-- 토스페이먼츠 단건결제·정기결제(빌링) 연동용 스키마
-- 단건: orderId / paymentKey / 승인 결과 저장
-- 정기: customerKey(회원 식별) + billingKey(서버 전용 저장) + 구독 주기는 앱에서 스케줄링

-- ---------------------------------------------------------------------------
-- 1) 토스 customerKey — 회원당 1개 (SDK·API의 customerKey로 사용)
--    보통 user UUID 문자열을 쓰면 되나, 추적·마이그레이션을 위해 명시 컬럼으로 둠
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists toss_customer_key text unique;

comment on column public.profiles.toss_customer_key is
  '토스페이먼츠 customerKey. 빌링·결제위젯에서 회원 식별자로 사용. 유저에게 노출 가능.';

-- 한 번 설정된 customerKey는 유저 업데이트로 바뀌면 토스 매핑이 깨지므로 금지
create or replace function public.profiles_toss_customer_key_immutable()
returns trigger
language plpgsql
as $$
begin
  if old.toss_customer_key is not null
     and new.toss_customer_key is distinct from old.toss_customer_key then
    raise exception 'toss_customer_key is immutable once set';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_toss_customer_key_immutable on public.profiles;
create trigger profiles_toss_customer_key_immutable
  before update on public.profiles
  for each row execute function public.profiles_toss_customer_key_immutable();

-- 기존 행 백필
update public.profiles
set toss_customer_key = id::text
where toss_customer_key is null;

-- 신규 가입 시 자동 설정 (기존 트리거 함수 확장)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, toss_customer_key)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    new.id::text
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) payment_orders — 단건결제 주문 + 빌링으로 발생한 각 결제 건(승인 이력)
--    order_id: 가맹점에서 생성한 고유 주문번호 (토스 orderId)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  order_id text not null,
  order_name text,
  amount bigint not null check (amount > 0),
  currency text not null default 'KRW',
  -- READY: 생성만 됨 / IN_PROGRESS: 인증 진행 / DONE: 승인 완료 / CANCELED·FAILED 등
  status text not null default 'READY'
    check (status in (
      'READY', 'IN_PROGRESS', 'DONE', 'CANCELED', 'PARTIAL_CANCELED', 'FAILED', 'ABORTED'
    )),
  payment_key text,
  payment_type text,
  method text,
  last_transaction_key text,
  approved_at timestamptz,
  receipt_url text,
  billing_subscription_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (order_id)
);

create index if not exists payment_orders_user_created_idx
  on public.payment_orders (user_id, created_at desc);

create index if not exists payment_orders_payment_key_idx
  on public.payment_orders (payment_key)
  where payment_key is not null;

comment on table public.payment_orders is
  '토스 결제 건별 기록. 단건 결제와 자동결제(빌링) 승인 1회당 1행.';

alter table public.payment_orders enable row level security;

create policy "결제 주문 본인 조회"
  on public.payment_orders for select
  using (auth.uid() = user_id);

-- INSERT/UPDATE는 서버(서비스 롤) 또는 별도 API에서만 하는 것을 권장.
-- 클라이언트에서 직접 넣지 않도록 insert/update 정책은 두지 않음.

-- billing_subscription_id FK는 아래 테이블 생성 후 추가
-- ---------------------------------------------------------------------------
-- 3) billing_subscriptions — 정기결제(구독) 계약 상태
--    다음 결제 시각·금액·플랜은 여기서 관리, 실제 승인 API 호출은 스케줄러/잡
-- ---------------------------------------------------------------------------
create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  customer_key text not null,
  plan_code text not null,
  amount bigint not null check (amount > 0),
  currency text not null default 'KRW',
  billing_interval text not null
    check (billing_interval in ('month', 'year', 'week', 'day')),
  interval_count int not null default 1 check (interval_count > 0),
  status text not null default 'active'
    check (status in ('active', 'paused', 'canceled', 'past_due')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_billing_at timestamptz,
  cancel_at_period_end boolean default false,
  canceled_at timestamptz,
  billing_key_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists billing_subscriptions_user_idx
  on public.billing_subscriptions (user_id);

create index if not exists billing_subscriptions_next_billing_idx
  on public.billing_subscriptions (next_billing_at)
  where status = 'active';

comment on table public.billing_subscriptions is
  '정기결제 구독. 토스는 스케줄링을 제공하지 않으므로 next_billing_at 기준으로 서버에서 승인 API 호출.';

alter table public.billing_subscriptions enable row level security;

create policy "구독 본인 조회"
  on public.billing_subscriptions for select
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4) billing_keys — 빌링키 (절대 클라이언트에 노출 금지)
--    RLS: authenticated 역할에는 정책 없음 → anon/로그인 유저는 읽기 불가
--    서비스 롤(Edge Function, Route Handler + service key)만 사용
-- ---------------------------------------------------------------------------
create table if not exists public.billing_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  customer_key text not null,
  billing_key text not null,
  method text,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  revoked_at timestamptz
);

create index if not exists billing_keys_user_active_idx
  on public.billing_keys (user_id, is_active);

comment on table public.billing_keys is
  '토스 빌링키 저장. SELECT/INSERT/UPDATE는 서비스 롤 전용. BILLING_DELETED 웹훅 시 is_active=false 등 처리.';

alter table public.billing_keys enable row level security;
-- 정책 없음: 일반 사용자는 접근 불가

alter table public.billing_subscriptions
  add constraint billing_subscriptions_billing_key_id_fkey
  foreign key (billing_key_id) references public.billing_keys (id)
  on delete set null;

alter table public.payment_orders
  add constraint payment_orders_billing_subscription_id_fkey
  foreign key (billing_subscription_id) references public.billing_subscriptions (id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- 5) webhook_events — BILLING_DELETED 등 웹훅 수신 로그 (디버깅·멱등 처리)
-- ---------------------------------------------------------------------------
create table if not exists public.toss_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  billing_key text,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text unique,
  processed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists toss_webhook_events_type_created_idx
  on public.toss_webhook_events (event_type, created_at desc);

comment on table public.toss_webhook_events is
  '토스 웹훅 수신 기록. 서비스 롤로만 insert/update 권장.';

alter table public.toss_webhook_events enable row level security;
-- 정책 없음

-- ---------------------------------------------------------------------------
-- updated_at 자동 갱신
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists payment_orders_set_updated_at on public.payment_orders;
create trigger payment_orders_set_updated_at
  before update on public.payment_orders
  for each row execute function public.set_updated_at();

drop trigger if exists billing_subscriptions_set_updated_at on public.billing_subscriptions;
create trigger billing_subscriptions_set_updated_at
  before update on public.billing_subscriptions
  for each row execute function public.set_updated_at();

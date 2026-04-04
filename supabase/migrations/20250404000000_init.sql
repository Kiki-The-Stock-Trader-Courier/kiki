-- Kiki: 프로필, 채팅, 즐겨찾기 (Supabase Auth 연동)
-- 대시보드 SQL 에디터에서 실행하거나: supabase db push

-- 프로필 (auth.users 와 1:1)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "프로필 본인 조회"
  on public.profiles for select
  using (auth.uid() = id);

create policy "프로필 본인 수정"
  on public.profiles for update
  using (auth.uid() = id);

-- 신규 가입 시 프로필 자동 생성
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 채팅 메시지 (지도 필터 대화 기록)
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  filters jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at desc);

alter table public.chat_messages enable row level security;

create policy "채팅 본인만"
  on public.chat_messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 즐겨찾기 장소
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  road_address text,
  category text,
  mapx text,
  mapy text,
  link text,
  created_at timestamptz default now(),
  unique (user_id, title, road_address)
);

alter table public.favorites enable row level security;

create policy "즐겨찾기 본인만"
  on public.favorites for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

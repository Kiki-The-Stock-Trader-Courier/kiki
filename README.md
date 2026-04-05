# Kiki — 맛집 지도 & 챗봇

Next.js + Supabase(로그인·DB) + 네이버 지역 검색 + (선택) n8n 챗봇 Webhook.

## 흐름

1. **로그인** (`/login`) — Google (Supabase Auth)
2. **연결 설정** (`/setup`) — Vercel 환경 변수 연결 여부 확인 (키는 앱에 입력하지 않음)
3. **지도** (`/map`) — 위치 + 장소 마커 + 채팅 필터

## 환경 변수

`.env.local.example` 참고. 배포 시 **Vercel → Environment Variables**에 동일 이름으로 설정합니다.

- **NEXT_PUBLIC_SITE_URL** — 프로덕션 URL (OAuth 리다이렉트용, 권장)
- **NAVER_*** — 지역 검색 후 **내 위치 주변 반경**(기본 2.5km, `NAVER_NEARBY_RADIUS_METERS`로 조정) 안 장소만 표시 (없으면 데모 마커)
- **N8N_CHAT_WEBHOOK_URL** — n8n에서 챗봇 응답을 줄 때 (없으면 앱 기본 문구만 사용)

## n8n

1. n8n에서 **Workflow → Import from File** 로 `n8n/kiki-chat.workflow.json` 가져오기  
2. 워크플로 **Activate** 후 **Webhook** 노드에 표시된 **Production URL** 전체를 복사  
3. Vercel에 `N8N_CHAT_WEBHOOK_URL` 로 등록 후 Redeploy  

Webhook은 `POST` JSON `{ "message": "...", "filters": { "keyword": "카페", "maxPriceKrw": 15000 } }` 를 받고, 응답은 `{ "reply": "문자열" }` 형식이어야 합니다.

## 개발

```bash
npm install
npm run dev
```

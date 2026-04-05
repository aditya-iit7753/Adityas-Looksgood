## Deploy LooksGood on Railway (backend + database)

Railway is convenient, but note:
- **Persistent disk is not guaranteed** like a VPS. For media URLs to stay permanent, **configure Cloudinary**.

### 1) Create project
1. Railway → **New Project**
2. **Deploy from GitHub repo** → select `aditya-iit7753/Adityas-Looksgood`

### 2) Add PostgreSQL
1. Railway project → **New** → **Database** → **PostgreSQL**
2. Railway will provide `DATABASE_URL` (use that for the backend service).

### 3) Deploy backend as Docker
Recommended (includes `ffmpeg`):
- Create a **Service** from the repo using the root `Dockerfile` (added for Railway).

Backend must have these env vars in Railway:
- `APP_ENV=production`
- `DATABASE_URL` (from Railway Postgres)
- `JWT_SECRET` (>= 32 chars)
- `PUBLIC_BASE_URL=https://api.looksgood.com` (or your chosen API domain)
- `CORS_ORIGINS=https://looksgood.com,https://www.looksgood.com`

If using AI:
- `OPENAI_API_KEY`

If using Cloudinary (recommended for production media persistence):
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

If using Stripe subscriptions (AI unlock + ads removal):
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_SUBSCRIPTION_PRICE_PRO`
- `STRIPE_SUBSCRIPTION_PRICE_CREATOR`
- `STRIPE_SUCCESS_URL=https://www.looksgood.com/?sub=success`
- `STRIPE_CANCEL_URL=https://www.looksgood.com/?sub=cancel`

### 4) Add domain for API
Railway → backend service → **Settings** → **Domains**:
- Add `api.looksgood.com` (recommended)

Then set DNS at your registrar per Railway’s instructions (CNAME/A as shown by Railway).

Verify:
- `https://api.looksgood.com/api/health`

### 5) Web frontend hosting
Cheapest option:
- Host `web-frontend/` on **Cloudflare Pages** (free) and point `looksgood.com` + `www.looksgood.com` there.

If you want the website on Railway too, tell me and I’ll add a small Railway web service for it.


# Railway deployment

This repo is ready to deploy to Railway as two services:

- `backend` -> FastAPI API service
- `web-frontend` -> static web app served by `nginx`

Railway behavior this setup expects:

- Railway injects a `PORT` environment variable for public services.
- Healthchecks must return HTTP `200`.
- In monorepos, the service `Root Directory` is set in the dashboard, while the Railway config file path must be the absolute repo path such as `/backend/railway.json`.

## 1. Create the Railway project

1. Create a new Railway project from your GitHub repo.
2. Add a PostgreSQL service in the same project.
3. Keep the mobile app out of Railway. Only deploy `backend` and `web-frontend`.

## 2. Deploy the backend service

Create a new service from the same repo with these settings:

- Service name: `looksgood-api`
- Root Directory: `/backend`
- Config as Code path: `/backend/railway.json`

Add a Railway volume:

- Mount path: `/app/generated`
- Recommended size: `5 GB`

Set these required variables on the backend service:

```env
APP_ENV=production
JWT_SECRET=replace-with-a-long-random-secret
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200
DATABASE_URL=<Railway reference to the Postgres DATABASE_URL variable>
GENERATED_STORAGE_DIR=/app/generated
PUBLIC_BASE_URL=https://your-backend-domain.up.railway.app
CORS_ORIGINS=https://your-frontend-domain.up.railway.app
CORS_ALLOW_CREDENTIALS=false
OPENAI_MODEL=gpt-4o-mini
```

`PUBLIC_BASE_URL` and `CORS_ORIGINS` must be set before the first production boot because the API validates them during startup.

Set these optional variables if you use the related features:

```env
OPENAI_API_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_SUBSCRIPTION_PRICE_PRO=
STRIPE_SUBSCRIPTION_PRICE_CREATOR=
STRIPE_SUCCESS_URL=https://your-frontend-domain.up.railway.app/?sub=success
STRIPE_CANCEL_URL=https://your-frontend-domain.up.railway.app/?sub=cancel
```

After deploy:

- Generate a Railway public domain for the backend service.
- Confirm `https://<backend-domain>/health` returns `200`.
- Confirm `https://<backend-domain>/api/health` returns JSON with `status: ok`.

## 3. Deploy the web frontend service

Create a second service from the same repo with these settings:

- Service name: `looksgood-web`
- Root Directory: `/web-frontend`
- Config as Code path: `/web-frontend/railway.json`

Set this required variable on the web service:

```env
PUBLIC_API_URL=https://your-backend-domain.up.railway.app/api
```

After deploy:

- Generate a Railway public domain for the web service.
- Open the site and verify login/feed calls go to the backend domain above.

## 4. Finalize public launch

Once both Railway domains exist, update backend variables:

```env
PUBLIC_BASE_URL=https://your-backend-domain.up.railway.app
CORS_ORIGINS=https://your-frontend-domain.up.railway.app
STRIPE_SUCCESS_URL=https://your-frontend-domain.up.railway.app/?sub=success
STRIPE_CANCEL_URL=https://your-frontend-domain.up.railway.app/?sub=cancel
```

If you later connect custom domains, change them again:

```env
PUBLIC_BASE_URL=https://api.yourdomain.com
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
STRIPE_SUCCESS_URL=https://www.yourdomain.com/?sub=success
STRIPE_CANCEL_URL=https://www.yourdomain.com/?sub=cancel
PUBLIC_API_URL=https://api.yourdomain.com/api
```

## 5. Custom domains

Recommended mapping:

- Backend: `api.yourdomain.com`
- Web frontend: `yourdomain.com` and `www.yourdomain.com`

On Railway:

1. Open the target service.
2. Go to `Settings -> Networking -> Public Networking`.
3. Add the custom domain.
4. Railway will show the DNS target.
5. Create the matching CNAME or DNS record in your DNS provider.

Railway will provision SSL automatically after the domain verifies.

## 6. Mobile app follow-up

When the backend is public, update the Expo app env used for builds:

```env
EXPO_PUBLIC_API_URL=https://api.yourdomain.com
EXPO_PUBLIC_API_URLS=https://api.yourdomain.com,https://api.yourdomain.com/api
```

For temporary Railway domains, use the Railway backend domain instead of `api.yourdomain.com`.

## 7. Repo files used by Railway

- `/backend/railway.json`
- `/backend/Dockerfile`
- `/web-frontend/railway.json`
- `/web-frontend/Dockerfile`
- `/web-frontend/nginx.conf.template`
- `/web-frontend/config.template.js`

## 8. What still needs manual dashboard setup

These cannot be fully done from repo files alone:

- Create the Railway project and services
- Add PostgreSQL
- Attach the backend volume
- Set secrets and custom domains
- Point DNS to Railway if you use your own domain

## 9. looksgoods.com cutover checklist

Use this exact mapping for LooksGood:

- Backend: `api.looksgoods.com`
- Web: `looksgoods.com` and `www.looksgoods.com`

In Cloudflare DNS:

1. Remove old `A` records for `@` and `www` that point to old VPS IPs.
2. Create `CNAME` `api` -> `<your-backend-railway-domain>`
3. Create `CNAME` `@` -> `<your-web-railway-domain>` (Cloudflare flattening on)
4. Create `CNAME` `www` -> `looksgoods.com`

Then set Railway variables:

```env
# backend
PUBLIC_BASE_URL=https://api.looksgoods.com
CORS_ORIGINS=https://looksgoods.com,https://www.looksgoods.com
STRIPE_SUCCESS_URL=https://www.looksgoods.com/?sub=success
STRIPE_CANCEL_URL=https://www.looksgoods.com/?sub=cancel

# web
PUBLIC_API_URL=https://api.looksgoods.com/api
```

Expected healthy checks:

- `https://api.looksgoods.com/health` -> `{"status":"ok"}`
- `https://api.looksgoods.com/api/health` -> `{"status":"ok","prefix":"/api"}`
- `https://looksgoods.com` and `https://www.looksgoods.com` load the web UI.

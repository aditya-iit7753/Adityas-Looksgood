# VPS commands (looksgoods.com)

Assumptions:
- DNS `looksgoods.com` + `www.looksgoods.com` already point to your VPS IP.
- You are inside the repo on the VPS (same folder that contains `docker-compose.prod.yml`).

## 1) Create `.env.production`
```bash
cp .env.production.looksgood.template .env.production
nano .env.production
```

Fill at minimum:
- `POSTGRES_PASSWORD`
- `JWT_SECRET` (>= 32 chars)
- `OPENAI_API_KEY` (optional if you want voice + AI parsing)
- `CLOUDINARY_*` (optional; otherwise media is served from `/generated/`)

## 2) Start the stack (HTTP)
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production --profile bootstrap up -d --build
docker compose -f docker-compose.prod.yml ps
curl -i http://127.0.0.1/api/health
```

## 3) Issue HTTPS cert (first time)
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d looksgoods.com -d www.looksgoods.com --cert-name looksgoods.com \
  --email you@example.com --agree-tos --no-eff-email

# Switch to HTTPS-enabled nginx
docker compose -f docker-compose.prod.yml --env-file .env.production --profile https up -d --build
# Stop the bootstrap HTTP-only nginx
docker compose -f docker-compose.prod.yml --env-file .env.production stop web_bootstrap
```

## 4) Verify HTTPS
```bash
curl -i https://www.looksgoods.com/api/health
curl -i https://www.looksgoods.com/
```



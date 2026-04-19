# LooksGood Production Deployment

## 1) VPS prerequisites
- Ubuntu 22.04+ (or similar Linux server)
- Docker + Docker Compose plugin installed
- Open ports `80` and `443` in firewall/security group

## 2) Upload project to server
```bash
git clone <your-repo-url> looksbook
cd looksbook
```

## 2b) DNS (required for looksgoods.com)
Set these records at your DNS provider:
- `A` record `@` -> your VPS public IPv4 (example: `185.38.109.209`)
- `A` record `www` -> your VPS public IPv4
- (Optional) `AAAA` record `@` -> your VPS public IPv6
- (Optional) `AAAA` record `www` -> your VPS public IPv6

## 3) Configure production environment
```bash
cp .env.production.example .env.production
```

Edit `.env.production` and set:
- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `CLOUDINARY_*` (if you want cloud media hosting)
- `CORS_ORIGINS` to your real domain(s)
- `DOMAIN` + `CERT_NAME` for HTTPS

## 4) Start stack (HTTP bootstrap)
Start the stack in HTTP-only mode so certbot can complete the first issuance.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production --profile bootstrap up -d --build
```

## 4b) Issue the first HTTPS certificate (one-time)
After DNS points to your server, run:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d $DOMAIN -d www.$DOMAIN --cert-name $CERT_NAME \
  --email you@example.com --agree-tos --no-eff-email

# Switch to HTTPS-enabled nginx
docker compose -f docker-compose.prod.yml --env-file .env.production --profile https up -d --build
# Stop the bootstrap HTTP-only nginx
docker compose -f docker-compose.prod.yml --env-file .env.production stop web_bootstrap
```
## 5) Verify services
```bash
docker compose -f docker-compose.prod.yml ps
curl http://<SERVER_IP>/api/health
curl https://<YOUR_DOMAIN>/api/health
```

Expected backend response:
```json
{"status":"LooksGood backend running"}
```

## 6) Point mobile app to live API
In `looksgood-app`, set:
```bash
cp .env.production.example .env.local
```
Then edit `.env.local`:
```env
EXPO_PUBLIC_API_URL=https://your-domain.com/api
```

Restart Expo after changing env:
```bash
npm run start
```

## 7) Useful ops commands
```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml restart backend
docker compose -f docker-compose.prod.yml down
```


# LooksGood Play Store Release Checklist

## 1) Configure production endpoints

Create/update `looksgood-app/.env.production`:

```env
EXPO_PUBLIC_API_URL=https://your-domain.com/api
EXPO_PUBLIC_API_URLS=https://your-domain.com/api,https://your-domain.com
EXPO_PUBLIC_WEB_FRONTEND_URL=https://your-domain.com/
EXPO_PUBLIC_ANDROID_PLAY_BILLING_READY=false
```

Current test-ready public URLs (active now):
- API: https://looksgood-api-production.up.railway.app/api
- Web: https://looksgood-web-production.up.railway.app/

When custom DNS is fully live, switch these back to:
- API: https://api.looksgoods.com/api
- Web: https://www.looksgoods.com/

Rules for production:
- Use public `https://` URLs only.
- Do not use `localhost`, `127.0.0.1`, `10.0.2.2`, or private LAN IPs.

For EAS cloud builds, also set these as EAS project secrets or profile env vars.

Android Play-safe setting:
- Keep `EXPO_PUBLIC_ANDROID_PLAY_BILLING_READY=false` until you finish Google Play Billing or RevenueCat setup.
- With that flag off, Android builds do not offer in-app digital subscription checkout.

## 2) Verify app config before build

- App id: `com.looksgood.app`
- Version name: `1.0.0`
- Android version code: managed by EAS (`autoIncrement: true`, `appVersionSource: remote`)
- Sensitive/legacy permissions blocked:
  - `android.permission.SYSTEM_ALERT_WINDOW`
  - `android.permission.READ_EXTERNAL_STORAGE`
  - `android.permission.WRITE_EXTERNAL_STORAGE`

## 3) Build AAB for Play

```bash
npm run build:android:prod
```

This uses EAS profile `production` and generates an Android App Bundle (`.aab`).
Make sure production env vars are configured in EAS before building, otherwise the app will ship without API URLs.

## 4) Submit to Play Console

```bash
npm run submit:android:prod
```

Default submit settings are configured to:
- Track: `internal`
- Release status: `draft`

If you are submitting manually:
1. Open the Play Console for your app.
2. Go to `Release` -> `Testing` -> `Internal testing`.
3. Create a new release and upload the `.aab` from EAS.
4. Add release notes and save.
5. Review and roll out to internal testers.

To get the `.aab`, use the "Application Archive URL" from the EAS build details page.

## 5) Complete Play Console listing and policy items

- Privacy Policy URL
  - Use: `https://looksgood-web-production.up.railway.app/privacy.html` for the current Railway domain
- App access instructions (if login is required)
- Data safety form
- Content rating questionnaire
- Target audience + ads declaration
- Store listing assets (icon, feature graphic, screenshots)

## 6) Security action required

If `credentials.json` or keystore passwords were ever committed/shared, rotate the upload key and credentials before production rollout.


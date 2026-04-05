# LooksGood Play Store Release Checklist

## 1) Configure production endpoints

Create/update `looksgood-app/.env.production`:

```env
EXPO_PUBLIC_API_URL=https://your-domain.com/api
EXPO_PUBLIC_API_URLS=https://your-domain.com/api,https://your-domain.com
EXPO_PUBLIC_WEB_FRONTEND_URL=https://your-domain.com/
```

Current LooksGood production URLs:
- API: https://api.looksgood.com/api
- Web: https://www.looksgood.com/

Rules for production:
- Use public `https://` URLs only.
- Do not use `localhost`, `127.0.0.1`, `10.0.2.2`, or private LAN IPs.

For EAS cloud builds, also set these as EAS project secrets or profile env vars.

## 2) Verify app config before build

- App id: `com.looksgood.app`
- Version name: `1.0.0`
- Android version code: `3` (must increase for each new Play upload)
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

To get the `.aab`, use the “Application Archive URL” from the EAS build details page.

## 5) Complete Play Console listing and policy items

- Privacy Policy URL
- App access instructions (if login is required)
- Data safety form
- Content rating questionnaire
- Target audience + ads declaration
- Store listing assets (icon, feature graphic, screenshots)

## 6) Security action required

If `credentials.json` or keystore passwords were ever committed/shared, rotate the upload key and credentials before production rollout.


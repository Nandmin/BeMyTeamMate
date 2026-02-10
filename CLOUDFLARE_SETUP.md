# Cloudflare Push Notification Worker Setup

Ez a dokumentum a Cloudflare Worker es a Cloudflare Pages beallitasokat irja le.

## 1. Elofeltetelek

- Cloudflare fiok
- Firebase projekt (FCM Service Account JSON)

## 2. Worker secrets

A Worker mukodesehez az alabbi valtozok legyenek Cloudflare Worker secretkent beallitva
(Worker > Settings > Variables):

| Valtozo nev | Leiras |
| --- | --- |
| `FCM_PROJECT_ID` | Firebase projekt azonosito |
| `FCM_CLIENT_EMAIL` | Service Account email (`client_email`) |
| `FCM_PRIVATE_KEY` | Service Account private key (`private_key`) |
| `TURNSTILE_SECRET_KEY` | Turnstile secret key a captcha ellenorzeshez |
| `ADMIN_SECRET` | Opcionais admin kulcs teszt/admin hasznalathoz |

Megjegyzes: `FCM_PRIVATE_KEY` eseten a `\n` sortoreseket a kod kezeli.

## 3. Cloudflare Pages build env valtozok (frontend)

A frontend publikus kulcsait a build elott a `scripts/generate-runtime-config.mjs`
script generalja a `public/runtime-config.js` fajlba.

Cloudflare Pages > Settings > Environment variables:

- `BMT_VAPID_KEY`: Firebase Web Push VAPID public key
- `BMT_TURNSTILE_SITE_KEY`: Cloudflare Turnstile site key (publikus)

Fontos:
- A Turnstile site key publikus, de igy nem hardcode-olt a repo-ban.
- A Turnstile secret key csak Worker secret maradjon (`TURNSTILE_SECRET_KEY`).

## 4. Worker telepitese

```bash
cd cloudflare
npx wrangler deploy
```

## 5. API hasznalata

Endpoint: `POST /send-notification`

Hitelesites:

1. Firebase ID token:
- Header: `Authorization: Bearer <FIREBASE_ID_TOKEN>`

2. Admin secret:
- Header: `X-Admin-Secret: <YOUR_ADMIN_SECRET>`

## 6. Frontend implementacio

A frontend automatikusan csatolja a bejelentkezett felhasznalo ID tokenjet.
Lasd: `src/app/services/notification.service.ts`.

## 7. Hibaelharitas

- `401 Unauthorized`: hianyzo vagy ervenytelen auth header
- `500 Server Error`: hianyzo Worker secret vagy hibas FCM config

## 8. MVP Cron Trigger (00:30 Europe/Budapest)

Alapertelmezett cron a `cloudflare/wrangler.toml` fajlban:

```toml
crons = ["30 22 * * *", "30 23 * * *"]
```

Ez UTC idoben fut, a Worker belul ellenorzi a budapesti idot.

## 9. Szukseges jogosultsagok

Az MVP cron ugyanazokat a Firebase Service Account adatokat hasznalja,
mint az ertesites kuldes:

- `FCM_PROJECT_ID`
- `FCM_CLIENT_EMAIL`
- `FCM_PRIVATE_KEY`

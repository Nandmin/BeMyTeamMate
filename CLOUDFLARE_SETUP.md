# Cloudflare Push Notification Worker Setup

Ez a dokumentum leírja a push értesítések küldéséért felelős Cloudflare Worker beállítását és használatát.

## 1. Előfeltételek

- Cloudflare fiók (Free plan is elegendő)
- Firebase projekt (FCM Service Account JSON)

## 2. Környezeti Változók (Secrets)

A Worker működéséhez a következő környezeti változókat **titkosítottként (Secret)** kell felvenni a Cloudflare Dashboard-on (Worker > Settings > Variables):

| Változó Név        | Leírás                                                  | Érték Forrása                                                                                                 |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `FCM_PROJECT_ID`   | A Firebase projekt azonosítója.                         | Firebase Console > Project Settings                                                                           |
| `FCM_CLIENT_EMAIL` | A Service Account e-mail címe.                          | Service Account JSON (`client_email`)                                                                         |
| `FCM_PRIVATE_KEY`  | A Service Account privát kulcsa.                        | Service Account JSON (`private_key`) <br> **Fontos:** A teljes `-----BEGIN PRIVATE KEY...` blokkot másold be! |
| `ADMIN_SECRET`     | (Opcionális) Titkos kulcs adminisztratív hozzáféréshez. | Generálj egy erős véletlenszerű stringet.                                                                     |

> **Megjegyzés:** A `FCM_PRIVATE_KEY` bemásolásakor ügyelj arra, hogy a sortörések (`\n`) helyesen kerüljenek átadásra. A kód automatikusan kezeli a `\n` karaktert, ha szövegként másolod be.

## 3. Worker Telepítése

Ha van telepítve `wrangler` CLI:

```bash
cd cloudflare
npx wrangler deploy
```

Vagy másold be a `worker.js` tartalmát a Cloudflare Dashboard online szerkesztőjébe.

## 4. API Használata

**Endpoint:** `POST /send-notification`

**Hitelesítés (Authentication):**
Két módon lehetséges:

1.  **Firebase ID Token (Kliens felől):**
    Header: `Authorization: Bearer <FIREBASE_ID_TOKEN>`
    A token érvényességét a Google API-n keresztül ellenőrizzük.
2.  **Admin Secret (Szerver felől / Tesztelés):**
    Header: `X-Admin-Secret: <YOUR_ADMIN_SECRET>`

**Request Body (JSON):**

```json
{
  "tokens": ["FCM_TOKEN_1", "FCM_TOKEN_2"],
  "notification": {
    "title": "Üzenet címe",
    "body": "Üzenet tartalma"
  },
  "data": {
    "groupId": "group123",
    "eventId": "event456",
    "type": "NEW_EVENT"
  }
}
```

## 5. Frontend Implementáció

A frontend automatikusan csatolja a bejelentkezett felhasználó ID tokenjét a kéréshez. Lásd: `src/app/services/notification.service.ts`.

## 6. Hibaelhárítás

- **401 Unauthorized**: Nincs vagy érvénytelen Auth header. Jelentkezz be újra.
- **500 Server Error**: Hiányzó Secrets vagy hibás FCM config. Ellenőrizd a Cloudflare logokat.
- **Token Verification Failed**: A Firebase ID token lejárt vagy érvénytelen.

## 7. MVP Cron Trigger (00:30, Europe/Budapest)

Az MVP szavazások automatikus lezárásához a Worker tartalmaz egy Cron trigger-t.
Alapértelmezetten a `cloudflare/wrangler.toml` fájlban ez van beállítva:

```
crons = ["30 22 * * *", "30 23 * * *"]
```

Ez **UTC** idő szerint fut. A Worker belül ellenőrzi a Budapest időt, és csak akkor fut,
amikor ott 00:30 van (DST-t is kezeli).

## 8. Szükséges jogosultságok

Az MVP cron ugyanazokat a Firebase Service Account adatokat használja, mint az értesítések küldése:

- `FCM_PROJECT_ID`
- `FCM_CLIENT_EMAIL`
- `FCM_PRIVATE_KEY`

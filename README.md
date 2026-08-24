# Wapi

MVP SaaS WA API gateway for unofficial multi-tenant WhatsApp automation. Default development mode uses a mock WhatsApp driver so the API and dashboard can run without scanning a real number. Set `WA_DRIVER=baileys` when ready to connect real WhatsApp Web sessions.

## Stack

- API: Node.js, Express, TypeScript
- WhatsApp driver: Baileys adapter with mock fallback
- Dashboard: React + Vite
- Production backing services: PostgreSQL + Redis/BullMQ

## Run Local

```bash
npm install
npm run dev
```

Open:

- Dashboard: `http://localhost:5173`
- API health: `http://localhost:4100/health`

Demo API key: `demo_key`

## Real WhatsApp Mode

```bash
cp apps/api/.env.example apps/api/.env
# edit WA_DRIVER=baileys
npm run dev --workspace @wagw/api
```

Real mode stores WhatsApp auth state under `.wa-sessions/`.

## Email Alerts

The API can notify a tenant when a WhatsApp session is logged out and needs a QR scan again. Alerts use Resend.

```bash
RESEND_API_KEY=re_xxx
RESEND_FROM="Wapi <notify@your-verified-domain.com>"
ALERT_EMAIL=owner@example.com
```

Use a `RESEND_FROM` address from a domain that is verified in Resend. Tenants can also have their own `notificationEmail`; if it is empty, the API falls back to `ALERT_EMAIL`.

## Production Notes

Use the SQL in `infra/schema.sql`, run Redis for queue/retry, and put the API behind HTTPS. Keep tenant API keys secret and use per-tenant rate limits.

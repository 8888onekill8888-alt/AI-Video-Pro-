# Deployment

Deploy the API and worker separately. The API needs a public HTTPS origin, Supabase Auth/Database/Storage, Redis for production jobs, CORS restricted to approved clients and provider secrets. The worker needs access to the same Redis, private storage, provider secrets and FFmpeg/ffprobe binaries.

Configure `NODE_ENV=production`; startup rejects missing Supabase Auth configuration. Live media jobs require Redis and persistent storage. Health checks use `GET /health`; provider readiness is reported by authenticated/configuration routes without exposing secrets.

Set production secrets in the hosting provider's secret manager. Apply the Supabase migration before enabling traffic. Configure backups, database connection limits, Redis persistence/monitoring, storage lifecycle rules, logs/alerts, request limits and provider spend caps. Do not enable publishing until official OAuth/API approval is recorded.

Stripe checkout requires `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO` and webhook signature validation before subscriptions can be activated. Billing values are not exposed to mobile.
# Security

- API secrets, service-role keys, OAuth secrets, Stripe secrets and database credentials are server-side only.
- Supabase Auth access tokens are verified by the API. Passwords are forwarded to Supabase Auth and are never stored by CINEFORGE.
- Protected routes authorize project ownership before reading or mutating project data. Job queries are owner-scoped.
- Zod validates API bodies; document uploads are limited to TXT/PDF/DOCX and video uploads to MP4/MOV/WebM with a 250 MB cap.
- Production video jobs require Redis and persistent Supabase Storage. Signed URLs are short-lived and asset object paths are scoped by owner/project/category.
- Rate limiting, Helmet, CORS configuration, parameterized SQL and server-side credit checks are enabled.
- Demo fixtures and provider-sample outputs are labeled; they are not represented as AI output.
- Configure TLS, private bucket policies, OAuth consent/redirect allowlists, secret rotation, backups, audit logs, deletion workflows and retention periods before public release.
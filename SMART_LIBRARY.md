# BookVault / Smart Library
## Scope
Private physical copies, works, editions, ISBN-10/13 validation, local English/Indonesian OCR, live rear-camera barcode, metadata matching, manual review, genre/type/form/binding/tag/read-status filtering, batch entry, CSV/JSON export. Public books and favorites remain unchanged. Cover photos are processed locally and not stored in this version.

## Local setup
1. Back up the old database outside Git before switching branches. The former tracked database is removed from this branch; do not use its public copy as production data.
2. Install Python dependencies: `pip install -r requirements.txt`.
3. Generate two independent random secrets with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Copy .env.example to .env, replace placeholders, set BOOKVAULT_HTTPS=0 only for local HTTP.
4. Install scanner assets: `npm ci --ignore-scripts --no-audit --no-fund && npm run build`. Runtime uses local assets, no third-party script CDN.
5. For a fresh DB: `flask --app app init-db`. To migrate legacy data instead, use `python migrate_legacy.py /path/to/backup.db` on an EMPTY target; this imports existing users, books and favorites transactionally and rotates the known v1 default admin password to an unusable random secret. Reset migrated default admin credentials with `flask --app app reset-password admin` before use. Because Git history exposed the historical database, rotate every affected account password. Do not run demo seeding before migration.
6. Run `flask --app app run`. Login or register, open /library/. For direct camera access from a physical phone use HTTPS; localhost is only the local device.

## Supabase production database (not provisioned)
Use a dedicated project and a dedicated non-superuser LOGIN role created in the SQL editor; generate its password privately. Create a schema owned by that role:
```sql
-- First create the restricted bookvault_app role with a strong secret outside source control.
CREATE SCHEMA bookvault AUTHORIZATION bookvault_app;
REVOKE ALL ON SCHEMA bookvault FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE bookvault_app IN SCHEMA bookvault
  REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE bookvault_app IN SCHEMA bookvault
  REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
```
Do not expose the bookvault schema in Supabase Data API settings; preferably disable Data API for this dedicated project. The Flask backend authorizes collection queries with the logged-in user and owner-scoped joins; it does not use a service-role key or expose database credentials to JS. Do not treat this as Supabase Auth/RLS; those identities are not used. If the schema is ever exposed, stop and implement/grant explicit policies before exposing it.

Configure a session pooler connection string (or direct connection where supported) with TLS, DATABASE_URL=postgresql+psycopg://...?...sslmode=require, BOOKVAULT_DB_SCHEMA=bookvault, BOOKVAULT_HTTPS=1, BOOKVAULT_TRUSTED_HOSTS=your deployment domain, BOOKVAULT_TRUST_PROXY=1 only for one trusted reverse proxy. Do not use the postgres superuser in the runtime. Create the schema before init-db. Test grants and verify anon/authenticated cannot read private tables. Keep a backup, run migration once, verify row counts, then start the Dockerfile/Gunicorn service. Do not deploy the Flask development server.
The production database and secrets have not been created by this feature branch. No Supabase Storage bucket exists yet; photo storage deliberately deferred. In production, public registration defaults to disabled. Create your account with `flask --app app create-account your-username`, or explicitly set BOOKVAULT_ALLOW_REGISTRATION=1 for a multi-user deployment. Password resets invalidate existing signed sessions.

## Security notes
- Per-owner lookup/edit/delete/export; copies separate from global book catalog. CSRF on browser writes; API key for old machine endpoints. Logout POST only.
- Mandatory secrets, secure cookies in production, bounded request sizes and metadata provider responses, no redirects on scanner metadata requests, CSP, rate limits. Do not trust arbitrary proxy headers.
- Git history still contains the old SQLite database. Removing the file from the branch does NOT erase it from Git history. Treat historical password hashes as exposed, rotate affected credentials/secrets and review history separately.
- CI uses disposable SQLite and PostgreSQL; never use a production DATABASE_URL for tests. Tests intentionally drop and recreate database tables. A runtime guard permits only in-memory SQLite or the specifically configured local PostgreSQL CI schema, refusing remote/persistent targets.
- No claim of vulnerability-free software. Review dependency advisories, real Android camera, production TLS and grants before exposing.

## Validation
Run CI or locally: `python -m pytest -q`, `npm run build`. Browser smoke tests in CI exercise the real scanner assets, login, collection and export. A real Android camera test is still a release gate.

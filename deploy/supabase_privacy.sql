-- Only for a dedicated BookVault Supabase project, after init-db or import.
-- Flask connects directly with a server-held database credential.
-- No browser Supabase keys or Data API access are required.
BEGIN;
REVOKE ALL ON TABLE public."user", public.book, public.favorite,
  public.library_work, public.library_edition, public.library_copy, public.auth_session
  FROM PUBLIC, anon, authenticated;
ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_edition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_copy ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  t text;
  seq text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public."user"','public.book','public.favorite','public.library_work','public.library_edition','public.library_copy','public.auth_session']
  LOOP
    seq := pg_get_serial_sequence(t,'id');
    IF seq IS NOT NULL THEN
      EXECUTE 'REVOKE ALL ON SEQUENCE ' || seq || ' FROM PUBLIC, anon, authenticated';
    END IF;
  END LOOP;
END $$;
-- Optional runtime group: only this server-side role can access BookVault tables.
-- Run as owner; create a separate LOGIN role securely outside this script and grant this group.
DO $bookvault$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='bookvault_app') THEN
    CREATE ROLE bookvault_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $bookvault$;
GRANT USAGE ON SCHEMA public TO bookvault_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."user", public.book, public.favorite,
    public.library_work, public.library_edition, public.library_copy, public.auth_session TO bookvault_app;
DO $bookvault$
DECLARE
  t text;
  seq text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public."user"','public.book','public.favorite','public.library_work','public.library_edition','public.library_copy','public.auth_session']
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS bookvault_server_only ON ' || t;
    EXECUTE 'CREATE POLICY bookvault_server_only ON ' || t || ' TO bookvault_app USING (true) WITH CHECK (true)';
    seq := pg_get_serial_sequence(t,'id');
    IF seq IS NOT NULL THEN
      EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE ' || seq || ' TO bookvault_app';
    END IF;
  END LOOP;
END $bookvault$;
COMMIT;

-- Only for a dedicated BookVault Supabase project, after init-db or import.
-- Flask connects directly with a server-held database credential.
-- No browser Supabase keys or Data API access are required.
BEGIN;
REVOKE ALL ON TABLE public."user", public.book, public.favorite,
  public.library_work, public.library_edition, public.library_copy
  FROM PUBLIC, anon, authenticated;
ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_edition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_copy ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  t text;
  seq text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public."user"','public.book','public.favorite','public.library_work','public.library_edition','public.library_copy']
  LOOP
    seq := pg_get_serial_sequence(t,'id');
    IF seq IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated',seq);
    END IF;
  END LOOP;
END $$;
COMMIT;

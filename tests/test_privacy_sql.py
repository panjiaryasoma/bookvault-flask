"""Actual PostgreSQL role and RLS verification (skipped on SQLite)."""
import unittest
from pathlib import Path
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from test_library import app, db

class PrivacySQLTests(unittest.TestCase):
    def test_revokes_data_api_roles_and_allows_only_runtime_group(self):
        with app.app_context():
            if db.engine.dialect.name!="postgresql":
                self.skipTest("PostgreSQL-specific grants and RLS")
            db.drop_all();db.create_all()
            try:
                with db.engine.begin() as conn:
                    for role in ("anon","authenticated"):
                        conn.exec_driver_sql(f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='{role}') THEN CREATE ROLE {role} NOLOGIN; END IF; END $$;")
                        conn.exec_driver_sql(f"GRANT USAGE ON SCHEMA public TO {role}")
                        conn.exec_driver_sql(f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {role}")
                    # Execute script inside this transaction rather than nesting BEGIN/COMMIT.
                    script=(Path(__file__).resolve().parents[1]/"deploy/supabase_privacy.sql").read_text()
                    script=script.replace("BEGIN;\nREVOKE","REVOKE",1).rsplit("COMMIT;",1)[0]
                    conn.exec_driver_sql(script)
                    for table in ('"user"',"book","favorite","library_work","library_edition","library_copy","auth_session"):
                        relation="public."+table
                        for role in ("anon","authenticated"):
                            for priv in ("SELECT","INSERT","UPDATE","DELETE"):
                                self.assertFalse(conn.execute(text("SELECT has_table_privilege(:r,:t,:p)"),dict(r=role,t=relation,p=priv)).scalar(),(role,table,priv))
                        self.assertTrue(conn.execute(text("SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass(:t)"),dict(t=relation)).scalar())
                for role in ("anon","authenticated"):
                    with db.engine.connect() as conn:
                        tx=conn.begin()
                        conn.exec_driver_sql(f"SET LOCAL ROLE {role}")
                        with self.assertRaises(DBAPIError) as ctx:
                            conn.exec_driver_sql("SELECT * FROM public.library_copy")
                        self.assertEqual(ctx.exception.orig.sqlstate,"42501")
                        tx.rollback()
                with db.engine.begin() as conn:
                    conn.exec_driver_sql("SET LOCAL ROLE bookvault_app")
                    conn.exec_driver_sql("INSERT INTO public.book (title,author,genre,year,rating) VALUES ('test','test','test',2000,0)")
                    self.assertEqual(conn.exec_driver_sql("SELECT count(*) FROM public.book").scalar(),1)
                    conn.exec_driver_sql("DELETE FROM public.book")
            finally:
                db.session.remove()
                db.drop_all()

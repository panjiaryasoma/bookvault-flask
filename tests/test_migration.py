import sqlite3
import tempfile
import unittest
from pathlib import Path
from werkzeug.security import generate_password_hash
from test_library import app, db, User, Book, Favorite
from scripts.migrate_legacy import migrate

class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.path=Path(self.temp.name)/"legacy.db"
        with app.app_context():
            db.drop_all();db.create_all()
        with sqlite3.connect(self.path) as source:
            source.executescript("""
            CREATE TABLE "user"(id INTEGER PRIMARY KEY,username TEXT,password_hash TEXT,role TEXT);
            CREATE TABLE book(id INTEGER PRIMARY KEY,title TEXT,author TEXT,genre TEXT,year INTEGER,rating REAL,description TEXT,cover_image TEXT,created_at TEXT,updated_at TEXT);
            CREATE TABLE favorite(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES "user"(id),book_id INTEGER REFERENCES book(id),created_at TEXT);
            """)
            source.executemany('INSERT INTO "user" VALUES(?,?,?,?)',[(42,"legacy-reader",generate_password_hash("LegacyReaderPassword123"),"user"),(17,"legacy-admin",generate_password_hash("OldAdminPassword123"),"admin")])
            source.execute("INSERT INTO book VALUES(?,?,?,?,?,?,?,?,?,?)",(51,"Legacy title","Legacy author","Sastra",1900,4,"Description","","2026-01-01 00:00:00","2026-01-01 00:00:00"))
            source.execute("INSERT INTO favorite VALUES(?,?,?,?)",(99,42,51,"2026-01-01 00:00:00"))
    def tearDown(self):
        with app.app_context():
            db.session.remove();db.drop_all()
        self.temp.cleanup()
    def test_preserve_ids_favorites_and_reset_admin(self):
        before=self.path.read_bytes()
        with app.app_context():
            self.assertEqual(migrate(self.path),{"user":2,"book":1,"favorite":1})
            self.assertTrue(db.session.get(User,42).check_password("LegacyReaderPassword123"))
            self.assertFalse(db.session.get(User,17).check_password("OldAdminPassword123"))
            self.assertEqual(db.session.get(Favorite,99).book_id,51)
            self.assertEqual(db.session.get(Book,51).title,"Legacy title")
            self.assertEqual(db.session.execute(db.text("SELECT count(*) FROM library_copy")).scalar(),0)
            u=User(username="new-after-migration",role="user");u.set_password("NewPassword123!");db.session.add(u);db.session.commit()
            self.assertGreater(u.id,42)
            with self.assertRaises(ValueError):
                migrate(self.path)
            self.assertEqual(User.query.count(),3)
        self.assertEqual(before,self.path.read_bytes())

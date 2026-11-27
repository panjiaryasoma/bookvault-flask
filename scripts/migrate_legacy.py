"""One-time read-only legacy SQLite copy. Use only on an empty destination."""
import argparse
import secrets
import sqlite3
from datetime import datetime
from pathlib import Path
import sys
from sqlalchemy import insert, text
from werkzeug.security import generate_password_hash
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import app, db, User, Book, Favorite

def migrate(source):
    source=Path(source).resolve()
    if not source.is_file():
        raise ValueError("Legacy SQLite file missing")
    if db.engine.url.get_backend_name()=="sqlite" and Path(db.engine.url.database or "").resolve()==source:
        raise ValueError("Destination cannot be source")
    with sqlite3.connect(source.as_uri()+"?mode=ro",uri=True) as conn:
        conn.row_factory=sqlite3.Row
        if conn.execute("PRAGMA integrity_check").fetchone()[0]!="ok" or conn.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("Legacy integrity check failed")
        source_rows={}
        for model in (User,Book,Favorite):
            table=model.__table__
            rows=[]
            for row in conn.execute('SELECT * FROM "'+table.name+'"'):
                item={k:row[k] for k in row.keys() if k in table.columns.keys()}
                for k in ("created_at","updated_at"):
                    if isinstance(item.get(k),str):
                        item[k]=datetime.fromisoformat(item[k])
                if model is User and item.get("role")=="admin":
                    # Never preserve default/known legacy admin credentials.
                    item["password_hash"]=generate_password_hash(secrets.token_urlsafe(48))
                rows.append(item)
            source_rows[table.name]=rows
    db.create_all()
    try:
        for table in db.metadata.sorted_tables:
            if db.session.execute(table.select().limit(1)).first():
                raise ValueError("Destination is not empty; refusing to overwrite")
        for model in (User,Book,Favorite):
            table=model.__table__
            rows=source_rows[table.name]
            if rows:
                db.session.execute(insert(table),rows)
            if db.engine.url.get_backend_name()=="postgresql":
                quoted=db.engine.dialect.identifier_preparer.quote(table.name)
                db.session.execute(text(f"SELECT setval(pg_get_serial_sequence(:tbl,'id'),COALESCE(MAX(id),1),COUNT(*)>0) FROM {quoted}"),{"tbl":quoted})
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return {name:len(rows) for name,rows in source_rows.items()}

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--legacy",required=True)
    args=parser.parse_args()
    with app.app_context():
        print(migrate(args.legacy))
    print("Legacy admin credentials disabled. Reset with flask --app app reset-admin-password USERNAME.")

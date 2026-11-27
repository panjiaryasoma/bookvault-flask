"""One-time, read-only SQLite migration into an EMPTY configured database.
Usage: python migrate_legacy.py /path/to/backup.db
The tracked historical DB is not a trustworthy production backup.
"""
import argparse
import sqlite3
from pathlib import Path
from datetime import datetime
from sqlalchemy import text
from werkzeug.security import check_password_hash, generate_password_hash
from app import app,db,User,Book,Favorite
import secrets

def migrate(path):
    source=Path(path).resolve(strict=True)
    if not source.is_file():
        raise ValueError("Source must be a regular SQLite file")
    if db.engine.url.get_backend_name()=="sqlite" and Path(db.engine.url.database or "").resolve()==source:
        raise ValueError("Source and destination must differ")
    if any(model.query.first() for model in (User,Book,Favorite)):
        raise ValueError("Target already contains data; refusing to overwrite")
    counts={}
    con=sqlite3.connect(source.as_uri()+"?mode=ro",uri=True)
    con.row_factory=sqlite3.Row
    try:
        con.execute("BEGIN")
        if con.execute("PRAGMA quick_check").fetchone()[0]!="ok":
            raise ValueError("Source failed integrity check")
        for model in (User,Book,Favorite):
            table=model.__tablename__
            rows=con.execute('SELECT * FROM "'+table+'" ORDER BY id').fetchall()
            counts[table]=len(rows)
            for row in rows:
                d=dict(row)
                if table=="user":
                    if d["role"] not in ("user","admin"):
                        raise ValueError("Invalid legacy role")
                    # Known default admin password from v1 must never survive migration.
                    if d["role"]=="admin" and check_password_hash(d["password_hash"],"admin123"):
                        d["password_hash"]=generate_password_hash(secrets.token_urlsafe(48))
                for field in ("created_at","updated_at"):
                    if field in d:
                        d[field]=datetime.fromisoformat(d[field]) if d[field] else datetime.now()
                db.session.add(model(**d))
            db.session.flush()
        if db.engine.dialect.name=="postgresql":
            schema=db.metadata.schema or "public"
            for model in (User,Book,Favorite):
                table=model.__tablename__
                relation='"'+schema+'"."'+table+'"'
                max_id=db.session.query(db.func.max(model.id)).scalar()
                db.session.execute(text("SELECT setval(pg_get_serial_sequence(:relation, 'id'), :value, :used)"),{"relation":relation,"value":max_id or 1,"used":max_id is not None})
        for model in (User,Book,Favorite):
            if model.query.count()!=counts[model.__tablename__]:
                raise ValueError("Row count mismatch")
        db.session.commit()
        return counts
    except Exception:
        db.session.rollback()
        raise
    finally:
        con.close()

if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("source",type=Path);args=p.parse_args()
    with app.app_context():
        db.create_all()
        print(migrate(args.source))

import os
import uuid
from unittest.mock import patch, Mock, MagicMock
import json
import pytest
os.environ.setdefault("DATABASE_URL","sqlite://")
os.environ.setdefault("BOOKVAULT_SECRET_KEY","test-secret-"+("a"*48))
os.environ.setdefault("BOOKVAULT_API_KEY","test-api-"+("b"*48))
os.environ.setdefault("BOOKVAULT_HTTPS","0")
from app import app, db, User, Book, Favorite, RateWindow
from library import isbn13, lookup_metadata

@pytest.fixture(autouse=True)
def database():
    app.config.update(TESTING=True)
    with app.app_context():
        db.drop_all();db.create_all()
        for name,role in [("alice","user"),("bob","user"),("root","admin")]:
            user=User(username=name,role=role);user.set_password("test-password-123");db.session.add(user)
        db.session.commit()
        book=Book(title="Public book",author="Author",genre="Literary Fiction",year=2000);db.session.add(book);db.session.commit()
    yield
    with app.app_context():db.session.remove();db.drop_all()

def client(name=None):
    c=app.test_client()
    if name:
        with c.session_transaction() as s:
            s["user_logged_in"]=True;s["user_username"]=name;s["_csrf"]="token-"+name
    return c

def h(name="alice"):
    return {"X-CSRF-Token":"token-"+name}

def payload(**kw):
    return dict(title="Laut Bercerita",author="Leila S. Chudori",genre="Historical Fiction",isbn="9780140328721",format="paperback",status="unread",token=str(uuid.uuid4()),**kw)

def make(c,name="alice",**kw):
    data=payload();data.update(kw)
    r=c.post("/library/copies",json=data,headers=h(name))
    assert r.status_code==201,r.data
    return r.json["id"]

def test_isbn_10_13_and_invalid():
    assert isbn13("0-14-032872-6")=="9780140328721"
    assert isbn13("978-0-14-032872-1")=="9780140328721"
    for x in ["9780140328722","1234567890123","978abc","123","0-14-032872-0",None]:
        with pytest.raises(ValueError):isbn13(x)

def test_private_isolation_and_public_catalog_unchanged():
    a,b=client("alice"),client("bob")
    cid=make(a,notes="TOP-SECRET",shelf="PRIVATE")
    for method,path in [("GET",f"/library/copies/{cid}/edit"),("PUT",f"/library/copies/{cid}"),("DELETE",f"/library/copies/{cid}")]:
        assert b.open(path,method=method,json=payload(),headers=h("bob")).status_code==404
    assert b.get("/library/export").json==[]
    assert b"TOP-SECRET" not in b.get("/library/").data
    assert b"TOP-SECRET" not in b.get("/api/books").data
    assert a.get("/library/export").json[0]["notes"]=="TOP-SECRET"
    assert len(a.get("/api/books").json["data"])==1

def test_csrf_and_session_role():
    a=client("alice")
    assert a.post("/library/copies",json=payload()).status_code==403
    assert a.post("/library/copies",json=payload(),headers=h("bob")).status_code==403
    assert client("root").post("/library/copies",json=payload(),headers=h("root")).status_code==401
    c=client()
    with c.session_transaction() as s:s["_csrf"]="anonymous"
    assert c.post("/library/copies",json=payload(),headers={"X-CSRF-Token":"anonymous"}).status_code==401
    assert c.get("/library/export").status_code==401
    assert a.get("/logout").status_code==405
    assert a.post("/logout",data={"_csrf":"token-alice"}).status_code==302
    assert a.get("/library/export").status_code==401

def test_duplicate_confirmation_and_idempotency():
    a=client("alice");d=payload()
    r=a.post("/library/copies",json=d,headers=h());assert r.status_code==201
    assert a.post("/library/copies",json=d,headers=h()).status_code==200
    assert a.post("/library/copies",json={**d,"notes":"changed"},headers=h()).status_code==409
    d2={**d,"token":str(uuid.uuid4()),"printing":"Cetakan 100"}
    assert a.post("/library/copies",json=d2,headers=h()).status_code==409
    assert a.post("/library/copies",json={**d2,"confirm_duplicate":True},headers=h()).status_code==201
    works,editions,copies=app.extensions["library_models"]
    with app.app_context():
        assert works.query.count()==1 and editions.query.count()==1 and copies.query.count()==2
    d3={**d2,"token":str(uuid.uuid4()),"format":"hardcover","confirm_duplicate":True}
    assert a.post("/library/copies",json=d3,headers=h()).status_code==201
    with app.app_context(): assert editions.query.count()==2

@pytest.mark.parametrize("changes",[{"title":""},{"title":"x"*301},{"title":"bad\x00"},{"year":"9999"},{"year":"NaN"},{"year":True},{"pages":-1},{"isbn":"9780140328722"},{"isbn":[]},{"genre":"made-up"},{"status":"hacked"},{"format":"nonsense"},{"token":"fake"},{"notes":{"x":1}},{"author":None}])
def test_adversarial_payloads(changes):
    a=client("alice");d=payload();d.update(changes)
    assert a.post("/library/copies",json=d,headers=h()).status_code==400
    assert a.get("/library/export").json==[]

def test_edit_delete_and_filtered_views():
    a=client("alice")
    cid=make(a,notes="first")
    data=payload();data.update(title="Germinal",author="Émile Zola",status="finished",isbn="",tags="naturalisme, kritik sosial")
    assert a.put(f"/library/copies/{cid}",json=data,headers=h()).status_code==200
    assert b"Germinal" in a.get("/library/?q=Naturalisme&status=finished").data
    assert b"Germinal" not in a.get("/library/?q=%25").data
    assert b"Germinal" not in a.get("/library/?status=unread").data
    assert a.delete(f"/library/copies/{cid}",headers=h()).status_code==204
    assert a.get("/library/export").json==[]

def test_xss_and_csv_formula_injection():
    a=client("alice");make(a,title="<script>alert(1)</script>",notes="=HYPERLINK(\"https://example.com\")",author="+1+1")
    page=a.get("/library/")
    assert b"<script>alert(1)</script>" not in page.data
    assert b"&lt;script&gt;" in page.data
    assert "frame-ancestors 'none'" in page.headers["Content-Security-Policy"]
    assert page.headers["Cache-Control"]=="no-store"
    csv=a.get("/library/export?format=csv").data.decode()
    assert "'+1+1" in csv and "'=HYPERLINK" in csv

def test_metadata_exact_match_and_fallback():
    def response(data):
        r=MagicMock(status_code=200)
        r.__enter__.return_value=r
        r.iter_content.return_value=[json.dumps(data).encode()]
        return r
    no=response({})
    wrong=response({"items":[{"volumeInfo":{"title":"Wrong","industryIdentifiers":[{"identifier":"9780140328722"}]}},{"volumeInfo":{"title":"Right","authors":["Author"],"industryIdentifiers":[{"identifier":"9780140328721"}],"categories":["Historical Fiction"]}}]})
    with patch("library.requests.get",side_effect=[no,wrong]) as mock:
        result=lookup_metadata("", "9780140328721")
        assert len(result)==1 and result[0]["title"]=="Right"
        assert result[0]["genre"]=="Historical Fiction"
        assert mock.call_args_list[0].kwargs["allow_redirects"] is False
        assert mock.call_args_list[1].kwargs["timeout"]==(3,5)

def test_provider_failure_and_rate_limit():
    a=client("alice")
    with patch("app.time.time",return_value=__import__("time").time()), patch("library.lookup_metadata",return_value=[]) as mock:
        for _ in range(30):
            assert a.post("/library/lookup",json={"query":"Title"},headers=h()).status_code==200
        assert a.post("/library/lookup",json={"query":"Title"},headers=h()).status_code==429
        assert mock.call_count==30

def test_api_and_existing_favorites():
    a=client("alice")
    with app.app_context():bid=Book.query.first().id
    assert a.post(f"/favorite/add/{bid}",data={"_csrf":"token-alice"}).status_code==302
    assert b"Public book" in a.get("/user/dashboard").data
    assert a.get("/library/export").json==[]
    body={"title":"Other","author":"Author","genre":"History","year":2001}
    assert a.post("/api/books",json=body).status_code==401
    key={"X-API-Key":app.config["API_KEY"]}
    assert a.post("/api/books",json=["bad"],headers=key).status_code==400
    assert a.post("/api/books",json={**body,"rating":"NaN"},headers=key).status_code==400
    assert a.post("/api/books",json=body,headers=key).status_code==201
    assert a.get("/api/books").json["total"]==2

def test_login_and_scanner_html():
    a=client()
    assert a.get("/login").status_code==200
    with a.session_transaction() as s: csrf=s["_csrf"]
    assert a.post("/login",data={"username":"alice","password":"test-password-123","_csrf":csrf}).status_code==302
    assert a.get("/library/scan").status_code==200
    assert b"Scan ISBN" in a.get("/library/scan").data
    assert a.get("/library/").status_code==200

def test_lookup_malformed_and_oversized_provider():
    a=client("alice")
    assert a.post("/library/lookup",json={"query":"test","isbn":[]},headers=h()).status_code==400
    huge=MagicMock(status_code=200)
    huge.__enter__.return_value=huge
    huge.iter_content.return_value=[b"x"*1000001,b"x"*1000001]
    with patch("library.requests.get",side_effect=[huge,huge]):
        assert lookup_metadata("Test")==[]

def test_legacy_open_redirect_and_literal_duplicate():
    a=client("alice")
    with app.app_context(): bid=Book.query.first().id
    response=a.post(f"/favorite/add/{bid}",data={"_csrf":"token-alice"},headers={"Referer":"https://malicious.example/"})
    assert response.status_code==302 and response.headers["Location"]=="/"
    key={"X-API-Key":app.config["API_KEY"]}
    body={"title":"%","author":"Author","genre":"History","year":2001}
    assert a.post("/api/books",json=body,headers=key).status_code==201

def test_csrf_static_and_request_size():
    a=client()
    page=a.get("/login")
    assert b'name="_csrf"' in page.data
    assert "nonce-" in page.headers["Content-Security-Policy"]
    a=client("alice")
    assert a.post("/library/copies",data=b"x"*(300*1024),content_type="application/json",headers=h()).status_code==413

def test_legacy_migration_roundtrip(tmp_path):
    import sqlite3
    from migrate_legacy import migrate
    source=tmp_path/"legacy.db"
    con=sqlite3.connect(source)
    con.executescript("""
    CREATE TABLE user(id INTEGER PRIMARY KEY, username TEXT, password_hash TEXT, role TEXT);
    CREATE TABLE book(id INTEGER PRIMARY KEY, title TEXT, author TEXT, genre TEXT, year INTEGER, rating REAL, description TEXT, cover_image TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE favorite(id INTEGER PRIMARY KEY, user_id INTEGER, book_id INTEGER, created_at TEXT);
    INSERT INTO book VALUES(17,'Legacy','Writer','History',1900,0,'','', '2020-01-01 00:00:00','2020-01-01 00:00:00');
    INSERT INTO favorite VALUES(20,9,17,'2020-01-01 00:00:00');
    """)
    from werkzeug.security import generate_password_hash
    con.execute("INSERT INTO user VALUES(9,'legacy',?,'user')",(generate_password_hash("old-password"),))
    con.commit();con.close()
    with app.app_context():
        db.drop_all();db.create_all()
        assert migrate(source)=={"user":1,"book":1,"favorite":1}
        assert db.session.get(User,9).check_password("old-password")
        assert db.session.get(Favorite,20).book_id==17
        with pytest.raises(ValueError): migrate(source)
        db.session.add(Book(title="Next",author="Writer",genre="History",year=1901));db.session.commit()
        assert Book.query.filter_by(title="Next").first().id>17

def test_idempotency_token_is_owner_scoped():
    a,b=client("alice"),client("bob")
    d=payload()
    x=a.post("/library/copies",json=d,headers=h())
    y=b.post("/library/copies",json=d,headers=h("bob"))
    assert x.status_code==201 and y.status_code==201 and x.json["id"]!=y.json["id"]
    assert x.json["id"]!=d["token"]
    assert a.post("/library/copies",json=d,headers=h()).json["id"]==x.json["id"]

def test_database_rejects_cross_owner_foreign_key():
    from sqlalchemy.exc import IntegrityError
    a=client("alice"); cid=make(a)
    works,editions,copies=app.extensions["library_models"]
    with app.app_context():
        other=User.query.filter_by(username="bob").first()
        original=db.session.get(copies,cid)
        db.session.add(copies(id=str(uuid.uuid4()),user_id=other.id,edition_id=original.edition_id,request_token=str(uuid.uuid4()),request_hash="a"*64,genre="History",status="unread"))
        with pytest.raises(IntegrityError): db.session.commit()
        db.session.rollback()

def test_postgres_schema_not_accessible_to_anon():
    if db_schema := os.getenv("BOOKVAULT_DB_SCHEMA"):
        from sqlalchemy import text
        with app.app_context():
            assert db.session.execute(text("SELECT has_schema_privilege('anon', :s, 'USAGE')"),{"s":db_schema}).scalar() is False
            assert db.session.execute(text("SELECT has_table_privilege('anon', :t, 'SELECT')"),{"t":db_schema+".library_copy"}).scalar() is False

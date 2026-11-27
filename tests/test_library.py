"""Adversarial collection and legacy API regression tests; no live credentials or network."""
import os
import unittest
from unittest.mock import patch
os.environ["BOOKVAULT_SECRET_KEY"]="test-secret-only-"+"x"*40
os.environ["BOOKVAULT_API_KEY"]="test-api-key"
from urllib.parse import urlsplit
test_url=os.getenv("TEST_DATABASE_URL","sqlite://")
if test_url!="sqlite://":
    parsed=urlsplit(test_url)
    if parsed.hostname not in {"localhost","127.0.0.1","::1"} or parsed.path!="/bookvault_test":
        raise RuntimeError("Refusing destructive tests against a non-local disposable database")
os.environ["DATABASE_URL"]=test_url
os.environ["BOOKVAULT_SECURE_COOKIES"]="0"
os.environ["BOOKVAULT_TRUSTED_HOSTS"]=""
from app import app, db, User, Book, Favorite, AuthSession, login_limit
from datetime import datetime, timedelta
from library_metadata import isbn13, classify, safe_cover, lookup
from library_routes import WindowLimit

class LibraryTests(unittest.TestCase):
    def setUp(self):
        app.config.update(TESTING=True)
        with app.app_context():
            db.drop_all()
            db.create_all()
            for username,role in [("alice","user"),("bob","user"),("admin-test","admin")]:
                user=User(username=username,role=role)
                user.set_password("ValidPassword123!")
                db.session.add(user)
            db.session.commit()
        login_limit.data.clear()
        self.alice=app.test_client()
        self.bob=app.test_client()
        self.admin=app.test_client()
        for client,name in [(self.alice,"alice"),(self.bob,"bob"),(self.admin,"admin-test")]:
            response=client.post("/login",data={"username":name,"password":"ValidPassword123!","_csrf":self.csrf(client)})
            self.assertEqual(response.status_code,302)
        login_limit.data.clear()

    def tearDown(self):
        with app.app_context():
            db.session.remove()
            db.drop_all()

    def csrf(self,client):
        client.get("/")
        with client.session_transaction() as s:
            return s["_csrf"]

    def data(self,**overrides):
        return dict(title="Private book",author="Private author",status="unread",isbn="9780306406157",genre="Sastra",kind="Fiksi",**{k:v for k,v in overrides.items() if k not in {"title","author","status","isbn","genre","kind"}}) | overrides

    def add(self,client=None,**overrides):
        client=client or self.alice
        return client.post("/user/library/scan",data=self.data(**overrides)|{"_csrf":self.csrf(client)})

    def copy_id(self):
        with app.app_context():
            return db.session.execute(db.text("SELECT id FROM library_copy ORDER BY id LIMIT 1")).scalar_one()

    def test_private_requires_user_login(self):
        anon=app.test_client()
        self.assertEqual(anon.get("/user/library").status_code,302)
        self.assertEqual(anon.get("/user/library/scan").status_code,302)
        self.assertEqual(self.admin.get("/user/library").status_code,302)
        self.assertEqual(anon.post("/user/library/scan",data=self.data()).status_code,403)

    def test_private_copy_not_public_or_other_user(self):
        self.assertEqual(self.add(title="alice-private-unique").status_code,302)
        ident=self.copy_id()
        self.assertIn(b"alice-private-unique",self.alice.get("/user/library").data)
        self.assertNotIn(b"alice-private-unique",self.bob.get("/user/library").data)
        self.assertNotIn(b"alice-private-unique",self.alice.get("/api/books").data)
        self.assertEqual(self.bob.get(f"/user/library/{ident}/edit").status_code,404)
        token=self.csrf(self.bob)
        self.assertEqual(self.bob.post(f"/user/library/{ident}/edit",data=self.data(title="hijack")|{"_csrf":token}).status_code,404)
        self.assertEqual(self.bob.post(f"/user/library/{ident}/delete",data={"_csrf":token}).status_code,404)
        self.assertIn(b"alice-private-unique",self.alice.get("/user/library").data)

    def test_owner_identity_not_from_form(self):
        self.assertEqual(self.add(user_id="2",owner_id="2",edition_id="999").status_code,302)
        self.assertIn(b"Private book",self.alice.get("/user/library").data)
        self.assertNotIn(b"Private book",self.bob.get("/user/library").data)

    def test_duplicate_explicit_and_edit_delete_isolated(self):
        self.assertEqual(self.add(printing="First").status_code,302)
        self.assertEqual(self.add(printing="Second").status_code,400)
        self.assertEqual(self.add(printing="Second",allow_duplicate="yes").status_code,302)
        ident=self.copy_id()
        self.assertEqual(self.alice.post(f"/user/library/{ident}/edit",data=self.data(title="Changed work",printing="Revised")|{"_csrf":self.csrf(self.alice)}).status_code,302)
        self.assertIn(b"Changed work",self.alice.get("/user/library").data)
        self.assertIn(b"Second",self.alice.get("/user/library").data)
        self.assertEqual(self.alice.post(f"/user/library/{ident}/delete",data={"_csrf":self.csrf(self.alice)}).status_code,302)
        html=self.alice.get("/user/library").data
        self.assertNotIn(b"Changed work",html)
        self.assertIn(b"Second",html)

    def test_invalid_data_rejected_without_rows(self):
        for invalid in [
            {"isbn":"9780306406158"},{"pages":"NaN"},{"pages":"0"},{"pages":"999999"},
            {"title":"x"*241},{"author":""},{"status":"admin"},{"kind":"invalid"},
            {"cover":"https://covers.openlibrary.org.evil.example/x"},
            {"cover":"javascript:alert(1)"},{"notes":"x"*4001},{"title":"a\x00b"}
        ]:
            with self.subTest(invalid=list(invalid)):
                self.assertEqual(self.add(**invalid).status_code,400)
        with app.app_context():
            self.assertEqual(db.session.execute(db.text("SELECT count(*) FROM library_copy")).scalar(),0)

    def test_xss_and_query_literal(self):
        payload='<script>alert("x")</script>'
        self.assertEqual(self.add(title=payload,notes=payload,isbn="",tags="x,y").status_code,302)
        data=self.alice.get("/user/library").data
        self.assertNotIn(payload.encode(),data)
        self.assertIn(b"&lt;script&gt;",data)
        ident=self.copy_id()
        self.assertNotIn(payload.encode(),self.alice.get(f"/user/library/{ident}/edit").data)
        self.assertNotIn(b"&lt;script&gt;",self.alice.get("/user/library?q=%25").data)
        self.assertNotIn(b"&lt;script&gt;",self.alice.get("/user/library?q=%27%20OR%201%3D1--").data)

    def test_csrf_and_cross_session_token(self):
        ident_token=self.csrf(self.alice)
        self.assertEqual(self.alice.post("/user/library/scan",data=self.data()).status_code,403)
        self.assertEqual(self.bob.post("/user/library/scan",data=self.data()|{"_csrf":ident_token}).status_code,403)
        self.assertEqual(self.alice.post("/user/library/scan",data=self.data()|{"_csrf":"wrong"}).status_code,403)

    def test_logout_get_is_not_mutating(self):
        self.assertEqual(self.alice.get("/logout").status_code,200)
        self.assertEqual(self.alice.get("/user/library").status_code,200)
        self.assertEqual(self.alice.post("/logout").status_code,403)
        self.assertEqual(self.alice.post("/logout",data={"_csrf":self.csrf(self.alice)}).status_code,302)
        self.assertEqual(self.alice.get("/user/library").status_code,302)

    def test_stolen_session_replay_after_logout(self):
        captured=self.alice.get_cookie("session").value
        self.assertEqual(self.alice.post("/logout",data={"_csrf":self.csrf(self.alice)}).status_code,302)
        replay=app.test_client()
        replay.set_cookie("session",captured)
        self.assertEqual(replay.get("/user/library").status_code,302)

    def test_expired_and_password_rotated_sessions(self):
        with app.app_context():
            user=User.query.filter_by(username="alice").first()
            AuthSession.query.filter_by(user_id=user.id).update({"expires_at":datetime.utcnow()-timedelta(seconds=1)})
            bob=User.query.filter_by(username="bob").first()
            bob.set_password("DifferentPassword123!")
            db.session.commit()
        self.assertEqual(self.alice.get("/user/library").status_code,302)
        self.assertEqual(self.bob.get("/user/library").status_code,302)

    def test_real_login_rotation_and_registration(self):
        c=app.test_client()
        token=self.csrf(c)
        self.assertEqual(c.post("/login",data={"username":"alice","password":"ValidPassword123!","_csrf":token}).status_code,302)
        self.assertEqual(c.get("/user/library").status_code,200)
        self.assertNotEqual(token,self.csrf(c))
        c=app.test_client()
        token=self.csrf(c)
        self.assertEqual(c.post("/register",data={"username":"newuser","password":"NewPassword123!","confirm_password":"NewPassword123!","_csrf":token}).status_code,302)
        with app.app_context():
            self.assertTrue(User.query.filter_by(username="newuser").first().check_password("NewPassword123!"))

    def test_metadata_api_auth_validation_and_no_store(self):
        with patch("library_routes.lookup",return_value=([],[])) as mocked:
            self.assertEqual(self.alice.post("/user/library/lookup",json={"q":"foo"}).status_code,403)
            headers={"X-CSRF-Token":self.csrf(self.alice)}
            for bad in [None, [], {}, {"q":17},{"q":"9780306406158"},{"q":"x"*161},{"q":"a\nb"}]:
                self.assertEqual(self.alice.post("/user/library/lookup",json=bad,headers=headers).status_code,400)
            mocked.assert_not_called()
            response=self.alice.post("/user/library/lookup",json={"q":"9780306406157"},headers=headers)
            self.assertEqual(response.status_code,200)
            self.assertEqual(response.json["results"],[])
            self.assertEqual(response.headers["Cache-Control"],"no-store")
            mocked.assert_called_once()

    def test_legacy_crud_and_favorites(self):
        key={"X-API-Key":"test-api-key"}
        body={"title":"Public catalog test","author":"Author","genre":"Classic","year":1900,"rating":4}
        self.assertEqual(self.alice.post("/api/books",json=body).status_code,401)
        self.assertEqual(self.alice.post("/api/books",json=[],headers=key).status_code,400)
        self.assertEqual(self.alice.post("/api/books",json=body|{"rating":"NaN"},headers=key).status_code,400)
        created=self.alice.post("/api/books",json=body,headers=key)
        self.assertEqual(created.status_code,201)
        ident=created.json["data"]["id"]
        self.assertEqual(self.alice.get(f"/api/books/{ident}").status_code,200)
        self.assertEqual(self.alice.post(f"/favorite/add/{ident}",data={"_csrf":self.csrf(self.alice)},headers={"Referer":"https://evil.example/"}).location,"/")
        self.assertIn(b"Public catalog test",self.alice.get("/user/dashboard").data)
        self.assertEqual(self.alice.put(f"/api/books/{ident}",json={"rating":5},headers=key).status_code,200)
        self.assertEqual(self.alice.delete(f"/api/books/{ident}",headers=key).status_code,200)
        with app.app_context():
            self.assertEqual(Favorite.query.count(),0)

    def test_security_headers_and_large_body(self):
        res=self.alice.get("/user/library")
        self.assertEqual(res.headers["X-Frame-Options"],"DENY")
        self.assertEqual(res.headers["X-Content-Type-Options"],"nosniff")
        csp=res.headers["Content-Security-Policy"]
        self.assertIn("frame-ancestors \'none\'",csp)
        self.assertIn("connect-src \'self\';",csp)
        self.assertNotIn("script-src \'self\' \'unsafe-inline\'",csp)
        self.assertEqual(res.headers["Cache-Control"],"no-store")
        self.assertEqual(self.alice.post("/user/library/scan",data={"_csrf":self.csrf(self.alice),"notes":"x"*70000}).status_code,413)

    def test_auth_throttle(self):
        c=app.test_client()
        token=self.csrf(c)
        for _ in range(15):
            self.assertEqual(c.post("/login",data={"username":"nonexistent","password":"bad","_csrf":token}).status_code,302)
        self.assertEqual(c.post("/login",data={"username":"nonexistent","password":"bad","_csrf":token}).status_code,429)

class MetadataTests(unittest.TestCase):
    def test_checksums(self):
        self.assertEqual(isbn13("0-306-40615-2"),"9780306406157")
        self.assertEqual(isbn13("9780306406157"),"9780306406157")
        for wrong in ["9780306406158","1234567890123","4006381333931","0-306-40615-X","１２３４５６７８９０",""]:
            self.assertIsNone(isbn13(wrong))

    def test_taxonomy_nonfiction(self):
        self.assertIn("Nonfiksi",classify(["Non-fiction"]))
        self.assertNotIn("Fiksi",classify(["Non-fiction"]))
        self.assertIn("Fiksi sejarah",classify(["Historical Fiction"]))

    def test_untrusted_cover(self):
        for val in ["https://evil.example/x","https://covers.openlibrary.org@evil.example/x","https://covers.openlibrary.org:8080/x","javascript:alert(1)","data:image/svg+xml,x","//covers.openlibrary.org/x"]:
            self.assertEqual(safe_cover(val),"")
        self.assertEqual(safe_cover("http://covers.openlibrary.org/b/id/1-M.jpg"),"https://covers.openlibrary.org/b/id/1-M.jpg")

    def test_fallback_exact_isbn_and_reject_false_match(self):
        wrong={"volumeInfo":{"title":"Wrong edition","industryIdentifiers":[{"identifier":"9780140449136"}]}}
        right={"volumeInfo":{"title":"Right edition","industryIdentifiers":[{"identifier":"9780306406157"}],"categories":["Science"]}}
        with patch("library_metadata.get_json",side_effect=[{},{"items":[wrong,right]}]):
            results,errors=lookup("9780306406157")
        self.assertEqual([r["title"] for r in results],["Right edition"])
        self.assertEqual(errors,[])

    def test_provider_failure_graceful(self):
        with patch("library_metadata.get_json",side_effect=ValueError("bad json")):
            results,warnings=lookup("Some title")
        self.assertEqual(results,[])
        self.assertEqual(len(warnings),2)

    def test_window_limit(self):
        lim=WindowLimit(limit=2,seconds=10)
        with patch("library_routes.time.monotonic",side_effect=[0,1,2,11]):
            self.assertTrue(lim.allow("a"))
            self.assertTrue(lim.allow("a"))
            self.assertFalse(lim.allow("a"))
            self.assertTrue(lim.allow("a"))

if __name__=="__main__":
    unittest.main()

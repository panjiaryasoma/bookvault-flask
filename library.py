"""Private physical-book catalog. Public catalog and favorites remain independent."""
import csv
import hashlib
import io
import json
import re
import unicodedata
import uuid
from datetime import datetime, timezone
from functools import wraps

import requests
from flask import Blueprint, abort, jsonify, redirect, render_template, request, session, url_for, Response
from sqlalchemy import UniqueConstraint, func
from sqlalchemy.exc import IntegrityError

GENRES = ("Literary Fiction", "Historical Fiction", "Political Fiction", "Mystery", "Fantasy", "Science Fiction", "Romance", "Philosophy", "Theology", "History", "Politics", "Science", "Biography", "Technology", "Other", "Unclassified")
STATUS = ("unread", "reading", "finished", "abandoned")
FORMATS = ("hardcover", "paperback", "other", "unknown")
FIELDS = {"title": 300, "author": 200, "publisher": 200, "language": 40, "translator": 200, "printing": 100, "edition": 100, "genre": 80, "tags": 500, "shelf": 100, "notes": 2000}
ISBN_RE = re.compile(r"^[0-9]{9}[0-9X]$|^[0-9]{13}$")

def isbn13(value):
    if not isinstance(value,str):
        raise ValueError("ISBN harus berupa teks.")
    value = re.sub(r"[\s-]", "", value).upper()
    if not ISBN_RE.fullmatch(value):
        raise ValueError("ISBN tidak valid.")
    if len(value) == 10:
        if sum((10-i)*(10 if c == "X" else int(c)) for i,c in enumerate(value)) % 11:
            raise ValueError("Checksum ISBN tidak valid.")
        value = "978" + value[:9]
        return value + str((-sum(int(c)*(1 if i%2==0 else 3) for i,c in enumerate(value))) % 10)
    if not value.startswith(("978", "979")) or sum(int(c)*(1 if i%2==0 else 3) for i,c in enumerate(value)) % 10:
        raise ValueError("Checksum ISBN tidak valid.")
    return value

def clean(value, maximum):
    if not isinstance(value, str):
        raise ValueError("Teks tidak valid.")
    value = unicodedata.normalize("NFC", value).strip()
    if len(value) > maximum or any(ord(c)<32 and c not in "\n\t" for c in value):
        raise ValueError("Teks terlalu panjang atau tidak valid.")
    return value

def fingerprint(*values):
    normalized = [" ".join(unicodedata.normalize("NFKC", str(v or "")).casefold().split()) for v in values]
    return hashlib.sha256(json.dumps(normalized, ensure_ascii=False).encode()).hexdigest()

def positive_int(value, maximum):
    if value in ("", None):
        return None
    if isinstance(value, bool) or not re.fullmatch(r"[0-9]{1,6}", str(value)):
        raise ValueError("Angka tidak valid.")
    n = int(value)
    if not 1 <= n <= maximum:
        raise ValueError("Angka di luar batas.")
    return n

def validate(data):
    result = {k: clean(data.get(k, ""), n) for k,n in FIELDS.items()}
    if not result["title"] or not result["author"]:
        raise ValueError("Judul dan penulis wajib diisi.")
    raw_isbn = data.get("isbn", "")
    if not isinstance(raw_isbn, str):
        raise ValueError("ISBN harus berupa teks.")
    result["isbn"] = isbn13(raw_isbn) if raw_isbn.strip() else ""
    result["year"] = positive_int(data.get("year"), datetime.now().year)
    result["pages"] = positive_int(data.get("pages"), 100000)
    result["genre"] = result["genre"] or "Unclassified"
    if result["genre"] not in GENRES:
        raise ValueError("Genre tidak valid.")
    result["format"] = data.get("format", "unknown")
    result["status"] = data.get("status", "unread")
    if result["format"] not in FORMATS or result["status"] not in STATUS:
        raise ValueError("Format atau status tidak valid.")
    result["tags"] = ", ".join(dict.fromkeys(t.strip() for t in result["tags"].split(",") if t.strip()))
    return result

def classify(subjects):
    text = " ".join(str(s) for s in subjects[:30]).casefold()
    for needles, genre in [
        (("historical fiction",), "Historical Fiction"), (("political fiction",), "Political Fiction"),
        (("science fiction",), "Science Fiction"), (("fantasy",), "Fantasy"), (("mystery", "detective"), "Mystery"),
        (("literary fiction", "classics"), "Literary Fiction"), (("romance",), "Romance"),
        (("philosophy",), "Philosophy"), (("theology", "religion"), "Theology"),
        (("biography", "autobiography"), "Biography"), (("history",), "History"),
        (("politics",), "Politics"), (("computers", "technology"), "Technology"), (("science",), "Science"),
        (("fiction",), "Literary Fiction")]:
        if any(n in text for n in needles):
            return genre
    return "Unclassified"

def lookup_metadata(query, isbn=None):
    # Fixed provider hosts, no user-controlled URLs or redirects.
    headers = {"User-Agent":"BookVault/2.0 (https://github.com/panjiaryasoma/bookvault-flask)"}
    results = []
    def get(url, params):
        with requests.get(url, params=params, headers=headers, timeout=(3,5), allow_redirects=False, stream=True) as response:
            response.raise_for_status()
            if response.status_code != 200:
                raise ValueError("Invalid provider response")
            body=bytearray()
            for chunk in response.iter_content(65536):
                body.extend(chunk)
                if len(body)>2_000_000:
                    raise ValueError("Provider response too large")
            return json.loads(body)
    def values(v):
        return [str(x)[:100] for x in v[:30]] if isinstance(v,list) else []
    def add(title, author, year, publisher, language, pages, ids, subjects, source):
        if not isinstance(title,str) or not title.strip():
            return
        valid_ids=[]
        for code in ids[:60]:
            try: valid_ids.append(isbn13(code))
            except ValueError: pass
        # Never attach an arbitrary ISBN to a title-only match.
        if isbn and isbn not in valid_ids:
            return
        results.append({"title":title[:300], "author":str(author or "")[:200], "year":str(year or "")[:4] if str(year or "")[:4].isdigit() else "", "publisher":str(publisher or "")[:200], "language":str(language or "")[:40], "pages":pages if isinstance(pages,int) and 0<pages<=100000 else "", "isbn":isbn or "", "genre":classify(subjects), "source":source})
    try:
        if isbn:
            data=get("https://openlibrary.org/api/books", {"bibkeys":"ISBN:"+isbn,"format":"json","jscmd":"data"}).get("ISBN:"+isbn,{})
            if data:
                add(data.get("title"), ", ".join(x.get("name","") for x in data.get("authors",[]) if isinstance(x,dict)), data.get("publish_date"), ", ".join(x.get("name","") for x in data.get("publishers",[]) if isinstance(x,dict)), "", data.get("number_of_pages"), [isbn], [x.get("name","") for x in data.get("subjects",[]) if isinstance(x,dict)][:30], "Open Library (ISBN)")
        else:
            data=get("https://openlibrary.org/search.json",{"q":query,"limit":8,"fields":"title,author_name,first_publish_year,subject"})
            for item in data.get("docs",[])[:8]:
                add(item.get("title"),", ".join(values(item.get("author_name"))),None,"","",None,[],values(item.get("subject")),"Open Library (work)")
    except (requests.RequestException, ValueError, TypeError, AttributeError, KeyError):
        pass
    if not results:
        try:
            data=get("https://www.googleapis.com/books/v1/volumes",{"q":"isbn:"+isbn if isbn else query,"maxResults":8,"printType":"books"})
            for item in data.get("items",[])[:8]:
                info=item.get("volumeInfo",{})
                add(info.get("title"),", ".join(values(info.get("authors"))),info.get("publishedDate"),info.get("publisher"),info.get("language"),info.get("pageCount"),[v.get("identifier","") for v in info.get("industryIdentifiers",[]) if isinstance(v,dict)],values(info.get("categories")),"Google Books")
        except (requests.RequestException, ValueError, TypeError, AttributeError, KeyError):
            pass
    return results[:8]

def register_library(app, db, User, throttle):
    class LibraryWork(db.Model):
        __tablename__ = "library_work"
        id = db.Column(db.Integer, primary_key=True)
        user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
        key = db.Column(db.String(64), nullable=False)
        title = db.Column(db.String(300), nullable=False)
        author = db.Column(db.String(200), nullable=False)
        __table_args__ = (UniqueConstraint("user_id","key"),)

    class LibraryEdition(db.Model):
        __tablename__ = "library_edition"
        id = db.Column(db.Integer, primary_key=True)
        work_id = db.Column(db.Integer, db.ForeignKey("library_work.id"), nullable=False, index=True)
        key = db.Column(db.String(64), nullable=False)
        isbn = db.Column(db.String(13), nullable=False, default="")
        publisher = db.Column(db.String(200), nullable=False, default="")
        language = db.Column(db.String(40), nullable=False, default="")
        translator = db.Column(db.String(200), nullable=False, default="")
        edition = db.Column(db.String(100), nullable=False, default="")
        format = db.Column(db.String(20), nullable=False, default="unknown")
        year = db.Column(db.Integer)
        pages = db.Column(db.Integer)
        work = db.relationship(LibraryWork)
        __table_args__ = (UniqueConstraint("work_id","key"),)

    class LibraryCopy(db.Model):
        __tablename__ = "library_copy"
        id = db.Column(db.String(36), primary_key=True)
        user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False, index=True)
        edition_id = db.Column(db.Integer, db.ForeignKey("library_edition.id"), nullable=False, index=True)
        printing = db.Column(db.String(100), nullable=False, default="")
        genre = db.Column(db.String(80), nullable=False)
        tags = db.Column(db.String(500), nullable=False, default="")
        status = db.Column(db.String(20), nullable=False)
        shelf = db.Column(db.String(100), nullable=False, default="")
        notes = db.Column(db.Text, nullable=False, default="")
        created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None), nullable=False)
        edition = db.relationship(LibraryEdition)

    app.extensions["library_models"] = (LibraryWork, LibraryEdition, LibraryCopy)
    bp = Blueprint("library", __name__, url_prefix="/library")

    def owner():
        if not session.get("user_logged_in"):
            abort(401)
        user=User.query.filter_by(username=session.get("user_username"),role="user").first()
        if not user:
            abort(401)
        return user.id

    def owned(uid):
        return LibraryCopy.query.join(LibraryEdition).join(LibraryWork).filter(LibraryCopy.user_id==uid, LibraryWork.user_id==uid)

    def get_copy(uid, copy_id):
        return owned(uid).filter(LibraryCopy.id==copy_id).first_or_404()

    def serialize(copy):
        e=copy.edition; w=e.work
        return {"id":copy.id,"title":w.title,"author":w.author, **{k:getattr(e,k) for k in ("isbn","publisher","language","translator","edition","format","year","pages")}, **{k:getattr(copy,k) for k in ("printing","genre","tags","status","shelf","notes")}}

    def edition_for(uid,d):
        key=fingerprint(d["title"],d["author"])
        w=LibraryWork.query.filter_by(user_id=uid,key=key).first()
        if not w:
            w=LibraryWork(user_id=uid,key=key,title=d["title"],author=d["author"])
            db.session.add(w); db.session.flush()
        names=("isbn","publisher","language","translator","edition","format","year","pages")
        key=fingerprint(*(d[n] for n in names))
        e=LibraryEdition.query.filter_by(work_id=w.id,key=key).first()
        if not e:
            e=LibraryEdition(work_id=w.id,key=key,**{n:d[n] for n in names})
            db.session.add(e); db.session.flush()
        return e

    def filtered(uid):
        q=owned(uid)
        term=request.args.get("q","").strip()[:200]
        genre=request.args.get("genre","")
        status=request.args.get("status","")
        if term:
            q=q.filter(db.or_(LibraryWork.title.icontains(term,autoescape=True),LibraryWork.author.icontains(term,autoescape=True),LibraryEdition.isbn.icontains(term,autoescape=True),LibraryCopy.tags.icontains(term,autoescape=True)))
        if genre in GENRES: q=q.filter(LibraryCopy.genre==genre)
        if status in STATUS: q=q.filter(LibraryCopy.status==status)
        return q.order_by(LibraryCopy.created_at.desc(),LibraryCopy.id)

    @bp.get("/")
    def index():
        if not session.get("user_logged_in"): return redirect("/login")
        uid=owner()
        page=filtered(uid).paginate(page=max(1,request.args.get("page",1,type=int)),per_page=20,error_out=False)
        return render_template("library.html", copies=[serialize(c) for c in page.items], pagination=page, genres=GENRES, statuses=STATUS, total=owned(uid).count(), finished=owned(uid).filter(LibraryCopy.status=="finished").count(), titles=owned(uid).with_entities(func.count(func.distinct(LibraryWork.id))).scalar())

    @bp.get("/scan")
    def scan():
        if not session.get("user_logged_in"): return redirect("/login")
        owner()
        return render_template("scanner.html",genres=GENRES,statuses=STATUS,formats=FORMATS,book={},copy_id="",token=str(uuid.uuid4()))

    @bp.get("/copies/<copy_id>/edit")
    def edit(copy_id):
        c=get_copy(owner(),copy_id)
        return render_template("scanner.html",genres=GENRES,statuses=STATUS,formats=FORMATS,book=serialize(c),copy_id=c.id,token=c.id)

    @bp.post("/lookup")
    def lookup():
        uid=owner()
        throttle("metadata",uid,30)
        data=request.get_json(silent=True)
        if not isinstance(data,dict): return jsonify(error="Invalid JSON"),400
        try:
            raw_isbn=clean(data.get("isbn",""),32)
            code=isbn13(raw_isbn) if raw_isbn else None
            query=clean(data.get("query",""),240)
            if not code and len(query)<2: raise ValueError("Masukkan ISBN atau judul.")
        except (ValueError,TypeError): return jsonify(error="ISBN atau judul tidak valid."),400
        return jsonify(results=lookup_metadata(query,code))

    @bp.post("/copies")
    def create():
        uid=owner()
        throttle("create-copy",uid,60)
        data=request.get_json(silent=True)
        if not isinstance(data,dict): return jsonify(error="Invalid JSON"),400
        try:
            d=validate(data)
            token=str(uuid.UUID(data.get("token","")))
        except (ValueError,TypeError,AttributeError): return jsonify(error="Metadata atau token tidak valid."),400
        existing=db.session.get(LibraryCopy,token)
        if existing:
            if existing.user_id!=uid: return jsonify(error="Conflict"),409
            original=serialize(existing)
            if any(original[k]!=v for k,v in d.items()):
                return jsonify(error="Token already used with different metadata."),409
            return jsonify(id=existing.id,duplicate=True),200
        same=owned(uid).filter(LibraryWork.key==fingerprint(d["title"],d["author"])).count()
        if same and data.get("confirm_duplicate") is not True:
            return jsonify(error="Karya ini sudah dimiliki. Simpan sebagai eksemplar lain?",duplicates=same),409
        try:
            e=edition_for(uid,d)
            c=LibraryCopy(id=token,user_id=uid,edition_id=e.id,**{k:d[k] for k in ("printing","genre","tags","status","shelf","notes")})
            db.session.add(c); db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return jsonify(error="Konflik data. Coba lagi."),409
        return jsonify(id=token),201

    @bp.put("/copies/<copy_id>")
    def update(copy_id):
        uid=owner(); c=get_copy(uid,copy_id)
        data=request.get_json(silent=True)
        if not isinstance(data,dict): return jsonify(error="Invalid JSON"),400
        try: d=validate(data)
        except (ValueError,TypeError): return jsonify(error="Metadata tidak valid."),400
        try:
            c.edition_id=edition_for(uid,d).id
            for k in ("printing","genre","tags","status","shelf","notes"): setattr(c,k,d[k])
            db.session.commit()
        except IntegrityError:
            db.session.rollback(); return jsonify(error="Konflik data. Coba lagi."),409
        return jsonify(id=c.id)

    @bp.delete("/copies/<copy_id>")
    def delete(copy_id):
        c=get_copy(owner(),copy_id)
        db.session.delete(c); db.session.commit()
        return "",204

    @bp.get("/export")
    def export():
        rows=[serialize(c) for c in owned(owner()).order_by(LibraryCopy.created_at).all()]
        if request.args.get("format")!="csv":
            response=jsonify(rows); response.headers["Content-Disposition"]='attachment; filename="bookvault.json"'; return response
        buf=io.StringIO()
        fields=["id","title","author","isbn","publisher","language","translator","edition","format","year","pages","printing","genre","tags","status","shelf","notes"]
        writer=csv.DictWriter(buf,fieldnames=fields); writer.writeheader()
        def safe(v):
            if isinstance(v,str) and (v.startswith(("\t","\r","\n")) or v.lstrip().startswith(("=","+","-","@"))): return "'"+v
            return v
        for row in rows: writer.writerow({k:safe(v) for k,v in row.items()})
        return Response(buf.getvalue(),mimetype="text/csv",headers={"Content-Disposition":'attachment; filename="bookvault.csv"'})

    app.register_blueprint(bp)

"""Private physical collection; intentionally separate from public coursework catalog."""
import os
import re
import csv
import io
import secrets
import threading
import time
from collections import OrderedDict, deque
from datetime import datetime, timezone
from flask import Blueprint, request, render_template, session, redirect, url_for, abort, jsonify, flash, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from library_metadata import isbn13, normalized, safe_cover, lookup

STATUS = ("unread","reading","finished","paused")
KINDS = ("","Fiksi","Nonfiksi","Puisi","Drama","Esai","Kumpulan cerpen","Referensi","Lainnya")
FORM_FIELDS = {"title":240,"author":240,"isbn":32,"publisher":240,"year":40,"printing":100,
               "translator":240,"language":80,"format":80,"pages":8,"genre":100,"kind":80,
               "tags":600,"status":20,"condition":100,"shelf":100,"notes":4000,"cover":1000}

class WindowLimit:
    """Bounded per-process limiter. Production needs shared ingress limiting too."""
    def __init__(self, limit=20, seconds=60):
        self.limit, self.seconds = limit, seconds
        self.data = OrderedDict()
        self.lock = threading.Lock()
    def allow(self, key):
        with self.lock:
            now=time.monotonic()
            if key not in self.data and len(self.data)>=4096:
                self.data.popitem(last=False)
            queue=self.data.setdefault(key,deque())
            self.data.move_to_end(key)
            while queue and queue[0]<=now-self.seconds:
                queue.popleft()
            if len(queue)>=self.limit:
                return False
            queue.append(now)
            return True

def register_library(app, db, User, login_required):
    class LibraryWork(db.Model):
        __tablename__="library_work"
        id=db.Column(db.Integer, primary_key=True)
        user_id=db.Column(db.Integer, db.ForeignKey("user.id",ondelete="CASCADE"),nullable=False,index=True)
        title=db.Column(db.String(240),nullable=False)
        author=db.Column(db.String(240),nullable=False)
        title_key=db.Column(db.String(500),nullable=False)
        author_key=db.Column(db.String(500),nullable=False)
        __table_args__=(db.UniqueConstraint("user_id","title_key","author_key",name="uq_library_work_owner_title"),)

    class LibraryEdition(db.Model):
        __tablename__="library_edition"
        id=db.Column(db.Integer,primary_key=True)
        work_id=db.Column(db.Integer,db.ForeignKey("library_work.id",ondelete="CASCADE"),nullable=False,index=True)
        work=db.relationship(LibraryWork)
        isbn=db.Column(db.String(13),index=True)
        publisher=db.Column(db.String(240))
        year=db.Column(db.String(40))
        printing=db.Column(db.String(100))
        translator=db.Column(db.String(240))
        language=db.Column(db.String(80))
        format=db.Column(db.String(80))
        pages=db.Column(db.Integer)
        cover=db.Column(db.String(1000))

    class LibraryCopy(db.Model):
        __tablename__="library_copy"
        id=db.Column(db.Integer,primary_key=True)
        edition_id=db.Column(db.Integer,db.ForeignKey("library_edition.id",ondelete="CASCADE"),nullable=False,unique=True)
        submission_key=db.Column(db.String(32),nullable=False,unique=True)
        edition=db.relationship(LibraryEdition)
        genre=db.Column(db.String(100))
        kind=db.Column(db.String(80))
        tags=db.Column(db.String(600))
        status=db.Column(db.String(20),nullable=False,default="unread")
        condition=db.Column(db.String(100))
        shelf=db.Column(db.String(100))
        notes=db.Column(db.Text)
        created_at=db.Column(db.DateTime(timezone=True),default=lambda:datetime.now(timezone.utc),nullable=False)
        __table_args__=(db.CheckConstraint("status IN ('unread','reading','finished','paused')",name="ck_library_copy_status"),)

    bp=Blueprint("library",__name__,url_prefix="/user/library")
    limit=WindowLimit()

    def owner():
        return User.query.filter_by(username=session.get("user_username"),role="user").first_or_404()

    def owned(user):
        return LibraryCopy.query.join(LibraryEdition).join(LibraryWork).filter(LibraryWork.user_id==user.id)

    def one(user, copy_id):
        return owned(user).filter(LibraryCopy.id==copy_id).first_or_404()

    def data_for(copy):
        if copy is None:
            return {"status":"unread","submission_key":secrets.token_urlsafe(24)}
        e=copy.edition
        return {"title":e.work.title,"author":e.work.author,**{k:getattr(e,k) or "" for k in ("isbn","publisher","year","printing","translator","language","format","pages","cover")},
                **{k:getattr(copy,k) or "" for k in ("genre","kind","tags","status","condition","shelf","notes")}}

    def parse():
        data={k:request.form.get(k,"").strip() for k in FORM_FIELDS}
        for k,n in FORM_FIELDS.items():
            if len(data[k])>n or "\x00" in data[k]:
                return data,f"Field {k} invalid or too long."
        if not data["title"] or not data["author"]:
            return data,"Judul dan penulis wajib diisi (gunakan Tidak diketahui jika perlu)."
        if max(len(normalized(data["title"])),len(normalized(data["author"])))>500:
            return data,"Judul atau penulis terlalu panjang setelah normalisasi."
        if data["isbn"]:
            number=isbn13(data["isbn"])
            if not number:
                return data,"ISBN tidak valid. Periksa digit checksum atau kosongkan."
            data["isbn"]=number
        if data["pages"] and (not re.fullmatch(r"[0-9]{1,6}",data["pages"]) or not 1<=int(data["pages"])<=100000):
            return data,"Jumlah halaman harus 1–100000."
        if data["status"] not in STATUS or data["kind"] not in KINDS:
            return data,"Status atau tipe tidak valid."
        if data["cover"] and not safe_cover(data["cover"]):
            return data,"URL sampul bukan dari penyedia yang didukung."
        data["cover"]=safe_cover(data["cover"])
        data["tags"]=", ".join(dict.fromkeys(t.strip() for t in data["tags"].split(",") if t.strip()))
        return data,None

    def save(user,copy=None):
        data,error=parse()
        warning=False
        submission=request.form.get("submission_key","")
        target="library.scan" if not copy and request.form.get("next")=="scan" else "library.index"
        if not copy:
            data["submission_key"]=submission if re.fullmatch(r"[A-Za-z0-9_-]{32}",submission) else secrets.token_urlsafe(24)
            if data["submission_key"]!=submission:
                error="Formulir kedaluwarsa. Periksa data dan kirim kembali."
            elif owned(user).filter(LibraryCopy.submission_key==submission).first():
                flash("Eksemplar sudah tersimpan.","success")
                return redirect(url_for(target))
        if not error:
            q=owned(user)
            if copy:
                q=q.filter(LibraryCopy.id!=copy.id)
            same_work=(LibraryWork.title_key==normalized(data["title"])) & (LibraryWork.author_key==normalized(data["author"]))
            matches=q.filter(or_(LibraryEdition.isbn==data["isbn"],same_work) if data["isbn"] else same_work).first()
            if not copy and matches and request.form.get("allow_duplicate")!="yes":
                warning=True
                error="Karya atau ISBN serupa sudah ada. Centang konfirmasi jika ini eksemplar/edisi lain."
        if error:
            return render_template("library_scan.html",data=data,copy=copy,error=error,warning=warning,statuses=STATUS,kinds=KINDS),400
        work=LibraryWork.query.filter_by(user_id=user.id,title_key=normalized(data["title"]),author_key=normalized(data["author"])).first()
        original_copy=copy
        old_work=copy.edition.work if copy else None
        try:
            if work is None:
                work=LibraryWork(user_id=user.id,title=data["title"],author=data["author"],title_key=normalized(data["title"]),author_key=normalized(data["author"]))
                db.session.add(work)
                db.session.flush()
            e=copy.edition if copy else LibraryEdition()
            e.work=work
            for k in ("isbn","publisher","year","printing","translator","language","format","cover"):
                setattr(e,k,data[k] or None)
            e.pages=int(data["pages"]) if data["pages"] else None
            if copy is None:
                copy=LibraryCopy(edition=e,submission_key=submission)
                db.session.add(copy)
            for k in ("genre","kind","tags","status","condition","shelf","notes"):
                setattr(copy,k,data[k])
            db.session.flush()
            if old_work and old_work.id != work.id and not LibraryEdition.query.filter_by(work_id=old_work.id).first():
                db.session.delete(old_work)
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            if not original_copy and owned(user).filter(LibraryCopy.submission_key==submission).first():
                flash("Eksemplar sudah tersimpan.","success")
                return redirect(url_for(target))
            return render_template("library_scan.html",data=data,copy=original_copy,error="Perubahan bersamaan terdeteksi. Coba lagi.",warning=False,statuses=STATUS,kinds=KINDS),409
        flash("Buku tersimpan.","success")
        return redirect(url_for(target))

    @bp.get("")
    @login_required
    def index():
        user=owner()
        q=owned(user)
        total=q.count()
        titles=LibraryWork.query.filter_by(user_id=user.id).filter(
            LibraryWork.id.in_(db.session.query(LibraryEdition.work_id).join(LibraryCopy))).count()
        finished=q.filter(LibraryCopy.status=="finished").count()
        term=request.args.get("q","").strip()[:160]
        genre=request.args.get("genre","").strip()[:100]
        status=request.args.get("status","")
        language=request.args.get("language","").strip()[:80]
        kind=request.args.get("kind","").strip()[:80]
        if term:
            # Escape LIKE wildcards so search treats them literally.
            pattern="%"+term.replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%"
            q=q.filter(or_(LibraryWork.title.ilike(pattern,escape="\\"),LibraryWork.author.ilike(pattern,escape="\\"),LibraryEdition.isbn.ilike(pattern,escape="\\"),LibraryCopy.tags.ilike(pattern,escape="\\")))
        if genre: q=q.filter(LibraryCopy.genre==genre)
        if status in STATUS: q=q.filter(LibraryCopy.status==status)
        if language: q=q.filter(LibraryEdition.language==language)
        if kind in KINDS and kind: q=q.filter(LibraryCopy.kind==kind)
        genres=[v[0] for v in owned(user).with_entities(LibraryCopy.genre).filter(LibraryCopy.genre!="").distinct().order_by(LibraryCopy.genre)]
        languages=[v[0] for v in owned(user).with_entities(LibraryEdition.language).filter(LibraryEdition.language.isnot(None)).distinct().order_by(LibraryEdition.language)]
        page=min(10000,max(1,request.args.get("page",1,type=int)))
        rows=q.order_by(LibraryCopy.id.desc()).paginate(page=page,per_page=24,error_out=False)
        return render_template("library_collection.html",rows=rows,total=total,titles=titles,finished=finished,genres=genres,languages=languages,statuses=STATUS,kinds=KINDS,term=term,genre=genre,status=status,language=language,kind=kind)

    @bp.route("/scan",methods=["GET","POST"])
    @login_required
    def scan():
        if request.method=="POST": return save(owner())
        return render_template("library_scan.html",data=data_for(None),copy=None,error=None,warning=False,statuses=STATUS,kinds=KINDS)

    @bp.route("/<int:copy_id>/edit",methods=["GET","POST"])
    @login_required
    def edit(copy_id):
        user=owner()
        copy=one(user,copy_id)
        if request.method=="POST": return save(user,copy)
        return render_template("library_scan.html",data=data_for(copy),copy=copy,error=None,warning=False,statuses=STATUS,kinds=KINDS)

    @bp.post("/<int:copy_id>/delete")
    @login_required
    def delete(copy_id):
        copy=one(owner(),copy_id)
        e=copy.edition
        w=e.work
        db.session.delete(copy)
        db.session.flush()
        db.session.delete(e)
        db.session.flush()
        if not LibraryEdition.query.filter_by(work_id=w.id).first():
            db.session.delete(w)
        db.session.commit()
        flash("Eksemplar dihapus.","success")
        return redirect(url_for("library.index"))

    @bp.get("/export")
    @login_required
    def export_collection():
        fmt=request.args.get("format","json")
        if fmt not in {"json","csv"}:
            abort(400)
        q=owned(owner()).order_by(LibraryCopy.id)
        if q.count()>20000:
            abort(413)
        items=[dict(data_for(copy),copy_id=copy.id,created_at=copy.created_at.isoformat()) for copy in q.all()]
        if fmt=="json":
            response=jsonify(schema_version=1,collection=items)
        else:
            output=io.StringIO(newline="")
            fields=["copy_id",*FORM_FIELDS,"created_at"]
            writer=csv.DictWriter(output,fieldnames=fields,extrasaction="ignore")
            writer.writeheader()
            def csv_safe(value):
                if not isinstance(value,str):
                    return value
                if re.match(r"^[\s\uFEFF]*[=+\-@]",value) or value.startswith(("\t","\r","\n")):
                    return "'"+value
                return value
            writer.writerows({k:csv_safe(v) for k,v in item.items()} for item in items)
            response=Response("\ufeff"+output.getvalue(),mimetype="text/csv")
        response.headers["Content-Disposition"]=f'attachment; filename="bookvault-collection.{fmt}"'
        return response

    @bp.post("/lookup")
    @login_required
    def metadata():
        user=owner()
        if not limit.allow(user.id):
            return jsonify(error="Too many lookup requests"),429
        payload=request.get_json(silent=True)
        if not isinstance(payload,dict) or not isinstance(payload.get("q"),str):
            return jsonify(error="Invalid query"),400
        query=payload["q"].strip()
        if not 2<=len(query)<=160 or any(ord(c)<32 for c in query):
            return jsonify(error="Invalid query"),400
        compact=re.sub(r"[\s-]","",query)
        if re.fullmatch(r"[0-9]{9,13}X?",compact) and not isbn13(query):
            return jsonify(error="Invalid ISBN checksum"),400
        results,errors=lookup(query,os.getenv("GOOGLE_BOOKS_API_KEY"))
        return jsonify(results=results,warnings=errors)

    app.register_blueprint(bp)

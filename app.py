from flask import Flask, request, jsonify, render_template, session, redirect
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from dotenv import load_dotenv
from sqlalchemy import func
from functools import wraps
import os
import requests

load_dotenv()

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.abspath(os.path.dirname(__file__))

app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(BASE_DIR, "bookvault.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = os.getenv("BOOKVAULT_SECRET_KEY", "bookvault-secret-key")
app.config["API_KEY"] = os.getenv("BOOKVAULT_API_KEY")

if not app.config["API_KEY"]:
    raise ValueError("BOOKVAULT_API_KEY belum diatur di file .env")

db = SQLAlchemy(app)


def set_alert(message, category="success"):
    session["alert_message"] = message
    session["alert_category"] = category


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("user_logged_in"):
            set_alert("Silakan login terlebih dahulu.", "warning")
            return redirect("/login")

        username = session.get("user_username")
        user = User.query.filter_by(username=username).first()

        if not user or user.role != "user":
            session.clear()
            set_alert("Session user tidak valid. Silakan login ulang.", "error")
            return redirect("/login")

        return f(*args, **kwargs)

    return wrapper


def admin_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not session.get("admin_logged_in"):
            set_alert("Silakan login sebagai admin.", "warning")
            return redirect("/admin/login")

        username = session.get("admin_username")
        user = User.query.filter_by(username=username).first()

        if not user or user.role != "admin":
            session.clear()
            set_alert("Session admin tidak valid. Silakan login ulang.", "error")
            return redirect("/admin/login")

        return f(*args, **kwargs)

    return wrapper


def api_key_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        api_key = request.headers.get("X-API-Key")

        if api_key != app.config["API_KEY"]:
            return jsonify({
                "error": "Unauthorized",
                "message": "Valid API key is required"
            }), 401

        return f(*args, **kwargs)

    return wrapper


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default="user")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class Book(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(150), nullable=False)
    author = db.Column(db.String(100), nullable=False)
    genre = db.Column(db.String(80), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    rating = db.Column(db.Float, default=0)
    description = db.Column(db.Text)
    cover_image = db.Column(db.String(255), default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "author": self.author,
            "genre": self.genre,
            "year": self.year,
            "rating": self.rating,
            "description": self.description,
            "cover_image": self.cover_image,
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "updated_at": self.updated_at.strftime("%Y-%m-%d %H:%M:%S")
        }


class Favorite(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    book_id = db.Column(db.Integer, db.ForeignKey("book.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User", backref="favorites")
    book = db.relationship("Book", backref="favorited_by")


def seed_data():
    if User.query.first() is None:
        admin = User(username="admin", role="admin")
        admin.set_password("admin123")
        db.session.add(admin)

    if Book.query.first() is None:
        books = [
            Book(
                title="The Secret History",
                author="Donna Tartt",
                genre="Dark Academia",
                year=1992,
                rating=4.6,
                description="Novel misteri akademik tentang kelompok mahasiswa klasik."
            ),
            Book(
                title="If We Were Villains",
                author="M. L. Rio",
                genre="Dark Academia",
                year=2017,
                rating=4.4,
                description="Kisah mahasiswa teater Shakespeare dengan konflik gelap."
            ),
            Book(
                title="Norwegian Wood",
                author="Haruki Murakami",
                genre="Literary Fiction",
                year=1987,
                rating=4.2,
                description="Novel tentang kehilangan, cinta, dan masa muda."
            ),
            Book(
                title="The Picture of Dorian Gray",
                author="Oscar Wilde",
                genre="Classic",
                year=1890,
                rating=4.5,
                description="Kisah klasik tentang kecantikan, moralitas, dan kehancuran diri."
            ),
            Book(
                title="Crime and Punishment",
                author="Fyodor Dostoevsky",
                genre="Classic",
                year=1866,
                rating=4.7,
                description="Novel psikologis tentang kejahatan, rasa bersalah, dan penebusan."
            ),
            Book(
                title="Confessions",
                author="Kanae Minato",
                genre="Mystery",
                year=2008,
                rating=4.3,
                description="Thriller Jepang tentang balas dendam dan rahasia di sekolah."
            )
        ]
        db.session.add_all(books)

    db.session.commit()


def _normalize_year(raw_value):
    if raw_value is None:
        return ""

    value = str(raw_value).strip()
    if len(value) >= 4 and value[:4].isdigit():
        return value[:4]

    return ""


def _fetch_open_library(keyword):
    url = "https://openlibrary.org/search.json"
    params = {
        "q": keyword,
        "limit": 12,
        "fields": "title,author_name,first_publish_year,edition_count,cover_i"
    }
    headers = {
        "User-Agent": "BookVault/1.0 (+https://github.com/panjiaryasoma/bookvault-flask)",
        "Accept": "application/json"
    }

    response = requests.get(
        url,
        params=params,
        headers=headers,
        timeout=(3, 7)
    )
    response.raise_for_status()

    data = response.json()
    books = []

    for item in data.get("docs", []):
        cover_id = item.get("cover_i")
        cover_url = (
            f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg"
            if cover_id else ""
        )

        authors = item.get("author_name") or ["Tidak diketahui"]

        books.append({
            "title": item.get("title", "Tanpa Judul"),
            "author": ", ".join(authors),
            "year": _normalize_year(item.get("first_publish_year")),
            "edition_count": item.get("edition_count", 0),
            "cover_url": cover_url,
            "source": "Open Library"
        })

    return books


def _fetch_google_books(keyword):
    url = "https://www.googleapis.com/books/v1/volumes"
    params = {
        "q": keyword,
        "maxResults": 12,
        "printType": "books"
    }

    google_api_key = os.getenv("GOOGLE_BOOKS_API_KEY")
    if google_api_key:
        params["key"] = google_api_key

    headers = {
        "Accept": "application/json",
        "User-Agent": "BookVault/1.0"
    }

    response = requests.get(
        url,
        params=params,
        headers=headers,
        timeout=(3, 9)
    )
    response.raise_for_status()

    data = response.json()
    books = []

    for item in data.get("items", []):
        info = item.get("volumeInfo") or {}
        image_links = info.get("imageLinks") or {}
        cover_url = image_links.get("thumbnail") or image_links.get("smallThumbnail") or ""

        if cover_url.startswith("http://"):
            cover_url = "https://" + cover_url[len("http://"):]

        authors = info.get("authors") or ["Tidak diketahui"]

        books.append({
            "title": info.get("title", "Tanpa Judul"),
            "author": ", ".join(authors),
            "year": _normalize_year(info.get("publishedDate")),
            "edition_count": "-",
            "cover_url": cover_url,
            "source": "Google Books"
        })

    return books


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "message": "BookVault API is running"
    }), 200


@app.route("/api/books", methods=["GET"])
def get_books():
    q = request.args.get("q", "").lower()
    genre = request.args.get("genre", "").lower()

    query = Book.query

    if q:
        query = query.filter(
            (Book.title.ilike(f"%{q}%")) |
            (Book.author.ilike(f"%{q}%"))
        )

    if genre:
        query = query.filter(Book.genre.ilike(f"%{genre}%"))

    books = query.order_by(Book.id.asc()).all()

    return jsonify({
        "total": len(books),
        "data": [book.to_dict() for book in books]
    }), 200


@app.route("/api/books/<int:book_id>", methods=["GET"])
def get_book(book_id):
    book = db.session.get(Book, book_id)

    if not book:
        return jsonify({"error": "Book not found"}), 404

    return jsonify(book.to_dict()), 200


@app.route("/api/books", methods=["POST"])
@api_key_required
def create_book():
    data = request.get_json(silent=True)

    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    title = str(data.get("title", "")).strip()
    author = str(data.get("author", "")).strip()
    genre = str(data.get("genre", "")).strip()
    year_raw = str(data.get("year", "")).strip()
    rating_raw = str(data.get("rating", 0)).strip()
    description = str(data.get("description", "")).strip()
    cover_image = str(data.get("cover_image", "")).strip()

    missing = []
    if not title:
        missing.append("title")
    if not author:
        missing.append("author")
    if not genre:
        missing.append("genre")
    if not year_raw:
        missing.append("year")

    if missing:
        return jsonify({
            "error": "Missing required fields",
            "missing_fields": missing
        }), 400

    try:
        year_value = int(year_raw)
    except (TypeError, ValueError):
        return jsonify({
            "error": "Invalid year",
            "message": "Year must be a number"
        }), 400

    current_year = datetime.now().year
    if year_value < 1000 or year_value > current_year:
        return jsonify({
            "error": "Invalid year",
            "message": f"Year must be between 1000 and {current_year}"
        }), 400

    try:
        rating_value = float(rating_raw) if rating_raw else 0
    except (TypeError, ValueError):
        return jsonify({
            "error": "Invalid rating",
            "message": "Rating must be a number"
        }), 400

    if rating_value < 0 or rating_value > 5:
        return jsonify({
            "error": "Invalid rating",
            "message": "Rating must be between 0 and 5"
        }), 400

    existing_book = Book.query.filter(
        Book.title.ilike(title),
        Book.author.ilike(author)
    ).first()

    if existing_book:
        return jsonify({
            "error": "Duplicate book",
            "message": "Book with the same title and author already exists"
        }), 409

    book = Book(
        title=title,
        author=author,
        genre=genre,
        year=year_value,
        rating=rating_value,
        description=description,
        cover_image=cover_image
    )

    db.session.add(book)
    db.session.commit()

    return jsonify({
        "message": "Book created successfully",
        "data": book.to_dict()
    }), 201


@app.route("/api/books/<int:book_id>", methods=["PUT"])
@api_key_required
def update_book(book_id):
    book = db.session.get(Book, book_id)

    if not book:
        return jsonify({"error": "Book not found"}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    new_title = str(data.get("title", book.title)).strip()
    new_author = str(data.get("author", book.author)).strip()
    new_genre = str(data.get("genre", book.genre)).strip()
    new_description = str(data.get("description", book.description or "")).strip()
    new_cover_image = str(data.get("cover_image", book.cover_image or "")).strip()

    missing = []
    if not new_title:
        missing.append("title")
    if not new_author:
        missing.append("author")
    if not new_genre:
        missing.append("genre")

    if missing:
        return jsonify({
            "error": "Missing required fields",
            "missing_fields": missing
        }), 400

    try:
        year_value = int(data["year"]) if "year" in data else book.year
    except (TypeError, ValueError):
        return jsonify({
            "error": "Invalid year",
            "message": "Year must be a number"
        }), 400

    current_year = datetime.now().year
    if year_value < 1000 or year_value > current_year:
        return jsonify({
            "error": "Invalid year",
            "message": f"Year must be between 1000 and {current_year}"
        }), 400

    try:
        rating_value = float(data["rating"]) if "rating" in data else book.rating
    except (TypeError, ValueError):
        return jsonify({
            "error": "Invalid rating",
            "message": "Rating must be a number"
        }), 400

    if rating_value < 0 or rating_value > 5:
        return jsonify({
            "error": "Invalid rating",
            "message": "Rating must be between 0 and 5"
        }), 400

    existing_book = Book.query.filter(
        Book.id != book.id,
        Book.title.ilike(new_title),
        Book.author.ilike(new_author)
    ).first()

    if existing_book:
        return jsonify({
            "error": "Duplicate book",
            "message": "Another book with the same title and author already exists"
        }), 409

    book.title = new_title
    book.author = new_author
    book.genre = new_genre
    book.year = year_value
    book.rating = rating_value
    book.description = new_description
    book.cover_image = new_cover_image

    db.session.commit()

    return jsonify({
        "message": "Book updated successfully",
        "data": book.to_dict()
    }), 200


@app.route("/api/books/<int:book_id>", methods=["DELETE"])
@api_key_required
def delete_book(book_id):
    book = db.session.get(Book, book_id)

    if not book:
        return jsonify({"error": "Book not found"}), 404

    Favorite.query.filter_by(book_id=book.id).delete()
    db.session.delete(book)
    db.session.commit()

    return jsonify({"message": "Book deleted successfully"}), 200


@app.route("/api/docs", methods=["GET"])
@admin_required
def api_docs():
    endpoints = [
        {
            "method": "GET",
            "endpoint": "/api/health",
            "description": "Mengecek status API BookVault.",
            "api_key": "Tidak perlu"
        },
        {
            "method": "GET",
            "endpoint": "/api/books",
            "description": "Mengambil seluruh data buku lokal.",
            "api_key": "Tidak perlu"
        },
        {
            "method": "GET",
            "endpoint": "/api/books/<id>",
            "description": "Mengambil detail buku berdasarkan ID.",
            "api_key": "Tidak perlu"
        },
        {
            "method": "POST",
            "endpoint": "/api/books",
            "description": "Menambahkan data buku baru.",
            "api_key": "Wajib"
        },
        {
            "method": "PUT",
            "endpoint": "/api/books/<id>",
            "description": "Mengubah data buku berdasarkan ID.",
            "api_key": "Wajib"
        },
        {
            "method": "DELETE",
            "endpoint": "/api/books/<id>",
            "description": "Menghapus data buku berdasarkan ID.",
            "api_key": "Wajib"
        }
    ]

    return render_template("api_docs.html", endpoints=endpoints)


@app.route("/", methods=["GET"])
def index():
    q = request.args.get("q", "").strip()
    selected_genre = request.args.get("genre", "").strip()
    page = request.args.get("page", 1, type=int)
    per_page = 8

    query = Book.query

    if q:
        query = query.filter(
            (Book.title.ilike(f"%{q}%")) |
            (Book.author.ilike(f"%{q}%"))
        )

    if selected_genre:
        query = query.filter(Book.genre.ilike(f"%{selected_genre}%"))

    pagination = query.order_by(Book.id.asc()).paginate(
        page=page,
        per_page=per_page,
        error_out=False
    )

    books = pagination.items

    genres = [
        row[0] for row in db.session.query(Book.genre)
        .filter(Book.genre.isnot(None))
        .distinct()
        .order_by(Book.genre.asc())
        .all()
    ]

    favorite_ids = []

    if session.get("user_logged_in"):
        user = User.query.filter_by(username=session.get("user_username")).first()
        if user:
            favorite_ids = [
                favorite.book_id
                for favorite in Favorite.query.filter_by(user_id=user.id).all()
            ]

    return render_template(
        "index.html",
        books=books,
        genres=genres,
        q=q,
        selected_genre=selected_genre,
        favorite_ids=favorite_ids,
        pagination=pagination
    )


@app.route("/book/<int:book_id>", methods=["GET"])
def book_detail(book_id):
    book = db.session.get(Book, book_id)

    if not book:
        return render_template("404.html"), 404

    return render_template("detail.html", book=book)


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()

        user = User.query.filter_by(username=username).first()

        if user and user.check_password(password) and user.role == "admin":
            session.clear()
            session["admin_logged_in"] = True
            session["admin_username"] = user.username
            set_alert("Login admin berhasil.", "success")
            return redirect("/admin")

        set_alert("Username/password salah atau bukan admin.", "error")
        return redirect("/admin/login")

    return render_template("admin_login.html", error=None)


@app.route("/admin/logout")
def admin_logout():
    session.clear()
    set_alert("Logout admin berhasil.", "success")
    return redirect("/admin/login")


@app.route("/admin", methods=["GET"])
@admin_required
def admin_dashboard():
    q = request.args.get("q", "").strip()
    selected_genre = request.args.get("genre", "").strip()

    book_query = Book.query

    if q:
        book_query = book_query.filter(
            (Book.title.ilike(f"%{q}%")) |
            (Book.author.ilike(f"%{q}%"))
        )

    if selected_genre:
        book_query = book_query.filter(Book.genre.ilike(f"%{selected_genre}%"))

    books = book_query.order_by(Book.id.asc()).all()

    total_books = Book.query.count()
    total_users = User.query.count()

    total_genres = (
        db.session.query(Book.genre)
        .filter(Book.genre.isnot(None), Book.genre != "")
        .distinct()
        .count()
    )

    avg_rating_value = (
        db.session.query(func.avg(Book.rating))
        .filter(Book.rating > 0)
        .scalar()
    )
    avg_rating = round(avg_rating_value or 0, 2)

    genre_raw = (
        db.session.query(Book.genre, func.count(Book.id))
        .filter(Book.genre.isnot(None), Book.genre != "")
        .group_by(Book.genre)
        .order_by(func.count(Book.id).desc())
        .all()
    )

    max_genre_count = max([total for _genre, total in genre_raw], default=1)

    genre_stats = [
        {
            "genre": genre,
            "total": total,
            "percent": int((total / max_genre_count) * 100)
        }
        for genre, total in genre_raw
    ]

    top_books = (
        Book.query
        .filter(Book.rating > 0)
        .order_by(Book.rating.desc())
        .limit(5)
        .all()
    )

    genres = [
        row[0] for row in db.session.query(Book.genre)
        .filter(Book.genre.isnot(None), Book.genre != "")
        .distinct()
        .order_by(Book.genre.asc())
        .all()
    ]

    return render_template(
        "admin_dashboard.html",
        books=books,
        username=session.get("admin_username"),
        total_books=total_books,
        total_users=total_users,
        total_genres=total_genres,
        avg_rating=avg_rating,
        genre_stats=genre_stats,
        top_books=top_books,
        genres=genres,
        q=q,
        selected_genre=selected_genre,
    )


def _validate_admin_book_form(form):
    title = form.get("title", "").strip()
    author = form.get("author", "").strip()
    genre = form.get("genre", "").strip()
    year_raw = form.get("year", "").strip()
    rating_raw = form.get("rating", "0").strip()
    description = form.get("description", "").strip()

    if not title or not author or not genre or not year_raw:
        return None, "Judul, penulis, genre, dan tahun wajib diisi."

    try:
        year_value = int(year_raw)
    except ValueError:
        return None, "Tahun harus berupa angka."

    current_year = datetime.now().year
    if year_value < 1000 or year_value > current_year:
        return None, f"Tahun harus berada di antara 1000 sampai {current_year}."

    try:
        rating_value = float(rating_raw) if rating_raw else 0
    except ValueError:
        return None, "Rating harus berupa angka."

    if rating_value < 0 or rating_value > 5:
        return None, "Rating harus berada di antara 0 sampai 5."

    return {
        "title": title,
        "author": author,
        "genre": genre,
        "year": year_value,
        "rating": rating_value,
        "description": description
    }, None


@app.route("/admin/book/add", methods=["GET", "POST"])
@admin_required
def admin_add_book():
    if request.method == "POST":
        data, error = _validate_admin_book_form(request.form)

        if error:
            set_alert(error, "error")
            return render_template(
                "admin_form.html",
                title="Tambah Buku",
                book=None,
                error=None
            )

        existing_book = Book.query.filter(
            Book.title.ilike(data["title"]),
            Book.author.ilike(data["author"])
        ).first()

        if existing_book:
            set_alert("Buku dengan judul dan penulis yang sama sudah ada.", "warning")
            return render_template(
                "admin_form.html",
                title="Tambah Buku",
                book=None,
                error=None
            )

        new_book = Book(**data)
        db.session.add(new_book)
        db.session.commit()

        set_alert("Buku berhasil ditambahkan.", "success")
        return redirect("/admin")

    return render_template(
        "admin_form.html",
        title="Tambah Buku",
        book=None,
        error=None
    )


@app.route("/admin/book/edit/<int:book_id>", methods=["GET", "POST"])
@admin_required
def admin_edit_book(book_id):
    book = db.session.get(Book, book_id)

    if not book:
        set_alert("Buku tidak ditemukan.", "error")
        return redirect("/admin")

    if request.method == "POST":
        data, error = _validate_admin_book_form(request.form)

        if error:
            set_alert(error, "error")
            return render_template(
                "admin_form.html",
                title="Edit Buku",
                book=book,
                error=None
            )

        existing_book = Book.query.filter(
            Book.id != book.id,
            Book.title.ilike(data["title"]),
            Book.author.ilike(data["author"])
        ).first()

        if existing_book:
            set_alert("Buku lain dengan judul dan penulis yang sama sudah ada.", "warning")
            return render_template(
                "admin_form.html",
                title="Edit Buku",
                book=book,
                error=None
            )

        book.title = data["title"]
        book.author = data["author"]
        book.genre = data["genre"]
        book.year = data["year"]
        book.rating = data["rating"]
        book.description = data["description"]

        db.session.commit()

        set_alert("Data buku berhasil diperbarui.", "success")
        return redirect("/admin")

    return render_template(
        "admin_form.html",
        title="Edit Buku",
        book=book,
        error=None
    )


@app.route("/admin/book/delete/<int:book_id>", methods=["POST"])
@admin_required
def admin_delete_book(book_id):
    book = db.session.get(Book, book_id)

    if not book:
        set_alert("Buku tidak ditemukan.", "error")
        return redirect("/admin")

    Favorite.query.filter_by(book_id=book.id).delete()
    db.session.delete(book)
    db.session.commit()

    set_alert("Data buku berhasil dihapus.", "success")
    return redirect("/admin")


@app.route("/public-books", methods=["GET"])
def public_books():
    keyword = request.args.get("q", "python").strip() or "python"
    books = []
    error = None
    provider = None

    try:
        books = _fetch_open_library(keyword)
        provider = "Open Library"
    except requests.RequestException as exc:
        app.logger.warning("Open Library request failed: %s", exc)

        try:
            books = _fetch_google_books(keyword)
            provider = "Google Books"
        except requests.RequestException as fallback_exc:
            app.logger.warning("Google Books fallback failed: %s", fallback_exc)
            error = (
                "Open Library dan sumber cadangan sementara tidak dapat diakses. "
                "Silakan coba lagi beberapa saat."
            )
        except (TypeError, ValueError, KeyError) as fallback_parse_exc:
            app.logger.warning("Google Books response could not be parsed: %s", fallback_parse_exc)
            error = (
                "Sumber cadangan merespons, tetapi datanya tidak dapat dibaca. "
                "Silakan coba lagi."
            )
    except (TypeError, ValueError, KeyError) as exc:
        app.logger.warning("Open Library response could not be parsed: %s", exc)

        try:
            books = _fetch_google_books(keyword)
            provider = "Google Books"
        except requests.RequestException as fallback_exc:
            app.logger.warning("Google Books fallback failed: %s", fallback_exc)
            error = (
                "Data API publik sementara tidak dapat diakses. "
                "Silakan coba lagi beberapa saat."
            )

    return render_template(
        "public_books.html",
        books=books,
        keyword=keyword,
        error=error,
        provider=provider
    )


@app.route("/admin/import-book", methods=["POST"])
@admin_required
def admin_import_book():
    title = request.form.get("title", "").strip()
    author = request.form.get("author", "").strip()
    year_raw = request.form.get("year", "").strip()
    cover_url = request.form.get("cover_url", "").strip()
    genre = request.form.get("genre", "").strip()
    source = request.form.get("source", "API publik").strip() or "API publik"

    if not title:
        set_alert("Buku gagal disimpan karena judul tidak valid.", "error")
        return redirect(request.referrer or "/public-books")

    if not genre:
        set_alert("Buku gagal disimpan karena genre wajib diisi.", "error")
        return redirect(request.referrer or "/public-books")

    if not author:
        author = "Tidak diketahui"

    try:
        year = int(year_raw)
    except ValueError:
        set_alert("Buku gagal disimpan karena tahun wajib berupa angka.", "error")
        return redirect(request.referrer or "/public-books")

    current_year = datetime.now().year
    if year < 1000 or year > current_year:
        set_alert(
            f"Buku gagal disimpan karena tahun harus berada di antara 1000 sampai {current_year}.",
            "error"
        )
        return redirect(request.referrer or "/public-books")

    existing_book = Book.query.filter(
        Book.title.ilike(title),
        Book.author.ilike(author)
    ).first()

    if existing_book:
        set_alert("Buku sudah ada di katalog lokal.", "warning")
        return redirect(request.referrer or "/public-books")

    imported_book = Book(
        title=title,
        author=author,
        genre=genre,
        year=year,
        rating=0,
        description=f"Data buku ini diimpor dari {source}.",
        cover_image=cover_url
    )

    db.session.add(imported_book)
    db.session.commit()

    set_alert("Buku berhasil disimpan ke katalog lokal.", "success")
    return redirect(request.referrer or "/public-books")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()
        confirm_password = request.form.get("confirm_password", "").strip()

        if not username or not password or not confirm_password:
            set_alert("Semua field wajib diisi.", "error")
            return redirect("/register")

        if password != confirm_password:
            set_alert("Password dan konfirmasi password tidak sama.", "error")
            return redirect("/register")

        existing_user = User.query.filter_by(username=username).first()
        if existing_user:
            set_alert("Username sudah digunakan.", "warning")
            return redirect("/register")

        user = User(username=username, role="user")
        user.set_password(password)

        db.session.add(user)
        db.session.commit()

        set_alert("Registrasi berhasil. Silakan login.", "success")
        return redirect("/login")

    return render_template("register.html", error=None, success=None)


@app.route("/login", methods=["GET", "POST"])
def user_login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "").strip()

        user = User.query.filter_by(username=username).first()

        if user and user.check_password(password):
            if user.role == "admin":
                session.clear()
                session["admin_logged_in"] = True
                session["admin_username"] = user.username
                set_alert("Login admin berhasil.", "success")
                return redirect("/admin")

            session.clear()
            session["user_logged_in"] = True
            session["user_username"] = user.username
            set_alert("Login user berhasil.", "success")
            return redirect("/user/dashboard")

        set_alert("Username atau password salah.", "error")
        return redirect("/login")

    return render_template("login.html", error=None)


@app.route("/user/dashboard", methods=["GET"])
@login_required
def user_dashboard():
    user = User.query.filter_by(username=session.get("user_username")).first()

    favorites = []
    total_favorites = 0

    if user:
        favorites = (
            Favorite.query
            .filter_by(user_id=user.id)
            .order_by(Favorite.created_at.desc())
            .all()
        )
        total_favorites = len(favorites)

    total_books = Book.query.count()

    return render_template(
        "user_dashboard.html",
        username=session.get("user_username"),
        role=user.role if user else "user",
        favorites=favorites,
        total_favorites=total_favorites,
        total_books=total_books
    )


@app.route("/favorite/add/<int:book_id>", methods=["POST"])
@login_required
def add_favorite(book_id):
    user = User.query.filter_by(username=session.get("user_username")).first()
    book = db.session.get(Book, book_id)

    if not user:
        set_alert("Session user tidak valid. Silakan login ulang.", "error")
        return redirect("/login")

    if not book:
        set_alert("Buku tidak ditemukan.", "error")
        return redirect(request.referrer or "/")

    existing_favorite = Favorite.query.filter_by(
        user_id=user.id,
        book_id=book.id
    ).first()

    if not existing_favorite:
        favorite = Favorite(user_id=user.id, book_id=book.id)
        db.session.add(favorite)
        db.session.commit()
        set_alert("Buku berhasil ditambahkan ke favorit.", "success")
    else:
        set_alert("Buku sudah ada di daftar favorit.", "warning")

    return redirect(request.referrer or "/")


@app.route("/favorite/remove/<int:book_id>", methods=["POST"])
@login_required
def remove_favorite(book_id):
    user = User.query.filter_by(username=session.get("user_username")).first()

    if not user:
        set_alert("Session user tidak valid. Silakan login ulang.", "error")
        return redirect("/login")

    favorite = Favorite.query.filter_by(
        user_id=user.id,
        book_id=book_id
    ).first()

    if favorite:
        db.session.delete(favorite)
        db.session.commit()
        set_alert("Buku berhasil dihapus dari favorit.", "success")
    else:
        set_alert("Buku tidak ditemukan di daftar favorit.", "warning")

    return redirect(request.referrer or "/user/dashboard")


@app.route("/logout")
def user_logout():
    session.clear()
    set_alert("Logout user berhasil.", "success")
    return redirect("/login")


@app.context_processor
def inject_alert():
    alert_message = session.pop("alert_message", None)
    alert_category = session.pop("alert_category", "info")

    return dict(
        alert_message=alert_message,
        alert_category=alert_category
    )


@app.errorhandler(404)
def page_not_found(e):
    return render_template("404.html"), 404


@app.errorhandler(500)
def internal_server_error(e):
    db.session.rollback()
    return render_template("500.html"), 500


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        seed_data()

    app.run(debug=True)

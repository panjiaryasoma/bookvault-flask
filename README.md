# BookVault

BookVault adalah aplikasi katalog buku digital berbasis **Flask**, **SQLite**, dan **REST API**. Aplikasi ini menyediakan katalog buku lokal, fitur login user dan admin, dashboard admin, fitur favorit user, integrasi API publik Open Library, serta endpoint REST API untuk mengelola data buku.

Project ini dibuat untuk tugas Back-End / Pemrograman Web Back-End dengan fokus pada penggunaan Flask, database lokal, autentikasi sederhana, integrasi API publik, validasi data, dan dokumentasi API.

---

## Fitur Utama

### Fitur User

- Registrasi akun user.
- Login dan logout user.
- Melihat katalog buku lokal.
- Melakukan pencarian buku berdasarkan judul atau penulis.
- Melakukan filter buku berdasarkan genre.
- Melihat detail buku.
- Menambahkan buku ke daftar favorit.
- Menghapus buku dari daftar favorit.
- Dashboard user berisi informasi akun, total favorit, dan daftar buku favorit.
- Tampilan placeholder untuk buku yang tidak memiliki cover.

### Fitur Admin

- Login dan logout admin.
- Dashboard admin dengan statistik total buku, total genre, rata-rata rating, dan total user.
- Grafik distribusi genre sederhana menggunakan CSS.
- Daftar top rated books.
- CRUD data buku: tambah, edit, dan hapus buku.
- Validasi input data buku.
- Deteksi duplikasi buku berdasarkan judul dan penulis.
- Search dan filter pada tabel dashboard admin.
- Import buku dari Open Library API ke katalog lokal.
- Admin dapat menentukan genre saat melakukan import buku.
- Dokumentasi API tersedia di halaman `/api/docs`.
- Halaman API docs hanya dapat diakses oleh admin.

### Fitur API

- REST API untuk membaca, menambah, mengubah, dan menghapus data buku.
- Endpoint GET dapat diakses tanpa API key.
- Endpoint POST, PUT, dan DELETE dilindungi menggunakan API key.
- Response API menggunakan format JSON.
- Validasi request body pada endpoint POST dan PUT.
- Error response untuk data tidak valid, buku tidak ditemukan, duplikasi buku, dan API key tidak valid.

### Fitur Tampilan

- Tema visual dark academia.
- HTML menggunakan `base.html` sebagai layout utama.
- CSS dipisahkan ke folder `static/css`.
- JavaScript dipisahkan ke folder `static/js`.
- Custom alert message.
- Custom error page 404 dan 500.
- Pagination pada katalog lokal.

---

## Teknologi yang Digunakan

- Python
- Flask
- Flask-SQLAlchemy
- SQLite
- Flask-CORS
- Werkzeug Security
- Requests
- Python Dotenv
- HTML
- CSS
- JavaScript
- Open Library API
- Postman

---

## Struktur Folder

```text
BookVault/
├── app.py
├── requirements.txt
├── README.md
├── .env.example
├── templates/
│   ├── base.html
│   ├── flash_messages.html
│   ├── index.html
│   ├── detail.html
│   ├── login.html
│   ├── register.html
│   ├── user_dashboard.html
│   ├── admin_dashboard.html
│   ├── admin_form.html
│   ├── admin_login.html
│   ├── public_books.html
│   ├── api_docs.html
│   ├── 404.html
│   └── 500.html
└── static/
    ├── css/
    │   ├── base.css
    │   ├── index.css
    │   ├── detail.css
    │   ├── login.css
    │   ├── register.css
    │   ├── user_dashboard.css
    │   ├── admin_dashboard.css
    │   ├── admin_form.css
    │   ├── admin_login.css
    │   ├── public_books.css
    │   ├── api_docs.css
    │   └── error.css
    └── js/
        ├── index.js
        └── admin_dashboard.js
```

---

## Instalasi Project

### 1. Clone atau download project

```bash
git clone <url-repository>
cd BookVault
```

Jika project dijalankan dari folder lokal, langsung buka folder project melalui terminal.

### 2. Buat virtual environment

```bash
python -m venv venv
```

### 3. Aktifkan virtual environment

Untuk Windows PowerShell:

```powershell
.\venv\Scripts\activate
```

Jika menggunakan environment yang memakai path `venv/bin`, sesuaikan dengan terminal lokal.

### 4. Install dependency

```bash
pip install -r requirements.txt
```

Atau langsung menggunakan Python dari virtual environment:

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

---

## Environment Variable

Project ini menggunakan file `.env` untuk menyimpan API key lokal.

Buat file `.env` di root project:

```env
BOOKVAULT_API_KEY=bookvault-api-key-123
```

Sediakan juga file `.env.example` sebagai contoh konfigurasi:

```env
BOOKVAULT_API_KEY=your-api-key-here
```

File `.env` tidak perlu dipush ke GitHub karena berisi konfigurasi lokal.

---

## Menjalankan Aplikasi

Jalankan aplikasi dengan perintah:

```bash
python app.py
```

Atau jika menggunakan virtual environment langsung:

```powershell
.\venv\Scripts\python.exe app.py
```

Setelah server berjalan, buka browser:

```text
http://127.0.0.1:5000
```

---

## Akun Admin Default

Saat database pertama kali dibuat, aplikasi akan membuat akun admin default:

```text
Username: admin
Password: admin123
```

Admin dapat login melalui:

```text
http://127.0.0.1:5000/admin/login
```

---

## Halaman Aplikasi

| Halaman | URL | Keterangan |
|---|---|---|
| Katalog buku | `/` | Menampilkan daftar buku lokal |
| Detail buku | `/book/<id>` | Menampilkan detail buku |
| Register user | `/register` | Registrasi akun user |
| Login user | `/login` | Login user |
| Dashboard user | `/user/dashboard` | Menampilkan data akun dan buku favorit user |
| Login admin | `/admin/login` | Login admin |
| Dashboard admin | `/admin` | Statistik, tabel buku, search/filter, dan CRUD |
| Tambah buku | `/admin/book/add` | Form tambah buku |
| Edit buku | `/admin/book/edit/<id>` | Form edit buku |
| Open Library API | `/public-books` | Pencarian buku dari API publik |
| API Documentation | `/api/docs` | Dokumentasi REST API lokal |
| Error 404 | URL tidak tersedia | Custom page untuk halaman tidak ditemukan |
| Error 500 | Error internal server | Custom page untuk kesalahan server |

---

## REST API Endpoint

### Endpoint Publik

Endpoint berikut dapat diakses tanpa API key.

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/health` | Mengecek status API |
| GET | `/api/books` | Mengambil seluruh data buku |
| GET | `/api/books/<id>` | Mengambil detail buku berdasarkan ID |

Contoh request:

```text
GET http://127.0.0.1:5000/api/books
```

Contoh response:

```json
{
  "total": 1,
  "data": [
    {
      "id": 1,
      "title": "The Secret History",
      "author": "Donna Tartt",
      "genre": "Dark Academia",
      "year": 1992,
      "rating": 4.6,
      "description": "Novel misteri akademik tentang kelompok mahasiswa klasik.",
      "cover_image": "",
      "created_at": "2026-01-01 10:00:00",
      "updated_at": "2026-01-01 10:00:00"
    }
  ]
}
```

---

## API Key

Endpoint yang mengubah data wajib menggunakan API key.

| Method | Endpoint | API Key |
|---|---|---|
| POST | `/api/books` | Wajib |
| PUT | `/api/books/<id>` | Wajib |
| DELETE | `/api/books/<id>` | Wajib |

Header yang digunakan:

```text
X-API-Key: bookvault-api-key-123
```

Jika API key tidak dikirim atau salah, response yang diberikan:

```json
{
  "error": "Unauthorized",
  "message": "Valid API key is required"
}
```

---

## Contoh Request API

### POST `/api/books`

Header:

```text
X-API-Key: bookvault-api-key-123
Content-Type: application/json
```

Body:

```json
{
  "title": "No Longer Human",
  "author": "Osamu Dazai",
  "genre": "Japanese Literature",
  "year": 1948,
  "rating": 4.4,
  "description": "Novel tentang alienasi, identitas, dan kehancuran psikologis.",
  "cover_image": ""
}
```

### PUT `/api/books/<id>`

Header:

```text
X-API-Key: bookvault-api-key-123
Content-Type: application/json
```

Body:

```json
{
  "title": "No Longer Human Updated",
  "author": "Osamu Dazai",
  "genre": "Japanese Literature",
  "year": 1948,
  "rating": 4.6,
  "description": "Data buku berhasil diperbarui melalui endpoint PUT.",
  "cover_image": ""
}
```

### DELETE `/api/books/<id>`

Header:

```text
X-API-Key: bookvault-api-key-123
```

Contoh URL:

```text
DELETE http://127.0.0.1:5000/api/books/1
```

---

## Integrasi API Publik

BookVault menggunakan **Open Library API** untuk mengambil data buku dari internet.

Halaman:

```text
/public-books
```

Fitur pada halaman ini:

- Mencari buku dari Open Library.
- Menampilkan judul buku.
- Menampilkan penulis.
- Menampilkan tahun terbit.
- Menampilkan jumlah edisi.
- Menampilkan cover jika tersedia.
- Admin dapat menyimpan buku dari Open Library ke katalog lokal.
- Admin dapat menentukan genre saat menyimpan buku dari API publik.

---

## Validasi dan Error Handling

Aplikasi menerapkan validasi pada input web dan API.

Validasi yang digunakan:

- Field wajib tidak boleh kosong.
- Tahun harus berupa angka.
- Tahun harus berada pada rentang valid.
- Rating harus berupa angka.
- Rating harus berada pada rentang 0 sampai 5.
- Buku dengan judul dan penulis yang sama tidak boleh duplikat.
- Endpoint write API wajib menggunakan API key.
- Jika buku tidak ditemukan, API mengembalikan status 404.
- Jika body JSON kosong atau tidak valid, API mengembalikan status 400.
- Jika API key tidak valid, API mengembalikan status 401.
- Jika data buku duplikat, API mengembalikan status 409.

---

## Dokumentasi API di Aplikasi

Dokumentasi API tersedia pada halaman:

```text
/api/docs
```

Halaman ini hanya dapat diakses oleh admin yang sudah login.

Isi dokumentasi API:

- Daftar endpoint.
- Method.
- Deskripsi endpoint.
- Keterangan kebutuhan API key.
- Contoh body POST.
- Contoh body PUT.
- Contoh response error API key.

---

## Testing Manual

### Testing Web

| No | Skenario | Hasil yang Diharapkan |
|---|---|---|
| 1 | Buka `/` | Katalog buku tampil |
| 2 | Search buku di katalog | Data terfilter sesuai keyword |
| 3 | Filter genre | Data tampil sesuai genre |
| 4 | Buka detail buku | Detail buku tampil |
| 5 | Register user baru | User berhasil dibuat |
| 6 | Login user | User masuk ke dashboard |
| 7 | Tambah buku ke favorit | Buku masuk daftar favorit |
| 8 | Hapus buku dari favorit | Buku hilang dari daftar favorit |
| 9 | Login admin | Admin masuk dashboard |
| 10 | Tambah buku | Buku baru tersimpan |
| 11 | Edit buku | Data buku berubah |
| 12 | Hapus buku | Buku terhapus |
| 13 | Cari buku di dashboard admin | Tabel admin terfilter |
| 14 | Import buku Open Library | Buku tersimpan ke katalog lokal |
| 15 | Akses URL tidak tersedia | Halaman 404 tampil |

### Testing API dengan Postman

| No | Request | Hasil yang Diharapkan |
|---|---|---|
| 1 | GET `/api/health` | Status API tampil |
| 2 | GET `/api/books` | Data buku tampil |
| 3 | GET `/api/books/<id>` | Detail buku tampil |
| 4 | POST `/api/books` tanpa API key | Response 401 |
| 5 | POST `/api/books` dengan API key | Buku berhasil dibuat |
| 6 | PUT `/api/books/<id>` tanpa API key | Response 401 |
| 7 | PUT `/api/books/<id>` dengan API key | Buku berhasil diubah |
| 8 | DELETE `/api/books/<id>` tanpa API key | Response 401 |
| 9 | DELETE `/api/books/<id>` dengan API key | Buku berhasil dihapus |

---

## Screenshot yang Disarankan untuk Laporan

Screenshot yang dapat dimasukkan ke laporan:

1. Halaman katalog buku.
2. Search dan filter katalog.
3. Halaman detail buku.
4. Halaman register user.
5. Halaman login user.
6. Dashboard user.
7. Fitur favorit buku.
8. Halaman login admin.
9. Dashboard admin.
10. Search/filter dashboard admin.
11. Form tambah buku.
12. Form edit buku.
13. Halaman Open Library API.
14. Import buku dari Open Library.
15. Halaman API docs.
16. Testing GET API di Postman.
17. Testing POST API tanpa API key.
18. Testing POST API dengan API key.
19. Testing PUT API dengan API key.
20. Testing DELETE API dengan API key.
21. Halaman custom 404.
22. Halaman custom 500.

---

## Catatan GitHub

File dan folder berikut tidak perlu dipush ke GitHub:

```text
venv/
env/
.venv/
__pycache__/
*.pyc
.env
*.db
instance/
.vscode/
*.log
```

Database `bookvault.db` dapat dibuat ulang saat aplikasi dijalankan karena aplikasi menggunakan `db.create_all()` dan fungsi seed data.

---

## Status Project

Project sudah mencakup:

- Flask routing.
- Database SQLite.
- Model User, Book, dan Favorite.
- Authentication sederhana.
- Authorization admin dan user.
- REST API.
- API key protection.
- Integrasi API publik.
- CRUD.
- Validasi.
- Error handling.
- Dokumentasi API.
- Struktur template dengan `base.html`.
- Struktur static CSS dan JS terpisah.

---

## Author

Panji Arya Soma

Project: **BookVault**  
Tema: **Digital Book Catalog with Flask and REST API**

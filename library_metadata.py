"""ISBN verification, fixed-host metadata lookup and deterministic tags."""
import re
import unicodedata
from urllib.parse import urlsplit
import requests

def normalized(value):
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())

def isbn13(value):
    s = re.sub(r"[\s-]", "", value or "").upper()
    if re.fullmatch(r"[0-9]{9}[0-9X]", s):
        if sum((10-i)*(10 if c == "X" else int(c)) for i,c in enumerate(s)) % 11:
            return None
        s = "978" + s[:9]
        return s + str((-sum(int(c)*(1 if i%2==0 else 3) for i,c in enumerate(s))) % 10)
    if re.fullmatch(r"97[89][0-9]{10}", s) and sum(int(c)*(1 if i%2==0 else 3) for i,c in enumerate(s)) % 10 == 0:
        return s
    return None

def clean(value, limit=240):
    return str(value or "").strip()[:limit] if isinstance(value, (str,int)) else ""

def values(items, key=None):
    if not isinstance(items, list):
        return []
    return [clean(item.get(key) if isinstance(item,dict) and key else item) for item in items[:30]]

def safe_cover(value):
    try:
        p=urlsplit(value or "")
        if p.scheme == "http":
            value="https:" + value[5:]
            p=urlsplit(value)
        if p.scheme=="https" and p.hostname in {"covers.openlibrary.org","books.google.com","books.googleusercontent.com"} and not p.username and not p.password and p.port in (None,443):
            return value[:1000]
    except (ValueError, TypeError):
        pass
    return ""

RULES = {
    "Fiksi": ["fiction","novel","literary fiction","fiksi"],
    "Nonfiksi": ["nonfiction","non-fiction","non fiction","nonfiksi"],
    "Fiksi sejarah": ["historical fiction","fiksi sejarah"],
    "Fiksi politik": ["political fiction","fiksi politik"],
    "Filsafat": ["philosophy","filsafat"],
    "Teologi": ["theology","teologi"],
    "Sejarah": ["history","sejarah"],
    "Sastra": ["literary","literature","sastra"],
    "Psikologi": ["psychology","psikologi"],
    "Sains": ["science","sains"],
    "Teknologi": ["computer","technology","teknologi"],
    "Naturalisme": ["naturalism","naturalisme"],
    "Satire": ["satire"],
    "Romansa": ["romance","romansa"],
    "Misteri": ["mystery","misteri"],
}
def classify(subjects):
    s = normalized(" | ".join(values(subjects)))
    fiction_text = re.sub(r"\bnon[- ]?fiction\b|\bnonfiksi\b", "", s)
    return [name for name, words in RULES.items() if any(re.search(r"(?<!\w)"+re.escape(word)+r"(?!\w)",fiction_text if name=="Fiksi" else s) for word in words)]

def get_json(url, params):
    # No arbitrary URLs, redirects, or unbounded responses.
    with requests.get(url, params=params, timeout=(3,7), allow_redirects=False,
                      stream=True, headers={"User-Agent":"BookVault/2.0"}) as response:
        response.raise_for_status()
        if response.status_code != 200:
            raise ValueError("Unexpected response")
        content = bytearray()
        for chunk in response.iter_content(16384):
            content.extend(chunk)
            if len(content) > 2_000_000:
                raise ValueError("Metadata response too large")
        import json
        data=json.loads(content)
        if not isinstance(data,dict):
            raise ValueError("Invalid metadata")
        return data

def candidate(title="",author="",isbn="",publisher="",year="",pages="",language="",cover="",subjects=None,source=""):
    subjects=values(subjects)
    return dict(title=clean(title),author=clean(author),isbn=isbn13(isbn) or "",
                publisher=clean(publisher),year=clean(year,40),pages=clean(pages,8),
                language=clean(language,80),cover=safe_cover(cover),subjects=subjects,
                tags=classify(subjects),source=source)

def lookup(query, google_key=None):
    number=isbn13(query)
    results=[]
    errors=[]
    try:
        if number:
            key="ISBN:"+number
            data=get_json("https://openlibrary.org/api/books",{"bibkeys":key,"jscmd":"data","format":"json"}).get(key)
            if isinstance(data,dict):
                cover=data.get("cover") or {}
                results.append(candidate(title=data.get("title"),author=", ".join(values(data.get("authors"),"name")),
                    isbn=number,publisher=", ".join(values(data.get("publishers"),"name")),year=data.get("publish_date"),
                    pages=data.get("number_of_pages"),cover=cover.get("medium") if isinstance(cover,dict) else "",
                    subjects=values(data.get("subjects"),"name"),source="Open Library"))
        else:
            data=get_json("https://openlibrary.org/search.json",{"q":query,"limit":8,"fields":"title,author_name,first_publish_year,subject,cover_i"})
            for item in data.get("docs",[])[:8]:
                if not isinstance(item,dict):
                    continue
                ci=item.get("cover_i")
                results.append(candidate(title=item.get("title"),author=", ".join(values(item.get("author_name"))),
                    cover=f"https://covers.openlibrary.org/b/id/{ci}-M.jpg" if isinstance(ci,int) else "",
                    subjects=item.get("subject"),source="Open Library (work)"))
    except (requests.RequestException,ValueError,TypeError,AttributeError,KeyError):
        errors.append("Open Library unavailable")
    # An empty result must trigger fallback too; ISBN lookup compares actual identifiers.
    if not results or not number:
        try:
            params={"q":("isbn:"+number if number else query),"maxResults":8,"printType":"books"}
            if google_key:
                params["key"]=google_key
            data=get_json("https://www.googleapis.com/books/v1/volumes",params)
            for item in data.get("items",[])[:8]:
                info=item.get("volumeInfo") or {}
                ids=[isbn13(i.get("identifier","")) for i in info.get("industryIdentifiers",[]) if isinstance(i,dict)]
                if number and number not in ids:
                    continue
                images=info.get("imageLinks") or {}
                results.append(candidate(title=info.get("title"),author=", ".join(values(info.get("authors"))),
                    isbn=number or next((i for i in ids if i),""),publisher=info.get("publisher"),
                    year=info.get("publishedDate"),pages=info.get("pageCount"),language=info.get("language"),
                    cover=images.get("thumbnail"),subjects=info.get("categories"),source="Google Books"))
        except (requests.RequestException,ValueError,TypeError,AttributeError,KeyError):
            errors.append("Google Books unavailable")
    return [r for r in results if r["title"]][:12],errors

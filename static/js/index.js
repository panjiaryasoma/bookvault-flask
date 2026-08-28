document.addEventListener("DOMContentLoaded", () => {
    const SERVER_PAGE_SIZE = 8;
    const COMPACT_PAGE_SIZE = 12;
    const RECENT_KEY = "bookvault-recently-viewed";
    const DENSITY_KEY = "bookvault-catalog-density";

    const catalog = document.getElementById("catalog-app");
    const form = document.getElementById("catalog-search-form");
    const genreSelect = document.querySelector(".genre-select");
    const sortSelect = document.getElementById("catalog-sort");
    const scopeSelect = document.getElementById("catalog-scope");
    const bookList = document.getElementById("book-list");
    const pagination = document.getElementById("catalog-pagination");
    const emptyState = document.getElementById("catalog-empty");
    const resultCount = document.getElementById("catalog-result-count");
    const resultLabel = document.getElementById("catalog-result-label");
    const rangeLabel = document.getElementById("catalog-range");
    const sortStatus = document.getElementById("catalog-sort-status");
    const recentSection = document.getElementById("recently-viewed");
    const recentList = document.getElementById("recently-viewed-list");
    const clearRecent = document.getElementById("clear-recently-viewed");
    const densityButtons = Array.from(document.querySelectorAll("[data-density]"));

    if (!catalog || !form || !sortSelect || !bookList || !pagination) return;

    const params = new URLSearchParams(window.location.search);
    const query = (params.get("q") || "").trim();
    const genre = (params.get("genre") || "").trim();
    const isUserLoggedIn = catalog.dataset.userLoggedIn === "true";
    const favoriteIds = new Set(JSON.parse(catalog.dataset.favoriteIds || "[]").map(Number));
    const serverTotal = Number.parseInt(catalog.dataset.serverTotal || "0", 10) || 0;

    const sortLabels = {
        default: "Urutan katalog",
        rating_desc: "Rating tertinggi",
        title_asc: "Judul A–Z",
        year_desc: "Tahun terbaru",
        newest: "Baru ditambahkan"
    };

    let currentPage = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
    let currentSort = params.get("sort") || "default";
    let savedOnly = params.get("saved") === "1";
    let density = "comfortable";
    let clientBooks = [];
    let clientMode = false;

    if (!Object.prototype.hasOwnProperty.call(sortLabels, currentSort)) currentSort = "default";
    if (!isUserLoggedIn) savedOnly = false;

    sortSelect.value = currentSort;
    if (scopeSelect) scopeSelect.value = savedOnly ? "1" : "";

    try {
        const storedDensity = localStorage.getItem(DENSITY_KEY);
        if (storedDensity === "compact" || storedDensity === "comfortable") density = storedDensity;
    } catch (_error) {
        density = "comfortable";
    }

    const createElement = (tag, className = "", text = "") => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== "") element.textContent = text;
        return element;
    };

    const normalizeBook = (book) => ({
        id: Number(book.id),
        title: String(book.title || "Tanpa Judul"),
        author: String(book.author || "Tidak diketahui"),
        genre: String(book.genre || "Tidak diketahui"),
        year: Number(book.year) || 0,
        rating: Number(book.rating) || 0,
        description: String(book.description || "Tidak ada deskripsi."),
        coverImage: String(book.cover_image || book.coverImage || ""),
        createdAt: String(book.created_at || book.createdAt || "")
    });

    const bookFromRow = (row) => normalizeBook({
        id: row.dataset.bookId,
        title: row.dataset.title,
        author: row.dataset.author,
        genre: row.dataset.genre,
        year: row.dataset.year,
        rating: row.dataset.rating,
        description: row.dataset.description,
        cover_image: row.dataset.coverImage,
        created_at: row.dataset.createdAt
    });

    const serverPageBooks = Array.from(bookList.querySelectorAll(".book-entry")).map(bookFromRow);

    const sortBooks = (source) => {
        const sorted = [...source];

        if (currentSort === "rating_desc") {
            sorted.sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title));
        } else if (currentSort === "title_asc") {
            sorted.sort((a, b) => a.title.localeCompare(b.title, "id", { sensitivity: "base" }));
        } else if (currentSort === "year_desc") {
            sorted.sort((a, b) => b.year - a.year || a.title.localeCompare(b.title));
        } else if (currentSort === "newest") {
            sorted.sort((a, b) => {
                const aTime = Date.parse(a.createdAt.replace(" ", "T")) || 0;
                const bTime = Date.parse(b.createdAt.replace(" ", "T")) || 0;
                return bTime - aTime || b.id - a.id;
            });
        } else {
            sorted.sort((a, b) => a.id - b.id);
        }

        return sorted;
    };

    const matchesCurrentFilters = (book) => {
        const q = query.toLowerCase();
        const matchesQuery = !q
            || book.title.toLowerCase().includes(q)
            || book.author.toLowerCase().includes(q);
        const matchesGenre = !genre || book.genre.toLowerCase().includes(genre.toLowerCase());
        return matchesQuery && matchesGenre;
    };

    const addFavoriteForm = (parent, book) => {
        if (!isUserLoggedIn) return;

        const isSaved = favoriteIds.has(book.id);
        const formElement = document.createElement("form");
        formElement.method = "POST";
        formElement.action = isSaved ? `/favorite/remove/${book.id}` : `/favorite/add/${book.id}`;
        formElement.className = "favorite-form";

        const button = createElement(
            "button",
            isSaved ? "text-button text-button--saved" : "text-button",
            isSaved ? "♥ Tersimpan" : "♡ Simpan"
        );
        button.type = "submit";
        button.setAttribute(
            "aria-label",
            isSaved ? `Hapus ${book.title} dari favorit` : `Simpan ${book.title} ke favorit`
        );

        formElement.appendChild(button);
        parent.appendChild(formElement);
    };

    const renderBook = (book) => {
        const article = createElement("article", "book-entry");
        article.dataset.bookId = String(book.id);
        article.dataset.title = book.title;
        article.dataset.author = book.author;
        article.dataset.genre = book.genre;
        article.dataset.year = String(book.year || "");
        article.dataset.rating = String(book.rating || 0);
        article.dataset.description = book.description;
        article.dataset.coverImage = book.coverImage;
        article.dataset.createdAt = book.createdAt;

        const media = createElement("a", "book-media");
        media.href = `/book/${book.id}`;
        media.setAttribute("aria-label", `Lihat detail ${book.title}`);

        if (book.coverImage) {
            const image = createElement("img", "book-cover");
            image.src = book.coverImage;
            image.alt = `Cover ${book.title}`;
            image.loading = "lazy";
            media.appendChild(image);
        } else {
            media.appendChild(createElement("div", "book-cover cover-placeholder", "No Cover"));
        }

        const info = createElement("div", "book-info");
        const titleRow = createElement("div", "book-title-row");
        const heading = document.createElement("h2");
        const titleLink = document.createElement("a");
        titleLink.href = `/book/${book.id}`;
        titleLink.textContent = book.title;
        heading.appendChild(titleLink);
        titleRow.appendChild(heading);
        titleRow.appendChild(createElement("span", "book-year", book.year || "—"));

        info.appendChild(titleRow);
        info.appendChild(createElement("p", "meta", `${book.author} · ${book.genre}`));
        info.appendChild(createElement("p", "description", book.description || "Tidak ada deskripsi."));

        const footer = createElement("div", "book-footer");
        footer.appendChild(createElement(
            "span",
            book.rating > 0 ? "rating" : "rating rating--muted",
            book.rating > 0 ? `★ ${book.rating}` : "Belum dinilai"
        ));

        const detail = createElement("a", "detail-link", "Detail");
        detail.href = `/book/${book.id}`;
        footer.appendChild(detail);
        addFavoriteForm(footer, book);

        info.appendChild(footer);
        article.append(media, info);
        return article;
    };

    const getPageSize = () => density === "compact" ? COMPACT_PAGE_SIZE : SERVER_PAGE_SIZE;

    const buildStateUrl = (page = currentPage) => {
        const next = new URLSearchParams();
        if (query) next.set("q", query);
        if (genre) next.set("genre", genre);
        if (page > 1) next.set("page", String(page));
        if (currentSort !== "default") next.set("sort", currentSort);
        if (savedOnly) next.set("saved", "1");
        const search = next.toString();
        return `${window.location.pathname}${search ? `?${search}` : ""}`;
    };

    const makePageButton = (label, page, className = "page-number", active = false) => {
        if (active) {
            const span = createElement("span", `${className} active`, label);
            span.setAttribute("aria-current", "page");
            return span;
        }

        const button = createElement("button", className, label);
        button.type = "button";
        button.dataset.catalogPage = String(page);
        return button;
    };

    const getVisiblePageNumbers = (page, totalPages) => {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
        const pages = new Set([1, totalPages, page - 1, page, page + 1]);
        return [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
    };

    const renderClientPagination = (totalPages) => {
        pagination.innerHTML = "";
        if (totalPages <= 1) {
            pagination.hidden = true;
            return;
        }

        pagination.hidden = false;
        pagination.appendChild(
            currentPage > 1
                ? makePageButton("←", currentPage - 1, "pagination-arrow")
                : createElement("span", "pagination-arrow disabled", "←")
        );

        const pageGroup = createElement("div", "pagination-pages");
        const visiblePages = getVisiblePageNumbers(currentPage, totalPages);
        let previous = 0;

        visiblePages.forEach((pageNumber) => {
            if (previous && pageNumber - previous > 1) {
                pageGroup.appendChild(createElement("span", "pagination-ellipsis", "…"));
            }
            pageGroup.appendChild(makePageButton(
                String(pageNumber),
                pageNumber,
                "page-number",
                pageNumber === currentPage
            ));
            previous = pageNumber;
        });

        pagination.appendChild(pageGroup);
        pagination.appendChild(
            currentPage < totalPages
                ? makePageButton("→", currentPage + 1, "pagination-arrow")
                : createElement("span", "pagination-arrow disabled", "→")
        );
    };

    const renderClientCatalog = () => {
        const sorted = sortBooks(clientBooks);
        const pageSize = getPageSize();
        const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
        currentPage = Math.min(Math.max(1, currentPage), totalPages);
        const start = (currentPage - 1) * pageSize;
        const pageBooks = sorted.slice(start, start + pageSize);

        bookList.innerHTML = "";
        pageBooks.forEach((book) => bookList.appendChild(renderBook(book)));
        if (emptyState) emptyState.hidden = sorted.length !== 0;

        resultCount.textContent = String(sorted.length);
        resultLabel.textContent = savedOnly ? "buku tersimpan" : "buku tersedia";
        rangeLabel.textContent = sorted.length
            ? `Menampilkan ${start + 1}–${start + pageBooks.length} dari ${sorted.length} buku`
            : "Tidak ada buku untuk ditampilkan";
        sortStatus.textContent = savedOnly
            ? `${sortLabels[currentSort]} · koleksi tersimpan`
            : `${sortLabels[currentSort]} · global`;
        renderClientPagination(Math.ceil(sorted.length / pageSize));
    };

    const setBusy = (busy) => {
        if (busy) catalog.setAttribute("aria-busy", "true");
        else catalog.removeAttribute("aria-busy");
    };

    const filteredApiUrl = () => {
        const url = new URL("/api/books", window.location.origin);
        if (query) url.searchParams.set("q", query);
        if (genre) url.searchParams.set("genre", genre);
        return url;
    };

    const loadFullFilteredCatalog = async () => {
        setBusy(true);
        try {
            const response = await fetch(filteredApiUrl().toString(), { headers: { Accept: "application/json" } });
            if (!response.ok) throw new Error(`Catalog API HTTP ${response.status}`);
            const payload = await response.json();
            clientBooks = Array.isArray(payload.data) ? payload.data.map(normalizeBook) : [];
            clientMode = true;
            currentPage = 1;
            renderClientCatalog();
            return true;
        } catch (error) {
            console.warn("Global catalog sort unavailable:", error);
            sortStatus.textContent = "Urutan server";
            return false;
        } finally {
            setBusy(false);
        }
    };

    const loadSavedCatalog = async () => {
        setBusy(true);
        try {
            const ids = Array.from(favoriteIds);
            if (!ids.length) {
                clientBooks = [];
            } else if (ids.length <= 60) {
                const responses = await Promise.allSettled(ids.map(async (id) => {
                    const response = await fetch(`/api/books/${id}`, { headers: { Accept: "application/json" } });
                    if (!response.ok) throw new Error(`Book ${id}: HTTP ${response.status}`);
                    return normalizeBook(await response.json());
                }));
                clientBooks = responses
                    .filter((result) => result.status === "fulfilled")
                    .map((result) => result.value)
                    .filter(matchesCurrentFilters);
            } else {
                const response = await fetch(filteredApiUrl().toString(), { headers: { Accept: "application/json" } });
                if (!response.ok) throw new Error(`Catalog API HTTP ${response.status}`);
                const payload = await response.json();
                clientBooks = (Array.isArray(payload.data) ? payload.data : [])
                    .map(normalizeBook)
                    .filter((book) => favoriteIds.has(book.id));
            }

            clientMode = true;
            currentPage = 1;
            renderClientCatalog();
            return true;
        } catch (error) {
            console.warn("Saved catalog unavailable:", error);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const readRecent = () => {
        try {
            const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
            return Array.isArray(parsed) ? parsed.map(normalizeBook).slice(0, 5) : [];
        } catch (_error) {
            return [];
        }
    };

    const writeRecent = (items) => {
        try {
            localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, 5)));
        } catch (_error) {
            return;
        }
    };

    const renderRecent = () => {
        if (!recentSection || !recentList) return;
        const recent = readRecent();
        recentList.innerHTML = "";
        recentSection.hidden = recent.length === 0;

        recent.forEach((book) => {
            const link = createElement("a", "recent-book");
            link.href = `/book/${book.id}`;
            link.dataset.recentBookId = String(book.id);
            link.append(
                createElement("strong", "", book.title),
                createElement("small", "", `${book.author} · ${book.year || "—"}`)
            );
            recentList.appendChild(link);
        });
    };

    const rememberBook = (book) => {
        const recent = readRecent().filter((item) => item.id !== book.id);
        recent.unshift(book);
        writeRecent(recent);
        renderRecent();
    };

    const applyDensity = (nextDensity, rerender = false) => {
        density = nextDensity === "compact" ? "compact" : "comfortable";
        catalog.dataset.density = density;
        densityButtons.forEach((button) => {
            button.classList.toggle("active", button.dataset.density === density);
        });
        try {
            localStorage.setItem(DENSITY_KEY, density);
        } catch (_error) {
            // localStorage can be unavailable in hardened/private browser modes.
        }

        if (rerender && clientMode) {
            currentPage = 1;
            renderClientCatalog();
        }
    };

    bookList.addEventListener("click", (event) => {
        const link = event.target.closest('a[href^="/book/"]');
        if (!link) return;
        const row = link.closest(".book-entry");
        if (row) rememberBook(bookFromRow(row));
    });

    recentList?.addEventListener("click", (event) => {
        const link = event.target.closest("[data-recent-book-id]");
        if (!link) return;
        const book = readRecent().find((item) => item.id === Number(link.dataset.recentBookId));
        if (book) rememberBook(book);
    });

    clearRecent?.addEventListener("click", () => {
        try {
            localStorage.removeItem(RECENT_KEY);
        } catch (_error) {
            // Ignore unavailable storage.
        }
        renderRecent();
    });

    densityButtons.forEach((button) => {
        button.addEventListener("click", () => applyDensity(button.dataset.density, true));
    });

    pagination.addEventListener("click", (event) => {
        if (!clientMode) return;
        const button = event.target.closest("[data-catalog-page]");
        if (!button) return;
        currentPage = Number(button.dataset.catalogPage) || 1;
        renderClientCatalog();
        window.history.pushState({}, "", buildStateUrl(currentPage));
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        catalog.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });

    genreSelect?.addEventListener("change", () => form.submit());

    sortSelect.addEventListener("change", async () => {
        currentSort = sortSelect.value;
        currentPage = 1;

        if (savedOnly) {
            if (!clientMode) await loadSavedCatalog();
            else renderClientCatalog();
            window.history.replaceState({}, "", buildStateUrl(1));
            return;
        }

        if (currentSort === "default") {
            window.location.href = buildStateUrl(1);
            return;
        }

        const loaded = await loadFullFilteredCatalog();
        if (loaded) window.history.replaceState({}, "", buildStateUrl(1));
    });

    scopeSelect?.addEventListener("change", async () => {
        savedOnly = scopeSelect.value === "1";
        currentPage = 1;
        clientMode = false;

        if (savedOnly) {
            const loaded = await loadSavedCatalog();
            if (loaded) window.history.replaceState({}, "", buildStateUrl(1));
        } else if (currentSort !== "default") {
            const loaded = await loadFullFilteredCatalog();
            if (loaded) window.history.replaceState({}, "", buildStateUrl(1));
        } else {
            window.location.href = buildStateUrl(1);
        }
    });

    window.addEventListener("popstate", () => window.location.reload());

    const bootstrap = async () => {
        applyDensity(density, false);
        renderRecent();

        if (savedOnly) {
            await loadSavedCatalog();
            return;
        }

        if (currentSort !== "default") {
            await loadFullFilteredCatalog();
            return;
        }

        clientMode = false;
        sortStatus.textContent = "Urutan katalog · server page";
        resultCount.textContent = String(serverTotal);
        resultLabel.textContent = "buku tersedia";

        if (!serverPageBooks.length && emptyState) emptyState.hidden = false;
    };

    bootstrap();
});

document.addEventListener("DOMContentLoaded", () => {
    const PAGE_SIZE = 8;
    const catalog = document.getElementById("catalog-app");
    const form = document.getElementById("catalog-search-form");
    const genreSelect = document.querySelector(".genre-select");
    const sortSelect = document.getElementById("catalog-sort");
    const bookList = document.getElementById("book-list");
    const pagination = document.getElementById("catalog-pagination");
    const emptyState = document.getElementById("catalog-empty");
    const resultCount = document.getElementById("catalog-result-count");
    const resultLabel = document.getElementById("catalog-result-label");
    const rangeLabel = document.getElementById("catalog-range");
    const sortStatus = document.getElementById("catalog-sort-status");

    if (!catalog || !form || !sortSelect || !bookList || !pagination) {
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const query = (params.get("q") || "").trim();
    const genre = (params.get("genre") || "").trim();
    const isUserLoggedIn = catalog.dataset.userLoggedIn === "true";
    const favoriteIds = new Set(
        JSON.parse(catalog.dataset.favoriteIds || "[]").map(Number)
    );

    const sortLabels = {
        default: "Urutan katalog",
        rating_desc: "Rating tertinggi",
        title_asc: "Judul A–Z",
        year_desc: "Tahun terbaru",
        newest: "Baru ditambahkan"
    };

    let books = [];
    let allCatalogTotal = null;
    let currentPage = Math.max(1, Number.parseInt(params.get("page") || "1", 10) || 1);
    let currentSort = params.get("sort") || "default";

    if (!Object.prototype.hasOwnProperty.call(sortLabels, currentSort)) {
        currentSort = "default";
    }

    sortSelect.value = currentSort;

    const createElement = (tag, className = "", text = "") => {
        const element = document.createElement(tag);
        if (className) {
            element.className = className;
        }
        if (text !== "") {
            element.textContent = text;
        }
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
        coverImage: String(book.cover_image || ""),
        createdAt: String(book.created_at || "")
    });

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

    const addFavoriteForm = (parent, book) => {
        if (!isUserLoggedIn) {
            return;
        }

        const isSaved = favoriteIds.has(book.id);
        const formElement = document.createElement("form");
        formElement.method = "POST";
        formElement.action = isSaved
            ? `/favorite/remove/${book.id}`
            : `/favorite/add/${book.id}`;
        formElement.className = "favorite-form";

        const button = createElement(
            "button",
            isSaved ? "text-button text-button--saved" : "text-button",
            isSaved ? "♥ Tersimpan" : "♡ Simpan"
        );
        button.type = "submit";
        button.setAttribute(
            "aria-label",
            isSaved
                ? `Hapus ${book.title} dari favorit`
                : `Simpan ${book.title} ke favorit`
        );

        formElement.appendChild(button);
        parent.appendChild(formElement);
    };

    const renderBook = (book) => {
        const article = createElement("article", "book-entry");

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
        info.appendChild(createElement("p", "description", book.description));

        const footer = createElement("div", "book-footer");
        footer.appendChild(
            createElement(
                "span",
                book.rating > 0 ? "rating" : "rating rating--muted",
                book.rating > 0 ? `★ ${book.rating}` : "Belum dinilai"
            )
        );

        const detail = createElement("a", "detail-link", "Detail");
        detail.href = `/book/${book.id}`;
        footer.appendChild(detail);
        addFavoriteForm(footer, book);

        info.appendChild(footer);
        article.appendChild(media);
        article.appendChild(info);
        return article;
    };

    const buildUrl = (page) => {
        const next = new URLSearchParams(window.location.search);

        if (page > 1) {
            next.set("page", String(page));
        } else {
            next.delete("page");
        }

        if (currentSort !== "default") {
            next.set("sort", currentSort);
        } else {
            next.delete("sort");
        }

        const search = next.toString();
        return `${window.location.pathname}${search ? `?${search}` : ""}`;
    };

    const makePageLink = (label, page, className = "page-number", active = false) => {
        if (active) {
            const span = createElement("span", `${className} active`, label);
            span.setAttribute("aria-current", "page");
            return span;
        }

        const link = createElement("a", className, label);
        link.href = buildUrl(page);
        link.dataset.catalogPage = String(page);
        return link;
    };

    const getVisiblePageNumbers = (page, totalPages) => {
        if (totalPages <= 7) {
            return Array.from({ length: totalPages }, (_, index) => index + 1);
        }

        const pages = new Set([1, totalPages, page - 1, page, page + 1]);
        return [...pages]
            .filter((value) => value >= 1 && value <= totalPages)
            .sort((a, b) => a - b);
    };

    const renderPagination = (totalPages) => {
        pagination.innerHTML = "";

        if (totalPages <= 1) {
            pagination.hidden = true;
            return;
        }

        pagination.hidden = false;

        if (currentPage > 1) {
            pagination.appendChild(makePageLink("←", currentPage - 1, "pagination-arrow"));
        } else {
            pagination.appendChild(createElement("span", "pagination-arrow disabled", "←"));
        }

        const pageGroup = createElement("div", "pagination-pages");
        const visiblePages = getVisiblePageNumbers(currentPage, totalPages);
        let previous = 0;

        visiblePages.forEach((pageNumber) => {
            if (previous && pageNumber - previous > 1) {
                pageGroup.appendChild(createElement("span", "pagination-ellipsis", "…"));
            }

            pageGroup.appendChild(
                makePageLink(
                    String(pageNumber),
                    pageNumber,
                    "page-number",
                    pageNumber === currentPage
                )
            );
            previous = pageNumber;
        });

        pagination.appendChild(pageGroup);

        if (currentPage < totalPages) {
            pagination.appendChild(makePageLink("→", currentPage + 1, "pagination-arrow"));
        } else {
            pagination.appendChild(createElement("span", "pagination-arrow disabled", "→"));
        }
    };

    const render = () => {
        const sorted = sortBooks(books);
        const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
        currentPage = Math.min(Math.max(1, currentPage), totalPages);

        const start = (currentPage - 1) * PAGE_SIZE;
        const pageBooks = sorted.slice(start, start + PAGE_SIZE);

        bookList.innerHTML = "";
        pageBooks.forEach((book) => bookList.appendChild(renderBook(book)));

        if (emptyState) {
            emptyState.hidden = sorted.length !== 0;
        }

        resultCount.textContent = String(sorted.length);

        if (allCatalogTotal !== null && allCatalogTotal !== sorted.length) {
            resultLabel.textContent = `dari ${allCatalogTotal} buku`;
        } else {
            resultLabel.textContent = "buku tersedia";
        }

        if (sorted.length) {
            rangeLabel.textContent = `Menampilkan ${start + 1}–${start + pageBooks.length} dari ${sorted.length} buku`;
        } else {
            rangeLabel.textContent = "Tidak ada buku untuk ditampilkan";
        }

        sortStatus.textContent = sortLabels[currentSort];
        renderPagination(Math.ceil(sorted.length / PAGE_SIZE));
    };

    const moveToPage = (page, pushHistory = true) => {
        currentPage = page;
        render();

        if (pushHistory) {
            window.history.pushState({}, "", buildUrl(currentPage));
        }

        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        catalog.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    };

    pagination.addEventListener("click", (event) => {
        const link = event.target.closest("[data-catalog-page]");
        if (!link) {
            return;
        }

        event.preventDefault();
        moveToPage(Number(link.dataset.catalogPage));
    });

    genreSelect?.addEventListener("change", () => {
        form.submit();
    });

    sortSelect.addEventListener("change", () => {
        currentSort = sortSelect.value;
        currentPage = 1;
        render();
        window.history.replaceState({}, "", buildUrl(currentPage));
    });

    window.addEventListener("popstate", () => {
        const currentParams = new URLSearchParams(window.location.search);
        currentPage = Math.max(1, Number.parseInt(currentParams.get("page") || "1", 10) || 1);
        const sortFromUrl = currentParams.get("sort") || "default";
        currentSort = Object.prototype.hasOwnProperty.call(sortLabels, sortFromUrl)
            ? sortFromUrl
            : "default";
        sortSelect.value = currentSort;
        render();
    });

    const filteredApiUrl = new URL("/api/books", window.location.origin);
    if (query) {
        filteredApiUrl.searchParams.set("q", query);
    }
    if (genre) {
        filteredApiUrl.searchParams.set("genre", genre);
    }

    const loadCatalog = async () => {
        catalog.setAttribute("aria-busy", "true");

        try {
            const filteredRequest = fetch(filteredApiUrl.toString(), {
                headers: { Accept: "application/json" }
            });

            const needsAllCount = Boolean(query || genre);
            const allRequest = needsAllCount
                ? fetch("/api/books", { headers: { Accept: "application/json" } })
                : null;

            const filteredResponse = await filteredRequest;
            if (!filteredResponse.ok) {
                throw new Error(`Catalog API HTTP ${filteredResponse.status}`);
            }

            const filteredPayload = await filteredResponse.json();
            books = Array.isArray(filteredPayload.data)
                ? filteredPayload.data.map(normalizeBook)
                : [];

            if (allRequest) {
                const allResponse = await allRequest;
                if (allResponse.ok) {
                    const allPayload = await allResponse.json();
                    allCatalogTotal = Number(allPayload.total) || 0;
                }
            } else {
                allCatalogTotal = Number(filteredPayload.total) || books.length;
            }

            render();
        } catch (error) {
            console.warn("Catalog progressive enhancement unavailable:", error);
            sortSelect.disabled = true;
            sortStatus.textContent = "Urutan server";
        } finally {
            catalog.removeAttribute("aria-busy");
        }
    };

    loadCatalog();
});

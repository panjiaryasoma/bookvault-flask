(() => {
    const app = document.getElementById("public-books-app");

    if (!app) {
        return;
    }

    const PAGE_SIZE = 12;
    const query = (app.dataset.query || "python").trim() || "python";
    const isAdmin = app.dataset.admin === "true";
    const hasServerError = app.dataset.hasError === "true";
    const errorBox = document.getElementById("api-error");
    const statusBox = document.getElementById("fallback-status");
    const results = document.getElementById("public-results");
    const sentinel = document.getElementById("public-scroll-sentinel");
    const countLabel = document.getElementById("public-results-count");
    const sortSelect = document.getElementById("public-sort");
    const providerName = document.getElementById("provider-name");
    const providerState = document.getElementById("provider-state");

    let provider = null;
    let totalAvailable = null;
    let loading = false;
    let exhausted = false;
    let observer = null;
    let nextOffset = 0;
    let sequenceCounter = 0;
    const seenBooks = new Set();

    const normalizeKeyPart = (value) => String(value || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

    const bookKey = (book) => `${normalizeKeyPart(book.title)}::${normalizeKeyPart(book.author)}`;

    const normalizeProvider = (value) => {
        const text = String(value || "").toLowerCase();
        if (text.includes("google")) return "google";
        if (text.includes("open library")) return "openlibrary";
        return null;
    };

    const providerLabel = (value) => value === "google" ? "Google Books" : "Open Library";

    const syncProviderSummary = () => {
        if (!providerName || !providerState) return;

        if (!provider) {
            providerName.textContent = "Mendeteksi sumber…";
            providerState.textContent = "Menunggu hasil pencarian.";
            return;
        }

        providerName.textContent = providerLabel(provider);
        providerState.textContent = provider === "google"
            ? "Open Library tidak tersedia, fallback aktif."
            : "Primary source aktif.";
    };

    const setStatus = (message, state = "info") => {
        if (!statusBox) return;
        statusBox.hidden = false;
        statusBox.className = `fallback-status fallback-status--${state}`;
        statusBox.textContent = message;
    };

    const clearStatus = () => {
        if (!statusBox) return;
        statusBox.hidden = true;
        statusBox.textContent = "";
    };

    const getRows = () => Array.from(results.querySelectorAll(".public-book-row"));
    const getLoadedCount = () => getRows().length;

    const normalizeCover = (imageLinks = {}) => {
        const url = imageLinks.thumbnail || imageLinks.smallThumbnail || "";
        return String(url).replace(/^http:\/\//i, "https://");
    };

    const getYear = (publishedDate = "") => {
        const match = String(publishedDate).match(/^\d{4}/);
        return match ? match[0] : "";
    };

    const parseNumber = (value) => {
        const number = Number.parseFloat(String(value || "").replace(/[^0-9.]/g, ""));
        return Number.isFinite(number) ? number : 0;
    };

    const addText = (parent, tag, text, className = "") => {
        const element = document.createElement(tag);
        element.textContent = text;
        if (className) element.className = className;
        parent.appendChild(element);
        return element;
    };

    const addHiddenInput = (form, name, value) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value || "";
        form.appendChild(input);
    };

    const buildImportPanel = (book) => {
        const details = document.createElement("details");
        details.className = "import-panel";

        const summary = document.createElement("summary");
        summary.textContent = "Import to BookVault";
        details.appendChild(summary);

        const form = document.createElement("form");
        form.method = "POST";
        form.action = "/admin/import-book";
        form.className = "import-form";

        addHiddenInput(form, "title", book.title);
        addHiddenInput(form, "author", book.author);
        addHiddenInput(form, "cover_url", book.coverUrl);
        addHiddenInput(form, "source", book.source);

        const yearLabel = document.createElement("label");
        addText(yearLabel, "span", "Tahun");
        const yearInput = document.createElement("input");
        yearInput.type = "text";
        yearInput.name = "year";
        yearInput.value = book.year || "";
        yearInput.placeholder = "Tahun";
        yearInput.required = true;
        yearInput.className = "import-year";
        yearLabel.appendChild(yearInput);
        form.appendChild(yearLabel);

        const genreLabel = document.createElement("label");
        addText(genreLabel, "span", "Genre");
        const genreInput = document.createElement("input");
        genreInput.type = "text";
        genreInput.name = "genre";
        genreInput.placeholder = "Masukkan genre...";
        genreInput.required = true;
        genreInput.className = "import-genre";
        genreLabel.appendChild(genreInput);
        form.appendChild(genreLabel);

        const button = document.createElement("button");
        button.type = "submit";
        button.textContent = "Simpan ke Katalog Lokal";
        form.appendChild(button);

        details.appendChild(form);
        return details;
    };

    const renderBook = (book) => {
        const key = bookKey(book);
        if (!key || seenBooks.has(key)) return false;
        seenBooks.add(key);

        const row = document.createElement("article");
        row.className = "public-book-row";
        row.dataset.title = book.title || "";
        row.dataset.author = book.author || "";
        row.dataset.year = book.year || "";
        row.dataset.editions = String(book.editionCount ?? "-");
        row.dataset.source = book.source || providerLabel(provider);
        row.dataset.sequence = String(sequenceCounter++);

        const media = document.createElement("div");
        media.className = "public-book-media";

        if (book.coverUrl) {
            const image = document.createElement("img");
            image.src = book.coverUrl;
            image.alt = `Cover ${book.title}`;
            image.loading = "lazy";
            media.appendChild(image);
        } else {
            addText(media, "div", "No Cover", "api-cover-placeholder");
        }

        const copy = document.createElement("div");
        copy.className = "public-book-copy";

        const heading = document.createElement("div");
        heading.className = "public-book-heading";
        const titleWrap = document.createElement("div");
        addText(titleWrap, "h2", book.title || "Tanpa Judul");
        addText(titleWrap, "p", book.author || "Tidak diketahui", "book-author");
        heading.appendChild(titleWrap);
        addText(heading, "span", book.source || providerLabel(provider), "source-badge");
        copy.appendChild(heading);

        const metadata = document.createElement("dl");
        metadata.className = "book-metadata";

        const yearMeta = document.createElement("div");
        addText(yearMeta, "dt", "Tahun");
        addText(yearMeta, "dd", book.year || "—");
        metadata.appendChild(yearMeta);

        const editionMeta = document.createElement("div");
        addText(editionMeta, "dt", "Edisi");
        addText(editionMeta, "dd", String(book.editionCount ?? "—"));
        metadata.appendChild(editionMeta);
        copy.appendChild(metadata);

        if (isAdmin) copy.appendChild(buildImportPanel(book));

        row.appendChild(media);
        row.appendChild(copy);
        results.appendChild(row);
        return true;
    };

    const sortResults = () => {
        const mode = sortSelect ? sortSelect.value : "relevance";
        const rows = getRows();

        rows.sort((a, b) => {
            if (mode === "newest") return parseNumber(b.dataset.year) - parseNumber(a.dataset.year);
            if (mode === "oldest") {
                const yearA = parseNumber(a.dataset.year) || Number.MAX_SAFE_INTEGER;
                const yearB = parseNumber(b.dataset.year) || Number.MAX_SAFE_INTEGER;
                return yearA - yearB;
            }
            if (mode === "title") return a.dataset.title.localeCompare(b.dataset.title, undefined, { sensitivity: "base" });
            if (mode === "editions") return parseNumber(b.dataset.editions) - parseNumber(a.dataset.editions);
            return parseNumber(a.dataset.sequence) - parseNumber(b.dataset.sequence);
        });

        rows.forEach((row) => results.appendChild(row));
    };

    const hydrateInitialRows = () => {
        const initialRows = getRows();
        nextOffset = initialRows.length;

        initialRows.forEach((row) => {
            row.dataset.sequence = String(sequenceCounter++);
            const key = bookKey({ title: row.dataset.title, author: row.dataset.author });

            if (seenBooks.has(key)) {
                row.remove();
                return;
            }

            seenBooks.add(key);
        });
    };

    const fetchOpenLibrary = async (offset) => {
        const endpoint = new URL("https://openlibrary.org/search.json");
        endpoint.searchParams.set("q", query);
        endpoint.searchParams.set("limit", String(PAGE_SIZE));
        endpoint.searchParams.set("offset", String(offset));
        endpoint.searchParams.set("fields", "title,author_name,first_publish_year,edition_count,cover_i");

        const response = await fetch(endpoint.toString(), { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`Open Library HTTP ${response.status}`);

        const payload = await response.json();
        const docs = Array.isArray(payload.docs) ? payload.docs : [];

        return {
            provider: "openlibrary",
            total: Number.isFinite(payload.numFound) ? payload.numFound : null,
            books: docs.map((item) => ({
                title: item.title || "Tanpa Judul",
                author: Array.isArray(item.author_name) && item.author_name.length
                    ? item.author_name.join(", ")
                    : "Tidak diketahui",
                year: getYear(item.first_publish_year),
                editionCount: item.edition_count ?? 0,
                coverUrl: item.cover_i ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg` : "",
                source: "Open Library"
            }))
        };
    };

    const fetchGoogleBooks = async (offset) => {
        const endpoint = new URL("https://www.googleapis.com/books/v1/volumes");
        endpoint.searchParams.set("q", query);
        endpoint.searchParams.set("maxResults", String(PAGE_SIZE));
        endpoint.searchParams.set("startIndex", String(offset));
        endpoint.searchParams.set("printType", "books");

        const response = await fetch(endpoint.toString(), { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`Google Books HTTP ${response.status}`);

        const payload = await response.json();
        const items = Array.isArray(payload.items) ? payload.items : [];

        return {
            provider: "google",
            total: Number.isFinite(payload.totalItems) ? payload.totalItems : null,
            books: items.map((item) => {
                const info = item.volumeInfo || {};
                return {
                    title: info.title || "Tanpa Judul",
                    author: Array.isArray(info.authors) && info.authors.length
                        ? info.authors.join(", ")
                        : "Tidak diketahui",
                    year: getYear(info.publishedDate),
                    editionCount: "-",
                    coverUrl: normalizeCover(info.imageLinks),
                    source: "Google Books"
                };
            })
        };
    };

    const updateControls = () => {
        const loaded = getLoadedCount();
        const reachedKnownTotal = totalAvailable !== null && nextOffset >= totalAvailable;

        if (countLabel) {
            countLabel.textContent = totalAvailable !== null
                ? `${loaded} hasil unik dimuat · ${totalAvailable} ditemukan sumber`
                : `${loaded} hasil unik dimuat`;
        }

        if (!sentinel) return;

        if (loading) {
            sentinel.textContent = "Memuat hasil berikutnya...";
            sentinel.dataset.state = "loading";
        } else if (exhausted || reachedKnownTotal) {
            sentinel.textContent = loaded ? "Semua hasil yang tersedia sudah dimuat." : "Tidak ada hasil.";
            sentinel.dataset.state = "done";
            if (observer) observer.unobserve(sentinel);
        } else {
            sentinel.textContent = "Scroll untuk memuat hasil berikutnya";
            sentinel.dataset.state = "ready";
        }
    };

    const requestPage = async (preferredProvider, offset) => {
        if (preferredProvider === "google") return fetchGoogleBooks(offset);

        try {
            return await fetchOpenLibrary(offset);
        } catch (error) {
            console.warn("Open Library page failed, switching to Google Books:", error);
            return fetchGoogleBooks(offset);
        }
    };

    const appendNextPage = async () => {
        if (loading || exhausted) return;
        if (totalAvailable !== null && nextOffset >= totalAvailable) {
            exhausted = true;
            updateControls();
            return;
        }

        loading = true;
        updateControls();

        try {
            const page = await requestPage(provider || "openlibrary", nextOffset);
            const previousProvider = provider;
            provider = page.provider;
            totalAvailable = page.total;
            syncProviderSummary();

            const rawCount = page.books.length;
            if (!rawCount) {
                exhausted = true;
                setStatus("Tidak ada hasil tambahan.", "empty");
                return;
            }

            nextOffset += rawCount;
            let added = 0;
            page.books.forEach((book) => {
                if (renderBook(book)) added += 1;
            });

            if (rawCount < PAGE_SIZE) exhausted = true;
            if (previousProvider && previousProvider !== provider) {
                setStatus("Open Library tidak merespons. Hasil berikutnya dilanjutkan dari Google Books.", "info");
            } else if (!added) {
                setStatus("Batch ini hanya berisi hasil duplikat. Melanjutkan pencarian saat scroll berikutnya.", "empty");
            } else {
                clearStatus();
            }

            sortResults();
        } catch (error) {
            console.error("Could not load additional public books:", error);
            setStatus("Hasil tambahan belum dapat dimuat. Scroll keluar lalu kembali ke bawah untuk mencoba lagi.", "error");
        } finally {
            loading = false;
            updateControls();
        }
    };

    const loadBrowserFallback = async () => {
        setStatus("Server belum mendapat hasil. Mencoba sumber publik langsung dari browser...", "info");

        try {
            let firstPage;
            try {
                firstPage = await fetchOpenLibrary(0);
            } catch (openLibraryError) {
                console.warn("Browser Open Library fallback failed:", openLibraryError);
                firstPage = await fetchGoogleBooks(0);
            }

            results.innerHTML = "";
            seenBooks.clear();
            sequenceCounter = 0;
            provider = firstPage.provider;
            totalAvailable = firstPage.total;
            nextOffset = firstPage.books.length;
            firstPage.books.forEach(renderBook);
            exhausted = firstPage.books.length < PAGE_SIZE;
            syncProviderSummary();
            sortResults();

            if (errorBox) errorBox.hidden = true;

            if (!firstPage.books.length) {
                setStatus(`Tidak ada hasil untuk “${query}”.`, "empty");
            } else {
                clearStatus();
            }
        } catch (error) {
            console.error("All browser public-book fallbacks failed:", error);
            exhausted = true;
            setStatus("Semua sumber buku publik sedang tidak dapat diakses. Periksa koneksi internet lalu coba lagi.", "error");
        } finally {
            updateControls();
        }
    };

    provider = normalizeProvider(app.dataset.provider);
    hydrateInitialRows();
    syncProviderSummary();
    sortResults();
    updateControls();

    if (sortSelect) {
        sortSelect.addEventListener("change", sortResults);
    }

    if (sentinel && "IntersectionObserver" in window) {
        observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry && entry.isIntersecting) appendNextPage();
            },
            { root: null, rootMargin: "500px 0px", threshold: 0.01 }
        );
        observer.observe(sentinel);
    }

    if (hasServerError || getLoadedCount() === 0) {
        loadBrowserFallback();
    }
})();

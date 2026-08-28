(() => {
    const app = document.getElementById("public-books-app");

    if (!app) {
        return;
    }

    const PAGE_SIZE = 20;
    const INITIAL_TARGET = 20;
    const MAX_RENDERED = 350;
    const TOP_RELOAD_MARGIN = 700;

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
    let exhausted = false;
    let bottomObserver = null;
    let nextOffset = 0;
    let loadingBottom = false;
    let loadingTop = false;
    let scrollTicking = false;

    const visibleKeys = new Set();
    const loadedChunks = [];
    const beforeHistory = [];
    const afterHistory = [];

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
    const currentSort = () => sortSelect ? sortSelect.value : "relevance";

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

    const createBookRow = (book, sourceOffset, chunkProvider) => {
        const key = bookKey(book);
        if (!key || visibleKeys.has(key)) return null;
        visibleKeys.add(key);

        const row = document.createElement("article");
        row.className = "public-book-row";
        row.dataset.title = book.title || "";
        row.dataset.author = book.author || "";
        row.dataset.year = book.year || "";
        row.dataset.editions = String(book.editionCount ?? "-");
        row.dataset.source = book.source || providerLabel(chunkProvider);
        row.dataset.sequence = String(sourceOffset);
        row.dataset.sourceOffset = String(sourceOffset);
        row.dataset.streamProvider = chunkProvider || "openlibrary";
        row.dataset.bookKey = key;

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
        addText(heading, "span", book.source || providerLabel(chunkProvider), "source-badge");
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
        return row;
    };

    const sortResults = () => {
        const mode = currentSort();
        const rows = getRows();

        rows.sort((a, b) => {
            if (mode === "newest") return parseNumber(b.dataset.year) - parseNumber(a.dataset.year);
            if (mode === "oldest") {
                const yearA = parseNumber(a.dataset.year) || Number.MAX_SAFE_INTEGER;
                const yearB = parseNumber(b.dataset.year) || Number.MAX_SAFE_INTEGER;
                return yearA - yearB;
            }
            if (mode === "title") {
                return a.dataset.title.localeCompare(b.dataset.title, undefined, { sensitivity: "base" });
            }
            if (mode === "editions") return parseNumber(b.dataset.editions) - parseNumber(a.dataset.editions);
            return parseNumber(a.dataset.sequence) - parseNumber(b.dataset.sequence);
        });

        rows.forEach((row) => results.appendChild(row));
    };

    const hydrateInitialRows = () => {
        const initialRows = getRows();
        const rawCount = initialRows.length;
        nextOffset = rawCount;
        const nodes = [];
        const initialProvider = provider || "openlibrary";

        initialRows.forEach((row, index) => {
            const key = bookKey({ title: row.dataset.title, author: row.dataset.author });
            if (!key || visibleKeys.has(key)) {
                row.remove();
                return;
            }

            visibleKeys.add(key);
            row.dataset.bookKey = key;
            row.dataset.sequence = String(index);
            row.dataset.sourceOffset = String(index);
            row.dataset.streamProvider = initialProvider;
            nodes.push(row);
        });

        if (rawCount) {
            loadedChunks.push({ start: 0, end: rawCount, provider: initialProvider, nodes });
        }
    };

    const fetchOpenLibrary = async (offset, limit = PAGE_SIZE) => {
        const endpoint = new URL("https://openlibrary.org/search.json");
        endpoint.searchParams.set("q", query);
        endpoint.searchParams.set("limit", String(limit));
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
                coverUrl: item.cover_i
                    ? `https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg`
                    : "",
                source: "Open Library"
            }))
        };
    };

    const fetchGoogleBooks = async (offset, limit = PAGE_SIZE) => {
        const endpoint = new URL("https://www.googleapis.com/books/v1/volumes");
        endpoint.searchParams.set("q", query);
        endpoint.searchParams.set("maxResults", String(limit));
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

    const fetchExactProvider = (streamProvider, offset, limit) => {
        return streamProvider === "google"
            ? fetchGoogleBooks(offset, limit)
            : fetchOpenLibrary(offset, limit);
    };

    const requestPage = async (preferredProvider, offset, limit = PAGE_SIZE) => {
        if (preferredProvider === "google") return fetchGoogleBooks(offset, limit);

        try {
            return await fetchOpenLibrary(offset, limit);
        } catch (error) {
            console.warn("Open Library page failed, switching to Google Books:", error);
            return fetchGoogleBooks(offset, limit);
        }
    };

    const renderChunk = (page, startOffset, direction = "append") => {
        const fragment = document.createDocumentFragment();
        const nodes = [];

        page.books.forEach((book, index) => {
            const row = createBookRow(book, startOffset + index, page.provider);
            if (!row) return;
            nodes.push(row);
            fragment.appendChild(row);
        });

        const chunk = {
            start: startOffset,
            end: startOffset + page.books.length,
            provider: page.provider,
            nodes
        };

        if (direction === "prepend") {
            results.insertBefore(fragment, results.firstChild);
            loadedChunks.unshift(chunk);
        } else {
            results.appendChild(fragment);
            loadedChunks.push(chunk);
        }

        sortResults();
        return chunk;
    };

    const removeChunk = (chunk) => {
        chunk.nodes.forEach((node) => {
            if (node.dataset.bookKey) visibleKeys.delete(node.dataset.bookKey);
            node.remove();
        });
    };

    const chunkMeta = (chunk) => ({ start: chunk.start, end: chunk.end, provider: chunk.provider });

    const trimTopIfNeeded = () => {
        if (getLoadedCount() <= MAX_RENDERED) return;

        const beforeHeight = document.documentElement.scrollHeight;
        const beforeY = window.scrollY;

        while (getLoadedCount() > MAX_RENDERED && loadedChunks.length > 1) {
            const chunk = loadedChunks.shift();
            removeChunk(chunk);
            beforeHistory.push(chunkMeta(chunk));
        }

        const removedHeight = beforeHeight - document.documentElement.scrollHeight;
        if (removedHeight > 0 && currentSort() === "relevance") {
            window.scrollTo(0, Math.max(0, beforeY - removedHeight));
        }
    };

    const trimBottomIfNeeded = () => {
        while (getLoadedCount() > MAX_RENDERED && loadedChunks.length > 1) {
            const chunk = loadedChunks.pop();
            removeChunk(chunk);
            afterHistory.push(chunkMeta(chunk));
        }
    };

    const updateControls = () => {
        const loaded = getLoadedCount();
        const firstChunk = loadedChunks[0];
        const lastChunk = loadedChunks[loadedChunks.length - 1];
        const start = firstChunk ? firstChunk.start + 1 : 0;
        const end = lastChunk ? lastChunk.end : 0;
        const hasWindowedHistory = beforeHistory.length > 0 || afterHistory.length > 0;
        const reachedKnownTotal = totalAvailable !== null && nextOffset >= totalAvailable && afterHistory.length === 0;

        if (countLabel) {
            if (hasWindowedHistory) {
                const totalText = totalAvailable !== null ? ` · ${totalAvailable} ditemukan sumber` : "";
                countLabel.textContent = `${loaded} buku aktif · rentang ${start}–${end}${totalText}`;
            } else if (totalAvailable !== null) {
                countLabel.textContent = `${loaded} hasil unik dimuat · ${totalAvailable} ditemukan sumber`;
            } else {
                countLabel.textContent = `${loaded} hasil unik dimuat`;
            }
        }

        if (!sentinel) return;

        if (loadingBottom) {
            sentinel.textContent = afterHistory.length
                ? "Memuat kembali hasil berikutnya..."
                : "Memuat hasil berikutnya...";
            sentinel.dataset.state = "loading";
        } else if (afterHistory.length > 0) {
            sentinel.textContent = "Scroll untuk memuat kembali hasil berikutnya";
            sentinel.dataset.state = "ready";
        } else if (exhausted || reachedKnownTotal) {
            sentinel.textContent = loaded ? "Semua hasil yang tersedia sudah dimuat." : "Tidak ada hasil.";
            sentinel.dataset.state = "done";
        } else {
            sentinel.textContent = "Scroll untuk memuat hasil berikutnya";
            sentinel.dataset.state = "ready";
        }
    };

    const restoreAfterChunk = async () => {
        const meta = afterHistory.pop();
        if (!meta) return false;

        try {
            const page = await fetchExactProvider(meta.provider, meta.start, meta.end - meta.start);
            if (!page.books.length) throw new Error("Empty restored page");
            renderChunk(page, meta.start, "append");
            trimTopIfNeeded();
            return true;
        } catch (error) {
            afterHistory.push(meta);
            console.error("Could not restore later public books:", error);
            setStatus("Bagian hasil berikutnya belum dapat dimuat ulang. Coba scroll lagi beberapa saat.", "error");
            return false;
        }
    };

    const appendNextPage = async (requestedLimit = PAGE_SIZE) => {
        if (loadingBottom) return;

        if (!afterHistory.length && (exhausted || (totalAvailable !== null && nextOffset >= totalAvailable))) {
            exhausted = true;
            updateControls();
            return;
        }

        loadingBottom = true;
        updateControls();

        try {
            if (afterHistory.length) {
                const restored = await restoreAfterChunk();
                if (restored) clearStatus();
                return;
            }

            const startOffset = nextOffset;
            const page = await requestPage(provider || "openlibrary", startOffset, requestedLimit);
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
            const chunk = renderChunk(page, startOffset, "append");
            trimTopIfNeeded();

            if (rawCount < requestedLimit) exhausted = true;
            if (previousProvider && previousProvider !== provider) {
                setStatus("Open Library tidak merespons. Hasil berikutnya dilanjutkan dari Google Books.", "info");
            } else if (!chunk.nodes.length) {
                setStatus("Batch ini hanya berisi hasil duplikat. Melanjutkan pencarian saat scroll berikutnya.", "empty");
            } else {
                clearStatus();
            }
        } catch (error) {
            console.error("Could not load additional public books:", error);
            setStatus("Hasil tambahan belum dapat dimuat. Scroll keluar lalu kembali ke bawah untuk mencoba lagi.", "error");
        } finally {
            loadingBottom = false;
            updateControls();
        }
    };

    const prependPreviousChunk = async () => {
        if (loadingTop || !beforeHistory.length) return;

        const meta = beforeHistory.pop();
        loadingTop = true;
        const beforeHeight = document.documentElement.scrollHeight;
        const beforeY = window.scrollY;

        try {
            const page = await fetchExactProvider(meta.provider, meta.start, meta.end - meta.start);
            if (!page.books.length) throw new Error("Empty restored page");

            renderChunk(page, meta.start, "prepend");
            trimBottomIfNeeded();

            if (currentSort() === "relevance") {
                const heightDelta = document.documentElement.scrollHeight - beforeHeight;
                if (heightDelta > 0) window.scrollTo(0, beforeY + heightDelta);
            }

            clearStatus();
        } catch (error) {
            beforeHistory.push(meta);
            console.error("Could not restore earlier public books:", error);
            setStatus("Bagian hasil sebelumnya belum dapat dimuat ulang. Coba scroll ke atas lagi beberapa saat.", "error");
        } finally {
            loadingTop = false;
            updateControls();
        }
    };

    const fillInitialGrid = async () => {
        let attempts = 0;

        while (getLoadedCount() < INITIAL_TARGET && !exhausted && attempts < 5) {
            const needed = INITIAL_TARGET - getLoadedCount();
            await appendNextPage(Math.min(PAGE_SIZE, needed));
            attempts += 1;
        }
    };

    const resetWindowState = () => {
        results.innerHTML = "";
        visibleKeys.clear();
        loadedChunks.length = 0;
        beforeHistory.length = 0;
        afterHistory.length = 0;
        nextOffset = 0;
        exhausted = false;
    };

    const loadBrowserFallback = async () => {
        setStatus("Server belum mendapat hasil. Mencoba sumber publik langsung dari browser...", "info");

        try {
            let firstPage;
            try {
                firstPage = await fetchOpenLibrary(0, PAGE_SIZE);
            } catch (openLibraryError) {
                console.warn("Browser Open Library fallback failed:", openLibraryError);
                firstPage = await fetchGoogleBooks(0, PAGE_SIZE);
            }

            resetWindowState();
            provider = firstPage.provider;
            totalAvailable = firstPage.total;
            nextOffset = firstPage.books.length;
            renderChunk(firstPage, 0, "append");
            exhausted = firstPage.books.length < PAGE_SIZE;
            syncProviderSummary();

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

    const setupBottomInfiniteScroll = () => {
        if (!sentinel || !("IntersectionObserver" in window)) return;

        bottomObserver = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry && entry.isIntersecting) appendNextPage();
            },
            { root: null, rootMargin: "500px 0px", threshold: 0.01 }
        );
        bottomObserver.observe(sentinel);
    };

    const setupTopReload = () => {
        window.addEventListener("scroll", () => {
            if (scrollTicking) return;
            scrollTicking = true;

            window.requestAnimationFrame(() => {
                scrollTicking = false;
                if (!beforeHistory.length || loadingTop || loadingBottom) return;

                const distanceFromGridTop = results.getBoundingClientRect().top;
                if (distanceFromGridTop > -TOP_RELOAD_MARGIN) {
                    prependPreviousChunk();
                }
            });
        }, { passive: true });
    };

    const bootstrap = async () => {
        provider = normalizeProvider(app.dataset.provider);
        hydrateInitialRows();
        syncProviderSummary();
        sortResults();
        updateControls();

        if (sortSelect) {
            sortSelect.addEventListener("change", () => {
                sortResults();
                updateControls();
            });
        }

        if (hasServerError || getLoadedCount() === 0) {
            await loadBrowserFallback();
            if (getLoadedCount() < INITIAL_TARGET && !exhausted) {
                await fillInitialGrid();
            }
        } else {
            await fillInitialGrid();
        }

        setupBottomInfiniteScroll();
        setupTopReload();
    };

    bootstrap();
})();

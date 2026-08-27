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

    let provider = null;
    let totalAvailable = null;
    let loading = false;
    let exhausted = false;
    let observer = null;

    const setStatus = (message, state = "info") => {
        statusBox.hidden = false;
        statusBox.className = `fallback-status fallback-status--${state}`;
        statusBox.textContent = message;
    };

    const clearStatus = () => {
        statusBox.hidden = true;
        statusBox.textContent = "";
    };

    const getLoadedCount = () => results.querySelectorAll(".card").length;

    const normalizeCover = (imageLinks = {}) => {
        const url = imageLinks.thumbnail || imageLinks.smallThumbnail || "";
        return String(url).replace(/^http:\/\//i, "https://");
    };

    const getYear = (publishedDate = "") => {
        const match = String(publishedDate).match(/^\d{4}/);
        return match ? match[0] : "";
    };

    const addText = (parent, tag, text, className = "") => {
        const element = document.createElement(tag);
        element.textContent = text;

        if (className) {
            element.className = className;
        }

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

    const renderBook = (book) => {
        const card = document.createElement("article");
        card.className = "card";

        if (book.coverUrl) {
            const image = document.createElement("img");
            image.src = book.coverUrl;
            image.alt = `Cover ${book.title}`;
            image.loading = "lazy";
            card.appendChild(image);
        } else {
            const placeholder = document.createElement("div");
            placeholder.className = "api-cover-placeholder";
            addText(placeholder, "span", "No Cover");
            card.appendChild(placeholder);
        }

        addText(card, "h2", book.title);
        addText(card, "p", book.author);
        addText(card, "p", `Tahun: ${book.year || "-"}`);
        addText(card, "p", `Jumlah edisi: ${book.editionCount ?? "-"}`);
        addText(card, "p", `Sumber: ${book.source}`, "source-note");

        if (isAdmin) {
            const form = document.createElement("form");
            form.method = "POST";
            form.action = "/admin/import-book";
            form.className = "import-form";

            addHiddenInput(form, "title", book.title);
            addHiddenInput(form, "author", book.author);
            addHiddenInput(form, "cover_url", book.coverUrl);
            addHiddenInput(form, "source", book.source);

            const yearInput = document.createElement("input");
            yearInput.type = "text";
            yearInput.name = "year";
            yearInput.value = book.year || "";
            yearInput.placeholder = "Tahun";
            yearInput.required = true;
            yearInput.className = "import-year";
            form.appendChild(yearInput);

            const genreInput = document.createElement("input");
            genreInput.type = "text";
            genreInput.name = "genre";
            genreInput.placeholder = "Masukkan genre...";
            genreInput.required = true;
            genreInput.className = "import-genre";
            form.appendChild(genreInput);

            const button = document.createElement("button");
            button.type = "submit";
            button.textContent = "Simpan ke Katalog Lokal";
            form.appendChild(button);

            card.appendChild(form);
        }

        results.appendChild(card);
    };

    const fetchOpenLibrary = async (offset) => {
        const endpoint = new URL("https://openlibrary.org/search.json");
        endpoint.searchParams.set("q", query);
        endpoint.searchParams.set("limit", String(PAGE_SIZE));
        endpoint.searchParams.set("offset", String(offset));
        endpoint.searchParams.set(
            "fields",
            "title,author_name,first_publish_year,edition_count,cover_i"
        );

        const response = await fetch(endpoint.toString(), {
            headers: { Accept: "application/json" }
        });

        if (!response.ok) {
            throw new Error(`Open Library HTTP ${response.status}`);
        }

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

    const fetchGoogleBooks = async (offset) => {
        const endpoint = new URL("https://www.googleapis.com/books/v1/volumes");
        endpoint.searchParams.set("q", query);
        endpoint.searchParams.set("maxResults", String(PAGE_SIZE));
        endpoint.searchParams.set("startIndex", String(offset));
        endpoint.searchParams.set("printType", "books");

        const response = await fetch(endpoint.toString(), {
            headers: { Accept: "application/json" }
        });

        if (!response.ok) {
            throw new Error(`Google Books HTTP ${response.status}`);
        }

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

    const detectInitialProvider = () => {
        const note = results.querySelector(".source-note");
        const text = note ? note.textContent.toLowerCase() : "";

        if (text.includes("google books")) {
            return "google";
        }

        if (text.includes("open library")) {
            return "openlibrary";
        }

        return null;
    };

    const controls = document.createElement("div");
    controls.className = "public-results-controls";

    const countLabel = document.createElement("span");
    countLabel.className = "public-results-count";

    const sentinel = document.createElement("div");
    sentinel.className = "infinite-scroll-sentinel";
    sentinel.setAttribute("aria-live", "polite");

    controls.appendChild(countLabel);
    controls.appendChild(sentinel);
    results.insertAdjacentElement("afterend", controls);

    const updateControls = () => {
        const loaded = getLoadedCount();
        const reachedKnownTotal = totalAvailable !== null && loaded >= totalAvailable;

        if (totalAvailable !== null) {
            countLabel.textContent = `${loaded} dari ${totalAvailable} hasil dimuat`;
        } else {
            countLabel.textContent = `${loaded} hasil dimuat`;
        }

        if (loading) {
            sentinel.textContent = "Memuat hasil berikutnya...";
            sentinel.dataset.state = "loading";
        } else if (exhausted || reachedKnownTotal) {
            sentinel.textContent = loaded ? "Semua hasil yang tersedia sudah dimuat." : "Tidak ada hasil.";
            sentinel.dataset.state = "done";

            if (observer) {
                observer.unobserve(sentinel);
            }
        } else {
            sentinel.textContent = "Scroll untuk memuat hasil berikutnya";
            sentinel.dataset.state = "ready";
        }
    };

    const requestPage = async (preferredProvider, offset) => {
        if (preferredProvider === "google") {
            return fetchGoogleBooks(offset);
        }

        try {
            return await fetchOpenLibrary(offset);
        } catch (error) {
            console.warn("Open Library page failed, switching to Google Books:", error);
            return fetchGoogleBooks(offset);
        }
    };

    const appendNextPage = async () => {
        if (loading || exhausted) {
            return;
        }

        const loadedBefore = getLoadedCount();
        if (totalAvailable !== null && loadedBefore >= totalAvailable) {
            exhausted = true;
            updateControls();
            return;
        }

        loading = true;
        updateControls();

        try {
            const page = await requestPage(provider || "openlibrary", loadedBefore);

            provider = page.provider;
            totalAvailable = page.total;

            if (!page.books.length) {
                exhausted = true;
                setStatus("Tidak ada hasil tambahan.", "empty");
                return;
            }

            page.books.forEach(renderBook);

            if (page.books.length < PAGE_SIZE) {
                exhausted = true;
            }

            clearStatus();
        } catch (error) {
            console.error("Could not load additional public books:", error);
            setStatus(
                "Hasil tambahan belum dapat dimuat. Scroll keluar lalu kembali ke bawah untuk mencoba lagi.",
                "error"
            );
        } finally {
            loading = false;
            updateControls();
        }
    };

    const loadBrowserFallback = async () => {
        setStatus("Server API belum mendapat hasil. Mencoba langsung dari browser...");

        try {
            let firstPage;

            try {
                firstPage = await fetchOpenLibrary(0);
            } catch (openLibraryError) {
                console.warn("Browser Open Library fallback failed:", openLibraryError);
                firstPage = await fetchGoogleBooks(0);
            }

            results.innerHTML = "";
            firstPage.books.forEach(renderBook);
            provider = firstPage.provider;
            totalAvailable = firstPage.total;
            exhausted = firstPage.books.length < PAGE_SIZE;

            if (errorBox) {
                errorBox.hidden = true;
            }

            if (!firstPage.books.length) {
                setStatus(`Tidak ada hasil untuk “${query}”.`, "empty");
            } else {
                clearStatus();
            }
        } catch (error) {
            console.error("All browser public-book fallbacks failed:", error);
            exhausted = true;
            setStatus(
                "Semua sumber buku publik sedang tidak dapat diakses. Periksa koneksi internet lalu coba lagi.",
                "error"
            );
        } finally {
            updateControls();
        }
    };

    observer = new IntersectionObserver(
        (entries) => {
            const entry = entries[0];
            if (entry && entry.isIntersecting) {
                appendNextPage();
            }
        },
        {
            root: null,
            rootMargin: "500px 0px",
            threshold: 0.01
        }
    );

    provider = detectInitialProvider();
    updateControls();
    observer.observe(sentinel);

    if (hasServerError || getLoadedCount() === 0) {
        loadBrowserFallback();
    }
})();

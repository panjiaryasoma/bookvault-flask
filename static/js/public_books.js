(() => {
    const app = document.getElementById("public-books-app");

    if (!app || app.dataset.hasError !== "true") {
        return;
    }

    const query = (app.dataset.query || "python").trim() || "python";
    const isAdmin = app.dataset.admin === "true";
    const errorBox = document.getElementById("api-error");
    const statusBox = document.getElementById("fallback-status");
    const results = document.getElementById("public-results");

    const setStatus = (message, state = "info") => {
        statusBox.hidden = false;
        statusBox.className = `fallback-status fallback-status--${state}`;
        statusBox.textContent = message;
    };

    const normalizeCover = (imageLinks = {}) => {
        const url = imageLinks.thumbnail || imageLinks.smallThumbnail || "";
        return url.replace(/^http:\/\//i, "https://");
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
        addText(card, "p", "Jumlah edisi: -");
        addText(card, "p", "Sumber: Google Books (cadangan)", "source-note");

        if (isAdmin) {
            const form = document.createElement("form");
            form.method = "POST";
            form.action = "/admin/import-book";
            form.className = "import-form";

            addHiddenInput(form, "title", book.title);
            addHiddenInput(form, "author", book.author);
            addHiddenInput(form, "cover_url", book.coverUrl);

            const yearInput = document.createElement("input");
            yearInput.type = "text";
            yearInput.name = "year";
            yearInput.value = book.year;
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

    const loadFallback = async () => {
        setStatus("Open Library tidak tersedia. Mengambil hasil dari sumber cadangan...");

        const endpoint = new URL("https://www.googleapis.com/books/v1/volumes");
        endpoint.searchParams.set("q", query);
        endpoint.searchParams.set("maxResults", "12");
        endpoint.searchParams.set("printType", "books");

        try {
            const response = await fetch(endpoint.toString(), {
                headers: { Accept: "application/json" }
            });

            if (!response.ok) {
                throw new Error(`Fallback HTTP ${response.status}`);
            }

            const payload = await response.json();
            const items = Array.isArray(payload.items) ? payload.items : [];

            results.innerHTML = "";

            const books = items.map((item) => {
                const info = item.volumeInfo || {};
                return {
                    title: info.title || "Tanpa Judul",
                    author: Array.isArray(info.authors) && info.authors.length
                        ? info.authors.join(", ")
                        : "Tidak diketahui",
                    year: getYear(info.publishedDate),
                    coverUrl: normalizeCover(info.imageLinks)
                };
            });

            if (!books.length) {
                if (errorBox) {
                    errorBox.hidden = true;
                }
                setStatus(`Tidak ada hasil untuk “${query}”.`, "empty");
                return;
            }

            books.forEach(renderBook);

            if (errorBox) {
                errorBox.hidden = true;
            }

            setStatus(
                `Open Library tidak merespons. Menampilkan ${books.length} hasil cadangan dari Google Books.`,
                "success"
            );
        } catch (error) {
            console.error("Public book fallback failed:", error);
            setStatus(
                "Open Library dan sumber cadangan sama-sama tidak dapat diakses. Periksa koneksi internet lalu coba lagi.",
                "error"
            );
        }
    };

    loadFallback();
})();

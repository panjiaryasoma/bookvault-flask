document.addEventListener("DOMContentLoaded", () => {
    const PAGE_SIZE = 10;
    const list = document.getElementById("favorite-list");
    const rows = list ? Array.from(list.querySelectorAll(".favorite-row")) : [];
    const searchInput = document.getElementById("favorite-search");
    const genreFilter = document.getElementById("favorite-genre-filter");
    const sortSelect = document.getElementById("favorite-sort");
    const resultCount = document.getElementById("favorite-result-count");
    const emptyState = document.getElementById("favorite-filter-empty");
    const range = document.getElementById("favorite-range");
    const pagination = document.getElementById("favorite-pagination");
    const favoriteGenre = document.getElementById("favorite-genre");
    const collectionRating = document.getElementById("collection-rating");
    const genreDistribution = document.getElementById("genre-distribution");
    const genreCount = document.getElementById("genre-count");
    const sidebarLinks = Array.from(document.querySelectorAll(".sidebar-nav a"));

    let currentPage = 1;

    const numberValue = (value) => {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const buildGenreInsights = () => {
        const counts = new Map();

        rows.forEach((row) => {
            const genre = (row.dataset.genre || "Tidak diketahui").trim();
            counts.set(genre, (counts.get(genre) || 0) + 1);
        });

        const sortedGenres = Array.from(counts.entries()).sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            return a[0].localeCompare(b[0]);
        });

        if (favoriteGenre) {
            favoriteGenre.textContent = sortedGenres[0]?.[0] || "—";
        }

        if (genreCount) {
            genreCount.textContent = `${sortedGenres.length} genre`;
        }

        if (genreFilter) {
            sortedGenres
                .map(([genre]) => genre)
                .sort((a, b) => a.localeCompare(b))
                .forEach((genre) => {
                    const option = document.createElement("option");
                    option.value = genre;
                    option.textContent = genre;
                    genreFilter.appendChild(option);
                });
        }

        if (!genreDistribution) return;
        genreDistribution.innerHTML = "";

        if (!sortedGenres.length) {
            const empty = document.createElement("p");
            empty.className = "empty-copy";
            empty.textContent = "Distribusi genre akan muncul setelah ada buku favorit.";
            genreDistribution.appendChild(empty);
            return;
        }

        const maxCount = sortedGenres[0][1];

        sortedGenres.forEach(([genre, count]) => {
            const row = document.createElement("div");
            row.className = "genre-row";

            const meta = document.createElement("div");
            meta.className = "genre-row__meta";

            const label = document.createElement("strong");
            label.textContent = genre;

            const value = document.createElement("span");
            value.textContent = `${count} buku`;

            const track = document.createElement("div");
            track.className = "genre-track";
            track.setAttribute("aria-hidden", "true");

            const bar = document.createElement("span");
            bar.style.width = `${Math.round((count / maxCount) * 100)}%`;

            meta.append(label, value);
            track.appendChild(bar);
            row.append(meta, track);
            genreDistribution.appendChild(row);
        });
    };

    const updateAverageRating = () => {
        const ratings = rows
            .map((row) => numberValue(row.dataset.rating))
            .filter((rating) => rating > 0);

        if (!collectionRating) return;

        if (!ratings.length) {
            collectionRating.textContent = "—";
            return;
        }

        const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
        collectionRating.textContent = average.toFixed(2);
    };

    const sortRows = (inputRows) => {
        const mode = sortSelect?.value || "saved";

        return [...inputRows].sort((a, b) => {
            if (mode === "title") {
                return (a.dataset.titleRaw || "").localeCompare(
                    b.dataset.titleRaw || "",
                    undefined,
                    { sensitivity: "base" }
                );
            }

            if (mode === "rating") {
                return numberValue(b.dataset.rating) - numberValue(a.dataset.rating);
            }

            if (mode === "year") {
                return numberValue(b.dataset.year) - numberValue(a.dataset.year);
            }

            const dateA = Date.parse(a.dataset.savedAt || "");
            const dateB = Date.parse(b.dataset.savedAt || "");

            if (!Number.isNaN(dateA) && !Number.isNaN(dateB) && dateA !== dateB) {
                return dateB - dateA;
            }

            return numberValue(a.dataset.order) - numberValue(b.dataset.order);
        });
    };

    const matchesFilters = (row) => {
        const query = (searchInput?.value || "").trim().toLowerCase();
        const selectedGenre = genreFilter?.value || "";
        const matchesQuery = !query
            || (row.dataset.title || "").includes(query)
            || (row.dataset.author || "").includes(query);
        const matchesGenre = !selectedGenre || row.dataset.genre === selectedGenre;
        return matchesQuery && matchesGenre;
    };

    const renderPagination = (totalPages) => {
        if (!pagination) return;
        pagination.innerHTML = "";

        if (totalPages <= 1) return;

        const addButton = (label, page, options = {}) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = label;
            button.disabled = Boolean(options.disabled);
            if (options.active) button.classList.add("active");
            if (options.label) button.setAttribute("aria-label", options.label);
            button.addEventListener("click", () => {
                currentPage = page;
                renderCollection();
                document.getElementById("collection")?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
            pagination.appendChild(button);
        };

        addButton("←", Math.max(1, currentPage - 1), {
            disabled: currentPage === 1,
            label: "Halaman sebelumnya"
        });

        const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
        const visiblePages = Array.from(pages)
            .filter((page) => page >= 1 && page <= totalPages)
            .sort((a, b) => a - b);

        let previous = 0;
        visiblePages.forEach((page) => {
            if (previous && page - previous > 1) {
                const ellipsis = document.createElement("span");
                ellipsis.textContent = "…";
                pagination.appendChild(ellipsis);
            }

            addButton(String(page), page, { active: page === currentPage });
            previous = page;
        });

        addButton("→", Math.min(totalPages, currentPage + 1), {
            disabled: currentPage === totalPages,
            label: "Halaman berikutnya"
        });
    };

    const renderCollection = () => {
        if (!list || !rows.length) return;

        const sortedRows = sortRows(rows);
        sortedRows.forEach((row) => list.appendChild(row));
        rows.forEach((row) => {
            row.hidden = true;
        });

        const workingRows = sortedRows.filter(matchesFilters);
        const total = workingRows.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        currentPage = Math.min(currentPage, totalPages);

        if (!total) {
            if (resultCount) resultCount.textContent = "0 buku";
            if (range) range.textContent = "Tidak ada buku untuk ditampilkan";
            if (emptyState) emptyState.hidden = false;
            renderPagination(0);
            return;
        }

        const start = (currentPage - 1) * PAGE_SIZE;
        const end = Math.min(start + PAGE_SIZE, total);

        workingRows.slice(start, end).forEach((row) => {
            row.hidden = false;
        });

        if (resultCount) resultCount.textContent = `${total} buku`;
        if (range) range.textContent = `Menampilkan ${start + 1}–${end} dari ${total} buku`;
        if (emptyState) emptyState.hidden = true;
        renderPagination(totalPages);
    };

    const setupScrollSpy = () => {
        if (!("IntersectionObserver" in window) || !sidebarLinks.length) return;

        const linkById = new Map(
            sidebarLinks.map((link) => [link.getAttribute("href")?.replace("#", ""), link])
        );

        const sections = Array.from(document.querySelectorAll(".library-section"))
            .filter((section) => linkById.has(section.id));

        const observer = new IntersectionObserver((entries) => {
            const visible = entries
                .filter((entry) => entry.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

            if (!visible) return;
            sidebarLinks.forEach((link) => link.classList.remove("active"));
            linkById.get(visible.target.id)?.classList.add("active");
        }, {
            root: null,
            rootMargin: "-18% 0px -68% 0px",
            threshold: [0.01, 0.15, 0.35]
        });

        sections.forEach((section) => observer.observe(section));
    };

    searchInput?.addEventListener("input", () => {
        currentPage = 1;
        renderCollection();
    });

    genreFilter?.addEventListener("change", () => {
        currentPage = 1;
        renderCollection();
    });

    sortSelect?.addEventListener("change", () => {
        currentPage = 1;
        renderCollection();
    });

    document.querySelectorAll(".favorite-form").forEach((form) => {
        form.addEventListener("submit", (event) => {
            if (!window.confirm("Hapus buku ini dari favorit?")) {
                event.preventDefault();
            }
        });
    });

    buildGenreInsights();
    updateAverageRating();
    setupScrollSpy();
    renderCollection();
});

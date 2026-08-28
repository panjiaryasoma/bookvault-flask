document.addEventListener("DOMContentLoaded", () => {
    const rows = Array.from(document.querySelectorAll(".favorite-row"));
    const favoriteGenre = document.getElementById("favorite-genre");
    const searchInput = document.getElementById("favorite-search");
    const genreFilter = document.getElementById("favorite-genre-filter");
    const resultCount = document.getElementById("favorite-result-count");
    const emptyState = document.getElementById("favorite-filter-empty");

    if (!rows.length) {
        return;
    }

    const genreCounts = new Map();

    rows.forEach((row) => {
        const genre = (row.dataset.genre || "Tidak diketahui").trim();
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
    });

    const sortedGenres = Array.from(genreCounts.entries()).sort((a, b) => {
        if (b[1] !== a[1]) {
            return b[1] - a[1];
        }

        return a[0].localeCompare(b[0]);
    });

    if (favoriteGenre && sortedGenres.length) {
        favoriteGenre.textContent = sortedGenres[0][0];
    }

    if (genreFilter) {
        Array.from(genreCounts.keys())
            .sort((a, b) => a.localeCompare(b))
            .forEach((genre) => {
                const option = document.createElement("option");
                option.value = genre;
                option.textContent = genre;
                genreFilter.appendChild(option);
            });
    }

    const applyFilters = () => {
        const query = (searchInput?.value || "").trim().toLowerCase();
        const selectedGenre = genreFilter?.value || "";
        let visible = 0;

        rows.forEach((row) => {
            const matchesQuery = !query
                || row.dataset.title.includes(query)
                || row.dataset.author.includes(query);
            const matchesGenre = !selectedGenre || row.dataset.genre === selectedGenre;
            const show = matchesQuery && matchesGenre;

            row.hidden = !show;

            if (show) {
                visible += 1;
            }
        });

        if (resultCount) {
            resultCount.textContent = `${visible} buku`;
        }

        if (emptyState) {
            emptyState.hidden = visible !== 0;
        }
    };

    searchInput?.addEventListener("input", applyFilters);
    genreFilter?.addEventListener("change", applyFilters);

    document.querySelectorAll(".favorite-form").forEach((form) => {
        form.addEventListener("submit", (event) => {
            if (!window.confirm("Hapus buku ini dari favorit?")) {
                event.preventDefault();
            }
        });
    });
});

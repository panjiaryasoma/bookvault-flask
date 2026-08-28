document.addEventListener("DOMContentLoaded", () => {
    const PAGE_SIZE = 12;
    const tableBody = document.getElementById("admin-book-rows");
    const sortSelect = document.getElementById("admin-sort");
    const pagination = document.getElementById("admin-pagination");
    const tableRange = document.getElementById("table-range");
    const catalogCount = document.getElementById("catalog-count");
    const clearAttention = document.getElementById("clear-attention");
    const attentionButtons = Array.from(document.querySelectorAll(".attention-item"));
    const sidebarLinks = Array.from(document.querySelectorAll(".sidebar-nav a"));
    const rows = tableBody ? Array.from(tableBody.querySelectorAll(".admin-book-row")) : [];

    let currentPage = 1;
    let attentionFilter = null;

    const numberValue = (value) => {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const boolValue = (value) => String(value).toLowerCase() === "true";

    const rowNeedsAttention = (row, type) => {
        if (type === "cover") return !boolValue(row.dataset.hasCover);
        if (type === "rating") return numberValue(row.dataset.rating) <= 0;
        if (type === "description") return !boolValue(row.dataset.hasDescription);
        return true;
    };

    const getWorkingRows = () => rows.filter((row) => rowNeedsAttention(row, attentionFilter));

    const sortRows = (workingRows) => {
        const mode = sortSelect?.value || "id";

        return [...workingRows].sort((a, b) => {
            if (mode === "newest") {
                const dateA = Date.parse(a.dataset.createdAt || "") || numberValue(a.dataset.id);
                const dateB = Date.parse(b.dataset.createdAt || "") || numberValue(b.dataset.id);
                return dateB - dateA;
            }

            if (mode === "title") {
                return (a.dataset.title || "").localeCompare(b.dataset.title || "", undefined, { sensitivity: "base" });
            }

            if (mode === "year") return numberValue(b.dataset.year) - numberValue(a.dataset.year);
            if (mode === "rating") return numberValue(b.dataset.rating) - numberValue(a.dataset.rating);
            return numberValue(a.dataset.id) - numberValue(b.dataset.id);
        });
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
                renderTable();
                document.getElementById("catalog-management")?.scrollIntoView({ behavior: "smooth", block: "start" });
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

    const renderTable = () => {
        if (!tableBody) return;

        const serverEmpty = tableBody.querySelector(".server-empty-row");
        if (serverEmpty) serverEmpty.hidden = rows.length > 0;

        rows.forEach((row) => {
            row.hidden = true;
        });

        tableBody.querySelector(".client-empty-row")?.remove();

        const workingRows = sortRows(getWorkingRows());
        const total = workingRows.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        currentPage = Math.min(currentPage, totalPages);

        if (!total) {
            if (rows.length) {
                const emptyRow = document.createElement("tr");
                emptyRow.className = "client-empty-row";
                const cell = document.createElement("td");
                cell.colSpan = 7;
                cell.className = "empty-row";
                cell.textContent = "Tidak ada buku yang cocok dengan kategori perhatian ini.";
                emptyRow.appendChild(cell);
                tableBody.appendChild(emptyRow);
            }

            if (tableRange) tableRange.textContent = "Tidak ada data untuk ditampilkan";
            if (catalogCount) catalogCount.textContent = `0 dari ${rows.length} data tampil`;
            renderPagination(0);
            return;
        }

        const start = (currentPage - 1) * PAGE_SIZE;
        const end = Math.min(start + PAGE_SIZE, total);

        workingRows.forEach((row) => tableBody.appendChild(row));
        workingRows.slice(start, end).forEach((row) => {
            row.hidden = false;
        });

        if (tableRange) tableRange.textContent = `Menampilkan ${start + 1}–${end} dari ${total} data`;
        if (catalogCount) {
            catalogCount.textContent = attentionFilter
                ? `${total} dari ${rows.length} perlu perhatian`
                : `${total} data tampil`;
        }

        renderPagination(totalPages);
    };

    const updateHealth = () => {
        const total = rows.length;
        const rated = rows.filter((row) => numberValue(row.dataset.rating) > 0).length;
        const withCover = rows.filter((row) => boolValue(row.dataset.hasCover)).length;
        const withDescription = rows.filter((row) => boolValue(row.dataset.hasDescription)).length;

        const healthItems = [
            ["rated", rated],
            ["cover", withCover],
            ["description", withDescription]
        ];

        healthItems.forEach(([key, count]) => {
            const value = document.getElementById(`health-${key}-value`);
            const bar = document.getElementById(`health-${key}-bar`);
            const percent = total ? Math.round((count / total) * 100) : 0;
            if (value) value.textContent = `${count} / ${total} · ${percent}%`;
            if (bar) bar.style.width = `${percent}%`;
        });

        const missingCover = total - withCover;
        const missingRating = total - rated;
        const missingDescription = total - withDescription;

        const coverCount = document.getElementById("missing-cover-count");
        const ratingCount = document.getElementById("missing-rating-count");
        const descriptionCount = document.getElementById("missing-description-count");

        if (coverCount) coverCount.textContent = String(missingCover).padStart(2, "0");
        if (ratingCount) ratingCount.textContent = String(missingRating).padStart(2, "0");
        if (descriptionCount) descriptionCount.textContent = String(missingDescription).padStart(2, "0");
    };

    const renderRecent = () => {
        const target = document.getElementById("recent-admin-list");
        if (!target) return;

        target.innerHTML = "";

        if (!rows.length) {
            const empty = document.createElement("p");
            empty.className = "empty-copy";
            empty.textContent = "Belum ada entri katalog.";
            target.appendChild(empty);
            return;
        }

        const recentRows = [...rows]
            .sort((a, b) => {
                const dateA = Date.parse(a.dataset.createdAt || "") || numberValue(a.dataset.id);
                const dateB = Date.parse(b.dataset.createdAt || "") || numberValue(b.dataset.id);
                return dateB - dateA;
            })
            .slice(0, 5);

        recentRows.forEach((row, index) => {
            const item = document.createElement("article");
            item.className = "recent-admin-item";

            const rank = document.createElement("span");
            rank.className = "recent-admin-index";
            rank.textContent = String(index + 1).padStart(2, "0");

            const copy = document.createElement("div");
            copy.className = "recent-admin-copy";
            const title = document.createElement("strong");
            title.textContent = row.dataset.title || "Tanpa judul";
            const meta = document.createElement("small");
            meta.textContent = `${row.dataset.author || "Tidak diketahui"} · ${row.dataset.genre || "—"}`;
            copy.append(title, meta);

            const date = document.createElement("time");
            date.className = "recent-admin-date";
            const parsedDate = row.dataset.createdAt ? new Date(row.dataset.createdAt) : null;
            date.textContent = parsedDate && !Number.isNaN(parsedDate.getTime())
                ? new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(parsedDate)
                : `ID ${row.dataset.id}`;

            const edit = document.createElement("a");
            edit.href = `/admin/book/edit/${row.dataset.id}`;
            edit.textContent = "Edit";

            item.append(rank, copy, date, edit);
            target.appendChild(item);
        });
    };

    const setupAttention = () => {
        attentionButtons.forEach((button) => {
            button.addEventListener("click", () => {
                const type = button.dataset.attention;
                attentionFilter = attentionFilter === type ? null : type;
                currentPage = 1;

                attentionButtons.forEach((item) => {
                    item.classList.toggle("active", item.dataset.attention === attentionFilter);
                });

                if (clearAttention) clearAttention.hidden = !attentionFilter;
                renderTable();
                document.getElementById("catalog-management")?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
        });

        clearAttention?.addEventListener("click", () => {
            attentionFilter = null;
            currentPage = 1;
            attentionButtons.forEach((item) => item.classList.remove("active"));
            clearAttention.hidden = true;
            renderTable();
        });
    };

    const setupScrollSpy = () => {
        if (!("IntersectionObserver" in window)) return;

        const linkById = new Map(
            sidebarLinks.map((link) => [link.getAttribute("href")?.replace("#", ""), link])
        );
        const sections = Array.from(document.querySelectorAll(".dashboard-section"))
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

    document.querySelectorAll(".delete-form").forEach((form) => {
        form.addEventListener("submit", (event) => {
            if (!window.confirm("Yakin mau hapus buku ini?")) {
                event.preventDefault();
            }
        });
    });

    sortSelect?.addEventListener("change", () => {
        currentPage = 1;
        renderTable();
    });

    updateHealth();
    renderRecent();
    setupAttention();
    setupScrollSpy();
    renderTable();
});

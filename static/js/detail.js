document.addEventListener("DOMContentLoaded", () => {
    const RECENT_KEY = "bookvault-recently-viewed";
    const detail = document.getElementById("book-detail");
    if (!detail) return;

    const book = {
        id: Number(detail.dataset.bookId),
        title: detail.dataset.title || "Tanpa Judul",
        author: detail.dataset.author || "Tidak diketahui",
        genre: detail.dataset.genre || "Tidak diketahui",
        year: Number(detail.dataset.year) || 0,
        rating: Number(detail.dataset.rating) || 0,
        description: detail.dataset.description || "",
        coverImage: detail.dataset.coverImage || "",
        createdAt: detail.dataset.createdAt || ""
    };

    try {
        const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
        const recent = Array.isArray(parsed) ? parsed : [];
        const next = [book, ...recent.filter((item) => Number(item.id) !== book.id)].slice(0, 5);
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch (_error) {
        // Browsing history enhancement is optional when storage is unavailable.
    }
});

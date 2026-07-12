document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".delete-form").forEach(function (form) {
        form.addEventListener("submit", function (event) {
            if (!confirm("Yakin mau hapus buku ini?")) {
                event.preventDefault();
            }
        });
    });
});

document.addEventListener("DOMContentLoaded", function () {
    const genreSelect = document.querySelector(".genre-select");
    if (genreSelect) {
        genreSelect.addEventListener("change", function () {
            this.form.submit();
        });
    }
});

(() => {
    const token = document.querySelector('meta[name="csrf-token"]')?.content;
    if (!token) return;
    function protect(form) {
        if (form.method.toUpperCase() !== "POST" || new URL(form.action, location.href).origin !== location.origin) return;
        let field = form.querySelector('input[name="_csrf"]');
        if (!field) {
            field = document.createElement("input"); field.type = "hidden"; field.name = "_csrf"; form.appendChild(field);
        }
        field.value = token;
    }
    document.querySelectorAll("form").forEach(protect);
    document.addEventListener("submit", event => {
        if (event.target instanceof HTMLFormElement) protect(event.target);
    }, true);
})();
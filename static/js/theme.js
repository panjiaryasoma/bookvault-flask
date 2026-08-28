(() => {
    const STORAGE_KEY = "bookvault-theme";
    const root = document.documentElement;
    const toggle = document.getElementById("theme-toggle");

    if (!toggle) {
        return;
    }

    const getTheme = () => root.dataset.theme === "dark" ? "dark" : "light";

    const syncToggle = () => {
        const isDark = getTheme() === "dark";
        toggle.textContent = isDark ? "Light mode" : "Dark mode";
        toggle.setAttribute("aria-pressed", String(isDark));
        toggle.setAttribute(
            "aria-label",
            isDark ? "Aktifkan light mode" : "Aktifkan dark mode"
        );
    };

    const setTheme = (theme, persist = true) => {
        root.dataset.theme = theme === "dark" ? "dark" : "light";

        if (persist) {
            localStorage.setItem(STORAGE_KEY, root.dataset.theme);
        }

        syncToggle();
    };

    toggle.addEventListener("click", () => {
        setTheme(getTheme() === "dark" ? "light" : "dark");
    });

    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    systemTheme.addEventListener("change", (event) => {
        if (!localStorage.getItem(STORAGE_KEY)) {
            setTheme(event.matches ? "dark" : "light", false);
        }
    });

    syncToggle();
})();

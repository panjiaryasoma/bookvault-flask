document.addEventListener("DOMContentLoaded", () => {
    const copyButtons = Array.from(document.querySelectorAll(".copy-button"));
    const navLinks = Array.from(document.querySelectorAll(".docs-nav a"));

    copyButtons.forEach((button) => {
        button.addEventListener("click", async () => {
            const targetId = button.dataset.copyTarget;
            const target = targetId ? document.getElementById(targetId) : null;
            if (!target) return;

            const text = target.innerText.trim();
            const original = button.textContent;

            try {
                await navigator.clipboard.writeText(text);
                button.textContent = "Copied";
                button.classList.add("copied");
            } catch (_error) {
                const textarea = document.createElement("textarea");
                textarea.value = text;
                textarea.setAttribute("readonly", "");
                textarea.style.position = "fixed";
                textarea.style.opacity = "0";
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand("copy");
                textarea.remove();
                button.textContent = "Copied";
                button.classList.add("copied");
            }

            window.setTimeout(() => {
                button.textContent = original;
                button.classList.remove("copied");
            }, 1400);
        });
    });

    if (!("IntersectionObserver" in window) || !navLinks.length) {
        return;
    }

    const linkById = new Map(
        navLinks.map((link) => [link.getAttribute("href")?.replace("#", ""), link])
    );

    const sections = Array.from(document.querySelectorAll(".docs-section"))
        .filter((section) => linkById.has(section.id));

    const observer = new IntersectionObserver((entries) => {
        const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;

        navLinks.forEach((link) => link.classList.remove("active"));
        linkById.get(visible.target.id)?.classList.add("active");
    }, {
        root: null,
        rootMargin: "-18% 0px -68% 0px",
        threshold: [0.01, 0.15, 0.35]
    });

    sections.forEach((section) => observer.observe(section));
});

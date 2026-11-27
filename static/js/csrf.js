(() => {
    const token = document.querySelector('meta[name="csrf-token"]')?.content;
    if (!token) return;
    const attach = (form) => {
        if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== "post") return;
        try {
            if (new URL(form.action, location.href).origin !== location.origin) return;
        } catch (_) { return; }
        if (!form.querySelector('input[name="_csrf"]')) {
            const input=document.createElement("input");
            input.type="hidden"; input.name="_csrf"; input.value=token;
            form.append(input);
        }
    };
    document.querySelectorAll("form").forEach(attach);
    document.addEventListener("submit", (event) => attach(event.target), true);
    // Existing logout navigation becomes a protected POST, including legacy pages.
    document.querySelectorAll('a[href="/logout"],a[href="/admin/logout"]').forEach(a => {
        a.addEventListener("click",event=>{
            if(event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            const form=document.createElement("form");
            form.method="POST"; form.action=a.getAttribute("href");
            attach(form); document.body.append(form); form.submit();
        });
    });
})();
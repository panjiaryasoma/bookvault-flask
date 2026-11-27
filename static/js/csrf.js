(() => {
    const token=document.querySelector('meta[name="csrf-token"]')?.content;
    if(!token)return;
    function protect(form){
        if(form.method.toUpperCase()!=="POST"||new URL(form.action,location.href).origin!==location.origin)return;
        let field=form.querySelector('input[name="_csrf"]');
        if(!field){field=document.createElement("input");field.type="hidden";field.name="_csrf";form.appendChild(field);}
        field.value=token;
    }
    document.querySelectorAll("a[href='/logout'],a[href='/admin/logout']").forEach(link=>{
        const form=document.createElement("form");form.method="POST";form.action=link.getAttribute("href");form.className="logout-form";
        const button=document.createElement("button");button.type="submit";button.className=link.className;button.textContent=link.textContent;
        form.appendChild(button);protect(form);link.replaceWith(form);
    });
    document.querySelectorAll("form").forEach(protect);
    document.addEventListener("submit",e=>{if(e.target instanceof HTMLFormElement)protect(e.target);},true);
})();
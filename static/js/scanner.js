(() => {
    "use strict";
    const root = document.getElementById("scanner");
    if (!root) return;
    const $ = id => document.getElementById(id);
    const form = $("copy-form"), status = $("scan-status"), saveStatus = $("save-status");
    const csrf = document.querySelector('meta[name="csrf-token"]').content;
    let controls = null, cameraEpoch = 0, busy = false, lookupEpoch = 0, worker = null, ocrBusy = false;
    let token = root.dataset.token;
    const editId = root.dataset.copyId;
    const scripts = new Map();
    function loadScript(path) {
        if (!scripts.has(path)) scripts.set(path,new Promise((resolve,reject) => {
            const script = document.createElement("script"); script.src=path; script.onload=resolve; script.onerror=()=>{scripts.delete(path);script.remove();reject(new Error("Scanner assets unavailable"));}; document.head.append(script);
        }));
        return scripts.get(path);
    }
    function stopCamera() {
        cameraEpoch++;
        if (controls) { try { controls.stop(); } catch (_) {} controls=null; }
        const stream=$("scan-video").srcObject;
        if (stream) stream.getTracks().forEach(track=>track.stop());
        $("scan-video").srcObject=null; $("scan-frame").hidden=true; $("stop-camera").hidden=true; $("start-camera").disabled=false;
    }
    async function api(path,method,body) {
        const response=await fetch(path,{method,headers:{"Content-Type":"application/json","X-CSRF-Token":csrf},credentials:"same-origin",body:body===undefined?undefined:JSON.stringify(body),redirect:"error"});
        const data=response.status===204?{}:await response.json().catch(()=>({error:"Server tidak dapat memproses permintaan."}));
        return {response,data};
    }
    function apply(result) {
        for (const k of ["title","author","isbn","publisher","language","year","pages","genre","kind","work_form","tags"]) {
            form.elements[k].value=result[k]??(["kind","work_form"].includes(k)?"unknown":k==="genre"?"Unclassified":"");
        }
        saveStatus.textContent="Periksa kecocokan edisi dan metadata sebelum menyimpan.";
    }
    async function lookup() {
        const epoch=++lookupEpoch;
        const isbn=$("lookup-isbn").value.trim(),query=$("lookup-query").value.trim();
        if(!isbn&&!query){status.textContent="Isi ISBN atau judul.";return;}
        status.textContent="Mencari metadata…"; $("scan-results").replaceChildren();
        try {
            const {response,data}=await api("/library/lookup","POST",{isbn,query});
            if(epoch!==lookupEpoch)return;
            if(!response.ok)throw Error(data.error||"Pencarian gagal.");
            for(const result of data.results){
                const button=document.createElement("button"); button.type="button"; button.className="scan-result";
                const title=document.createElement("strong");title.textContent=result.title;
                const detail=document.createElement("small");detail.textContent=[result.author,result.publisher,result.year,result.source].filter(Boolean).join(" · ");
                button.append(title,detail);button.addEventListener("click",()=>apply(result));$("scan-results").append(button);
            }
            status.textContent=data.results.length?"Pilih hasil yang sesuai.":"Tidak ada hasil. Isi manual atau cari berdasarkan judul.";
        } catch(error) {if(epoch===lookupEpoch)status.textContent=error.message;}
    }
    $("lookup-button").addEventListener("click",lookup);
    for(const id of ["lookup-isbn","lookup-query"]) $(id).addEventListener("input",()=>{lookupEpoch++;$("scan-results").replaceChildren();status.textContent="";});
    function validISBN(raw) {
        if(/^97[89][0-9]{10}$/.test(raw))return [...raw].reduce((s,c,i)=>s+Number(c)*(i%2?3:1),0)%10===0;
        if(/^[0-9]{9}[0-9X]$/.test(raw))return [...raw].reduce((s,c,i)=>s+(c==="X"?10:Number(c))*(10-i),0)%11===0;
        return false;
    }
    $("start-camera").addEventListener("click",async()=>{
        if(!navigator.mediaDevices?.getUserMedia){status.textContent="Kamera membutuhkan HTTPS. Gunakan foto sampul atau input manual.";return;}
        const epoch=++cameraEpoch;
        $("start-camera").disabled=true;$("stop-camera").hidden=false;$("scan-frame").hidden=false;
        status.textContent="Menyiapkan kamera…";
        try {
            await loadScript("/static/vendor/zxing-browser.min.js");
            if(epoch!==cameraEpoch)return;
            const reader=new ZXingBrowser.BrowserMultiFormatReader();
            let detected=false;
            const active=await reader.decodeFromConstraints({audio:false,video:{facingMode:{ideal:"environment"}}},$("scan-video"),(result,error,control)=>{
                if(epoch!==cameraEpoch){control?.stop();return;}
                if(!result||detected)return;
                const raw=result.getText().replace(/[\s-]/g,"");
                if(!validISBN(raw))return;
                detected=true;control?.stop();stopCamera();
                $("lookup-isbn").value=raw; form.elements.isbn.value=raw; lookup();
            });
            if(epoch!==cameraEpoch){active.stop();return;}
            controls=active;status.textContent="Arahkan kamera ke ISBN di belakang buku.";
        } catch(_) {if(epoch===cameraEpoch){stopCamera();status.textContent="Kamera gagal dibuka. Periksa izin atau gunakan input manual."}}
    });
    $("stop-camera").addEventListener("click",stopCamera);
    $("cover-file").addEventListener("change",async event=>{
        const file=event.target.files[0];
        if(!file||ocrBusy)return;
        if(file.size>12*1024*1024||!["image/jpeg","image/png","image/webp"].includes(file.type)){status.textContent="Gunakan JPEG, PNG, atau WebP maksimal 12 MB.";return;}
        stopCamera();lookupEpoch++;$("scan-results").replaceChildren();ocrBusy=true;event.target.disabled=true;status.textContent="Menyiapkan OCR lokal…";
        let bitmap=null;
        try {
            bitmap=await createImageBitmap(file);
            if(bitmap.width*bitmap.height>40_000_000)throw Error("Resolusi foto terlalu besar. Ambil foto lebih kecil.");
            const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
            const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
            bitmap.close();bitmap=null;
            await loadScript("/static/vendor/tesseract.min.js");
            if(!worker) worker=await Tesseract.createWorker(["eng","ind"],1,{workerPath:"/static/vendor/worker.min.js",corePath:"/static/vendor/core",langPath:"/static/vendor/lang",workerBlobURL:false,logger:m=>{if(m.status==="recognizing text")status.textContent="Membaca sampul… "+Math.round(m.progress*100)+"%";}});
            const {data}=await worker.recognize(canvas);
            const lines=data.text.split(/\n+/).map(x=>x.trim()).filter(Boolean);
            $("lookup-query").value=lines.join(" ").slice(0,240);
            $("lookup-isbn").value="";
            status.textContent="OCR selesai. Koreksi teks pencarian sebelum Find metadata.";
        }catch(error){status.textContent="OCR gagal: "+error.message;if(worker){await worker.terminate().catch(()=>{});worker=null;}}
        finally{if(bitmap)bitmap.close();ocrBusy=false;event.target.disabled=false;event.target.value="";}
    });
    async function save(next) {
        if(busy||ocrBusy||!form.reportValidity()){if(ocrBusy)saveStatus.textContent="Selesaikan OCR sebelum menyimpan.";return;}
        busy=true;$("save-copy").disabled=true;if($("save-next"))$("save-next").disabled=true;saveStatus.textContent="Menyimpan…";
        const data=Object.fromEntries(new FormData(form));data.token=token;
        const path=editId?"/library/copies/"+encodeURIComponent(editId):"/library/copies";
        try{
            let result=await api(path,editId?"PUT":"POST",data);
            if(result.response.status===409&&result.data.duplicates&&confirm(result.data.error)){data.confirm_duplicate=true;result=await api(path,"POST",data);}
            if(!result.response.ok)throw Error(result.data.error||"Gagal menyimpan.");
            if(next&&!editId){stopCamera();lookupEpoch++;form.reset();token=crypto.randomUUID();status.textContent="";$("lookup-isbn").value="";$("lookup-query").value="";$("scan-results").replaceChildren();saveStatus.textContent="Tersimpan. Siap untuk buku berikutnya.";}
            else location.assign("/library/");
        }catch(error){saveStatus.textContent=error.message;}
        finally{busy=false;$("save-copy").disabled=false;if($("save-next"))$("save-next").disabled=false;}
    }
    form.addEventListener("submit",event=>{event.preventDefault();save(false);});
    $("save-next")?.addEventListener("click",()=>save(true));
    $("delete-copy")?.addEventListener("click",async()=>{
        if(busy||!confirm("Hapus eksemplar ini dari koleksi?"))return;
        busy=true;
        try{const {response}=await api("/library/copies/"+encodeURIComponent(editId),"DELETE");if(!response.ok)throw Error("Gagal menghapus.");location.assign("/library/");}
        catch(error){saveStatus.textContent=error.message;busy=false;}
    });
    window.addEventListener("pagehide",()=>{stopCamera();if(worker){worker.terminate().catch(()=>{});worker=null;}});
})();
(() => {
    "use strict";
    const root=document.getElementById("scanner");
    if(!root) return;
    const $=id=>document.getElementById(id);
    const form=$("copy-form"), video=$("camera-preview"), placeholder=$("camera-placeholder"), start=$("start-camera"), stop=$("stop-camera"), status=$("scan-status"), query=$("lookup-query"), resultBox=$("lookup-results"), file=$("cover-file"), ocr=$("ocr-button");
    const vendor=root.dataset.vendor;
    const scripts=new Map();
    let controls=null, cameraGeneration=0, lookupController=null, lookupGeneration=0, worker=null, ocrGeneration=0, busy=false;
    const report=message=>{status.textContent=message;};
    const loadScript=name=>{
        if(!scripts.has(name)){
            const promise=new Promise((resolve,reject)=>{
                const script=document.createElement("script");
                script.src=vendor+name;
                script.onload=resolve;
                script.onerror=()=>{script.remove();reject(new Error("Scanner assets missing"));};
                document.head.append(script);
            });
            scripts.set(name,promise);
            promise.catch(()=>scripts.delete(name));
        }
        return scripts.get(name);
    };
    function stopCamera(){
        cameraGeneration++;
        if(controls){try{controls.stop();}catch(_){}controls=null;}
        if(video.srcObject){for(const track of video.srcObject.getTracks())track.stop();video.srcObject=null;}
        video.hidden=true;placeholder.hidden=false;start.disabled=false;stop.disabled=true;
    }
    function isbnValid(input){
        const n=input.replace(/[\s-]/g,"");
        return /^97[89]\d{10}$/.test(n)&&[...n].reduce((sum,c,i)=>sum+Number(c)*(i%2?3:1),0)%10===0;
    }
    start.addEventListener("click",async()=>{
        if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){report("Kamera memerlukan HTTPS atau localhost. Gunakan foto atau input manual.");return;}
        const generation=++cameraGeneration;
        start.disabled=true;stop.disabled=false;report("Menyiapkan kamera…");
        try{
            await loadScript("zxing-browser.min.js");
            if(generation!==cameraGeneration)return;
            if(!window.ZXingBrowser)throw Error("ZXing unavailable");
            const reader=new window.ZXingBrowser.BrowserMultiFormatReader();
            video.hidden=false;placeholder.hidden=true;
            const active=await reader.decodeFromConstraints({audio:false,video:{facingMode:{ideal:"environment"}}},video,(result,error,current)=>{
                if(generation!==cameraGeneration){current?.stop();return;}
                if(!result)return;
                const code=result.getText().trim();
                if(!isbnValid(code))return;
                current?.stop();stopCamera();query.value=code;
                form.elements.namedItem("isbn").value=code;
                search();
            });
            if(generation!==cameraGeneration){active.stop();return;}
            controls=active;report("Arahkan ke barcode ISBN pada belakang buku.");
        }catch(_){if(generation===cameraGeneration){stopCamera();report("Kamera atau aset scanner tidak tersedia. Gunakan input manual.");}}
    });
    stop.addEventListener("click",()=>{stopCamera();report("Kamera dimatikan.");});
    function textElement(tag,text,className){
        const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;
    }
    function fill(candidate){
        for(const key of ["title","author","isbn","publisher","year","language","pages","cover"]){
            const input=form.elements.namedItem(key);
            if(input&&candidate[key])input.value=String(candidate[key]);
        }
        const tags=Array.isArray(candidate.tags)?candidate.tags:[];
        if(tags.length){
            const input=form.elements.namedItem("tags");
            input.value=[...new Set([...input.value.split(",").map(x=>x.trim()).filter(Boolean),...tags])].join(", ").slice(0,600);
            if(!form.elements.namedItem("genre").value)form.elements.namedItem("genre").value=tags.find(t=>!["Fiksi","Nonfiksi"].includes(t))||tags[0];
            if(!form.elements.namedItem("kind").value)form.elements.namedItem("kind").value=tags.includes("Nonfiksi")?"Nonfiksi":tags.includes("Fiksi")?"Fiksi":"";
        }
        report("Metadata dipilih. Periksa edisi, cetakan, penerjemah dan klasifikasi sebelum menyimpan.");
        form.scrollIntoView({block:"start",behavior:"auto"});
    }
    async function search(){
        const q=query.value.trim();
        if(q.length<2||q.length>160){report("Masukkan 2–160 karakter.");return;}
        lookupController?.abort();lookupController=new AbortController();
        const generation=++lookupGeneration;
        resultBox.replaceChildren();report("Mencari metadata…");
        const timer=setTimeout(()=>lookupController?.abort(),25000);
        try{
            const u=new URL(root.dataset.lookup,location.origin);u.searchParams.set("q",q);
            const response=await fetch(u,{signal:lookupController.signal,credentials:"same-origin",headers:{Accept:"application/json"}});
            if(!response.ok||response.redirected)throw Error("Lookup failed");
            const data=await response.json();if(generation!==lookupGeneration)return;
            for(const candidate of data.results||[]){
                const row=document.createElement("div");row.className="lookup-result";
                const description=document.createElement("div");
                description.append(textElement("strong",candidate.title),textElement("p",[candidate.author,candidate.publisher,candidate.year,candidate.isbn].filter(Boolean).join(" · "), "library-meta"),textElement("small",candidate.source,"library-meta"));
                const button=textElement("button","Pilih hasil","library-button");button.type="button";button.addEventListener("click",()=>fill(candidate));
                row.append(description,button);resultBox.append(row);
            }
            report((data.results||[]).length?"Pilih hasil yang sesuai. Hasil berbasis judul mungkin bukan edisi fisikmu.":"Tidak ditemukan. Ubah kata kunci atau isi manual.");
        }catch(_){if(generation===lookupGeneration)report("Metadata tidak tersedia atau sesi berakhir. Coba lagi atau isi manual.");}
        finally{clearTimeout(timer);}
    }
    $("lookup-form").addEventListener("submit",event=>{event.preventDefault();search();});
    function deadline(promise,ms){
        let id;return Promise.race([promise,new Promise((_,reject)=>{id=setTimeout(()=>reject(Error("Timeout")),ms);})]).finally(()=>clearTimeout(id));
    }
    ocr.addEventListener("click",async()=>{
        if(busy)return;const image=file.files?.[0];
        if(!image||!["image/jpeg","image/png","image/webp"].includes(image.type)||image.size>12*1024*1024){report("Pilih foto JPEG/PNG/WebP maksimal 12 MB.");return;}
        stopCamera();busy=true;ocr.disabled=true;const generation=++ocrGeneration;
        let bitmap;
        try{
            report("Menyiapkan OCR lokal…");await loadScript("tesseract.min.js");
            bitmap=await createImageBitmap(image);
            if(bitmap.width*bitmap.height>40_000_000)throw Error("Image dimensions too large");
            const factor=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
            const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*factor));canvas.height=Math.max(1,Math.round(bitmap.height*factor));
            canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
            bitmap.close();bitmap=null;
            const origin=location.origin;
            const pending=window.Tesseract.createWorker("eng+ind",1,{workerPath:origin+vendor+"worker.min.js",corePath:origin+vendor+"core",langPath:origin+vendor+"lang",workerBlobURL:false,logger:m=>{if(generation===ocrGeneration&&m.status==="recognizing text")report("OCR "+Math.round(m.progress*100)+"%");}});
            pending.then(w=>{if(generation!==ocrGeneration)w.terminate();}).catch(()=>{});
            worker=await deadline(pending,60000);
            if(generation!==ocrGeneration)return;
            const {data}=await deadline(worker.recognize(canvas),60000);
            if(generation!==ocrGeneration)return;
            const recognized=String(data.text||"").split(/\n/).map(x=>x.trim()).filter(Boolean).join(" ").slice(0,160);
            query.value=recognized;
            report(recognized?"Teks ditemukan. Koreksi kata kunci lalu tekan Cari metadata.":"Teks tidak terbaca. Coba foto lebih jelas.");
        }catch(_){if(generation===ocrGeneration)report("OCR gagal atau melebihi batas waktu. Gunakan input manual.");}
        finally{
            if(bitmap)bitmap.close();ocrGeneration++;
            if(worker){try{await worker.terminate();}catch(_){}worker=null;}
            busy=false;ocr.disabled=false;
        }
    });
    window.addEventListener("pagehide",()=>{stopCamera();lookupController?.abort();ocrGeneration++;if(worker){worker.terminate().catch(()=>{});worker=null;}});
})();
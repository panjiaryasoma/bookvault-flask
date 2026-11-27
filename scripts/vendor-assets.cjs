const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const dst=path.join(root,"static","vendor");
const copy=(from,to)=>{
  const src=path.join(root,"node_modules",from),dest=path.join(dst,to);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.copyFileSync(src,dest);
};
copy("@zxing/browser/umd/zxing-browser.min.js","zxing-browser.min.js");
copy("tesseract.js/dist/tesseract.min.js","tesseract.min.js");
copy("tesseract.js/dist/worker.min.js","worker.min.js");
for(const name of fs.readdirSync(path.join(root,"node_modules","tesseract.js-core"))){
  if(/\.wasm(?:\.js)?$/.test(name))copy("tesseract.js-core/"+name,"core/"+name);
}
for(const lang of ["eng","ind"])copy("@tesseract.js-data/"+lang+"/4.0.0_best_int/"+lang+".traineddata.gz","lang/"+lang+".traineddata.gz");
console.log("Scanner assets prepared locally.");
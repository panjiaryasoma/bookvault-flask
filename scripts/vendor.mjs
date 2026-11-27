import {mkdir,copyFile,readdir} from "node:fs/promises";
const root="static/vendor";
await mkdir(root+"/core",{recursive:true});await mkdir(root+"/lang",{recursive:true});
for (const [source,destination] of [
 ["node_modules/@zxing/browser/umd/zxing-browser.min.js","zxing-browser.min.js"],
 ["node_modules/tesseract.js/dist/tesseract.min.js","tesseract.min.js"],
 ["node_modules/tesseract.js/dist/worker.min.js","worker.min.js"]
]) await copyFile(source,root+"/"+destination);
for(const name of await readdir("node_modules/tesseract.js-core"))if(/\.wasm(\.js)?$/.test(name))await copyFile("node_modules/tesseract.js-core/"+name,root+"/core/"+name);
for(const lang of ["eng","ind"])await copyFile("node_modules/@tesseract.js-data/"+lang+"/4.0.0_best_int/"+lang+".traineddata.gz",root+"/lang/"+lang+".traineddata.gz");

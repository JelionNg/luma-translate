// Real tainted canvas and cross-origin bytes; verify reconstructed pixels, no OCR/API costs.
const {chromium}=require('playwright'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});try{
 const page=await browser.newPage();const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=100;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(0,0,100,100);x.fillStyle='blue';x.fillRect(100,0,100,100);return c.toDataURL().split(',')[1];});await page.route('https://reader.test/',r=>r.fulfill({contentType:'text/html',body:'<canvas width="200" height="100"></canvas>'}));
 await page.route('https://cdn.test/source.svg',r=>r.fulfill({contentType:'image/png',body:Buffer.from(png,'base64')}));await page.goto('https://reader.test/');
 for(const f of ['image-capture.js','image-recipe.js'])await page.addScriptTag({path:path.join(__dirname,'..',f)});
 await page.evaluate(async()=>{const img=new Image();img.src='https://cdn.test/source.svg';await img.decode();const ctx=document.querySelector('canvas').getContext('2d');ctx.drawImage(img,100,0,100,100,0,0,100,100);ctx.drawImage(img,0,0,100,100,100,0,100,100);});
 await page.waitForFunction(()=>document.querySelector('canvas').hasAttribute('data-reader-image-recipe'));
 const data=await page.evaluate(()=>{let error;try{document.querySelector('canvas').toDataURL();}catch(e){error=e.name;}return {error,recipe:JSON.parse(document.querySelector('canvas').getAttribute('data-reader-image-recipe'))};});assert.equal(data.error,'SecurityError');assert.equal(data.recipe.draws.length,2);
 // Supply downloaded bytes as extension fetch does, without changing page CORS policy.

 const pixels=await page.evaluate(async({recipe,png})=>{const blob=await ReaderImageRecipe.rebuild(recipe,async()=>new Blob([Uint8Array.from(atob(png),c=>c.charCodeAt(0))],{type:'image/png'}),new AbortController().signal);const bitmap=await createImageBitmap(blob),c=new OffscreenCanvas(200,100),ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();return [[...ctx.getImageData(20,20,1,1).data],[...ctx.getImageData(180,20,1,1).data]];},{recipe:data.recipe,png});assert.deepEqual(pixels,[[0,0,255,255],[255,0,0,255]]);
 const rejected=await page.evaluate(recipe=>{try{ReaderImageRecipe.parse({...recipe,width:100000});return false;}catch{return true;}},data.recipe);assert(rejected);
 console.log('PASS tainted canvas captured; reordered slices rebuilt pixel-exactly; oversized recipe rejected.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});

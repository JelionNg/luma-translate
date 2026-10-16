const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
// Structure verified against HF's public model discussion listing, including
// fixed-height outer row, truncated title ancestors and absolute metadata.
const row=id=>`<div class="relative h-16 w-full" id="row${id}"><a class="group flex h-full items-stretch" href="/google/embeddinggemma-300m/discussions/${id}"><div class="icon">○</div><div class="flex-1 overflow-hidden whitespace-nowrap px-4"><div class="mt-2 overflow-hidden"><div class="flex items-center overflow-hidden"><h4 class="overflow-hidden truncate font-semibold">Cannot use EmbeddingGemma, License Redirects to Kaggle 404</h4></div></div></div><div>♡</div></a><div class="absolute bottom-2 truncate metadata">#${id} opened 5 days ago by author</div></div>`;
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.READER_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://huggingface.co/**',r=>r.fulfill({contentType:'text/html',body:`<style>body{font:16px/1.4 Arial;margin:8px}h4{margin:10px 0 0}.relative{position:relative}.h-16{height:64px}.h-full{height:100%}.flex{display:flex}.flex-1{flex:1 1 0%}.icon{width:64px;flex:none}.overflow-hidden{overflow:hidden}.whitespace-nowrap,.truncate{white-space:nowrap}.truncate{text-overflow:ellipsis;overflow:hidden}.absolute{position:absolute}.bottom-2{bottom:8px}.metadata{padding-left:80px;font-size:14px;max-width:100%;box-sizing:border-box}.px-4{padding:0 16px}</style><main>${row(1)}${row(2)}</main>`}));
 await page.goto('https://huggingface.co/google/embeddinggemma-300m/discussions');
 await page.evaluate(()=>{
  window.listeners=[];window.release=[];window.requested=[];
  window.chrome={runtime:{id:'fixture',onMessage:{addListener:f=>listeners.push(f)},sendMessage:async m=>{
   if(m.type==='get-follow')return {enabled:false};if(m.type==='translation-cache')return {ok:true,items:[]};
   if(m.type==='translate-batch'){requested.push(...m.items.map(x=>x.text));await new Promise(r=>release.push(r));return {ok:true,items:m.items.map(x=>({id:x.id,text:'无法使用模型，许可证链接跳转到了不存在的页面。这里用较长的译文验证窄屏换行之后，标题、译文、作者信息仍然保持间距。'}))}}return {ok:true};
  }},storage:{sync:{get:async d=>({...d})},local:{get:async()=>({}),set:async()=>{}},onChanged:{addListener(){}}}};
  window.send=m=>listeners.forEach(f=>f(m,{},()=>{}));
 });
 for(const file of ['reader-config','user-rules','site-rules','translation-text','paragraph-codec','reader-ui','content'])await page.addScriptTag({path:`${root}/${file}.js`});
 await page.addStyleTag({path:root+'/src/web/content.css'});
 const check=async()=>{
  const boxes=await page.evaluate(()=>[...document.querySelectorAll('main > div')].map(row=>{
   const rect=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,right:r.right}};
   return {row:rect(row),title:rect(row.querySelector('h4')),meta:rect(row.querySelector('.metadata'))};
  }));
  for(let i=0;i<boxes.length;i++){const b=boxes[i];assert(b.title.bottom<=b.meta.top+1,JSON.stringify(b));assert(b.meta.bottom<=b.row.bottom+1);if(i)assert(boxes[i-1].row.bottom<=b.row.top+1)}
 };
 await page.evaluate(()=>send({type:'translate-page'}));
 await page.waitForFunction(()=>release.length&&document.querySelector('.reader-loading'));
 await check();await page.evaluate(()=>release.splice(0).forEach(f=>f()));
 await page.waitForFunction(()=>document.querySelectorAll('h4 > .reader-translation').length===2);
 for(const width of [1100,360]){await page.setViewportSize({width,height:800});await check()}
 assert((await page.evaluate(()=>requested)).every(text=>!text.includes('opened')));
 await page.evaluate(html=>document.querySelector('main').insertAdjacentHTML('beforeend',html),row(3));
 await page.waitForFunction(()=>document.querySelector('#row3 .reader-translation'));await check();
 await page.evaluate(()=>send({type:'clear-page'}));
 assert.equal(await page.locator('[data-reader-target]').count(),0);
 assert.deepEqual(await page.locator('main > div').evaluateAll(rows=>rows.map(x=>x.getBoundingClientRect().height)),[64,64,64]);
 assert.deepEqual(errors,[]);console.log('PASS HF loading, wrapping, metadata, dynamic cached row and reversible layout');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

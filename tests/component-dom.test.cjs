const {chromium}=require('playwright');
const fs=require('fs'),assert=require('assert');const root=require('path').resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.READER_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<main><p id="plain">A complete paragraph with <a href="/link">a useful link</a> and some additional words.</p><x-article id="component"></x-article><pre id="code">const value = 42;</pre></main>'}));
 await page.goto('https://fixture.test/');
 await page.evaluate(()=>{
  const shadow=document.querySelector('x-article').attachShadow({mode:'open'});shadow.innerHTML='<p id="inside">This paragraph belongs to an open shadow component.</p>';
  window.messages=[];window.changed=[];window.calls=[];
  window.chrome={runtime:{id:'fixture',onMessage:{addListener:f=>messages.push(f)},sendMessage:async m=>{calls.push(m.type);if(m.type==='get-follow')return {enabled:false};if(m.type==='translation-cache')return {ok:true,items:[]};if(m.type==='translate-local'){send({type:'local-progress',generation:m.generation,requestId:m.requestId,text:'先显示的译文'});await new Promise(resolve=>setTimeout(resolve,100));window.localStreamSeen=[...document.querySelectorAll('[data-reader-ui]')].some(el=>el.shadowRoot?.querySelector('#output')?.textContent.includes('先显示的译文'));}if(['translate-batch','translate-local'].includes(m.type))return {ok:true,items:m.items.map(x=>({id:x.id,text:'这里是完整译文。'}))};return {ok:true}}},storage:{sync:{get:async defaults=>({...defaults})},local:{get:async()=>({}),set:async()=>{}},onChanged:{addListener:f=>changed.push(f)}}};
  window.send=m=>messages.forEach(f=>f(m,{},()=>{}));
 });
 await page.addScriptTag({path:root+'/src/shared/reader-config.js'});await page.addScriptTag({path:root+'/src/shared/user-rules.js'});await page.addScriptTag({path:root+'/src/web/site-rules.js'});await page.addScriptTag({path:root+'/src/shared/translation-text.js'});await page.addStyleTag({path:root+'/src/web/content.css'});await page.addScriptTag({path:root+'/src/web/paragraph-codec.js'});await page.addScriptTag({path:root+'/src/shared/reader-ui.js'});await page.addScriptTag({path:root+'/src/web/content.js'});
 await page.evaluate(()=>send({type:'translate-page'}));
 await page.waitForFunction(()=>document.querySelector('#plain [data-reader-target]')&&document.querySelector('x-article').shadowRoot.querySelector('#inside [data-reader-target]'));
 await page.evaluate(()=>{const p=document.createElement('p');p.id='later';p.textContent='Dynamically appended paragraph in the shadow root.';document.querySelector('x-article').shadowRoot.append(p)});
 await page.waitForFunction(()=>document.querySelector('x-article').shadowRoot.querySelector('#later [data-reader-target]'));
 await page.evaluate(()=>changed.forEach(f=>f({mode:{newValue:'translation'}},'sync')));
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('x-article').shadowRoot.querySelector('.reader-original')).display),'none');
 await page.evaluate(()=>send({type:'diagnose'}));await page.locator('#code').click();
 assert.match(await page.evaluate(()=>[...document.querySelectorAll('[data-reader-ui]')].map(x=>x.shadowRoot?.querySelector('#result')?.textContent).filter(Boolean).join('')),/被排除/);
 await page.evaluate(()=>send({type:'clear-page'}));
 assert.equal(await page.locator('#plain [data-reader-target]').count(),0);assert.equal(await page.evaluate(()=>document.querySelector('x-article').shadowRoot.querySelectorAll('[data-reader-target]').length),0);
 await page.evaluate(()=>{const frame=document.createElement('iframe');frame.src='/embedded';document.body.append(frame)});
 await page.waitForFunction(()=>document.querySelector('iframe')?.contentDocument?.querySelector('#plain'));
 const frame=page.frames().find(f=>f!==page.mainFrame());
 await frame.evaluate(()=>{
  window.messages=[];window.calls=[];
  window.chrome={runtime:{id:'fixture-frame',onMessage:{addListener:f=>messages.push(f)},sendMessage:async m=>{calls.push(m.type);if(m.type==='get-frame-intent')return {enabled:true};if(m.type==='translation-cache')return {ok:true,items:[]};if(['translate-batch','translate-local'].includes(m.type))return {ok:true,items:m.items.map(x=>({id:x.id,text:'嵌入网页译文'}))};return {ok:true}}},storage:{sync:{get:async defaults=>({...defaults,translateFrames:true})},local:{get:async()=>({})},onChanged:{addListener(){}}}};
  window.send=m=>messages.forEach(f=>f(m,{},()=>{}));
 });
 await frame.addScriptTag({path:root+'/src/shared/reader-config.js'});await frame.addScriptTag({path:root+'/src/shared/user-rules.js'});await frame.addScriptTag({path:root+'/src/web/site-rules.js'});await frame.addScriptTag({path:root+'/src/shared/translation-text.js'});await frame.addStyleTag({path:root+'/src/web/content.css'});await frame.addScriptTag({path:root+'/src/web/paragraph-codec.js'});await frame.addScriptTag({path:root+'/src/shared/reader-ui.js'});await frame.addScriptTag({path:root+'/src/web/content.js'});
 await frame.waitForFunction(()=>document.querySelector('#plain [data-reader-target]'));
 assert.equal(await frame.locator('[data-reader-ui]').count(),0);
 assert.equal(await frame.evaluate(()=>calls.includes('set-follow')),false);
 await frame.evaluate(()=>send({type:'frame-intent',enabled:false}));assert.equal(await frame.locator('[data-reader-target]').count(),0);
 // Saturate network workers, then recreate a known paragraph and a persistent-cache hit.
 await page.evaluate(()=>{
  window.release=[];const original=chrome.runtime.sendMessage;
  chrome.runtime.sendMessage=async m=>{
   if(m.type==='translation-cache')return {ok:true,items:m.items.filter(x=>x.text.includes('persistent warm')).map(x=>({...x,text:'持久缓存恢复'}))};
   if(m.type==='translate-batch'&&m.items.some(x=>x.text.includes('pending request')))return new Promise(resolve=>release.push(()=>resolve({ok:true,items:m.items.map(x=>({...x,text:'完成'}))})));
   return original(m);
  };
  document.querySelectorAll('main > p').forEach(x=>x.remove());
  for(let i=0;i<12;i++){const p=document.createElement('p');p.textContent='pending request '+i;document.querySelector('main').prepend(p)}
  send({type:'translate-page'});
 });
 await page.waitForFunction(()=>release.length===6);
 await page.evaluate(()=>{const p=document.createElement('p');p.id='warm';p.textContent='persistent warm cache paragraph';document.querySelector('main').prepend(p)});
 await page.waitForFunction(()=>document.querySelector('#warm [data-reader-target]'));
 assert.equal(await page.evaluate(()=>release.length),6);
 await page.evaluate(()=>{send({type:'clear-page'});release.forEach(f=>f());});
 // A burst finishes before the first scheduled request; only stable final text should be sent.
 await page.evaluate(()=>{
  document.querySelector('main').innerHTML='<p id="changing">Initial stable paragraph.</p>';
  const old=chrome.runtime.sendMessage;window.networkTexts=[];
  chrome.runtime.sendMessage=async m=>{if(m.type==='translate-batch')networkTexts.push(...m.items.map(x=>x.text));return old(m)};
  send({type:'translate-page'});
 });
 await page.waitForFunction(()=>document.querySelector('#changing [data-reader-target]'));
 await page.evaluate(async()=>{const p=document.querySelector('#changing');p.textContent='Changing draft number one';await new Promise(r=>setTimeout(r,15));p.textContent='Changing draft number two';await new Promise(r=>setTimeout(r,15));p.textContent='Final stable text after burst';});
 await page.waitForFunction(()=>document.querySelector('#changing [data-reader-target]'));
 const texts=await page.evaluate(()=>networkTexts);assert(!texts.includes('Changing draft number one'));assert(!texts.includes('Changing draft number two'));assert(texts.includes('Final stable text after burst'));
 await page.evaluate(()=>{
  send({type:'clear-page'});
  const original=chrome.runtime.sendMessage;
  chrome.runtime.sendMessage=async m=>m.type==='translate-batch'?{ok:true,items:m.items.map(x=>({...x,text:x.text}))}:m.type==='translation-cache'?{ok:true,items:[]}:original(m);
  const p=document.createElement('p');p.id='long-rich';const a=document.createElement('a');a.href='https://example.com/resource';a.textContent='Long linked paragraph text. '.repeat(80);const strong=document.createElement('strong');strong.textContent='Nested emphasis across chunks. '.repeat(60);a.append(strong);p.append(a);document.querySelector('main').replaceChildren(p);
  send({type:'translate-page'});
 });
 await page.waitForFunction(()=>document.querySelector('#long-rich .reader-translation a strong'));
 assert(await page.locator('#long-rich .reader-translation a').count()>1);
 assert.equal(await page.locator('#long-rich .reader-translation a').first().getAttribute('href'),'https://example.com/resource');
 assert.equal(await page.locator('#long-rich .reader-translation').count(),1);
 await page.evaluate(()=>send({type:'clear-page'}));assert.equal(await page.locator('#long-rich > a > strong').count(),1);
 // Local translation is explicitly triggered and uses a separate request type.
 await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('#long-rich'));getSelection().removeAllRanges();getSelection().addRange(range);send({type:'translate-selection'});});
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-reader-ui]')].some(x=>x.shadowRoot?.querySelector('#copy')?.disabled===false));
 assert(await page.evaluate(()=>calls.includes('translate-local')));assert(await page.evaluate(()=>localStreamSeen));
 assert.equal(await page.locator('#long-rich .reader-translation').count(),0);
 await page.getByRole('button',{name:'关闭翻译',exact:true}).click();
 // Saved include/exclude picks share the real storage-change rule rebuild path.
 await page.evaluate(()=>{window.ruleStore={readerRules:{}};chrome.storage.local.get=async defaults=>({...defaults,...ruleStore});chrome.storage.local.set=async values=>{Object.assign(ruleStore,structuredClone(values));changed.forEach(f=>f(Object.fromEntries(Object.entries(values).map(([k,v])=>[k,{newValue:v}])), 'local'))};getSelection().removeAllRanges();send({type:'diagnose'});});
 await page.locator('#long-rich').click();await page.getByRole('button',{name:'排除此段',exact:true}).click();
 assert.equal(await page.evaluate(()=>ruleStore.readerRules['fixture.test'].entries[0].exclude),'#long-rich');
 assert.deepEqual(await page.evaluate(()=>ruleStore.readerRulesBackup),{});
 await page.getByRole('button',{name:'加入正文',exact:true}).click();
 assert.equal(await page.evaluate(()=>ruleStore.readerRules['fixture.test'].entries[0].exclude),'');
 assert.equal(await page.evaluate(()=>ruleStore.readerRules['fixture.test'].entries[0].include),'#long-rich');
 assert.deepEqual(errors,[]);console.log('PASS long rich text + cache saturation + stable burst + browser DOM: paragraphs, open shadow initial/dynamic, translation-only mode, diagnostic exclusion, restore, iframe intent/no duplicate UI; mocked extension API');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

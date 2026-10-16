const {chromium}=require('playwright'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const context=await chromium.launchPersistentContext('',{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});try{
const cdp=await context.browser().newBrowserCDPSession();const {id}=await cdp.send('Extensions.loadUnpacked',{path:path.resolve(__dirname,'..')});
const config=await context.newPage();await config.goto('chrome-extension://'+id+'/options.html');await config.evaluate(()=>chrome.storage.sync.set({apiKey:'mock',endpoint:'https://api.deepseek.com',model:'deepseek-flash',autoTranslate:true,minInterval:0}));let calls=0;
await context.route('https://api.deepseek.com/**',async r=>{calls++;const items=JSON.parse(r.request().postDataJSON().messages[1].content);await r.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify(items.map(x=>({id:x.id,text:'这是正文的测试译文。'})))}}]})});});
await context.route('https://github.com/test/readme',r=>r.fulfill({contentType:'text/html',body:'<main><article class="markdown-body"><h1>Turn your model into a decision engine</h1>'+Array.from({length:6},(_,i)=>'<p>Paragraph '+i+' describes the architecture and implementation of a language model inference service.</p>').join('')+'</article></main>'}));
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('https://github.com/test/readme');
try{await page.waitForFunction(()=>[...document.querySelectorAll('[data-reader-target]')].filter(el=>el.textContent.includes('这是正文的测试译文')).length>=7,{},{timeout:15000});}catch(e){console.log({calls,errors,body:await page.locator('body').innerText()});throw e;}
assert(calls>0);assert.equal(await page.locator('[data-reader-ui] #ball').count(),1);await page.locator('[data-reader-ui] #ball').hover();await page.locator('[data-reader-ui] #tools').click();assert.equal(await page.locator('[data-reader-ui] section').isVisible(),true);assert.deepEqual(errors,[]);console.log('PASS full extension article translation',calls);
await context.route('https://github.com/test/tasks',r=>r.fulfill({contentType:'text/html',body:`<main><article class="markdown-body"><ul><li id="unchecked"><input class="task-list-item-checkbox" type="checkbox" disabled>Support multiple translation providers</li><li id="checked"><input class="task-list-item-checkbox" type="checkbox" disabled checked>Preserve original paragraph structure</li><li id="nested"><p><input class="task-list-item-checkbox" type="checkbox" disabled>Translate nested checklist paragraphs</p></li><li id="editable"><input type="text">Editable text must remain untouched</li></ul></article></main>`}));
await page.goto('https://github.com/test/tasks');
await page.waitForFunction(()=>document.querySelectorAll('li .reader-translation').length===3,{},{timeout:15000});
assert.equal(await page.locator('#editable .reader-translation').count(),0);
assert.equal(await page.locator('input[type=checkbox]').count(),3);
assert.equal(await page.locator('#checked input').isChecked(),true);
assert.equal(await page.locator('#unchecked input').isChecked(),false);
await page.locator('[data-reader-ui] #ball').click();
assert.equal(await page.locator('li .reader-translation').count(),0);
assert.equal(await page.locator('#checked > input:checked').count(),1);
assert.equal(await page.locator('#nested > p > input').count(),1);
console.log('PASS GitHub disabled task lists, editable exclusion and restore');
await context.route('https://github.com/test/project/issues',r=>r.fulfill({contentType:'text/html',body:`<main><div id="filters"><span>Open issues</span><span>Closed issues</span></div><div data-testid="list-row"><a data-testid="issue-listitem-title-link" href="/test/project/issues/42">Linux voice input records nothing</a><span id="metadata">opened yesterday by somebody</span></div><div class="js-issue-row"><a class="markdown-title" href="/test/project/issues/43">Support additional translation providers</a></div></main>`}));
await page.goto('https://github.com/test/project/issues');
await page.locator('[data-reader-ui] #ball').click();
await page.waitForFunction(()=>document.querySelectorAll('a > .reader-translation').length===2,{},{timeout:15000});
assert.equal(await page.locator('#filters .reader-translation,#metadata .reader-translation').count(),0);
assert.equal(await page.locator('a[data-testid]').getAttribute('href'),'/test/project/issues/42');
await page.locator('[data-reader-ui] #ball').click();
assert.equal(await page.locator('a[data-testid]').innerText(),'Linux voice input records nothing');
assert.deepEqual(errors,[]);
console.log('PASS GitHub Issue titles, filters exclusion and restore');
await context.route('https://github.com/test/project/pulls',r=>r.fulfill({contentType:'text/html',body:'<main><div><a data-testid="listitem-title-link" href="/test/project/pull/42">Fix Linux microphone access and application audio</a><span id="labels">dependencies</span></div></main>'}));
await page.goto('https://github.com/test/project/pulls');await page.locator('[data-reader-ui] #ball').click();
await page.waitForFunction(()=>document.querySelector('a[data-testid="listitem-title-link"] > .reader-translation'));
assert.equal(await page.locator('#labels .reader-translation').count(),0);
// Navigate in place, as GitHub does, and replace its content after the route changes.
await page.evaluate(()=>{history.pushState({},'', '/test/project');document.querySelector('main').innerHTML='<div data-component="SplitPageLayout.Pane"><div class="sidebarSection__example"><div><h2 data-component="Heading"><span>About</span></h2><p data-component="Text">Utsuwa is an open-source alternative to Grok Companion.</p></div></div></div>';});
await page.waitForFunction(()=>document.querySelectorAll('[data-component="SplitPageLayout.Pane"] .reader-translation').length===2,{},{timeout:15000});
assert.equal(await page.locator('p > .reader-original').innerText(),'Utsuwa is an open-source alternative to Grok Companion.');
console.log('PASS GitHub PR title and SPA navigation to nested About sidebar');
await context.route('https://www.google.com.hk/search?*',r=>r.fulfill({contentType:'text/html',body:`<style>.VwiC3b{display:-webkit-box;-webkit-line-clamp:2;overflow:hidden}em{color:red}</style><div id="search"><div id="rso">${Array.from({length:3},(_,i)=>`<div class="MjjYud"><div class="TbwUpd"><span class="VuuXrf">English source name</span><cite>https://example.com/result</cite></div><a href="https://example.com/${i}"><h3>Stratum result ${i}</h3></a><div class="IsZvec"><span class="VwiC3b" data-sncf="1">In geology, a stratum is a <em>layer of rock or sediment</em> characterized by its properties.</span></div></div>`).join('')}</div></div>`}));
await page.goto('https://www.google.com.hk/search?q=strata');
await page.waitForFunction(()=>document.querySelectorAll('#rso .reader-translation').length===6,{},{timeout:15000});
assert.equal(await page.locator('.TbwUpd [data-reader-target]').count(),0);
assert.equal(await page.locator('h3 .reader-translation').count(),3);
assert.equal(await page.locator('.VwiC3b .reader-translation').count(),3);
assert.equal(await page.locator('.VwiC3b.reader-unclamped').count(),3);
await page.locator('[data-reader-ui] #ball').click();
assert.equal(await page.locator('#rso [data-reader-target]').count(),0);
assert.equal(await page.locator('.reader-unclamped').count(),0);
assert.deepEqual(errors,[]);console.log('PASS Google titles, snippets, metadata exclusion and restore');
await context.route('https://huggingface.co/test/model',r=>r.fulfill({contentType:'text/html',body:'<style>h3{display:flex;align-items:center;gap:8px;font-size:16px}svg{width:18px;height:18px;flex:none}</style><main><section><h3><svg viewBox="0 0 20 20"><path d="M0 0L20 20"/></svg>You need to agree to share your contact information to access this model</h3><p>This repository is publicly accessible.</p><label>Name<input placeholder="Name (required)"></label></section></main>'}));
await page.goto('https://huggingface.co/test/model');
await page.waitForFunction(()=>document.querySelector('h3 > .reader-translation'));
assert.equal(await page.locator('h3 svg').count(),1);
assert.equal(await page.locator('label [data-reader-target]').count(),0);
for(const width of [1100,360]){
 await page.setViewportSize({width,height:800});
 const placement=await page.locator('h3').evaluate(h=>{const original=h.querySelector('.reader-original'),range=document.createRange();range.selectNodeContents(original);return {sourceBottom:range.getBoundingClientRect().bottom,targetTop:h.querySelector('.reader-translation').getBoundingClientRect().top,wrap:getComputedStyle(h).flexWrap};});
 assert.equal(placement.wrap,'wrap');assert(placement.targetTop>=placement.sourceBottom-1,JSON.stringify(placement));
}
await page.locator('[data-reader-ui] #ball').click();
assert.equal(await page.locator('h3').evaluate(h=>getComputedStyle(h).flexWrap),'nowrap');
assert.equal(await page.locator('h3 svg').count(),1);
console.log('PASS flex card heading, icon, narrow layout and restore');


}finally{await context.close();}})().catch(e=>{console.error(e);process.exitCode=1});

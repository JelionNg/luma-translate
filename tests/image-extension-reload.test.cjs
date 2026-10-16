// Real extension reload, not a mocked invalid-context exception. No translation API configured.
const {chromium}=require('playwright'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const context=await chromium.launchPersistentContext('',{executablePath:process.env.READER_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});try{
const cdp=await context.browser().newBrowserCDPSession();const {id}=await cdp.send('Extensions.loadUnpacked',{path:path.resolve(__dirname,'..')});
await context.route('https://fixture.test/',route=>route.fulfill({contentType:'text/html',body:'<img id="photo" style="width:700px;height:300px">'}));
const page=await context.newPage(),pc=await context.newCDPSession(page),errors=[];await pc.send('Runtime.enable');pc.on('Runtime.exceptionThrown',e=>errors.push(e.exceptionDetails));
await page.goto('https://fixture.test/');await page.evaluate(()=>{const c=document.createElement('canvas');c.width=700;c.height=300;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,700,300);x.fillStyle='black';x.font='36px Arial';x.fillText('Image reload regression',20,80);document.querySelector('img').src=c.toDataURL();});
await page.locator('#photo').hover();
async function action(){const {root}=await pc.send('DOM.getDocument',{depth:1,pierce:true});const {nodeId}=await pc.send('DOM.querySelector',{nodeId:root.nodeId,selector:'[data-reader-ui="image"]'});const {node}=await pc.send('DOM.describeNode',{nodeId,depth:1,pierce:true});const {object}=await pc.send('DOM.resolveNode',{backendNodeId:node.shadowRoots[0].backendNodeId});try{const {result}=await pc.send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:"function(){this.querySelector('#action').click();}",returnByValue:true});return result;}finally{await pc.send('Runtime.releaseObject',{objectId:object.objectId});}}
await action();
const sw=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id+'/'));
await sw.evaluate(()=>{setTimeout(()=>chrome.runtime.reload(),0);});
await page.waitForTimeout(1000);
await page.evaluate(()=>{dispatchEvent(new Event('resize'));document.querySelector('img').dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));});
await page.waitForFunction(()=>!document.querySelector('[data-reader-ui="image"]'));
await page.mouse.move(0,0);await page.locator('#photo').hover();await page.evaluate(()=>dispatchEvent(new Event('resize')));assert.equal(await page.locator('[data-reader-ui="image"]').count(),0);
assert.deepEqual(errors,[]);console.log('PASS actual extension reload during image task: old overlay disposed, no uncaught exceptions, subsequent old-page events do not recreate stale UI.');
}finally{await context.close();}})().catch(e=>{console.error(e);process.exitCode=1});

// Real PP-OCRv6 inference in an isolated unpacked extension. No real translation API calls.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),reportDir=path.join(root,'analysis/ocr-browser');
(async()=>{
 fs.mkdirSync(reportDir,{recursive:true});
 const context=await chromium.launchPersistentContext('',{executablePath:process.env.READER_CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging'],viewport:{width:1280,height:900}});
 const browser=context.browser();let interval;
 try{
  const cdp=await browser.newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:root});
  const page=await context.newPage(),requests=[],errors=[];context.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
  await page.goto('chrome-extension://'+id+'/ocr/index.html');
  const fixture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=1000;c.height=420;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='#24202e';x.font='bold 40px Arial';x.fillText('Local OCR in your browser',44,70);x.font='30px Arial';x.fillText('PaddleOCR + DeepSeek',44,130);x.font='30px "PingFang SC",sans-serif';x.fillText('图片文字识别，无需上传云端。',44,198);x.font='24px Arial';x.fillText('Price: $19.99   Order: AB-12345',44,258);x.save();x.translate(48,345);x.rotate(-.06);x.font='28px Arial';x.fillText('Rotated text stays readable.',0,0);x.restore();return c.toDataURL().split(',')[1];});
  const processInfo=await cdp.send('SystemInfo.getProcessInfo'),rootPid=processInfo.processInfo.find(p=>p.type==='browser')?.id;
  function rss(){if(!rootPid)return null;try{const rows=execFileSync('ps',['-axo','pid=,ppid=,rss='],{encoding:'utf8'}).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));const ids=new Set([rootPid]);let previous;do{previous=ids.size;for(const [pid,parent]of rows)if(ids.has(parent))ids.add(pid);}while(ids.size!==previous);return rows.filter(([pid])=>ids.has(pid)).reduce((sum,row)=>sum+row[2]*1024,0);}catch{return null;}}
  const baselineRss=rss();let peakRss=baselineRss;interval=setInterval(()=>{const value=rss();if(value!==null)peakRss=Math.max(peakRss||0,value);},100);
  const cpuBefore=processInfo.processInfo.reduce((n,p)=>n+p.cpuTime,0);
  const waitResult=async()=>{await page.waitForFunction(()=>window.ocrResult||window.ocrError,{},{timeout:120000});const data=await page.evaluate(()=>({result:window.ocrResult,error:window.ocrError}));assert(!data.error,JSON.stringify(data.error));return data.result;};
  await page.locator('#file').setInputFiles({name:'ocr-fixture.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});const cold=await waitResult();
  const expected=['Local OCR in your browser','PaddleOCR + DeepSeek','图片文字识别，无需上传云端。','Price: $19.99 Order: AB-12345','Rotated text stays readable.'];assert.deepEqual(cold.regions.map(r=>r.text),expected);
  for(const r of cold.regions){assert.equal(r.polygon.length,4);for(const [x,y]of r.polygon){assert(x>=0&&x<1000);assert(y>=0&&y<420);}}
  await context.setOffline(true);await page.locator('#again').click();const warm=await waitResult();assert.deepEqual(warm.regions.map(r=>r.text),expected);
  const cpuAfter=(await cdp.send('SystemInfo.getProcessInfo')).processInfo.reduce((n,p)=>n+p.cpuTime,0);clearInterval(interval);interval=null;
  const localRequests=[...requests];assert(localRequests.every(url=>url.startsWith('chrome-extension://'+id+'/')),'OCR made an external request');
  await page.screenshot({path:path.join(reportDir,'browser-preview.png'),fullPage:true});
  await page.locator('#again').click();await page.locator('#cancel').click();await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.ocrResult),null);assert.match(await page.locator('#status').textContent(),/已取消/);
  await page.locator('#again').click();const reloaded=await waitResult();assert.deepEqual(reloaded.regions.map(r=>r.text),expected);
  // Translation path is exercised through the real background with a mock server response.
  await context.setOffline(false);let translatedRequests=0;
  await context.route('https://api.deepseek.com/**',async route=>{const body=route.request().postDataJSON();assert.deepEqual(body.thinking,{type:'disabled'});assert.equal(typeof body.messages[1].content,'string');const items=JSON.parse(body.messages[1].content);assert(!JSON.stringify(body).includes('image_url'));translatedRequests++;await route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify(items.map(item=>({id:item.id,text:'测试译文：'+item.text})))}}]})});});
  await page.evaluate(()=>chrome.storage.sync.set({apiKey:'mock-key',endpoint:'https://api.deepseek.com',model:'deepseek-flash',minInterval:0}));
  await page.locator('#translate').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('翻译完成'));assert.equal(await page.locator('.translated').count(),5);assert.equal(translatedRequests,2);
  const blank=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=200;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,320,200);return c.toDataURL().split(',')[1]});
  await page.locator('#file').setInputFiles({name:'blank.png',mimeType:'image/png',buffer:Buffer.from(blank,'base64')});const blankResult=await waitResult();assert.equal(blankResult.regions.length,0);assert(await page.locator('#translate').isDisabled());assert.deepEqual(errors,[]);
  const report={browser:browser.version(),platform:process.platform,architecture:process.arch,cold,warm,reloaded,blankTiming:blankResult.timing,localRequests,errors,translation:{mocked:true,requests:translatedRequests},resources:{baselineSummedRssBytes:baselineRss,peakSampledSummedRssBytes:peakRss,coldAndWarmListedProcessCpuSeconds:cpuAfter-cpuBefore,notes:'100ms sample of ps RSS summed for the isolated browser process tree; shared pages can be counted more than once. CPU is CDP-listed processes delta and may omit exited processes. Not OCR-only memory.'}};
  fs.writeFileSync(path.join(reportDir,'verified-run.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:'PASS',cold:cold.timing,warm:warm.timing,resources:report.resources,checks:'5 text lines and polygons; offline warm/reload; cancel; actual extension CSP; no OCR network; mock text translation; blank image'},null,2));
 }finally{if(interval)clearInterval(interval);await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

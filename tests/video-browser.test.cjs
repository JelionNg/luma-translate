// Actual MV3 background/capture/content integration with synthetic player and mocked API.
const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const context=await chromium.launchPersistentContext('',{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});
 try{
 const cdp=await context.browser().newBrowserCDPSession(),{id}=await cdp.send('Extensions.loadUnpacked',{path:root});
 const settings=await context.newPage();await settings.goto('chrome-extension://'+id+'/src/ui/popup.html');await settings.evaluate(()=>chrome.storage.sync.set({apiKey:'test-only',endpoint:'https://api.deepseek.com',model:'deepseek-flash',minInterval:0,autoTranslate:false}));
 let releasePrefetch;const prefetchGate=new Promise(r=>releasePrefetch=r);let requests=[];await context.route('https://api.deepseek.com/**',async route=>{const b=route.request().postDataJSON(),items=JSON.parse(b.messages[1].content);requests.push(items);assert(items.length<=4);if(items.some(x=>x.text==='Hello world')){const reference=JSON.parse(b.messages[2].content).referenceOnly;assert(reference.after.includes('Next sentence'));assert(!reference.targets);}if(items.some(x=>x.text==='Next sentence'))await prefetchGate;await route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify(items.map(x=>({id:x.id,text:'译文：'+x.text})))}}]})});});
 await context.route('https://www.reddit.com/video-fixture*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body><div id="component"></div><script>const root=document.querySelector("#component").attachShadow({mode:"open"});root.innerHTML=\'<video style="width:640px;height:360px;background:#222"></video>\';window.player=root.querySelector("video");window.clock=0;window.track=player.addTextTrack("captions","English","en");track.addCue(new VTTCue(0,3,"Hello world"));track.addCue(new VTTCue(3,6,"Next sentence"));for(let i=2;i<5;i++)track.addCue(new VTTCue(i*3,(i+1)*3,"Future sentence "+i));track.mode="showing";</script>'}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('https://www.reddit.com/video-fixture');
 // No extension wrappers: unrelated CSP-blocked requests retain native ownership.
 const nativeNetwork=()=>page.evaluate(()=>[XMLHttpRequest.prototype.open,XMLHttpRequest.prototype.send].every(fn=>Function.prototype.toString.call(fn).includes('[native code]')));
 assert(await nativeNetwork());
 async function open(){await settings.evaluate(async url=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url===url);const r=await chrome.tabs.sendMessage(tab.id,{type:'video-open'});if(!r.ok)throw Error('open failed');},page.url());}
 const target=()=>page.locator('[data-reader-ui="video-subtitle"] #target');
 await open();await target().filter({hasText:'译文：Hello world'}).waitFor();assert(requests.flat().some(x=>x.text==='Next sentence'));assert(requests.every(items=>!(items.some(x=>x.text==='Hello world')&&items.some(x=>x.text==='Next sentence'))),'current cue must not wait for prefetch batch');assert(requests.some(items=>items.length===4&&items.some(x=>x.text==='Next sentence')),'future cues must be batched');releasePrefetch();
 await page.evaluate(()=>{clock=4;player.currentTime=4;player.dispatchEvent(new Event('seeking'));});await target().filter({hasText:'译文：Next sentence'}).waitFor();
 await page.evaluate(()=>{track.cues[1].text='Changed cue';});await target().filter({hasText:'译文：Changed cue'}).waitFor();
 const downloadEvent=page.waitForEvent('download');
 await page.locator('[data-reader-ui] #export').click();
 const download=await downloadEvent,exported=fs.readFileSync(await download.path(),'utf8');
 assert(download.suggestedFilename().endsWith('.txt'));
 assert(exported.includes('Hello world')&&exported.includes('译文：Hello world'));
 assert(exported.includes('Changed cue')&&exported.includes('译文：Changed cue'));
 assert(exported.indexOf('Hello world')<exported.indexOf('Changed cue'));
 assert.equal((exported.match(/\[\d{2}:\d{2}:\d{2}\.\d{3} – /g)||[]).length,5);
 await page.evaluate(()=>{track.mode='disabled';});await page.waitForFunction(()=>document.querySelector('[data-reader-ui="video-subtitle"]').hidden);
 const before=requests.length;await page.waitForTimeout(700);assert.equal(requests.length,before);
 await page.evaluate(()=>{track.mode='showing';});await page.waitForFunction(()=>!document.querySelector('[data-reader-ui="video-subtitle"]').hidden);
 await page.locator('[data-reader-ui="video"] #close').click();assert.equal(await page.locator('[data-reader-ui="video"]').count(),0);
 // Request capture fallback: remove native tracks by replacing the element.
 await page.evaluate(()=>{const next=document.createElement('video');next.style.cssText=player.style.cssText;const shell=document.createElement('shreddit-player-2');player.replaceWith(shell);const root=shell.attachShadow({mode:'open'});root.append(next);const ui=document.createElement('shreddit-media-ui');root.append(ui);ui.attachShadow({mode:'open'}).innerHTML='<button aria-label="切换字幕" aria-pressed="true">CC</button>';player=next;clock=0;});
 let captionReads=0;const vtt='WEBVTT\n\n00:00.000 --> 00:01.000\nCaptured subtitle\n\n00:01.000 --> 00:02.000\nCaptured subtitle\n\n00:02.000 --> 00:03.000\nCaptured subtitle\n';await context.route('https://v.redd.it/test/captions.vtt',route=>{captionReads++;return route.fulfill({contentType:'text/vtt',headers:{'access-control-allow-origin':'*'},body:vtt})});
 await page.evaluate(()=>{const t=player.addTextTrack('captions','Empty pending track','en');t.mode='disabled';});
 assert(await nativeNetwork());assert.equal(await page.evaluate(()=>fetch('https://v.redd.it/test/captions.vtt').then(r=>r.text())),vtt);await page.waitForTimeout(100);await open();await target().filter({hasText:'译文：Captured subtitle'}).waitFor({timeout:5000}).catch(async e=>{console.log(errors);console.log(await page.evaluate(()=>({status:document.querySelector('[data-reader-ui=video]')?.shadowRoot.querySelector('#status').textContent,rule:globalThis.ReaderVideoRules?.resource(location.href,'https://v.redd.it/test/captions.vtt')})));throw e});
 await page.evaluate(()=>{const line=document.createElement('div');line.id='native-caption';line.textContent='Captured subtitle';line.style.cssText='position:absolute;left:30px;top:300px';player.getRootNode().append(line);});
 await page.waitForTimeout(1300);await target().filter({hasText:'译文：Captured subtitle'}).waitFor();assert.equal(captionReads,1,'actual response observed without refetch');
 assert.equal(requests.flat().filter(x=>x.text==='Captured subtitle').length,1,'same utterance shares current/prefetch translation');
 const repeatedDownloadEvent=page.waitForEvent('download');await page.locator('[data-reader-ui] #export').click();
 const repeatedDownload=await repeatedDownloadEvent,repeatedText=fs.readFileSync(await repeatedDownload.path(),'utf8');
 assert.equal((repeatedText.match(/\[\d{2}:\d{2}:\d{2}\.\d{3} – /g)||[]).length,1,'export uses one utterance while raw slices remain intact');
 assert.equal(requests.flat().filter(x=>x.text==='Captured subtitle').length,1,'export reuses playback translation');

 assert.equal(await page.locator('[data-reader-ui="video-subtitle"] #source').innerText(),'');
 const placement=await page.evaluate(()=>({native:player.getRootNode().querySelector('#native-caption').getBoundingClientRect().top,translation:document.querySelector('[data-reader-ui="video-subtitle"]').shadowRoot.querySelector('section').getBoundingClientRect().bottom}));
 assert(placement.translation<=placement.native-6,JSON.stringify(placement));

 await page.evaluate(()=>player.getRootNode().querySelector('shreddit-media-ui').shadowRoot.querySelector('button').setAttribute('aria-pressed','false'));
 await page.waitForFunction(()=>document.querySelector('[data-reader-ui="video-subtitle"]').hidden);
 await page.evaluate(()=>player.getRootNode().querySelector('shreddit-media-ui').shadowRoot.querySelector('button').setAttribute('aria-pressed','true'));
 await target().filter({hasText:'译文：Captured subtitle'}).waitFor();

 await page.locator('[data-reader-ui="video"] #close').click();
 await page.evaluate(()=>fetch('https://v.redd.it/test/captions.vtt').then(r=>r.text()));await page.waitForTimeout(100);assert.equal(captionReads,2,'closed capture makes no extra read');
 // YouTube adapter uses player metadata in MAIN world and bounded JSON3 retrieval.
 await context.route('https://www.youtube.com/watch?v=fixture',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><video style="width:640px;height:360px"></video><button class="ytp-subtitles-button" aria-pressed="true">CC</button><div id="movie_player"></div><script>document.querySelector('#movie_player').append(document.querySelector('video'));document.querySelector('#movie_player').getOption=()=>({languageCode:'en'});document.querySelector('#movie_player').getPlayerResponse=()=>({videoDetails:{videoId:'fixture'},captions:{playerCaptionsTracklistRenderer:{captionTracks:[{name:{simpleText:'Arabic'},languageCode:'ar',baseUrl:'https://www.youtube.com/api/timedtext?v=fixture&lang=ar'},{name:{simpleText:'English'},languageCode:'en',baseUrl:'https://www.youtube.com/api/timedtext?v=fixture&lang=en'}]}}});</script>`}));
 await context.route('https://www.youtube.com/api/timedtext?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({events:[{tStartMs:0,dDurationMs:3000,segs:[{utf8:'YouTube adapter works'}]}]})}));
 await page.goto('https://www.youtube.com/watch?v=fixture');await page.locator('[data-reader-ui=video-launcher] button').click();await target().filter({hasText:'译文：YouTube adapter works'}).waitFor();
 assert.equal(await page.locator('[data-reader-ui=video] #track').inputValue(),'1','prefer current English track, not first Arabic track');
 await page.locator('[data-reader-ui=video-launcher] button').click();assert.equal(await page.locator('[data-reader-ui=video]').count(),0);
 // A successful HTTP request with an empty body is not an unsupported format.
 await context.route('https://www.youtube.com/api/timedtext?*',r=>r.fulfill({contentType:'application/json',body:''}));
 await page.reload(); // Fresh document: no previously successful timeline retained.
 await page.evaluate(()=>{const node=document.createElement('div');node.className='caption-window';node.innerHTML='<span class="ytp-caption-segment">Visible caption fallback</span>';document.querySelector('#movie_player').append(node)});
 await page.locator('[data-reader-ui=video-launcher] button').click();
 await target().filter({hasText:'译文：Visible caption fallback'}).waitFor();
 await page.evaluate(()=>document.querySelector('.ytp-caption-segment').textContent='Updated visible caption');
 await target().filter({hasText:'译文：Updated visible caption'}).waitFor();
 // A rolling caption changes while the previous translation is still in flight.
 let releaseCaption,captionStarted;const pendingCaption=new Promise(r=>releaseCaption=r),pending=new Promise(r=>captionStarted=r);
 await context.route('https://api.deepseek.com/**',async route=>{
  const body=route.request().postDataJSON(),items=JSON.parse(body.messages[1].content);
  if(items.some(x=>x.text==='Rolling sentence first')){captionStarted();await pendingCaption;}
  await route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify(items.map(x=>({id:x.id,text:'译文：'+x.text})))}}]})});
 });
 await page.evaluate(()=>document.querySelector('.ytp-caption-segment').textContent='Rolling sentence first');await pending;
 await page.evaluate(()=>document.querySelector('.ytp-caption-segment').textContent='Rolling sentence first with more words');await page.waitForTimeout(600);
 releaseCaption();await target().filter({hasText:'译文：Rolling sentence first'}).waitFor();
 await target().filter({hasText:'译文：Rolling sentence first with more words'}).waitFor();
 await page.evaluate(()=>document.querySelector('.ytp-caption-segment').textContent='');await page.waitForTimeout(600);
 assert.match(await target().textContent(),/Rolling sentence/,'brief caption DOM gap must not flash the translation away');
 await page.evaluate(()=>document.querySelector('.caption-window').remove());
 await page.waitForFunction(()=>!document.querySelector('[data-reader-ui=video-subtitle]').shadowRoot.querySelector('#target').textContent);
 
 // A pending full timeline must survive starting the visible-caption fallback.
 let finishTimeline;const timelineGate=new Promise(r=>finishTimeline=r);
 await context.route('https://www.youtube.com/api/timedtext?*',async r=>{await timelineGate;await r.fulfill({contentType:'application/json',body:JSON.stringify({events:[{tStartMs:0,dDurationMs:3000,segs:[{utf8:'Acquired full timeline'}]}]})});});
 await page.evaluate(()=>{const n=document.createElement('div');n.className='caption-window';n.innerHTML='<span class="ytp-caption-segment">Acquisition fallback</span>';document.querySelector('#movie_player').append(n)});
 await page.locator('[data-reader-ui=video] #refresh').click();
 await target().filter({hasText:'译文：Acquisition fallback'}).waitFor();finishTimeline();
 await target().filter({hasText:'译文：Acquired full timeline'}).waitFor();
 await page.evaluate(()=>document.querySelector('.ytp-subtitles-button').setAttribute('aria-pressed','false'));await page.waitForFunction(()=>document.querySelector('[data-reader-ui="video-subtitle"]').hidden);
 await page.evaluate(()=>history.pushState({},'', '/watch?v=next'));await page.waitForFunction(()=>!document.querySelector('[data-reader-ui="video-subtitle"]').shadowRoot.querySelector('#target').textContent);
 // Playback-window parsing preserves overlapping cues and sanitizes markup.
 const core=await settings.evaluate(async()=>{await import(chrome.runtime.getURL('src/video/media-core.js'));const c=ReaderMediaCore.parse('WEBVTT\n\n00:00.000 --> 00:30.000\nLong\n\n00:01.000 --> 00:02.000\nShort\n\n00:03.000 --> 00:10.000\n<b>Later</b>');return ReaderMediaCore.windowAt(c,5,0).map(x=>x.text)});assert.deepEqual(core,['Long','Later']);
 // Common player adapter: a burst produces one final phrase, without YouTube.
 const genericTexts=[];let firstGenericRequestAt=0;
 await context.route('https://api.deepseek.com/**',async route=>{const items=JSON.parse(route.request().postDataJSON().messages[1].content);genericTexts.push(...items.map(x=>x.text));firstGenericRequestAt=firstGenericRequestAt||Date.now();await route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify(items.map(x=>({id:x.id,text:'译文：'+x.text})))}}]})});});
 await context.route('https://video-fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<div class="video-js" style="position:relative;width:640px;height:360px"><video style="width:640px;height:360px"></video><div class="vjs-text-track-display" style="position:absolute;bottom:60px"><span class="vjs-text-track-cue"></span></div></div>'}));
 await page.goto('https://video-fixture.test/');await page.locator('[data-reader-ui=video-launcher] button').click();
 const changedAt=await page.evaluate(()=>{const n=document.querySelector('.vjs-text-track-cue');for(let i=0;i<15;i++)n.textContent='Draft '+i;n.textContent='Common player final caption';return Date.now()});
 await target().filter({hasText:'译文：Common player final caption'}).waitFor();
 assert.deepEqual(genericTexts,['Common player final caption']);
 await page.waitForTimeout(250);
 const positions=()=>page.evaluate(()=>({caption:document.querySelector('.vjs-text-track-cue').getBoundingClientRect().top,translation:document.querySelector('[data-reader-ui=video-subtitle]').shadowRoot.querySelector('section').getBoundingClientRect().bottom}));
 const raised=await positions();assert(Math.abs(raised.caption-raised.translation-8)<2,JSON.stringify(raised));
 await page.evaluate(()=>document.querySelector('.vjs-text-track-display').style.bottom='15px');await page.waitForTimeout(400);
 const lowered=await positions();assert(Math.abs(lowered.caption-lowered.translation-8)<2,JSON.stringify(lowered));assert(lowered.translation-raised.translation>40);
 await page.evaluate(()=>document.querySelector('.video-js').requestFullscreen());
 await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>document.querySelector('[data-reader-ui=video-subtitle]').parentNode===document.fullscreenElement),true);
 await page.evaluate(()=>document.exitFullscreen());await page.waitForTimeout(100);

 await page.locator('[data-reader-ui=video-launcher] button').click();await page.locator('[data-reader-ui=video-launcher] button').click();
 await target().filter({hasText:'译文：Common player final caption'}).waitFor();assert.equal(genericTexts.length,1,'same context reuses persistent cache');
 await page.locator('[data-reader-ui=video-launcher] button').click();await page.evaluate(()=>document.title='Different technical context');await page.locator('[data-reader-ui=video-launcher] button').click();
 await target().filter({hasText:'译文：Common player final caption'}).waitFor();assert.equal(genericTexts.length,2,'changed context must not reuse the old translation');


 console.log(JSON.stringify({genericCaptionDetectionToRequestMs:firstGenericRequestAt-changedAt,scope:'synthetic Video.js DOM, mock translation API; includes background dispatch'}));
 const rolling=await settings.evaluate(()=>ReaderMediaCore.parse(JSON.stringify({events:[{tStartMs:0,dDurationMs:2000,wWinId:1,segs:[{utf8:'Hello'}]},{tStartMs:1000,dDurationMs:2000,wWinId:1,segs:[{utf8:'Hello world'}]},{tStartMs:2000,dDurationMs:2000,wWinId:1,aAppend:1,segs:[{utf8:' again'}]}]})));
 const shortTail=await settings.evaluate(()=>ReaderMediaCore.parse(JSON.stringify({events:[{tStartMs:0,dDurationMs:7000,segs:[{utf8:'This is an unfinished long phrase ',tOffsetMs:0},{utf8:'now',tOffsetMs:6000}]}]})));
 assert.equal(shortTail.length,1);assert.equal(shortTail[0].end,7);
 const segmented=await settings.evaluate(()=>ReaderMediaCore.parse(JSON.stringify({events:[{tStartMs:0,dDurationMs:7000,segs:[{utf8:'This ',tOffsetMs:0},{utf8:'is ',tOffsetMs:500},{utf8:'complete. ',tOffsetMs:1000},{utf8:'Another ',tOffsetMs:3000},{utf8:'sentence.',tOffsetMs:4000}]}]})));
 const boundaries=await settings.evaluate(()=>{
  const cues=ReaderMediaCore.normalize([{start:0,end:2,text:'An unfinished phrase'},{start:2,end:4,text:'continues here.'},{start:9,end:11,text:'A different scene'},{start:9,end:12,text:'Another speaker'}]);
  const connected=ReaderMediaCore.contextWindow(cues,0,0),isolated=ReaderMediaCore.contextWindow(cues,2,2);
  return {connected:connected.after.map(c=>c.text),before:isolated.before.length,after:isolated.after.length};
 });assert.deepEqual(boundaries,{connected:['continues here.'],before:0,after:0});
 assert.equal(segmented.length,2);assert.equal(segmented[0].end,3);assert.equal(segmented[1].start,3);assert.equal(segmented[1].end,7);
 assert.equal(rolling.length,1);assert.equal(rolling[0].text,'Hello world again');assert.equal(rolling[0].end,4);
 // Bilibili has a site subtitle control, not a literal CC label.
 await context.route('https://www.bilibili.com/video/BVfixture',r=>r.fulfill({contentType:'text/html',body:'<div class="bpx-player-container"><video style="width:640px;height:360px"></video><div class="bpx-player-subtitle-wrap"><span class="bpx-player-subtitle-panel-text">Bilibili visible subtitle</span></div></div>'}));
 const biliText=JSON.stringify({body:[{from:0,to:3,content:'Bilibili full timeline'},{from:3,to:6,content:'Next Bilibili cue'}]});
 await context.route('https://aisubtitle.hdslb.com/bfs/subtitle/fixture.json',r=>r.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:biliText}));
 await page.goto('https://www.bilibili.com/video/BVfixture');await page.locator('[data-reader-ui=video-launcher] button').click();
 await target().filter({hasText:'译文：Bilibili visible subtitle'}).waitFor();
 assert.equal(await page.evaluate(()=>fetch('https://aisubtitle.hdslb.com/bfs/subtitle/fixture.json').then(r=>r.text())),biliText);
 await target().filter({hasText:'译文：Bilibili full timeline'}).waitFor();
 await page.evaluate(()=>{const v=document.querySelector('video');v.currentTime=4;v.dispatchEvent(new Event('seeking'))});
 await target().filter({hasText:'译文：Next Bilibili cue'}).waitFor();
 const contracts=await settings.evaluate(async()=>{await import(chrome.runtime.getURL('src/video/video-rules.js'));
  const r=ReaderVideoRules;
  const page='https://www.youtube.com/watch?v=one';
  const a=r.resource(page,'https://www.youtube.com/api/timedtext?v=one&lang=en');
  const b=r.resource(page,'https://www.youtube.com/api/timedtext?v=one&lang=ja');
  return {foreign:r.resource(page,'https://www.youtube.com/api/timedtext?v=two&lang=en'),different:a.key!==b.key,mapped:r.mapJSON({nested:{lines:[{s:1,e:2,t:'text'}]}},{items:['nested','lines'],text:'t',start:'s',end:'e'}),merged:r.merge([{start:0,end:1,text:'old',id:'a'}],[{start:0,end:1,text:'revised',id:'b'},{start:1,end:2,text:'next',id:'c'}])};
 });assert.equal(contracts.foreign,null);assert(contracts.different);assert.equal(contracts.mapped[0].text,'text');assert.deepEqual(contracts.merged.map(x=>x.text),['revised','next']);
 const formats=await settings.evaluate(()=>{
 const t=ReaderMediaCore.parse('<tt xmlns="http://www.w3.org/ns/ttml"><body begin="2s"><div><p begin="00:00:01.000" dur="1500ms">Hello<br/>world</p></div></body></tt>');
 const mapped=ReaderVideoRules.mapJSON({captions:[{hash:{lines:[{start:0,end:2,text:'Wistia'}]}}]},{items:['captions'],nested:['hash','lines'],text:'text',start:'start',end:'end'});
 const a=ReaderVideoRules.segmentIdentity('https://example.test/track/list.m3u8','en-main','en',['1.vtt','2.vtt'],'1.vtt'),b=ReaderVideoRules.segmentIdentity('https://example.test/track/list.m3u8','en-main','en',['1.vtt','2.vtt'],'2.vtt');
 return {start:t[0].start,end:t[0].end,text:t[0].text,mapped:mapped[0].text,same:a===b,foreign:ReaderVideoRules.segmentIdentity('https://example.test/list','en','en',['1.vtt'],'unlisted.vtt')};
 });assert.deepEqual(formats,{start:3,end:4.5,text:'Hello world',mapped:'Wistia',same:true,foreign:null});
 // Preferred target-language human track fails; return to the player's English track.
 await page.goto('https://www.youtube.com/watch?v=fixture');
 await page.evaluate(()=>{const p=document.querySelector('#movie_player'),old=p.getPlayerResponse;p.getPlayerResponse=()=>{const d=old();d.captions.playerCaptionsTracklistRenderer.captionTracks.push({name:{simpleText:'Chinese'},languageCode:'zh-Hans',baseUrl:'https://www.youtube.com/api/timedtext?v=fixture&lang=zh-Hans'});return d}});
 await context.route('https://www.youtube.com/api/timedtext?*',r=>r.fulfill({contentType:'application/json',body:r.request().url().includes('zh-Hans')?'':JSON.stringify({events:[{tStartMs:0,dDurationMs:3000,segs:[{utf8:'Recovered source track'}]}]})}));
 await page.locator('[data-reader-ui=video-launcher] button').click();await target().filter({hasText:'译文：Recovered source track'}).waitFor();assert.equal(await page.locator('[data-reader-ui=video] #track').inputValue(),'1');
 // An old content world may throw synchronously, before sendMessage returns a Promise.
 const stale=await context.newPage();stale.on('pageerror',e=>errors.push(e.message));
 await stale.goto('about:blank');await stale.setContent('<video style="width:640px;height:360px"></video>');
 await stale.evaluate(()=>{
  window.broken=false;window.callsAfterLoss=0;window.postMessage=()=>{};
  window.chrome={runtime:{id:'fixture',onMessage:{addListener(){}},sendMessage:()=>{if(broken){callsAfterLoss++;throw Error('Extension context invalidated.')}return Promise.resolve({ok:true})}},storage:{onChanged:{addListener(){}}}};
 });
 await stale.addScriptTag({path:root+'/src/video/video-rules.js'});await stale.addScriptTag({path:root+'/src/video/media-core.js'});await stale.addScriptTag({path:root+'/src/video/video-sources.js'});await stale.addScriptTag({path:root+'/src/video/video-reader.js'});
 await stale.locator('[data-reader-ui=video-launcher] button').click();
 await stale.evaluate(()=>{broken=true;document.querySelector('video').dispatchEvent(new Event('seeking'))});
 await stale.waitForFunction(()=>!document.querySelector('[data-reader-ui=video]')&&!document.querySelector('[data-reader-ui=video-launcher]'));
 await stale.waitForTimeout(600);assert.equal(await stale.evaluate(()=>callsAfterLoss),1,'invalidation stops further sends');await stale.close();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',requests:requests.length,checks:'real extension messaging/background; shadow video; native cues; prefetch; seek; same-count cue edit; CC pause/resume; close; Reddit fetch response unchanged; caption capture; YouTube metadata/JSON3; CC off; SPA stale-output removal; overlap parser. Player clock and translation API are simulated.'}));
 }finally{await context.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

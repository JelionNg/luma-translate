const $=id=>document.getElementById(id);
let tab;
async function send(type){
  if(!tab?.id)throw Error('找不到当前网页');
  try{return await chrome.tabs.sendMessage(tab.id,{type},{frameId:0});}
  catch{
    if(!/^https?:/.test(tab.url||''))throw Error('此页面不允许翻译，请打开普通网页');
    await chrome.scripting.insertCSS({target:{tabId:tab.id,allFrames:true},files:['content.css']});
    await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},files:['reader-config.js','image-rules.js','user-rules.js','site-rules.js','translation-text.js','paragraph-codec.js','reader-ui.js','content.js']});
    return chrome.tabs.sendMessage(tab.id,{type},{frameId:0});
  }
}
async function refresh(){try{const s=await send('status');$('go').textContent=s.active||s.hasTranslations?'取消并恢复原文 · Alt+A':'开始翻译 · Alt+A';$('status').textContent=s.error||`${s.active?'翻译中':'就绪'} · ${s.done}/${s.total} 段 · ${s.siteRule||'通用网页'}`;$('progress').max=Math.max(1,s.total);$('progress').value=s.done;}catch(e){$('status').textContent=e.message;}}
(async()=>{
  [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  const c=await chrome.storage.sync.get(ReaderConfig.pick(['targetLang','mode','autoTranslate','dynamic','translateFrames']));
  for(const key of Object.keys(c)){const el=$(key);if(el.type==='checkbox')el.checked=c[key];else el.value=c[key];el.onchange=async()=>{try{await chrome.storage.sync.set({[key]:el.type==='checkbox'?el.checked:el.value});}catch(e){$('status').textContent=e.message;}};}
  await refresh();setInterval(refresh,1000);
})().catch(e=>$('status').textContent=e.message);
$('go').onclick=async()=>{try{await send('toggle');await refresh();}catch(e){$('status').textContent=e.message;}};
$('clear').onclick=async()=>{try{await send('clear-page');await refresh();}catch(e){$('status').textContent=e.message;}};
$('settings').onclick=()=>chrome.runtime.openOptionsPage();

$('diagnose').onclick=async()=>{try{await send('diagnose');window.close();}catch(e){$('status').textContent=e.message;}};

(async()=>{
 const [local,current]=await Promise.all([chrome.storage.local.get({readerServices:{}}),chrome.storage.sync.get({serviceId:'legacy'})]);
 const profiles=local.readerServices;const select=$('service');
 select.replaceChildren(...Object.entries(profiles).map(([id,p])=>new Option(p.name||id,id)));
 if(!select.options.length)select.add(new Option('当前服务（可在接口设置中管理）',current.serviceId));
 select.value=current.serviceId;
 select.onchange=async()=>{try{const p=profiles[select.value];if(!p)return;await chrome.storage.sync.set({serviceId:select.value,endpoint:p.endpoint,apiKey:p.apiKey,model:p.model,concurrency:p.concurrency??ReaderConfig.defaults.concurrency,minInterval:p.minInterval??ReaderConfig.defaults.minInterval});await refresh();}catch(e){$('status').textContent=e.message;}};
})().catch(e=>$('status').textContent=e.message);
$('selection').onclick=async()=>{try{await send('translate-selection');window.close();}catch(e){$('status').textContent=e.message;}};

$('imageOcr').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('ocr/index.html')}).then(()=>window.close()).catch(e=>$('status').textContent=e.message);

$('videoTranslate').onclick=async()=>{try{
 if(!tab?.id||!/^https?:/.test(tab.url||''))throw Error('请在视频所在网页打开');
 if(/(^|\.)(youtube|reddit)\.com$/.test(new URL(tab.url).hostname))await chrome.scripting.executeScript({target:{tabId:tab.id},world:'MAIN',files:['video-capture.js']});
 await chrome.scripting.executeScript({target:{tabId:tab.id},files:['video-rules.js','media-core.js','video-sources.js','video-reader.js']});
 await chrome.tabs.sendMessage(tab.id,{type:'video-open'},{frameId:0});window.close();
}catch(e){$('status').textContent=e.message;}};

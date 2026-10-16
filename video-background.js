// Video scopes are independent of article, selection and image generations.
const videoJobs=new Map();
chrome.runtime.onMessage.addListener((m,s,reply)=>{
 if(!['media-translate','media-cancel','media-youtube','media-fetch-subtitle'].includes(m.type))return;
 if(s.id!==chrome.runtime.id||!Number.isInteger(s.tab?.id)||!s.documentId||!Number.isSafeInteger(m.generation)||m.generation<0){reply({ok:false,error:'无效视频来源'});return;}
 const key=s.tab.id+':'+s.documentId;
 (async()=>{
 let scope=videoJobs.get(key);
 if(!scope||m.generation>scope.generation){scope?.controller.abort();scope={owner:key+':video',tabId:s.tab.id,generation:m.generation,format:'plain',controller:new AbortController()};videoJobs.set(key,scope);}
 if(m.generation<scope.generation)throw Error('已取消旧字幕任务');
 const signal=scope.controller.signal;signal.throwIfAborted();
 if(m.type==='media-cancel')return {ok:true};
 if(m.type==='media-translate'){
 if(!Array.isArray(m.items)||!m.items.length||m.items.length>4||m.items.some(x=>typeof x?.id!=='string'||x.id.length>22000||typeof x.text!=='string'||!x.text.trim())||m.items.reduce((n,x)=>n+x.text.length,0)>20000)throw Error('字幕批次无效');
 let context;
 if(m.context!==undefined){const c=m.context;
  if(!c||typeof c.title!=='string'||c.title.length>160||!['before','after'].every(k=>Array.isArray(c[k])&&c[k].length<=2&&c[k].every(v=>typeof v==='string'&&v.length<=300)))throw Error('字幕上下文无效');
  context={version:1,title:c.title,before:c.before,after:c.after,targets:m.items.map(x=>x.text)};
 }
 const texts=await translate(m.items.map((x,i)=>({id:String(i),text:x.text})),false,{...scope,subtitleContext:context,priority:m.priority==='current'?1:0});signal.throwIfAborted();return {ok:true,items:m.items.map((x,i)=>({id:x.id,text:texts[i]}))};
 }
  if(m.type==='media-youtube'){
    const host=new URL(s.url).hostname;if(!/(^|\.)youtube\.com$/.test(host))throw Error('仅支持 YouTube 页面');
    const prefs=await chrome.storage.sync.get({targetLang:'简体中文'});
    const target=({'简体中文':'zh-Hans','繁體中文':'zh-Hant','English':'en','日本語':'ja','한국어':'ko','Français':'fr','Deutsch':'de','Español':'es'})[prefs.targetLang]||'';
    const results=await chrome.scripting.executeScript({target:{tabId:s.tab.id,frameIds:[s.frameId??0]},world:'MAIN',args:[Number.isInteger(m.trackIndex)?m.trackIndex:null,m.videoId||'',target,typeof m.trackLanguage==='string'?m.trackLanguage:''],func:async(index,expectedId,target,expectedLanguage)=>{
      // Only reads the current player's metadata and its own subtitle URL; no page hooks.
      const player=document.querySelector('#movie_player');let data;
      try{data=player?.getPlayerResponse?.();}catch{}
      data=data||globalThis.ytInitialPlayerResponse;
      const videoId=data?.videoDetails?.videoId||'';
      const pageId=new URL(location.href).searchParams.get('v')||location.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
      if(pageId&&videoId!==pageId)return {error:'播放器正在切换视频，请稍后刷新字幕'};
      if(!videoId||(expectedId&&videoId!==expectedId))return {error:'视频已变化，请重新选择视频'};
      const tracks=data?.captions?.playerCaptionsTracklistRenderer?.captionTracks||[];
      let selected;try{selected=player?.getOption?.('captions','track');}catch{}
      const audio=data?.captions?.playerCaptionsTracklistRenderer?.audioTracks||[];
      const defaultIndex=audio.find(t=>t.hasDefaultTrack)?.defaultCaptionTrackIndex??audio[0]?.defaultCaptionTrackIndex;
      const selectedIndex=tracks.findIndex(t=>selected?.vssId?t.vssId===selected.vssId:selected?.languageCode&&t.languageCode===selected.languageCode);
      const preferredIndex=selectedIndex>=0?selectedIndex:Number.isInteger(defaultIndex)?defaultIndex:Math.max(0,tracks.findIndex(t=>t.kind==='asr'));
      if(index===null)return {videoId,preferredIndex,tracks:tracks.slice(0,100).map((t,i)=>({index:i,label:t.name?.simpleText||t.name?.runs?.map(x=>x.text).join('')||t.languageCode,lang:t.languageCode,auto:t.kind==='asr',targetHuman:t.kind!=='asr'&&!!target&&(t.languageCode===target||target==='zh-Hans'&&t.languageCode==='zh-CN'||target==='zh-Hant'&&t.languageCode==='zh-TW')}))};
      const track=tracks[index];if(!track)return {error:'字幕轨道不可用，请先打开播放器字幕，再重新选择'};
      if(expectedLanguage&&track.languageCode!==expectedLanguage)return {error:'字幕轨道已变化，请刷新字幕'};
      const url=new URL(track.baseUrl);if(!/(^|\.)youtube\.com$/.test(url.hostname)||url.protocol!=='https:')return {error:'字幕地址不受支持'};
      const original=url.toString();url.searchParams.set('fmt','json3');
      const urls=[...new Set([url.toString(),original])],deadline=AbortSignal.timeout(15000);
      try{for(const candidate of urls){
        const response=await fetch(candidate,{credentials:'same-origin',signal:deadline});if(!response.ok)throw Error('字幕读取失败：HTTP '+response.status);
        if(Number(response.headers.get('content-length'))>2*1024*1024)throw Error('字幕超过 2 MiB');
        const reader=response.body?.getReader();if(!reader)continue;let size=0,text='';const decoder=new TextDecoder();
        try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024)throw Error('字幕超过 2 MiB');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
        // Keep the signed player URL intact as a fallback when changing fmt
        // returns an empty body. Never manufacture missing authorization tokens.
        if(text.trim())return {videoId,text};
      }return {error:'字幕响应为空，等待播放器 CC 或原始字幕资源'};
      }catch(e){return {error:e.message};}
    }});
    // Read-only acquisition can finish after a live-caption fallback starts.
    // The content owner validates its acquisition revision before promotion.
    const result=results[0]?.result;if(!result||result.error)throw Error(result?.error||'无法获取视频字幕');return {ok:true,...result};
  }

 if(m.type==='media-fetch-subtitle'){
 const url=new URL(m.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('不支持的字幕地址');
 const fetchSignal=AbortSignal.any([signal,AbortSignal.timeout(15000)]);
 const response=await fetch(url,{signal:fetchSignal,credentials:'omit'});
 return {ok:true,text:new TextDecoder().decode(await boundedBytes(response,fetchSignal,2*1024*1024))};
 }
 })().then(reply,e=>reply({ok:false,error:e.message}));return true;
});
chrome.tabs.onRemoved.addListener(tabId=>{for(const [key,scope]of videoJobs)if(scope.tabId===tabId){scope.controller.abort();videoJobs.delete(key);}});
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(change.status==='loading')for(const [key,scope]of videoJobs)if(scope.tabId===tabId){scope.controller.abort();videoJobs.delete(key);}});
async function boundedBytes(response,signal,maxBytes){
  if(!response.ok)throw Error('读取失败：HTTP '+response.status);
  if(Number(response.headers.get('content-length'))>maxBytes)throw Error('文件超过大小限制');
  const reader=response.body?.getReader();if(!reader)throw Error('响应为空');const chunks=[];let size=0;
  try{while(true){signal.throwIfAborted();const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw Error('文件超过大小限制');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const result=new Uint8Array(size);let offset=0;for(const value of chunks){result.set(value,offset);offset+=value.length;}return result;
}

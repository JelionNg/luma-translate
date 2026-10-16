(()=>{
 if(globalThis.ReaderVideo)return;
 let generation=Date.now(),active=false,video,host,overlay,timer,track,route='',sourceKey='',cues=[],cache=new Map(),failed=new Set(),tracks=[],youtubeId='',requestController,oldMode=null,follow=true,mode='dual',lastTrackRead=0,lastCC=true,bindingController,selectedSrc='';
 let liveCaption=null,visibleHistory=[],visibleDisplay=null,captionSource=null,readRevision=0,wakeTimer,trackController;
 const lanes=new Set(),inflight=new Set();
 function wake(){if(wakeTimer||!active)return;wakeTimer=setTimeout(()=>{wakeTimer=null;run(tick);},0);}
 const nativeOwned=new WeakSet();let fullscreenTrack=null;
 const query=(selector,root=document)=>{const found=[...root.querySelectorAll(selector)];for(const el of root.querySelectorAll('*'))if(el.shadowRoot)found.push(...query(selector,el.shadowRoot));return found;};
 const el=id=>host?.shadowRoot?.getElementById(id);
 const status=text=>{if(el('status'))el('status').textContent=text;};
 let contextLost=false;
 const lifecycle=new AbortController();
 function loseContext(){
  if(contextLost)return;contextLost=true;
  try{close();}finally{lifecycle.abort();clearTimeout(wakeTimer);clearInterval(timer);clearInterval(launcherTimer);cancelAnimationFrame(launcherFrame);requestController?.abort();bindingController?.abort();trackController?.abort();host?.remove();overlay?.remove();launcher?.remove();host=overlay=video=launcher=launcherVideo=null;launcherRoots.clear();}
 }
 function contextAvailable(){
  if(contextLost)return false;
  try{if(chrome.runtime?.id)return true;}catch{}
  loseContext();return false;
 }
 const send=async m=>{
  if(!contextAvailable())throw Error('扩展已更新，请刷新网页');
  try{const r=await chrome.runtime.sendMessage({...m,generation});if(!r?.ok)throw Error(r?.error||'字幕请求失败');return r;}
  catch(e){if(/Extension context invalidated/i.test(e?.message||'')||!contextAvailable())loseContext();throw e;}
 };
 const run=operation=>{Promise.resolve().then(()=>{if(contextAvailable())return operation();}).catch(e=>{if(/Extension context invalidated/i.test(e?.message||'')){loseContext();return;}if(contextAvailable())status(e.message);});};
 let exportJob=null;
 function stopExport(message='已取消全文翻译'){
  if(!exportJob)return;exportJob=null;
  if(el('export'))el('export').textContent='翻译全文 · 下载 TXT';
  if(el('export-status'))el('export-status').textContent=message;
 }
 async function exportTranscript(){
  if(exportJob){stopExport();return;}
  if(!cues.length||sourceKey.startsWith('visible:')){
   el('export-status').textContent='尚未取得字幕时间轴，只有画面中的当前字幕，无法导出全文。';return;
  }
  const snapshot=utteranceView(cues),token=generation,title=document.title;
  const job={};exportJob=job;el('export').textContent='取消全文翻译';
  const valid=()=>active&&exportJob===job&&generation===token;
  const results=new Map();
  try{
   for(let i=0;i<snapshot.length;){
    if(!valid())return;
    const cue=snapshot[i];
    if(cache.has(cue.id)){results.set(cue.id,cache.get(cue.id));i++;}
    else if(inflight.has(cue.id)){
     await new Promise(resolve=>setTimeout(resolve,150));continue;
    }else{
     const group=[];let chars=0;
     while(i<snapshot.length&&group.length<4){
      const next=snapshot[i];if(cache.has(next.id)||inflight.has(next.id)||chars+next.text.length>20000)break;
      group.push(next);chars+=next.text.length;i++;
     }
     if(!group.length)throw Error('字幕段落过长，无法导出');
     {
      // Export must not mark playback cues in-flight: urgent playback may overtake this batch.
      const response=await translateCues(group,'export');
      if(!valid())return;
      for(const c of group){const translated=response.items.find(x=>x.id===c.id)?.text;if(typeof translated!=='string'||!translated.trim())throw Error('字幕译文不完整');cache.set(c.id,translated);results.set(c.id,translated);}
      render();
     }
    }
    if(valid())el('export-status').textContent=`全文翻译 ${results.size} / ${snapshot.length}`;
   }
   if(!valid())return;
   const stamp=value=>{const ms=Math.max(0,Math.round(value*1000)),n=Math.floor(ms/1000);return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,'0')).join(':')+'.'+String(ms%1000).padStart(3,'0');};
   const text=title+'\n\n'+snapshot.map(c=>`[${stamp(c.start)} – ${stamp(c.end)}]\n${c.text}\n${results.get(c.id)}`).join('\n\n')+'\n';
   const url=URL.createObjectURL(new Blob(['\uFEFF',text],{type:'text/plain;charset=utf-8'}));
   const link=document.createElement('a');link.href=url;link.download=(title.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100)||'视频字幕')+'.txt';link.hidden=true;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   stopExport(`已导出 ${snapshot.length} 条字幕（原文 + 译文）`);
  }catch(error){if(valid())stopExport('导出未完成：'+error.message+'；可再次点击继续。');}
 }
 function invalidate(){stopExport();generation++;lanes.clear();inflight.clear();if(contextLost)return;if(active)postMessage({channel:'reader-caption-control',enabled:true,epoch:generation},location.origin);void send({type:'media-cancel'}).catch(()=>{});}
 function restore(){trackController?.abort();liveCaption=null;visibleHistory=[];visibleDisplay=null;if(track&&oldMode!==null&&track.mode==='hidden')track.mode=oldMode;track=null;oldMode=null;if(fullscreenTrack){fullscreenTrack.mode='disabled';while(fullscreenTrack.cues?.length)fullscreenTrack.removeCue(fullscreenTrack.cues[0]);fullscreenTrack=null;}}
 function close(){readRevision++;clearTimeout(wakeTimer);wakeTimer=null;active=false;invalidate();requestController?.abort();clearInterval(timer);bindingController?.abort();restore();host?.remove();overlay?.remove();host=overlay=video=null;cues=[];cache.clear();utteranceResults.clear();failed.clear();postMessage({channel:'reader-caption-control',enabled:false},location.origin);}
 function ccEnabled(){
  if(!follow)return true;
  if(/(^|\.)youtube\.com$/.test(location.hostname)){const button=document.querySelector('.ytp-subtitles-button');return button?.getAttribute('aria-pressed')==='true';}
  const playerCC=ReaderVideoSources.captionsEnabled(video);
  if(typeof playerCC==='boolean')return playerCC;
  if(track?.mode==='showing')return true;
  // A disabled native track is not proof that Reddit's custom renderer is off.
  if(track&&playerCC===undefined)return track.mode!=='disabled';
  const root=video?.getRootNode();const button=root?.querySelector?.('[aria-label="Toggle captions"]');
  return button?.hasAttribute('aria-pressed')?button.getAttribute('aria-pressed')==='true':true;
 }
 function setCues(next,key){if(key!==sourceKey){invalidate();sourceKey=key;cache.clear();utteranceResults.clear();failed.clear();}cues=next;utteranceIdentities.clear();let previous=null,utterance;
 for(const cue of cues){if(!previous||previous.text!==cue.text||cue.start>previous.end+.02)utterance=JSON.stringify([sourceKey,cue.start,cue.text]);utteranceIdentities.set(cue.id,utterance);previous=cue;}
 const ids=new Set(cues.map(c=>c.id));for(const id of cache.keys())if(!ids.has(id))cache.delete(id);for(const id of failed)if(!ids.has(id))failed.delete(id);}
 function readTrack(){if(!track||track.mode==='disabled')return;const next=ReaderMediaCore.normalize(Array.from(track.cues||[],c=>({start:c.startTime,end:c.endTime,text:c.text||''})));if(next.length)setCues(next,sourceKey);}
 function syncNative(){if(!fullscreenTrack||!video)return;while(fullscreenTrack.cues?.length)fullscreenTrack.removeCue(fullscreenTrack.cues[0]);for(const c of ReaderMediaCore.windowAt(cues,video.currentTime,35)){const t=cache.get(c.id);if(track?.mode==='showing'){if(t)fullscreenTrack.addCue(new VTTCue(c.start,c.end,t));}else fullscreenTrack.addCue(new VTTCue(c.start,c.end,mode==='translation'&&t?t:c.text+(t?'\n'+t:'')));}}
 function render(){
  if(!contextAvailable()||!active||!video||!overlay)return;
  const full=document.fullscreenElement,container=full&&full!==video?full:document.body;if(overlay.parentNode!==container)container.append(overlay);if(host.parentNode!==container)container.append(host);
  const box=video.getBoundingClientRect(),show=ccEnabled();overlay.hidden=!show||full===video||box.bottom<=0||box.top>=innerHeight;
  overlay.style.cssText=`position:fixed;z-index:2147483646;pointer-events:none;text-align:center;left:${box.left+box.width*.07}px;bottom:${Math.max(innerHeight-box.bottom+64,0)}px;transition:bottom 120ms ease-out;width:${box.width*.86}px;font-size:${Math.max(14,Math.min(30,box.width/32))}px`;
  const live=utteranceView(ReaderMediaCore.windowAt(cues,video.currentTime,0)),source=live.map(c=>c.text).join('\n');
  let translated=live.map(c=>utteranceResults.get(utteranceKey(c))||cache.get(c.id)||'').join('\n');
  if(sourceKey.startsWith('visible:')){
   const now=performance.now();
   const ready=[...visibleHistory].reverse().find(c=>cache.has(c.id)&&now-c.lastSeen<4000);
   if(ready&&(!visibleDisplay||ready.order>=visibleDisplay.order)&&ready.id!==visibleDisplay?.id)visibleDisplay={id:ready.id,order:ready.order,text:cache.get(ready.id),shown:now};
   // Bridge rolling CC replacements and brief DOM gaps, but bound stale output.
   const last=visibleHistory.at(-1);
   translated=visibleDisplay&&last&&now-last.lastSeen<1800&&(now-visibleDisplay.shown<1400||ready?.id===visibleDisplay.id)?visibleDisplay.text:'';
  }
  // Native/site captions remain visible while following CC; do not obscure or mutate them.
  const redditCC=ReaderVideoSources.captionsEnabled(video);
  const redditAnchor=redditCC!==undefined?ReaderVideoSources.redditCaptionBounds(video,source):null;
  const customCaptions=redditCC===true||!!redditAnchor||(redditCC===null&&follow);
  const nativeVisible=customCaptions||sourceKey.startsWith('visible:')||track?.mode==='showing'||(/(^|\.)youtube\.com$/.test(location.hostname)&&follow);
  overlay.shadowRoot.getElementById('source').textContent=nativeVisible?'':mode==='translation'&&translated?'':source;
  overlay.shadowRoot.getElementById('target').textContent=translated.replace(/\s*\n\s*/g,' ').trim();
  overlay.shadowRoot.querySelector('section').hidden=!translated&&(!source||nativeVisible);
  const anchor=nativeVisible?(redditAnchor||captionSource?.bounds()):null;
  const section=overlay.shadowRoot.querySelector('section');
  const height=section.hidden?0:section.getBoundingClientRect().height;
  const desired=anchor&&anchor.top>=box.top&&anchor.top<box.bottom?anchor.top-8:box.bottom-(customCaptions?Math.max(110,box.height*.22):64);
  const bottom=Math.max(box.top+height+8,Math.min(box.bottom-8,desired));
  overlay.style.bottom=(innerHeight-bottom)+'px';

  if(full===video){if(!fullscreenTrack){fullscreenTrack=video.addTextTrack('subtitles','双语阅读器','');nativeOwned.add(fullscreenTrack);}syncNative();fullscreenTrack.mode=show?'showing':'disabled';}else if(fullscreenTrack)fullscreenTrack.mode='disabled';
 }
 function readVisibleCaption(){
  if((track?.cues?.length)||!captionSource||!ccEnabled()||(cues.length&&!sourceKey.startsWith('visible:')))return;
  const text=captionSource.read();
  if(!text&&!sourceKey.startsWith('visible:'))return;
  const now=video.currentTime,wall=performance.now();
  visibleHistory=visibleHistory.filter(c=>wall-c.lastSeen<6000).slice(-11);
  if(text){
   if(!liveCaption||liveCaption.text!==text||now<liveCaption.start||now>liveCaption.end+2){
    // Coalesce an unsent rolling prefix. In-flight/completed revisions retain
    // identity until the bounded history expires, so their results remain usable.
    if(liveCaption&&text.startsWith(liveCaption.text)&&!inflight.has(liveCaption.id)&&!cache.has(liveCaption.id))visibleHistory=visibleHistory.filter(c=>c!==liveCaption);
    liveCaption=ReaderMediaCore.normalize([{start:now,end:now+2,text}])[0];
    liveCaption.order=wall;visibleHistory.push(liveCaption);
   }else liveCaption.end=now+2;
   liveCaption.lastSeen=wall;
  }else liveCaption=null;
  setCues(visibleHistory,'visible:'+captionSource.id+':'+(youtubeId||route));status('跟随播放器当前字幕');
 }
 async function tick(){
  if(!active||!video)return;
  if(!contextAvailable())return;
  if(!video.isConnected||route!==location.href||(video.currentSrc&&video.currentSrc!==selectedSrc)){await bind();return;}
  if(track&&performance.now()-lastTrackRead>1000){lastTrackRead=performance.now();try{readTrack();}catch(e){status(e.message);}}
  readVisibleCaption();const cc=ccEnabled();if(cc!==lastCC){lastCC=cc;invalidate();}render();if(!cc){status('已暂停 · 开启 CC 后继续');return;}if(!cues.length)return;
  const visible=sourceKey.startsWith('visible:'),now=video.currentTime;
  const pending=c=>!cache.has(c.id)&&!failed.has(c.id)&&!inflight.has(c.id);
  const current=visible?(liveCaption?[liveCaption]:[]):ReaderMediaCore.windowAt(cues,now,0);
  dispatch('current',current.filter(pending),1);
  if(!visible)dispatch('prefetch',ReaderMediaCore.windowAt(cues,now,Math.min(60,25*Math.max(.5,video.playbackRate||1))).filter(c=>c.start>now&&pending(c)),4);
  if(!lanes.size)status(failed.size?'部分字幕失败，可重试':visible?'当前字幕后备 · 无法提前预取':'时间轴预取 · 已就绪');
 }
 function subtitleContext(group){
  const ids=new Set(group.map(c=>c.id)),first=cues.findIndex(c=>c.id===group[0].id),last=cues.findIndex(c=>c.id===group.at(-1).id);
  const compact=list=>list.filter(c=>!ids.has(c.id)).map(c=>c.text.slice(0,180));
  const neighbors=ReaderMediaCore.contextWindow(cues,first,last);
  return {title:document.title.slice(0,100),before:compact(neighbors.before),after:sourceKey.startsWith('visible:')?[]:compact(neighbors.after)};
 }
 // Translation ownership is separate from individual timing slices. Preserve all cues.
 const utteranceResults=new Map(),utterancePending=new Map(),utteranceIdentities=new Map();
 function utteranceKey(cue){return utteranceIdentities.get(cue.id)||JSON.stringify([sourceKey,cue.start,cue.text]);}
 function utteranceView(list){
  const entries=new Map();
  for(const cue of list){
   const key=utteranceKey(cue),existing=entries.get(key);
   if(existing){existing.start=Math.min(existing.start,cue.start);existing.end=Math.max(existing.end,cue.end);}
   else entries.set(key,{...cue});
  }
  return [...entries.values()];
 }
 async function translateCues(group,lane){
  const token=generation,owned=[],promises=[];
  for(const cue of group){
   const key=utteranceKey(cue),flight=token+':'+key;
   if(utteranceResults.has(key)){promises.push(Promise.resolve(utteranceResults.get(key)));continue;}
   if(!utterancePending.has(flight)){
    let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});
    utterancePending.set(flight,promise);owned.push({key,flight,cue,resolve,reject});
   }
   promises.push(utterancePending.get(flight));
  }
  if(owned.length)void(async()=>{
   try{
    const targets=owned.map(x=>x.cue);
    const response=await send({type:'media-translate',priority:lane,context:subtitleContext(targets),items:targets.map(c=>({id:c.id,text:c.text}))});
    if(token!==generation)throw Error('已取消旧字幕任务');
    for(const item of owned){const text=response.items.find(x=>x.id===item.cue.id)?.text;if(typeof text!=='string'||!text.trim())throw Error('字幕译文不完整');}
    for(const item of owned){const text=response.items.find(x=>x.id===item.cue.id).text;utteranceResults.set(item.key,text);item.resolve(text);}
   }catch(error){owned.forEach(x=>x.reject(error));}
   finally{owned.forEach(x=>utterancePending.delete(x.flight));}
  })();
  const texts=await Promise.all(promises);return {items:group.map((c,i)=>({id:c.id,text:texts[i]}))};
 }
 function dispatch(lane,candidates,max){
  if(lanes.has(lane)||!candidates.length)return;
  const group=[];let chars=0;for(const c of candidates){if(group.length===max||chars+c.text.length>20000)break;group.push(c);chars+=c.text.length;}
  if(!group.length)return;
  const token=generation;lanes.add(lane);group.forEach(c=>inflight.add(c.id));status('正在翻译附近字幕…');
  void (async()=>{
   try{const r=await translateCues(group,lane);if(token!==generation)return;
    const current=new Set(cues.map(c=>c.id));for(const item of r.items)if(current.has(item.id)&&group.some(c=>c.id===item.id))cache.set(item.id,item.text);render();
   }catch(e){if(token===generation){group.forEach(c=>failed.add(c.id));status(e.message);}}
   finally{if(token===generation){lanes.delete(lane);group.forEach(c=>inflight.delete(c.id));wake();}}
  })();
 }

 async function selectTrack(allowFallback=true){
  invalidate();restore();cues=[];cache.clear();utteranceResults.clear();failed.clear();const item=tracks[Number(el('track').value)],revision=++readRevision;if(!item)return;
  sourceKey=item.key;status('正在读取字幕…');
  try{if(item.track){track=item.track;oldMode=track.mode;if(!follow&&track.mode==='disabled')track.mode='hidden';trackController=new AbortController();track.addEventListener('cuechange',()=>{if(active)run(()=>{readTrack();wake();});},{signal:trackController.signal});readTrack();if(!cues.length&&item.src){const r=await send({type:'media-fetch-subtitle',url:item.src});if(revision!==readRevision||!active)return;setCues(ReaderMediaCore.parse(r.text),item.key);}}
   else{const r=await send({type:'media-youtube',trackIndex:item.index,trackLanguage:item.lang,videoId:youtubeId});if(revision!==readRevision||!active)return;setCues(ReaderMediaCore.parse(r.text),item.key);if(item.targetHuman)for(const c of cues)cache.set(c.id,c.text);}
   status(cues.length?'已读取 '+cues.length+' 条字幕':'等待 CC 加载字幕');run(tick);
  }catch(e){if(revision===readRevision&&active){
    // An unavailable optional human track must not strand the working source.
    const fallback=allowFallback&&item.targetHuman?tracks.findIndex(t=>!t.targetHuman&&t.preferred):-1;
    const fallbackIndex=fallback>=0?fallback:allowFallback&&item.targetHuman?tracks.findIndex(t=>!t.targetHuman):-1;
    if(fallbackIndex>=0){el('track').value=String(fallbackIndex);await selectTrack(false);return;}
    status(e.message+'；可切换 CC 后重试');
   }}
 }
 async function discover(){
  const revision=readRevision;let preferredKey='';tracks=[];for(const t of video.textTracks)if(['subtitles','captions'].includes(t.kind)&&!nativeOwned.has(t)){const node=[...video.querySelectorAll('track')].find(n=>n.track===t);tracks.push({track:t,src:node?.src,label:t.label||t.language||'字幕',key:'native:'+t.language+':'+(node?.src||t.label)});}
  if(/(^|\.)youtube\.com$/.test(location.hostname))try{const r=await send({type:'media-youtube'});if(revision!==readRevision||!active)return;youtubeId=r.videoId;preferredKey='youtube:'+r.videoId+':'+r.preferredIndex;tracks.push(...r.tracks.map(t=>({...t,preferred:t.index===r.preferredIndex,label:t.label+(t.auto?' · 自动字幕':''),key:'youtube:'+r.videoId+':'+t.index})));}catch(e){status(e.message);}
  if(revision!==readRevision||!active)return;el('track').replaceChildren(...tracks.map((t,i)=>new Option(t.label,String(i))));
  if(tracks.length){let showing=tracks.findIndex(t=>t.targetHuman);if(showing<0)showing=tracks.findIndex(t=>t.track?.mode==='showing');if(showing<0)showing=tracks.findIndex(t=>t.key===preferredKey);el('track').value=String(Math.max(0,showing));await selectTrack();}else{el('track').add(new Option('等待播放器字幕',''));status('请开启 CC；若已开启，可关开一次以读取字幕');}
 }
 async function bind(chosen){
  readRevision++;bindingController?.abort();bindingController=new AbortController();
  invalidate();restore();cues=[];cache.clear();utteranceResults.clear();failed.clear();sourceKey='';youtubeId='';
  const videos=query('video').filter(v=>v.getBoundingClientRect().width>80&&v.getBoundingClientRect().height>40);videos.sort((a,b)=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return (y.bottom>0&&y.top<innerHeight?1:0)-(x.bottom>0&&x.top<innerHeight?1:0)||y.width*y.height-x.width*x.height;});
  if(overlay){overlay.hidden=true;overlay.shadowRoot.getElementById('source').textContent='';overlay.shadowRoot.getElementById('target').textContent='';}
  video=chosen||videos[0];if(!video){status('未发现可见视频，请播放后重新打开');return;}
  selectedSrc=video.currentSrc;route=location.href;captionSource=ReaderVideoSources.forVideo(video);captionSource?.observe(wake,bindingController.signal);
  el('video').replaceChildren(...videos.map((v,i)=>new Option('视频 '+(i+1),String(i))));el('video').value=String(videos.indexOf(video));el('video').onchange=()=>run(()=>bind(videos[Number(el('video').value)]));
  video.textTracks.addEventListener('addtrack',e=>{if(active&&video&&!nativeOwned.has(e.track)&&!tracks.length)run(discover);},{signal:bindingController.signal});
  video.textTracks.addEventListener('change',()=>{const showing=[...video.textTracks].find(t=>t.mode==='showing'&&!nativeOwned.has(t));if(showing&&showing!==track){const i=tracks.findIndex(t=>t.track===showing);if(i>=0){el('track').value=String(i);run(selectTrack);}else run(discover);}},{signal:bindingController.signal});
  video.addEventListener('seeking',()=>{invalidate();failed.clear();if(sourceKey.startsWith('visible:')){liveCaption=null;visibleHistory=[];visibleDisplay=null;cues=[];cache.clear();render();}run(tick);},{signal:bindingController.signal});
  video.addEventListener('seeked',wake,{signal:bindingController.signal});
  video.addEventListener('ratechange',wake,{signal:bindingController.signal});
  video.addEventListener('timeupdate',()=>{render();wake();},{signal:bindingController.signal});
  await discover();render();
 }
 function open(chosen){
  if(!contextAvailable())return;close();if(contextLost)return;active=true;requestController=new AbortController();const signal=requestController.signal;
  host=document.createElement('div');host.dataset.readerUi='video';host.style.cssText='position:fixed;right:16px;top:16px;z-index:2147483647';
  host.attachShadow({mode:'open'}).innerHTML=`<style>section{width:250px;padding:14px;border-radius:14px;background:#fffffff5;box-shadow:0 6px 30px #201b2e30;color:#211b2d;font:13px/1.5 system-ui}header{display:flex;justify-content:space-between}select{width:100%;margin:7px 0;padding:6px;border:1px solid #ddd;border-radius:7px}button{border:0;border-radius:7px;padding:5px 9px;cursor:pointer}p{font-size:12px;overflow-wrap:anywhere}label{display:block;margin:7px 0}footer{display:flex;gap:6px}</style><section><header><b>视频字幕</b><button id="close">关闭</button></header><select id="video" aria-label="视频"></select><select id="track" aria-label="字幕语言"></select><select id="mode" aria-label="字幕显示"><option value="dual">原文 + 译文</option><option value="translation">译文（原播放器 CC 独立控制）</option></select><label><input id="follow" type="checkbox" checked>跟随播放器 CC</label><p id="status" role="status">正在读取字幕…</p><footer><button id="refresh">刷新字幕</button><button id="retry">重试</button></footer><button id="export" style="width:100%;margin-top:10px">翻译全文 · 下载 TXT</button><p id="export-status" role="status">导出已获取的字幕；尚未加载的分片不包含在内。</p></section>`;
  overlay=document.createElement('div');overlay.dataset.readerUi='video-subtitle';overlay.attachShadow({mode:'open'}).innerHTML='<style>section{display:inline-block;width:max-content;padding:6px 12px;border-radius:7px;background:#080808cc;color:white;font:inherit;line-height:1.45;white-space:pre-line;overflow-wrap:anywhere;max-width:100%;box-sizing:border-box}#source{font-size:.85em;color:#eee}@media(prefers-reduced-motion:reduce){:host{transition:none!important}}[hidden]{display:none}</style><section hidden><div id="source"></div><div id="target"></div></section>';
  document.documentElement.append(host,overlay);el('export').onclick=()=>run(exportTranscript);el('close').onclick=close;el('refresh').onclick=()=>run(()=>bind(video));el('retry').onclick=()=>{failed.clear();if(!cues.length)run(tracks.length?selectTrack:discover);else run(tick);};el('track').onchange=()=>run(selectTrack);el('mode').value=mode;el('mode').onchange=()=>{mode=el('mode').value;render();};follow=true;el('follow').onchange=()=>{follow=el('follow').checked;run(selectTrack);};
  window.addEventListener('message',e=>{
   const d=e.data;if(!active||e.source!==window||d?.channel!=='reader-caption-data'||d.route!==location.href||d.epoch!==generation||typeof d.text!=='string'||d.text.length>ReaderMediaCore.MAX_TEXT||!video)return;
   try{const resolved=ReaderVideoRules.resource(location.href,d.url);if(!resolved)return;
    const selected=tracks[Number(el('track').value)];
    if(resolved.language&&selected?.lang&&resolved.language!==selected.lang)return;
    if(resolved.rule.id==='youtube'&&cues.length&&sourceKey.startsWith('youtube:'))return;
    // A native selected track owns timing. Network fallback is only for a single visible player.
    if((track?.mode!=='disabled'&&track?.cues?.length)||query('video').filter(v=>{const r=v.getBoundingClientRect();return r.width>80&&r.bottom>0&&r.top<innerHeight;}).length!==1)return;
    const key='captured:'+resolved.key;
    const next=resolved.rule.format==='json'?ReaderMediaCore.normalize(ReaderVideoRules.mapJSON(JSON.parse(d.text),resolved.rule.mapping)):ReaderMediaCore.parse(d.text);
    if(!next.length)throw Error('字幕资源没有有效时间轴');
    setCues(key===sourceKey?ReaderVideoRules.merge(cues,next):next,key);status('已读取播放器字幕');run(tick);
   }catch(e){if(!cues.length)status(e.message+'；等待播放器当前字幕');}
  },{signal});
  document.addEventListener('fullscreenchange',render,{signal});window.addEventListener('resize',render,{signal});window.addEventListener('scroll',render,{capture:true,passive:true,signal});
  postMessage({channel:'reader-caption-control',enabled:true,epoch:generation},location.origin);timer=setInterval(()=>run(tick),500);run(()=>bind(chosen));
 }
 // One lightweight entry follows the visible/hovered player, including open
 // shadow roots. Geometry updates never scan the document on scroll.
 let launcher,launcherVideo,launcherFrame=0,launcherTimer,launcherDiscovered=false;const launcherRoots=new Set([document]);
 function positionLauncher(){
  launcherFrame=0;if(!contextAvailable())return;if(!launcher||!launcherVideo?.isConnected){if(launcher)launcher.hidden=true;return;}
  const box=launcherVideo.getBoundingClientRect(),full=document.fullscreenElement;
  launcher.hidden=box.width<160||box.height<90||box.bottom<=0||box.top>=innerHeight||box.right<=0||box.left>=innerWidth||full===launcherVideo;
  const parent=full&&full.contains(launcherVideo)?full:document.documentElement;
  if(launcher.parentNode!==parent)parent.append(launcher);
  launcher.style.left=Math.max(8,Math.min(innerWidth-112,box.right-112))+'px';
  launcher.style.top=Math.max(8,box.top+12)+'px';
  const on=active&&video===launcherVideo,button=launcher.shadowRoot.querySelector('button');
  button.textContent=on?'◈ 停止翻译':'◈ 翻译字幕';button.setAttribute('aria-pressed',String(on));
 }
 function queueLauncher(){if(contextLost)return;if(!launcherFrame)launcherFrame=requestAnimationFrame(positionLauncher);}
 function discoverLauncher(){
  if(!contextAvailable()||document.hidden)return;
  if(!launcherDiscovered){for(const v of query('video'))launcherRoots.add(v.getRootNode());launcherDiscovered=true;}
  for(const root of launcherRoots)if(root.host&&!root.host.isConnected)launcherRoots.delete(root);
  const videos=[...launcherRoots].flatMap(root=>[...root.querySelectorAll('video')]).filter(v=>{const b=v.getBoundingClientRect();return b.width>=160&&b.height>=90&&b.bottom>0&&b.top<innerHeight;});
  if(!videos.includes(launcherVideo))launcherVideo=videos.sort((a,b)=>b.getBoundingClientRect().width*b.getBoundingClientRect().height-a.getBoundingClientRect().width*a.getBoundingClientRect().height)[0];
  if(launcherVideo&&!launcher){
   launcher=document.createElement('div');launcher.dataset.readerUi='video-launcher';
   launcher.style.cssText='position:fixed;z-index:2147483647';
   launcher.attachShadow({mode:'open'}).innerHTML='<style>button{display:flex;align-items:center;justify-content:center;min-height:32px;padding:6px 11px;border:1px solid #ffffff38;border-radius:10px;background:#171722c9;color:#fff;box-shadow:0 3px 12px #0002;backdrop-filter:blur(12px);font:500 12px/1.4 system-ui;cursor:pointer}button:hover,button:focus-visible{background:#363044;outline:2px solid #c9b1ee}button[aria-pressed=true]{background:#58436ce8}</style><button type="button" aria-label="开启或关闭视频字幕翻译">◈ 翻译字幕</button>';
   launcher.shadowRoot.querySelector('button').onclick=()=>{if(active&&video===launcherVideo)close();else open(launcherVideo);positionLauncher();};
  }
  positionLauncher();
 }
 addEventListener('pointerover',e=>{const hovered=e.composedPath().find(n=>n instanceof HTMLVideoElement);if(hovered){launcherRoots.add(hovered.getRootNode());launcherVideo=hovered;discoverLauncher();}},{passive:true,signal:lifecycle.signal});
 addEventListener('scroll',queueLauncher,{capture:true,passive:true,signal:lifecycle.signal});addEventListener('resize',queueLauncher,{passive:true,signal:lifecycle.signal});document.addEventListener('fullscreenchange',queueLauncher,{signal:lifecycle.signal});
 launcherTimer=setInterval(discoverLauncher,1800);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',discoverLauncher,{once:true,signal:lifecycle.signal});else discoverLauncher();
 addEventListener('pagehide',()=>{clearInterval(launcherTimer);cancelAnimationFrame(launcherFrame);launcher?.remove();},{once:true});
 try{chrome.runtime.onMessage.addListener((m,s,reply)=>{if(m.type==='video-open'){open();reply({ok:true});}});
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='sync'&&active&&['targetLang','endpoint','model','apiKey','serviceId','glossary'].some(k=>changes[k]))close();});}catch(error){if(/Extension context invalidated/i.test(error?.message||''))loseContext();else throw error;}
 addEventListener('pagehide',close,{once:true});globalThis.ReaderVideo=Object.freeze({open,close});
})();

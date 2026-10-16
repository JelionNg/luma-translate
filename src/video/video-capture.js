// Observe resource completion without wrapping the page's fetch/XHR. Only a
// recognized caption URL gets an independent, bounded read (usually HTTP cached).
(()=>{
 if(globalThis.__readerCaptionCapture)return;globalThis.__readerCaptionCapture=true;
 const rule=ReaderVideoRules.resolve(location.href);if(!rule)return;const youtube=rule.id==='youtube';
 const fetchCaption=window.fetch.bind(window),limit=2*1024*1024;
 let enabled=false,epoch=0,session=null;const retained=new Map();
 const matches=url=>!!ReaderVideoRules.resource(location.href,url);
 // Reddit may fetch captions before translation is enabled. Observe the actual
 // successful response; never refetch signed/one-shot URLs or alter its body.
 if(rule.id==='reddit'){
  const original=window.fetch;let reading=0;
  window.fetch=function(...args){
   const result=Reflect.apply(original,this,args),route=location.href;
   let url;try{url=new URL(args[0] instanceof Request?args[0].url:String(args[0]),location.href).href;}catch{return result;}
   if(matches(url))void result.then(response=>{
    if(!response.ok||reading>=2||Number(response.headers.get('content-length'))>limit)return;
    let copy;try{copy=response.clone();}catch{return;}
    reading++;
    void(async()=>{
     const reader=copy.body?.getReader();if(!reader){reading--;return;}
     let expired=false;const timer=setTimeout(()=>{expired=true;void reader.cancel().catch(()=>{});},15000);
     let size=0,text='',finished=false;const decoder=new TextDecoder();
     try{
      while(true){const part=await reader.read();if(part.done){text+=decoder.decode();finished=true;break;}size+=part.value.byteLength;if(size>limit)break;text+=decoder.decode(part.value,{stream:true});}
      if(finished&&!expired&&text.trim()&&route===location.href){
       retained.set(url,{text,route,at:Date.now()});while(retained.size>2)retained.delete(retained.keys().next().value);
       if(session&&current(session))postMessage({channel:'reader-caption-data',url,text,route,epoch:session.epoch},location.origin);
      }
     }catch{}finally{clearTimeout(timer);void reader.cancel().catch(()=>{});reader.releaseLock();reading--;}
    })();
   },()=>{});
   return result;
  };
 }
 function stop(){if(!session)return;session.observer.disconnect();for(const controller of session.controllers)controller.abort();session.queue.length=0;session=null;}
 function current(s){return enabled&&session===s&&s.epoch===epoch&&s.route===location.href;}
 async function read(s,url){
  const controller=new AbortController();s.controllers.add(controller);
  const timeout=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetchCaption(url,{credentials:'same-origin',signal:controller.signal});
   if(!response.ok||Number(response.headers.get('content-length'))>limit)return;
   const reader=response.body?.getReader();if(!reader)return;
   let size=0,text='';const decoder=new TextDecoder();
   try{while(current(s)){const {done,value}=await reader.read();if(done){text+=decoder.decode();if(current(s)&&text.trim()){retained.set(url,{text,route:s.route,at:Date.now()});while(retained.size>2)retained.delete(retained.keys().next().value);}if(current(s))postMessage({channel:'reader-caption-data',url,text,route:s.route,epoch:s.epoch},location.origin);break;}size+=value.byteLength;if(size>limit)break;text+=decoder.decode(value,{stream:true});}}
   finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  }catch{/* Optional resource fallback; the original player's response is untouched. */}
  finally{clearTimeout(timeout);s.controllers.delete(controller);pump(s);}
 }
 function pump(s){while(current(s)&&s.controllers.size<2&&s.queue.length)void read(s,s.queue.shift());}
 function start(){
  const s={epoch,route:location.href,controllers:new Set(),seen:new Set(),queue:[],observer:null};
  s.observer=new PerformanceObserver(list=>{
   if(!current(s)){if(session===s)stop();return;}
   for(const entry of list.getEntries()){
    const url=entry.name;
    if(rule.id==='reddit'||!matches(url)||s.seen.has(url)||s.queue.length>=8)continue;
    // Mark before reading: our own resource completion must never trigger a loop.
    s.seen.add(url);if(s.seen.size>128)s.seen.delete(s.seen.values().next().value);
    s.queue.push(url);
   }
   pump(s);
  });
  session=s;s.observer.observe({type:'resource'});
  // Reuse only same-route caption bytes, not arbitrary historical resources.
  for(const [url,item]of retained){
   if(item.route!==s.route||Date.now()-item.at>120000){retained.delete(url);continue;}
   s.seen.add(url);postMessage({channel:'reader-caption-data',url,text:item.text,route:s.route,epoch:s.epoch},location.origin);
  }
  // A YouTube URL includes video identity. Reddit resource URLs do not prove
  // which visible player owns an old request, so historical replay stays off there.
  const id=new URL(location.href).searchParams.get('v')||location.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
  if(youtube&&id){
   const recent=performance.getEntriesByType('resource').filter(e=>matches(e.name)&&performance.now()-e.startTime<120000&&new URL(e.name).searchParams.get('v')===id).slice(-2);
   for(const e of recent)if(!s.seen.has(e.name)){s.seen.add(e.name);s.queue.push(e.name);}pump(s);
  }
 }
 addEventListener('message',e=>{
  const d=e.data;if(e.source!==window||d?.channel!=='reader-caption-control'||typeof d.enabled!=='boolean')return;
  if(d.enabled&&(!Number.isSafeInteger(d.epoch)||d.epoch<0))return;
  if(d.enabled&&enabled&&d.epoch===epoch&&session?.route===location.href)return;
  stop();enabled=d.enabled;epoch=d.epoch;if(enabled)start();
 });
})();

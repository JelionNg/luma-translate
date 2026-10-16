import '../image-recipe.js';
// Private extension document: no web-accessible resources or page message bridge.
let worker, active, idle;
const queue=[];let queueBytes=0;
function drain(){if(!active&&queue.length){const next=queue.shift();queueBytes-=next.cost;run(next.m,next.reply);}}
// Cache recognized facts, not URLs: a refetched changed image cannot reuse stale boxes.
const recognized=new Map();let cacheBytes=0;
const MAX_CACHE_BYTES=2*1024*1024,MAX_CACHE_ENTRIES=16,CACHE_TTL=10*60*1000;
function cached(key){const item=recognized.get(key);if(!item)return null;if(Date.now()-item.time>CACHE_TTL){recognized.delete(key);cacheBytes-=item.bytes;return null;}recognized.delete(key);recognized.set(key,item);return item.result;}
function remember(key,result){const bytes=JSON.stringify(result).length*2;if(bytes>MAX_CACHE_BYTES)return;
  const previous=recognized.get(key);if(previous)cacheBytes-=previous.bytes;recognized.delete(key);
  recognized.set(key,{result,bytes,time:Date.now()});cacheBytes+=bytes;
  while(recognized.size>MAX_CACHE_ENTRIES||cacheBytes>MAX_CACHE_BYTES){const first=recognized.keys().next().value;cacheBytes-=recognized.get(first).bytes;recognized.delete(first);}
}
function release(){worker?.terminate();worker=null;clearTimeout(idle);}
function finish(value){if(!active)return;const job=active;active=null;clearTimeout(job.timer);job.controller.abort();if(value.ok&&job.digest&&!value.cacheHit)remember(job.digest,value.result);job.reply({...value,elapsedMs:performance.now()-job.started});if(queue.length)queueMicrotask(drain);else idle=setTimeout(release,60000);}
chrome.runtime.onMessage.addListener((m,s,reply)=>{
  if(m.target!=='reader-image-engine'||s.id!==chrome.runtime.id||s.url!==chrome.runtime.getURL('background.js'))return;
  if(m.type==='stop'){
    const index=queue.findIndex(j=>j.m.id===m.id);if(index>=0){const [job]=queue.splice(index,1);queueBytes-=job.cost;job.reply({ok:false,error:'已取消图片识别'});}
    if(active?.id===m.id){release();finish({ok:false,error:'已取消图片识别'});}reply({ok:true});return;
  }
  if(m.type!=='recognize')return;
  if(active||queue.length){const cost=((m.url?.length||0)+(m.recipe?JSON.stringify(m.recipe).length:0))*2;if(queue.length>=12||queueBytes+cost>48*1024*1024){reply({ok:false,error:'图片识别队列已满，请稍后重试'});return;}queueBytes+=cost;queue.push({m,reply,cost});return true;}
  run(m,reply);return true;
});
function run(m,reply){
  clearTimeout(idle);const job={id:m.id,reply,started:performance.now(),controller:new AbortController()};active=job;
  job.timer=setTimeout(()=>{if(active===job){release();finish({ok:false,error:'图片识别超时，请重试'});}},120000);
  (async()=>{
    let totalBytes=0;
    async function read(urlString){
      const url=new URL(urlString);if(!['http:','https:','data:'].includes(url.protocol))throw Error('不支持的图片地址');
      const response=await fetch(url.href,{credentials:'omit',cache:'no-cache',signal:job.controller.signal});if(!response.ok)throw Error('无法读取图片（HTTP '+response.status+'）');
      const reader=response.body.getReader(),chunks=[];let size=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;totalBytes+=value.length;if(size>12*1024*1024||totalBytes>24*1024*1024)throw Error('图片超过读取预算');chunks.push(value);}}catch(e){await reader.cancel();throw e;}finally{reader.releaseLock();}return new Blob(chunks);
    }
    const blob=m.recipe?await ReaderImageRecipe.rebuild(m.recipe,read,job.controller.signal):await read(m.url),bytes=await blob.arrayBuffer();
    job.digest='ppocr-v6-small-curved-lines-v4:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(active!==job)return;
    const hit=cached(job.digest);if(hit){finish({ok:true,result:hit,cacheHit:true});return;}
    const bitmap=await createImageBitmap(blob);
    if(active!==job){bitmap.close();return;}
    if(bitmap.width*bitmap.height>20*1024*1024){bitmap.close();throw Error('图片超过 2000 万像素，请裁剪后识别');}
    if(!worker){const owned=worker=new Worker(new URL('./ocr-worker.js',import.meta.url),{type:'module'});
      worker.onmessage=({data})=>{if(worker!==owned||data.id!==active?.id||data.type==='progress')return;if(data.type==='result')finish({ok:true,result:data.result});else{release();finish({ok:false,error:data.error});}};
      worker.onerror=()=>{if(worker!==owned)return;release();finish({ok:false,error:'本地识别引擎加载失败，请检查模型文件'});};}
    worker.postMessage({type:'recognize',id:job.id,bitmap},[bitmap]);
  })().catch(e=>{if(active===job)finish({ok:false,error:e.message});});
}

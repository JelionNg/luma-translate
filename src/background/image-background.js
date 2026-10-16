importScripts('../image/image-recipe.js');
// Image jobs own cancellation independently of pages, selections and other images.
let imageDocumentCreation;
const imageJobs=new Map();
let imageTranslations=0;const imageTranslationQueue=[];
function translateImage(items,scope){return new Promise((resolve,reject)=>{
  const signal=scope.controller.signal;
  const entry={run:()=>{signal.removeEventListener('abort',cancel);imageTranslations++;translate(items,false,scope).then(resolve,reject).finally(()=>{imageTranslations--;pumpImages();});}};
  const cancel=()=>{const i=imageTranslationQueue.indexOf(entry);if(i>=0)imageTranslationQueue.splice(i,1);reject(signal.reason||Error('图片翻译已取消'));};
  if(signal.aborted){cancel();return;}signal.addEventListener('abort',cancel,{once:true});imageTranslationQueue.push(entry);pumpImages();
});}
function pumpImages(){while(imageTranslations<2&&imageTranslationQueue.length)imageTranslationQueue.shift().run();}
async function ensureImageDocument(){
  if(imageDocumentCreation)return imageDocumentCreation;
  imageDocumentCreation=(async()=>{const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[chrome.runtime.getURL('ocr/offscreen.html')]});if(!contexts.length)await chrome.offscreen.createDocument({url:'ocr/offscreen.html',reasons:['WORKERS'],justification:'Run local OCR in a dedicated worker for images selected by the user.'});})();
  try{await imageDocumentCreation;}finally{imageDocumentCreation=null;}
}
function imageOwner(s){return s.tab.id+':'+s.documentId;}
function stopImageJob(key){const job=imageJobs.get(key);if(!job)return;job.scope.controller.abort();imageJobs.delete(key);chrome.runtime.sendMessage({target:'reader-image-engine',type:'stop',id:job.engineId}).catch(()=>{});}
chrome.runtime.onMessage.addListener((m,s,reply)=>{
  if(!['reader-image-recognize','reader-image-translate','reader-image-stop','reader-image-release'].includes(m.type))return;
  if(s.id!==chrome.runtime.id||!Number.isInteger(s.tab?.id)||!s.documentId||typeof m.id!=='string'||m.id.length>80){reply({ok:false,error:'无效图片来源'});return;}
  const owner=imageOwner(s),key=owner+':'+m.id;
  if(m.type==='reader-image-stop'){stopImageJob(key);reply({ok:true});return;}
  if(m.type==='reader-image-release'){const job=imageJobs.get(key);if(job&&!job.pending)imageJobs.delete(key);reply({ok:true});return;}
  (async()=>{
    let job=imageJobs.get(key);
    if(!job){if([...imageJobs.values()].filter(j=>j.owner===owner).length>=12||imageJobs.size>=48)throw Error('图片任务已满，请关闭部分图片后重试');job={owner,engineId:crypto.randomUUID(),pending:0,scope:{format:'plain',owner:owner+':image',generation:0,tabId:s.tab.id,controller:new AbortController()}};imageJobs.set(key,job);}
    job.pending++;
    try{
      if(m.type==='reader-image-recognize'){
        let input;if(m.recipe){if(!['shonenjumpplus.com','manga.bilibili.com'].includes(new URL(s.url).hostname))throw Error('此页面未启用漫画重建');input={recipe:ReaderImageRecipe.parse(m.recipe)};}else{if(typeof m.url!=='string'||m.url.length>17*1024*1024)throw Error('无效图片请求');const url=new URL(m.url);if(!['http:','https:','data:'].includes(url.protocol))throw Error('此图片暂不支持直接读取');input={url:url.href};}
        await ensureImageDocument();job.scope.controller.signal.throwIfAborted();const result=await chrome.runtime.sendMessage({target:'reader-image-engine',type:'recognize',...input,id:job.engineId});job.scope.controller.signal.throwIfAborted();return result;
      }
      const items=m.items;if(!Array.isArray(items)||!items.length||items.length>4||items.some(x=>typeof x?.text!=='string'||!x.text.trim())||items.reduce((n,x)=>n+x.text.length,0)>20000)throw Error('无效图片翻译批次');
      const imageContext=imageTranslationContext(m.context);
      const texts=await translateImage(items,{...job.scope,imageContext});return {ok:true,items:items.map((x,i)=>({id:x.id,text:texts[i]}))};
    }finally{job.pending--;}
  })().then(reply,e=>reply({ok:false,error:e.message}));return true;
});
chrome.tabs.onRemoved.addListener(tabId=>{for(const [key,job]of imageJobs)if(job.scope.tabId===tabId)stopImageJob(key);});
chrome.tabs.onUpdated.addListener((tabId,change)=>{if(change.status==='loading')for(const [key,job]of imageJobs)if(job.scope.tabId===tabId)stopImageJob(key);});

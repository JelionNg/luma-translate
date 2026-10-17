// Dedicated PDF scopes cannot cancel web, image or subtitle jobs.
const pdfJobs=new Map();
chrome.runtime.onMessage.addListener((m,s,reply)=>{
 if(!['pdf-translate','pdf-cancel'].includes(m.type))return;
 if(s.id!==chrome.runtime.id||s.url!==chrome.runtime.getURL('src/pdf/index.html')||!s.documentId||!Number.isSafeInteger(m.generation)||m.generation<0){reply({ok:false,error:'无效 PDF 来源'});return;}
 const key=s.documentId;let scope=pdfJobs.get(key);
 if(!scope||m.generation>scope.generation){scope?.controller.abort();scope={generation:m.generation,owner:'pdf:'+key,tabId:s.tab?.id,format:'plain',controller:new AbortController()};pdfJobs.set(key,scope);}
 if(m.generation<scope.generation){reply({ok:false,error:'PDF 任务已取消'});return;}
 if(m.type==='pdf-cancel'){scope.controller.abort();reply({ok:true});return;}
 const items=m.items;
 if(!Array.isArray(items)||!items.length||items.length>4||items.some(x=>typeof x?.id!=='string'||typeof x.text!=='string'||!x.text.trim())||items.reduce((n,x)=>n+x.text.length,0)>20000){reply({ok:false,error:'PDF 段落批次无效'});return;}
 translate(items,false,scope).then(texts=>reply({ok:true,items:items.map((x,i)=>({id:x.id,text:texts[i]}))}),e=>reply({ok:false,error:e.message}));return true;
});
chrome.tabs.onRemoved.addListener(id=>{for(const [key,scope]of pdfJobs)if(scope.tabId===id){scope.controller.abort();pdfJobs.delete(key);}});

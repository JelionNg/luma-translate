// Dedicated PDF scopes cannot cancel web, image or subtitle jobs.
const pdfJobs=new Map(),pdfAlignJobs=new Map();
chrome.runtime.onMessage.addListener((m,s,reply)=>{
 if(!['pdf-translate','pdf-cancel','pdf-align','pdf-align-cancel'].includes(m.type))return;
 if(s.id!==chrome.runtime.id||s.url!==chrome.runtime.getURL('src/pdf/index.html')||!s.documentId||!Number.isSafeInteger(m.generation)||m.generation<0){reply({ok:false,error:'无效 PDF 来源'});return;}
 const key=s.documentId;
 if(m.type==='pdf-align-cancel'){pdfAlignJobs.get(key)?.controller.abort();pdfAlignJobs.delete(key);reply({ok:true});return;}
 if(m.type==='pdf-align'){
  const q=m.query;
  if(!q||['source','target','selected'].some(k=>typeof q[k]!=='string')||q.source.length>12000||q.target.length>12000||q.selected.length<2||q.selected.length>1500||!q.target.includes(q.selected)||JSON.stringify(q).length>20000){reply({ok:false,error:'无效对齐内容'});return;}
  pdfAlignJobs.get(key)?.controller.abort();
  const scope={generation:m.generation,owner:'pdf-align:'+key,tabId:s.tab?.id,format:'pdf-align',controller:new AbortController()};
  pdfAlignJobs.set(key,scope);idleAlignmentControllers.add(scope.controller);
  translate([{id:'0',text:JSON.stringify(q)}],false,scope).then(texts=>{
   const excerpt=texts[0]?.trim();
   reply({ok:true,excerpt:excerpt&&excerpt!=='NONE'&&q.source.includes(excerpt)&&q.source.indexOf(excerpt)===q.source.lastIndexOf(excerpt)?excerpt:null});
  },()=>reply({ok:true,excerpt:null,retry:scope.controller.signal.aborted})).finally(()=>{idleAlignmentControllers.delete(scope.controller);if(pdfAlignJobs.get(key)===scope)pdfAlignJobs.delete(key);});return true;
 }
 let scope=pdfJobs.get(key);
 if(!scope||m.generation>scope.generation){scope?.controller.abort();scope={generation:m.generation,owner:'pdf:'+key,tabId:s.tab?.id,format:'pdf',controller:new AbortController()};pdfJobs.set(key,scope);}
 if(m.generation<scope.generation){reply({ok:false,error:'PDF 任务已取消'});return;}
 if(m.type==='pdf-cancel'){scope.controller.abort();reply({ok:true});return;}
 const items=m.items;
 if(!Array.isArray(items)||!items.length||items.length>4||items.some(x=>typeof x?.id!=='string'||typeof x.text!=='string'||!x.text.trim())||items.reduce((n,x)=>n+x.text.length,0)>20000){reply({ok:false,error:'PDF 段落批次无效'});return;}
 const context=m.context;
 if(context!==undefined&&(!context||typeof context!=='object'||['title','overview','section','before','after'].some(k=>typeof context[k]!=='string')||JSON.stringify(context).length>12000)){reply({ok:false,error:'PDF 上下文无效'});return;}
 translate(items,false,{...scope,pdfContext:context}).then(texts=>reply({ok:true,items:items.map((x,i)=>({id:x.id,text:texts[i]}))}),e=>reply({ok:false,error:e.message}));return true;
});
chrome.tabs.onRemoved.addListener(id=>{for(const jobs of [pdfJobs,pdfAlignJobs])for(const [key,scope]of jobs)if(scope.tabId===id){scope.controller.abort();jobs.delete(key);}});

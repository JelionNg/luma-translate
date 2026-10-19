import {excerptGeometry} from './excerpt-geometry.js';
import {installSelectionHighlight} from './selection.js';
import {renderMathLayer} from './math-layer.js';
import {documentContext} from './document-context.js';
import {validateMath,normalizeMath,recoverMath} from './inline-math.js';
import * as pdfjs from '../../vendor/pdfjs/pdf.mjs';
import {paragraphs,readingRegions} from './layout.js';
import {createRegions,scheduleTypeset,setTranslatedText} from './typeset.js';
pdfjs.GlobalWorkerOptions.workerSrc=chrome.runtime.getURL('vendor/pdfjs/pdf.worker.mjs');
const $=id=>document.getElementById(id),states=[],near=new Set();
let doc,loadingTask,generation=0,enabled=false,pageWorker=false,observer;
const active=new Set();
let aligning=0,alignmentId=0;
const alignExcerpt=async query=>{
 const id=++alignmentId,token=generation;aligning=id;
 try{
  while(aligning===id&&token===generation){
   while(aligning===id&&token===generation&&enabled&&([...active].some(j=>j.token===token)||[...near].some(s=>s.blocks?.some(b=>!b.preserve&&!b.result&&!b.error))))await new Promise(r=>setTimeout(r,120));
   if(aligning!==id||token!==generation)break;
   const result=await chrome.runtime.sendMessage({type:'pdf-align',generation:token,query});
   if(!result?.retry)return result?.ok?result.excerpt:null;
   await new Promise(r=>setTimeout(r,200));
  }
  throw Error('选区已改变');
 }finally{if(aligning===id)aligning=0;}

};
alignExcerpt.cancel=()=>{if(aligning){aligning=0;chrome.runtime.sendMessage({type:'pdf-align-cancel',generation}).catch(()=>{});}};
alignExcerpt.boxes=async (block,selected,excerpt)=>excerptGeometry(block,selected,excerpt,await doc.getPage(block.page.number),pdfjs.TextLayer);
installSelectionHighlight(states,document,alignExcerpt);
const tell=text=>{$('status').textContent=text;};
const cancelled=token=>token!==generation;
function display(s,b){
 b.node.classList.toggle('pending',!!b.pending);b.node.classList.toggle('error',!!b.error);
 if(b.result)setTranslatedText(b,b.result);else b.node.textContent=b.error?'翻译未完成，点击重试':b.pending?'正在翻译':'等待翻译';scheduleTypeset(s,b.region);
}
function stop(){enabled=false;generation++;chrome.runtime.sendMessage({type:'pdf-cancel',generation}).catch(()=>{});$('cancel').disabled=true;for(const s of states)for(const b of s.blocks||[])if(b.pending){b.pending=false;display(s,b);}tell('已暂停，可继续翻译');}
async function ensure(s,token){
 if(s.blocks)return;if(s.loading)return s.loading;
 const owner=doc;
 s.loading=(async()=>{
  const page=await owner.getPage(s.number);if(cancelled(token))return;
  const viewport=page.getViewport({scale:1});s.width=viewport.width;s.height=viewport.height;
  for(const el of [s.paper,s.target])el.style.setProperty('--ratio',s.width/s.height);
  const content=await page.getTextContent();if(cancelled(token))return;
  s.blocks=paragraphs(content,viewport).map(b=>({...b,id:s.number+':'+b.id}));s.layer.replaceChildren();
  if(!s.blocks.length){const note=document.createElement('div');note.className='note';note.textContent='本页没有可提取文字，可能是扫描页。';s.layer.append(note);return;}
  for(const b of s.blocks)b.page=s;
  createRegions(s,readingRegions(s.blocks,viewport));
  for(const b of s.blocks){
   if(!b.node)continue;
   const node=b.node;
   node.onclick=()=>{if(b.error){b.error=false;enabled=true;pump();}};
   display(s,b);
  }
 })();try{await s.loading;}finally{s.loading=null;}
}
const textOps=new Set(['showText','showSpacedText','nextLineShowText','nextLineSetSpacingShowText'].map(k=>pdfjs.OPS[k]).filter(v=>v!==undefined));
async function render(s,token){
 if(s.rendered||s.rendering)return;s.rendering=true;
 try{
  const page=await doc.getPage(s.number);if(cancelled(token))return;
  const scale=Math.min(2,Math.max(.5,s.paper.clientWidth/s.width*devicePixelRatio)),v=page.getViewport({scale});
  const operators=await page.getOperatorList();if(cancelled(token))return;
  for(const [canvas,translated] of [[s.canvas,false],[s.background,true]]){
   if(cancelled(token))return;canvas.width=v.width;canvas.height=v.height;
   const task=page.render({canvasContext:canvas.getContext('2d'),viewport:v,...(translated?{operationsFilter:i=>!textOps.has(operators.fnArray[i])}:{})});
   s.task=task;await task.promise;
  }
  const mathFonts=new Set((s.blocks||[]).flatMap(b=>(b.math||[]).flatMap(slot=>(slot.fragments||[slot]).flatMap(f=>f.runs.map(r=>r.font)))));
  if(mathFonts.size){
   s.mathCanvas ||= document.createElement('canvas');
   await renderMathLayer(page,operators,v,s.mathCanvas,mathFonts,pdfjs.OPS,task=>{s.task=task;});
  }
  if(cancelled(token))return;
  // Restore protected technical text directly from the original rendering.
  // Neither the model nor HTML typography rewrites table cells or diagram labels.
  const ctx=s.background.getContext('2d');
  const protectedRegions=new Set((s.blocks||[]).filter(b=>b.preserve).map(b=>b.protectedRegion).filter(Boolean));
  const copy=box=>{const pad=(box.kind==='formula'?1:2)*scale,x=Math.max(0,Math.floor(box.x*scale-pad)),y=Math.max(0,Math.floor(box.y*scale-pad)),w=Math.min(v.width-x,Math.ceil(box.width*scale+pad*2)),h=Math.min(v.height-y,Math.ceil(box.height*scale+pad*2));if(w>0&&h>0)ctx.drawImage(s.canvas,x,y,w,h,x,y,w,h);};
  // Copy each complete equation/technical region once: fractions, delimiters,
  // accents and limits can extend outside PDF text-run bounds.
  for(const region of protectedRegions)copy(region);
  for(const b of s.blocks||[])if(b.preserve&&!b.protectedRegion)for(const run of b.runs)copy(run);
  s.rendered=true;for(const b of s.blocks||[])if(b.result&&b.node)setTranslatedText(b,b.result);scheduleTypeset(s);
 }catch(e){if(!cancelled(token)&&e.name!=='RenderingCancelledException')tell(e.message);}finally{s.rendering=false;s.task=null;}
}
async function pages(){if(pageWorker)return;pageWorker=true;const token=generation;try{for(const s of [...near].sort((a,b)=>a.number-b.number)){if(cancelled(token))break;await ensure(s,token);pump();await render(s,token);}}catch(e){if(!cancelled(token))tell(e.message);}finally{pageWorker=false;if(cancelled(token)&&near.size)pages();else pump();}}
function pump(){
 if(!enabled)return;const token=generation;
 const eligible=b=>!b.preserve&&!b.result&&!b.pending&&!b.error;
 while([...active].filter(j=>j.token===token).length<2){
  const s=[...near].sort((a,b)=>a.number-b.number).find(s=>s.blocks?.some(eligible));if(!s)break;
  const batch=s.blocks.filter(eligible).slice(0,4);while(batch.length>1&&batch.reduce((n,b)=>n+b.text.length,0)>20000)batch.pop();
  const job={token};active.add(job);for(const b of batch){b.pending=true;display(s,b);}
  const context=documentContext(states,s,batch);
  const request=async items=>{
   const r=await chrome.runtime.sendMessage({type:'pdf-translate',generation:token,context,items});
   if(cancelled(token))throw Error('PDF 任务已取消');
   if(!r?.ok)throw Error(r?.error||'翻译未完成');return r.items;
  };
  request(batch.map(b=>({id:b.id,text:b.translationText||b.text}))).then(async items=>{
   // Each paragraph owns its result/failure. A malformed formula in one item
   // must never turn already successful neighboring paragraphs red.
   for(const b of batch){
    if(cancelled(token))return;
    try{
     const item=items?.find(x=>x.id===b.id);if(typeof item?.text!=='string')throw Error('译文段落缺失');
     let text=normalizeMath(b,item.text);
     try{validateMath(b,text);}catch(e){if(!b.math?.length)throw e;text=await recoverMath(b,request);}
     b.result=text;b.error=false;b.node.removeAttribute('title');
    }catch(e){if(cancelled(token))return;b.error=true;b.node.title=e.message;tell(e.message);}
    b.pending=false;display(s,b);
   }
  }).catch(e=>{if(cancelled(token))return;for(const b of batch)if(!b.result){b.error=true;b.node.title=e.message;}tell(e.message);}).finally(()=>{
   active.delete(job);if(cancelled(token))return;for(const b of batch){b.pending=false;display(s,b);}
   const done=states.reduce((n,s)=>n+(s.blocks?.filter(b=>b.result).length||0),0);tell(`已翻译 ${done} 段 · ${doc.numPages} 页`);pump();
  });
 }
}
$('file').onchange=async()=>{
 const file=$('file').files[0];if(!file)return;stop();const token=generation;observer?.disconnect();near.clear();for(const s of states)s.task?.cancel();states.length=0;
 const old=loadingTask;loadingTask=null;await old?.destroy().catch(()=>{});if(cancelled(token))return;$('pages').replaceChildren();$('translate').disabled=true;tell('正在解析 PDF…');
 try{
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});loadingTask=task;
  task.onPassword=(update,reason)=>{const password=prompt(reason===2?'密码错误，请重新输入':'此 PDF 需要密码');if(password===null){task.destroy();return;}update(password);};
  const opened=await task.promise;if(cancelled(token))return;doc=opened;
  observer=new IntersectionObserver(entries=>{for(const e of entries){const s=states[Number(e.target.dataset.index)];if(!s)continue;if(e.isIntersecting)near.add(s);else{near.delete(s);if(s.rendered&&!s.rendering){for(const c of [s.canvas,s.background,s.mathCanvas].filter(Boolean))c.width=c.height=0;s.rendered=false;}}}pages();},{rootMargin:'600px'});
  const first=await doc.getPage(1),v=first.getViewport({scale:1});if(cancelled(token))return;
  for(let number=1;number<=doc.numPages;number++){
   const row=document.createElement('section');row.className='pair';row.dataset.index=number-1;
   row.innerHTML='<div class="column"><div class="caption"></div><div class="paper"><canvas></canvas><div class="highlight"></div></div></div><div class="column"><div class="caption"></div><div class="translation"><canvas></canvas><div class="text-layer"></div></div></div>';
   row.querySelectorAll('.caption').forEach((el,i)=>el.textContent=`${number} / ${doc.numPages} · ${i?'译文':'原文'}`);
   const paper=row.querySelector('.paper'),target=row.querySelector('.translation');for(const el of [paper,target])el.style.setProperty('--ratio',v.width/v.height);
   states.push({number,row,paper,canvas:paper.querySelector('canvas'),background:target.querySelector('canvas'),overlay:row.querySelector('.highlight'),target,layer:row.querySelector('.text-layer')});$('pages').append(row);observer.observe(row);
  }
  $('translate').disabled=false;tell(`${file.name} · ${doc.numPages} 页`);
 }catch(e){if(!cancelled(token))tell('读取失败：'+e.message);}
};
$('translate').onclick=()=>{if(!enabled)generation++;enabled=true;$('cancel').disabled=false;for(const s of states)for(const b of s.blocks||[])if(b.node){b.error=false;display(s,b);}pages();pump();};$('cancel').onclick=stop;
$('settings').onclick=()=>chrome.runtime.openOptionsPage();
const prefs=await chrome.storage.sync.get({targetLang:'简体中文'});$('language').value=prefs.targetLang;
$('language').onchange=async()=>{stop();await chrome.storage.sync.set({targetLang:$('language').value});for(const s of states)for(const b of s.blocks||[])if(b.node){b.result=null;b.pending=false;b.error=false;display(s,b);}};
new ResizeObserver(()=>{for(const s of near)scheduleTypeset(s);}).observe($('pages'));
document.fonts.ready.then(()=>{for(const s of near)scheduleTypeset(s);});
window.addEventListener('pagehide',()=>{stop();loadingTask?.destroy();});

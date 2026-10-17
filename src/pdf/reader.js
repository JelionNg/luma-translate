import * as pdfjs from '../../vendor/pdfjs/pdf.mjs';
import {paragraphs} from './layout.js';
pdfjs.GlobalWorkerOptions.workerSrc=chrome.runtime.getURL('vendor/pdfjs/pdf.worker.mjs');
const $=id=>document.getElementById(id),states=[],near=new Set();
let doc,loadingTask,generation=0,enabled=false,workers=0,pageWorker=false,observer;
const tell=text=>{$('status').textContent=text;};
function cancelled(token){return token!==generation;}
function stop(){enabled=false;generation++;workers=0;chrome.runtime.sendMessage({type:'pdf-cancel',generation}).catch(()=>{});$('cancel').disabled=true;for(const s of states)for(const b of s.blocks||[])if(b.pending){b.pending=false;b.node.classList.remove('pending');b.node.textContent=b.result||'等待翻译';}tell('已暂停，可继续翻译');}
function highlight(s,b){s.overlay.replaceChildren();if(!b)return;for(const r of b.boxes){const el=document.createElement('i');Object.assign(el.style,{left:r.x/s.width*100+'%',top:r.y/s.height*100+'%',width:r.width/s.width*100+'%',height:r.height/s.height*100+'%'});s.overlay.append(el);}}
async function ensure(s,token){
 if(s.blocks)return;if(s.loading)return s.loading;
 s.loading=(async()=>{const page=await doc.getPage(s.number);if(cancelled(token))return;const viewport=page.getViewport({scale:1});s.width=viewport.width;s.height=viewport.height;s.paper.style.setProperty('--ratio',s.width/s.height);const content=await page.getTextContent();if(cancelled(token))return;s.blocks=paragraphs(content,viewport).map(b=>({...b,id:s.number+':'+b.id}));s.target.replaceChildren();
 if(!s.blocks.length){s.target.textContent='本页没有可提取文字，可能是扫描页。';return;}
 for(const b of s.blocks){const node=document.createElement('div');node.className='block';node.tabIndex=0;node.textContent='等待翻译';node.title=b.text;node.onpointerenter=node.onfocus=()=>highlight(s,b);node.onpointerleave=node.onblur=()=>highlight(s);node.onclick=()=>{if(node.classList.contains('error')){b.error=false;enabled=true;pump();}};b.node=node;s.target.append(node);}
 })();try{await s.loading;}finally{s.loading=null;}
}
async function render(s,token){if(s.rendered||s.rendering)return;s.rendering=true;try{const page=await doc.getPage(s.number);if(cancelled(token))return;const scale=Math.min(2,Math.max(.5,s.paper.clientWidth/page.getViewport({scale:1}).width*devicePixelRatio));const v=page.getViewport({scale});s.canvas.width=v.width;s.canvas.height=v.height;const task=page.render({canvasContext:s.canvas.getContext('2d'),viewport:v});s.task=task;await task.promise;if(!cancelled(token))s.rendered=true;}catch(e){if(!cancelled(token)&&e.name!=='RenderingCancelledException')tell(e.message);}finally{s.rendering=false;s.task=null;}}
async function pages(){if(pageWorker)return;pageWorker=true;const token=generation;try{for(const s of [...near].sort((a,b)=>a.number-b.number)){if(cancelled(token))break;await ensure(s,token);await render(s,token);}}catch(e){if(!cancelled(token))tell(e.message);}finally{pageWorker=false;if(cancelled(token)&&near.size)pages();else pump();}}
function pump(){if(!enabled)return;const token=generation;
 while(workers<2){const s=[...near].sort((a,b)=>a.number-b.number).find(s=>s.blocks?.some(b=>!b.result&&!b.pending&&!b.error));if(!s)break;const batch=s.blocks.filter(b=>!b.result&&!b.pending&&!b.error).slice(0,4);while(batch.length>1&&batch.reduce((n,b)=>n+b.text.length,0)>20000)batch.pop();workers++;for(const b of batch){b.pending=true;b.node.classList.add('pending');b.node.textContent='正在翻译';}
 chrome.runtime.sendMessage({type:'pdf-translate',generation:token,items:batch.map(b=>({id:b.id,text:b.text}))}).then(r=>{if(cancelled(token))return;if(!r?.ok)throw Error(r?.error||'翻译未完成');for(const b of batch){const item=r.items.find(x=>x.id===b.id);if(!item)throw Error('译文段落缺失');b.result=item.text;b.node.textContent=item.text;}}).catch(e=>{if(cancelled(token))return;for(const b of batch){b.error=true;b.node.classList.add('error');b.node.textContent='翻译未完成，点击重试';b.node.title=e.message;}tell(e.message);}).finally(()=>{if(cancelled(token))return;workers--;for(const b of batch){b.pending=false;b.node.classList.remove('pending');}const done=states.reduce((n,s)=>n+(s.blocks?.filter(b=>b.result).length||0),0);tell(`已翻译 ${done} 段 · ${doc.numPages} 页`);pump();});
 }
}
$('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;stop();const token=generation;observer?.disconnect();near.clear();for(const s of states)s.task?.cancel();states.length=0;const old=loadingTask;loadingTask=null;await old?.destroy().catch(()=>{});if(cancelled(token))return;$('pages').replaceChildren();tell('正在解析 PDF…');
 try{loadingTask=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false});loadingTask.onPassword=(update,reason)=>{const password=prompt(reason===2?'密码错误，请重新输入':'此 PDF 需要密码');if(password===null){loadingTask.destroy();return;}update(password);};doc=await loadingTask.promise;if(cancelled(token))return;
 observer=new IntersectionObserver(entries=>{for(const e of entries){const s=states[Number(e.target.dataset.index)];if(e.isIntersecting)near.add(s);else{near.delete(s);if(s.rendered&&!s.rendering){s.canvas.width=s.canvas.height=0;s.rendered=false;}}}pages();},{rootMargin:'600px'});
 const first=await doc.getPage(1),v=first.getViewport({scale:1});for(let number=1;number<=doc.numPages;number++){const row=document.createElement('section');row.className='pair';row.dataset.index=number-1;row.innerHTML='<div class="column"><div class="caption"></div><div class="paper"><canvas></canvas><div class="highlight"></div></div></div><div class="column"><div class="caption"></div><div class="translation"><div class="note">进入视区后解析，点击上方按钮开始翻译。</div></div></div>';row.querySelectorAll('.caption').forEach((el,i)=>el.textContent=`${number} / ${doc.numPages} · ${i?'译文':'原文'}`);const paper=row.querySelector('.paper');paper.style.setProperty('--ratio',v.width/v.height);const target=row.querySelector('.translation');target.style.minHeight='300px';states.push({number,row,paper,canvas:row.querySelector('canvas'),overlay:row.querySelector('.highlight'),target});$('pages').append(row);observer.observe(row);}
 $('translate').disabled=false;tell(`${file.name} · ${doc.numPages} 页`);
 }catch(e){if(!cancelled(token))tell('读取失败：'+e.message);}
};
$('translate').onclick=()=>{if(!enabled)generation++;enabled=true;$('cancel').disabled=false;for(const s of states)for(const b of s.blocks||[]){b.error=false;b.node.classList.remove('error');}pages();pump();};$('cancel').onclick=stop;
$('settings').onclick=()=>chrome.runtime.openOptionsPage();
const prefs=await chrome.storage.sync.get({targetLang:'简体中文'});$('language').value=prefs.targetLang;
$('language').onchange=async()=>{stop();await chrome.storage.sync.set({targetLang:$('language').value});for(const s of states)for(const b of s.blocks||[]){b.result=null;b.pending=false;b.error=false;b.node.className='block';b.node.textContent='等待翻译';}};
window.addEventListener('pagehide',()=>{stop();loadingTask?.destroy();});

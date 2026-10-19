// Highlight only anchored excerpts. Never infer semantic correspondence from
// relative character positions or sentence order.
export function sourcePassage(block){
 const chars=[],owners=[];
 const append=(text,run)=>{for(let offset=0;offset<text.length;offset++){chars.push(text[offset]);owners.push(run?{run,offset}:null);}};
 for(const [i,line] of block.boxes.entries()){
  const ordered=[...line.runs].sort((a,b)=>a.x-b.x||a.baseline-b.baseline);
  if(i&&chars.length){
   const tail=chars.join('').match(/[A-Za-z][A-Za-z-]*-$/)?.[0];
   if(tail&&!tail.slice(0,-1).includes('-')&&/^[a-z]/.test(ordered[0]?.text||'')){chars.pop();owners.pop();}else append(' ');
  }
  let previous;
  for(const run of ordered){if(previous&&run.x>previous.x+previous.width+(block.size||12)*.12)append(' ');append(run.text,run);previous=run;}
 }
 const runs=[];
 for(let i=0;i<owners.length;i++){
  const owner=owners[i];if(!owner)continue;
  const prior=runs.at(-1);
  if(prior?.run===owner.run&&prior.end===i&&prior.offset+prior.end-prior.index===owner.offset)prior.end++;
  else runs.push({run:owner.run,index:i,end:i+1,offset:owner.offset});
 }
 return {text:chars.join(''),runs};
}

export function selectionQuery(block,start,end){
 const target=block.node.textContent,selected=target.slice(start,end).trim();
 // One grapheme, punctuation-only selections and empty ranges stay native.
 const letters=selected.match(/[\p{L}\p{N}]/gu)||[];
 if(letters.length<2||selected.length>1500)return null;
 const latin=/[\p{Script=Latin}\p{N}]/u;
 if(latin.test(target[start]||'')&&latin.test(target[start-1]||'')||latin.test(target[end-1]||'')&&latin.test(target[end]||''))return null;
 return {source:sourcePassage(block).text,target,selected};
}
export function anchoredExcerpt(source,selected,excerpt){
 if(typeof excerpt!=='string'||!excerpt.trim()||excerpt==='NONE')return null;
 const text=excerpt.trim(),start=source.indexOf(text);
 if(start<0||source.indexOf(text,start+1)!==-1)return null;
 const letters=(selected.match(/[\p{L}\p{N}]/gu)||[]).length;
 const limit=Math.min(3000,Math.max(48,letters*6));
 if(text.length>limit)return null;
 const sourceWords=(text.match(/[\p{L}\p{N}]+/gu)||[]).length;
 const cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(selected);
 const words=cjk?letters:(selected.match(/[\p{L}\p{N}]+/gu)||[]).length;
 if(sourceWords>Math.max(6,words*3))return null;
 return {start,end:start+text.length};
}
export function sourceSelection(block,start,end,excerpt){
 const query=selectionQuery(block,start,end);if(!query)return [];
 const {text,runs}=sourcePassage(block);
 // Literal anchors are immediate; translated phrases need a validated excerpt.
 if(excerpt===undefined){
  const matches=[...text.matchAll(new RegExp(query.selected.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu'))];
  if(matches.length!==1)return [];
  const match=matches[0],before=text[match.index-1]||'',after=text[match.index+match[0].length]||'';
  if(/[\p{L}\p{N}]/u.test(before)||/[\p{L}\p{N}]/u.test(after))return [];
  excerpt=match[0];
 }
 const span=anchoredExcerpt(text,query.selected,excerpt);if(!span)return [];
 return runs.flatMap(({run,index,end,offset})=>{
  const a=Math.max(span.start,index),b=Math.min(span.end,end);if(b<=a)return [];
  const length=Math.max(1,run.text.length),math=block.math?.some(s=>(s.fragments||[s]).some(f=>f.runs.includes(run)));
  return [{x:run.x+(math?0:(offset+a-index)/length*run.width),y:run.y,width:math?run.width:(b-a)/length*run.width,height:run.height}];
 });
}
export function installSelectionHighlight(states,doc=document,resolveExcerpt=async()=>null){
 let frame=0,timer=0,revision=0;
 const cached=new WeakMap();
 const clear=()=>{for(const s of states)s.overlay.replaceChildren();};
 const update=()=>{
  frame=0;clearTimeout(timer);resolveExcerpt.cancel?.();const current=++revision;clear();const selection=doc.getSelection();
  if(!selection||selection.isCollapsed||!selection.rangeCount||!selection.toString().trim())return;
  const range=selection.getRangeAt(0);
  // Cross-paragraph selection remains native selection, without lighting up
  // several original paragraphs and recreating the old wall of highlight.
  const element=node=>node.nodeType===1?node:node.parentElement;
  const node=element(range.startContainer)?.closest('.block');
  if(!node||element(range.endContainer)?.closest('.block')!==node)return;
  for(const s of states){
   const b=s.blocks?.find(b=>b.node===node&&b.result&&!b.pending&&!b.error);if(!b)continue;
   const prefix=doc.createRange();prefix.selectNodeContents(node);prefix.setEnd(range.startContainer,range.startOffset);
   const start=prefix.toString().length,end=start+range.toString().length;
   const paint=async (boxes,excerpt)=>{
    if(resolveExcerpt.boxes&&excerpt){
     try{const measured=await resolveExcerpt.boxes(b,query.selected,excerpt);if(measured.length)boxes=measured;}catch{/* Retain the baseline passage bounds if measurement is unavailable. */}
    }
    if(current!==revision||!node.isConnected||node.textContent!==query.target)return;
    for(const box of boxes){
    const mark=doc.createElement('i');Object.assign(mark.style,{left:box.x/s.width*100+'%',top:box.y/s.height*100+'%',width:box.width/s.width*100+'%',height:box.height/s.height*100+'%'});s.overlay.append(mark);
   }};
   const query=selectionQuery(b,start,end);if(!query)return;
   const local=sourceSelection(b,start,end);if(local.length){paint(local,query.selected);return;}
   let cache=cached.get(b);if(!cache||cache.target!==query.target||cache.source!==query.source){cache={source:query.source,target:query.target,items:new Map()};cached.set(b,cache);}
   if(cache.items.has(query.selected)){paint(sourceSelection(b,start,end,cache.items.get(query.selected)),cache.items.get(query.selected));return;}
   timer=setTimeout(async()=>{
    try{
     const excerpt=await resolveExcerpt(query);
     if(current!==revision||!node.isConnected||node.textContent!==query.target)return;
     // Transient cancellation and uncertain responses are not negative cache entries.
     if(!anchoredExcerpt(query.source,query.selected,excerpt))return;
     if(cache.items.size>=64)cache.items.delete(cache.items.keys().next().value);
     cache.items.set(query.selected,excerpt);
     paint(sourceSelection(b,start,end,excerpt),excerpt);
    }catch{/* Uncertain or unavailable alignment must not paint a guess. */}
   },350);
  }
 };
 doc.addEventListener('selectionchange',()=>{if(!frame)frame=requestAnimationFrame(update);});
 doc.addEventListener('keydown',event=>{if(event.key==='Escape'){revision++;clearTimeout(timer);resolveExcerpt.cancel?.();doc.getSelection()?.removeAllRanges();clear();}});
}

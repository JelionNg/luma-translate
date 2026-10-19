import {formulaCanvas} from './formula-render.js';
// A region owns typography and overflow. Paragraphs only own text and source identity.
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const serif = '"Noto Serif CJK SC", "Songti SC", "STSong", Georgia, serif';
const sans = 'system-ui, "Noto Sans CJK SC", sans-serif';
const profiles = {
 body:{leading:1.52, min:1, max:1.04, gap:.62},
 caption:{leading:1.4, min:.85, max:1, gap:.35},
 footnote:{leading:1.4, min:.9, max:1, gap:.35},
 title:{leading:1.28, min:.9, max:1.12, gap:0},
 heading:{leading:1.35, min:.9, max:1.04, gap:0},
 metadata:{leading:1.28, min:.9, max:1, gap:0},
 label:{leading:1.24, min:.9, max:1, gap:0}
};
export function translatedText(text){
 return text.replace(/\s+/g,' ').replace(/([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]) +(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])/gu,'$1').trim();
}
export function setTranslatedText(block, text) {
 const clean = translatedText(text);
 const baseline = Math.max(...block.runs.map(r => r.baseline));
 const sourceSuperscripts = block.role==='metadata' ? block.runs.filter(r => r.size<block.size*.85 && r.baseline<baseline-block.size*.1) : [];
 const numbers = new Set(sourceSuperscripts.flatMap(r => r.text.match(/\d+(?:,\d+)*/g)||[]));
 if(block.math?.length){
  block.node.replaceChildren();let offset=0;
  for(const match of clean.matchAll(/⟦M\d+⟧/g)){
   block.node.append(document.createTextNode(clean.slice(offset,match.index)));
   const slot=block.math.find(s=>s.token===match[0]);
   if(slot){
    const canvas=formulaCanvas(block,slot);
    block.node.append(canvas);
   }
   offset=match.index+match[0].length;
  }
  block.node.append(document.createTextNode(clean.slice(offset)));return;
 }
 if (!numbers.size) {block.node.textContent=clean;return;}
 // Only metadata with actual source superscripts gets this treatment. Years,
 // model names and numbers in body text are never reformatted by this rule.
 const pattern=/(?:^|(?<=[\p{L}]))\d+(?:[,，]\d+)*(?:\*)?/gu;
 let offset=0;block.node.replaceChildren();
 for (const match of clean.matchAll(pattern)) {
  if(!numbers.has(match[0].replaceAll('，',',').replace(/\*$/,'')))continue;
  block.node.append(document.createTextNode(clean.slice(offset,match.index)));
  const sup=document.createElement('sup');sup.textContent=match[0];block.node.append(sup);offset=match.index+match[0].length;
 }
 block.node.append(document.createTextNode(clean.slice(offset)));
}
export function createRegions(state, regions) {
 state.regions = regions;
 for (const r of regions) {
  const frame = document.createElement('div');frame.className='region '+r.role;
  const flow = document.createElement('div');flow.className='region-flow';frame.append(flow);
  Object.assign(frame.style,{left:r.x/state.width*100+'%',top:r.y/state.height*100+'%',width:r.width/state.width*100+'%',height:r.height/state.height*100+'%'});
  frame.dataset.role=r.role;r.node=frame;r.flow=flow;
  for (const b of r.blocks) {
   const node=document.createElement('div');node.className='block';node.tabIndex=0;
   node.style.textAlign=r.role==='body'?'justify':b.align;
   b.node=node;b.region=r;flow.append(node);
  }
  state.layer.append(frame);
 }
}
function fitRegion(state, region) {
 const frame=region.node,flow=region.flow,scale=state.target.clientWidth/state.width;
 if (!scale || !frame.clientHeight) return;
 const profile=profiles[region.role],text=region.blocks.map(b=>b.result||'').join('');
 const cjk=CJK.test(text),base=region.size*scale;
 flow.style.fontFamily=region.role==='label'?sans:serif;
 flow.style.lineHeight=String(!cjk&&region.role==='body'?1.42:profile.leading);
 flow.style.setProperty('--paragraph-gap',profile.gap+'em');
 // One font size for the entire region. Binary search bounds layout work and
 // never shrinks an isolated final line or changes the original source boxes.
 const high=base*profile.max,low=base*profile.min;
 const apply=size=>{flow.style.fontSize=size+'px';};
 const fits=()=>flow.scrollHeight<=frame.clientHeight+1&&flow.scrollWidth<=frame.clientWidth+1;
 apply(high);
 if (!fits()) {
  let lo=low,hi=high;apply(lo);
  if (fits()) {
   for(let i=0;i<5;i++){const middle=(lo+hi)/2;apply(middle);if(fits())lo=middle;else hi=middle;}
   apply(lo);
  }
 }
 const overflow=!fits();frame.classList.toggle('overflowing',overflow);
 frame.tabIndex=overflow?0:-1;
 if (overflow) {frame.setAttribute('aria-label','本区域译文较长，可滚动阅读');frame.title='译文较长，可在此区域滚动阅读';}
 else {frame.removeAttribute('aria-label');frame.removeAttribute('title');frame.scrollTop=0;}
}
const queued = new Map();let frameId=0;
export function scheduleTypeset(state, region) {
 if (!queued.has(state)) queued.set(state,region?new Set([region]):null);
 else if (!region) queued.set(state,null);
 else queued.get(state)?.add(region);
 if (frameId) return;
 frameId=requestAnimationFrame(()=>{
  frameId=0;
  for (const [page,dirty] of queued) if(page.target.isConnected) for(const region of dirty||page.regions||[])fitRegion(page,region);
  queued.clear();
 });
}

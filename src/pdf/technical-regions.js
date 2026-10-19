import {displayFormulas} from './formulas.js';
import {captionGroups,isCaption} from './captions.js';
// Caption geometry and local text structure own technical-region classification.
// Short text alone is never a reason to exclude a paragraph.
const right=b=>b.x+b.width,bottom=b=>b.y+b.height;
const figureCaption={test:isCaption};
const algorithm=/^(?:algorithm|算法)\s*\d+\s*[:：.]/i;
const section=/^(?:\d+(?:\.\d+)*\s+[A-Z][a-z]|abstract$|references$)/iu;
function extent(boxes){const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));return{x,y,width:Math.max(...boxes.map(right))-x,height:Math.max(...boxes.map(bottom))-y};}
export function technicalRegions(lines,viewport,bodySize,captions=captionGroups(lines,viewport)){
 const regions=[];
 const horizontal=lines.filter(l=>Math.abs(l.angle)<.05);
 const captionLine=l=>captions.owners.has(l);
 const prose=l=>l.size>bodySize*.94&&l.text.length>55&&(l.text.match(/[A-Za-z]{2,}/g)||[]).length>8&&(l.text.match(/\d/g)||[]).length/l.text.length<.1;
 function lane(seed){
  if(seed.width>viewport.width*.6)return{x:viewport.width*.08,width:viewport.width*.84};
  const candidates=horizontal.filter(l=>prose(l)&&l.width>viewport.width*.25&&l.width<viewport.width*.48&&l.x<right(seed)&&right(l)>seed.x);
  const nearest=candidates.sort((a,b)=>Math.abs(a.y-seed.y)-Math.abs(b.y-seed.y))[0];
  return nearest?{x:Math.min(nearest.x,seed.x),width:Math.max(right(nearest),right(seed))-Math.min(nearest.x,seed.x)}:{x:seed.x>viewport.width*.5?viewport.width*.5:viewport.width*.08,width:viewport.width*.4};
 }
 function within(l,area){const center=l.x+l.width/2;return center>=area.x-3&&center<=right(area)+3&&l.x>=area.x-5&&right(l)<=right(area)+8;}
 for(const seed of horizontal.filter(l=>figureCaption.test(l.text))){
  const area=lane(seed),above=horizontal.filter(l=>bottom(l)<=seed.y+1&&within(l,area)).sort((a,b)=>b.y-a.y);
  const captionFonts=new Set((seed.runs||[]).map(r=>r.font));
  const sharesCaptionFont=line=>!(line.runs?.length)||line.runs.some(r=>captionFonts.has(r.font));
  const collected=[];let edge=seed.y;
  for(const line of above){
   if(captionLine(line)||algorithm.test(line.text)||section.test(line.text)&&line.size>=bodySize||line.text.includes('@')||sharesCaptionFont(line)&&(prose(line)||line.size>bodySize*1.1))break;
   if(edge-bottom(line)>Math.max(bodySize*4,32))break;
   collected.push(line);edge=Math.min(edge,line.y);
  }
  if(collected.length>=2){
   // A panel gap is not an artwork boundary. Embedded figure fonts remain
   // owned by this figure above the caption, including disconnected panels.
   const figureFonts=new Set(collected.flatMap(l=>(l.runs||[]).filter(r=>!captionFonts.has(r.font)).map(r=>r.font)));
   const previousCaption=horizontal.filter(l=>captionLine(l)&&l.y<seed.y).sort((a,b)=>b.y-a.y)[0];
   const extended=/^(?:table|表)/i.test(seed.text)?[]:above.filter(l=>(!previousCaption||l.y>bottom(previousCaption))&&!captionLine(l)&&!section.test(l.text)&&(l.runs||[]).length&&l.runs.every(r=>figureFonts.has(r.font)));
   const members=[...new Set([...collected,...extended])];
   regions.push({...extent(members),kind:/^(?:table|表)/i.test(seed.text)?'table':'figure',lines:members});
  }
 }
 for(const seed of horizontal.filter(l=>algorithm.test(l.text))){
  const area=lane(seed),collected=[seed];let edge=bottom(seed);
  for(const line of horizontal.filter(l=>l!==seed&&l.y>=bottom(seed)-1&&within(l,area)).sort((a,b)=>a.y-b.y||a.x-b.x)){
   if(line.y-edge>bodySize*2||figureCaption.test(line.text)||section.test(line.text)&&line.size>=seed.size||prose(line)&&line.size>seed.size*.98)break;
   collected.push(line);edge=Math.max(edge,bottom(line));
  }
  if(collected.length>2)regions.push({...extent(collected),kind:'algorithm',lines:collected});
 }
 displayFormulas(horizontal,bodySize,{lane,within,prose,figureCaption,algorithm,section,captionLine,regions});
 return regions;
}

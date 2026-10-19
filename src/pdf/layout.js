import {headingGroups,numberedHeading,namedHeading} from './headings.js';
import {captionGroups,isCaption} from './captions.js';
import {inlineMath,attachMathFragments} from './inline-math.js';
import {technicalRegions} from './technical-regions.js';
// Source geometry belongs to the PDF, not to the translated presentation.
const right = box => box.x + box.width;
const bottom = box => box.y + box.height;
function bounds(boxes) {
 const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
 return {x, y, width: Math.max(...boxes.map(right)) - x, height: Math.max(...boxes.map(bottom)) - y};
}
function weightedSize(items) {
 const ordered = [...items].sort((a,b) => a.size - b.size);
 const total = ordered.reduce((n,b) => n + b.text.length, 0);
 let count = 0;
 return ordered.find(b => (count += b.text.length) >= total / 2)?.size || 12;
}
function lineText(runs, size) {
 return runs.map((run,i) => {
  const previous = runs[i-1];
  return (previous && run.x > right(previous) + size * .12 ? ' ' : '') + run.text;
 }).join('').replace(/\s+/g, ' ').trim();
}
const caption = isCaption;

export function paragraphs(content, viewport) {
 // Explicit PDF spaces carry line connectivity, even when justification makes
 // them wider than a glyph. Keep that evidence separate from visible runs.
 const spaces=new Map();
 for(const item of content.items){
  if(!item.str||item.str.trim()||!(item.width>0))continue;
  const t=item.transform,v=viewport.transform;
  if(Math.abs(Math.atan2(v[1]*t[0]+v[3]*t[1],v[0]*t[0]+v[2]*t[1]))>.05)continue;
  const [x,baseline]=viewport.convertToViewportPoint(t[4],t[5]),key=Math.round(baseline);
  if(!spaces.has(key))spaces.set(key,[]);
  spaces.get(key).push({x,width:item.width*viewport.scale,baseline});
 }
 const connected=(a,b)=>{
  const size=Math.max(a.size,b.size),left=a.x<=b.x?a:b,next=left===a?b:a;
  if(next.x-right(left)<size*1.1)return true;
  const tolerance=size*.08,baseline=(a.baseline+b.baseline)/2,vertical=size*.22;
  for(let k=Math.floor(baseline-vertical);k<=Math.ceil(baseline+vertical);k++)
   if((spaces.get(k)||[]).some(space=>Math.abs(space.baseline-baseline)<=vertical&&space.x<=right(left)+tolerance&&right(space)>=next.x-tolerance))return true;
  return false;
 };
 const runs = content.items.flatMap((item,index) => {
  if (!item.str?.trim()) return [];
  const t = item.transform, v = viewport.transform;
  const a = v[0]*t[0]+v[2]*t[1], b = v[1]*t[0]+v[3]*t[1];
  const c = v[0]*t[2]+v[2]*t[3], d = v[1]*t[2]+v[3]*t[3];
  const [bx,by] = viewport.convertToViewportPoint(t[4],t[5]);
  const size = Math.max(1,Math.hypot(c,d)), angle = Math.atan2(b,a);
  const metrics = content.styles?.[item.fontName];
  // Embedded diagram fonts may report NaN metrics. Nullish fallback does not
  // catch NaN: normalize here before geometry reaches any consumer.
  const ascent = Number.isFinite(metrics?.ascent) ? metrics.ascent : Number.isFinite(metrics?.descent) ? 1 + metrics.descent : .8;
  const width = Math.max(1,item.width*viewport.scale);
  const corners = [[0,-size*ascent],[width,-size*ascent],[width,size*(1-ascent)],[0,size*(1-ascent)]].map(([x,y]) => ({x:bx+x*Math.cos(angle)-y*Math.sin(angle), y:by+x*Math.sin(angle)+y*Math.cos(angle), width:0, height:0}));
  return [{index, text:item.str, size, baseline:by, angle, font:item.fontName, ...bounds(corners)}];
 });
 const lines = [];
 // Establish the main baseline before attaching smaller superscripts.
 for (const run of [...runs].sort((a,b) => b.size-a.size || a.y-b.y || a.x-b.x)) {
  const line = lines.find(l => {
   const baselineTolerance = run.size < l.size*.85 ? l.size*.6 : l.size*.22;
   return Math.abs(l.angle-run.angle)<.05 && Math.abs(l.baseline-run.baseline)<baselineTolerance && connected(l,run);
  });
  if (line) { line.runs.push(run); Object.assign(line,bounds(line.runs)); }
  else lines.push({...run,runs:[run]});
 }
 // Mixed font fragments may be connected by a run that arrived later.
 for (let i=0;i<lines.length;i++) {
  const line = lines[i];
  for (let j=i+1;j<lines.length;j++) {
   const other = lines[j];
   if (Math.abs(line.angle-other.angle)<.05 && Math.abs(line.baseline-other.baseline)<Math.max(line.size,other.size)*.22 && connected(line,other)) {
    line.runs.push(...other.runs); Object.assign(line,bounds(line.runs)); lines.splice(j,1); j=i;
   }
  }
 }
 const mathFonts=attachMathFragments(lines);
 for (const line of lines) {
  line.runs.sort((a,b) => a.x-b.x);
  line.text = lineText(line.runs,line.size);
 }
 lines.sort((a,b) => a.baseline-b.baseline || a.x-b.x);
 const bodySize = weightedSize(lines.filter(l => Math.abs(l.angle)<.05 && l.width>viewport.width*.24));
 const bodyStart = lines.find(l => l.y>viewport.height*.2 && l.width>viewport.width*.24 && l.size<bodySize*1.06 && l.text.length>25)?.y ?? 0;
 const titleLine = l => l.y<viewport.height*.22 && l.size>bodySize*1.24;
 const hasTitle = lines.some(titleLine);
 const metadataLine = l => hasTitle && bodyStart>0 && l.y<bodyStart && l.size>bodySize*1.02 && !titleLine(l) && !namedHeading(l.text);
 const captions=captionGroups(lines,viewport);
 const protectedRegions=technicalRegions(lines,viewport,bodySize,captions);
 const technical=new Map();
 for(const region of protectedRegions)for(const line of region.lines)technical.set(line,region);
 const headings=headingGroups(lines,l=>captions.owners.has(l)||technical.has(l)||metadataLine(l)||titleLine(l));
 const footnoteLine=l=>l.size<bodySize*.87&&l.y>viewport.height*.8;
 const blocks = [];
 for (const line of lines) {
  const prior = [...blocks].reverse().find(block => {
   const last = block.boxes.at(-1), gap = line.baseline-last.baseline-last.size;
   if(captions.owners.has(line)||captions.owners.has(last))return captions.owners.get(line)===captions.owners.get(last);
   if(headings.has(line)||headings.has(last))return headings.has(line)&&headings.get(line)===headings.get(last);
   if(technical.get(line)!==technical.get(last)||footnoteLine(line)!==footnoteLine(last))return false;
   if (Math.abs(line.angle-last.angle)>.05 || Math.abs(line.size-last.size)>line.size*.28 || gap < -line.size*.15 || gap>line.size*.9) return false;
   if(metadataLine(line)&&metadataLine(last)&&/^(?:\d+)?(?:Department|School|Institute|Faculty|University|College|Laboratory)\b/i.test(block.text)&&!/^\d+\p{L}/u.test(line.text)&&line.font===last.font&&line.x>=block.x-line.size&&right(line)<=right(block)+line.size)return true;
   if (metadataLine(line) || metadataLine(last) || namedHeading(line.text) || namedHeading(last.text) || numberedHeading(line.text) || numberedHeading(last.text)) return false;
   if (titleLine(line) && titleLine(last)) return Math.abs(line.x+line.width/2-last.x-last.width/2)<line.size;
   // A short final line belongs to its paragraph; it is not a new tiny translation box.
   if (Math.abs(line.x-last.x)>line.size*2.2 || Math.min(line.width,last.width)<line.size*3) return false;
   if (last.width<block.width*.75 && /[.!?。！？][)\]”’]*$/.test(last.text)) return false;
   // First-line indentation plus a completed sentence marks a new paragraph.
   if (line.x>block.x+line.size*.6 && /[.!?。！？][)\]”’]*$/.test(last.text)) return false;
   return !/^\s*[•▪]\s/.test(line.text);
  });
  if (prior) {
   const fragment=prior.text.match(/[A-Za-z][A-Za-z-]*-$/)?.[0];
   const softWrap=fragment && !fragment.slice(0,-1).includes('-') && /^[a-z]/.test(line.text);
   prior.text = softWrap ? prior.text.slice(0,-1)+line.text : prior.text.endsWith('-') ? prior.text+line.text : prior.text+' '+line.text;
   prior.boxes.push(line); Object.assign(prior,bounds(prior.boxes));
  } else blocks.push({text:line.text, boxes:[line], size:line.size, angle:line.angle, ...bounds([line])});
 }
 for (const b of blocks) {
  b.runs = b.boxes.flatMap(l => l.runs);
  b.size = weightedSize(b.runs);
  b.protectedRegion=technical.get(b.boxes[0]);
  b.preserveReason=b.protectedRegion?.kind;
  if(!captions.owners.has(b.boxes[0])&&b.y>viewport.height*.8&&b.size<bodySize*.87&&/https?:\/\//i.test(b.text))b.preserveReason='link-footnote';
  b.preserve = !!b.preserveReason || Math.abs(b.angle)>.1 || !/[\p{L}]{2}/u.test(b.text) || (b.text.includes('@') && b.text.split(/[,;\s]+/).every(t => !t || /^[\w.+-]+@[\w.-]+$/.test(t)));
  b.role = captions.owners.has(b.boxes[0]) ? 'caption' : titleLine(b) ? 'title' : metadataLine(b) ? 'metadata' : headings.has(b.boxes[0]) ? 'heading' : caption(b.text) ? 'caption' : b.size<bodySize*.87 && b.y>viewport.height*.8 ? 'footnote' : b.width>viewport.width*.24 && (b.boxes.length>1 || b.text.length>45) ? 'body' : 'label';
  b.metadataKind=b.role==='metadata' ? /(?:department|school|institute|faculty|university|college|laboratory)\b/i.test(b.text)?'affiliation':!b.text.includes('@')&&b.runs.filter(r=>/[A-Za-z]{2}/.test(r.text)).every(r=>/^[A-Z][a-z]+(?:[ .,’'*-]+[A-Z]?[a-z]*)*[\d,* ]*$/.test(r.text.trim()))?'authors':'other' : undefined;
  if(b.metadataKind==='authors'){b.preserve=true;b.preserveReason='authors';}
  if(!b.preserve&&b.role!=='metadata')Object.assign(b,inlineMath(b,mathFonts));
  // A heading can be centered over its own column without being centered on the page.
  b.align = b.role==='title' || b.role==='metadata' || namedHeading(b.text) ? 'center' : 'left';
 }
 // Use a total order. Spanning title/header bands precede their local columns;
 // numeric sort keys avoid contradictory pairwise column comparisons.
 const spans = blocks.filter(b => b.width>viewport.width*.6 && b.height<viewport.height*.15).sort((a,b) => a.y-b.y);
 const boundaries = [...new Set(spans.map(bottom))].sort((a,b) => a-b);
 for (const b of blocks) {
  b.band = boundaries.filter(y => y<=b.y+1).length;
  b.column = (b.y<bodyStart && hasTitle || b.width>viewport.width*.6) ? 0 : b.x>viewport.width*.5 ? 2 : 1;
 }
 blocks.sort((a,b) => a.band-b.band || a.column-b.column || a.y-b.y || a.x-b.x);
 return blocks.map((b,i) => ({...b,id:String(i)}));
}

// Translation can flow within a text region, but never across a heading, figure
// or a column boundary. Source boxes remain unchanged for linked highlighting.
export function readingRegions(blocks, viewport) {
 const regions = [];
 const translated = blocks.filter(b => !b.preserve).sort((a,b) => a.y-b.y || a.x-b.x);
 for (const b of translated) {
  const previous = (b.role==='body'||b.metadataKind==='affiliation') && [...regions].reverse().find(r => {
   if (r.role!==b.role || b.role==='metadata'&&!r.blocks.every(x=>x.metadataKind==='affiliation') || Math.abs(weightedSize(r.blocks)-b.size)>b.size*.12 || Math.abs(r.x-b.x)>b.size*1.5 || Math.abs(r.width-b.width)>b.size*2.5) return false;
   const gap = b.y-bottom(r);
   if (gap < -1 || gap>b.size*2.4) return false;
   return !blocks.some(other => !r.blocks.includes(other) && other!==b && other.y>=bottom(r)-1 && bottom(other)<=b.y+1 && other.x<right(r) && right(other)>r.x);
  });
  if (previous) { previous.blocks.push(b); Object.assign(previous,bounds(previous.blocks)); }
  else regions.push({blocks:[b],role:b.role,...bounds([b])});
 }
 for (const r of regions) {
  const size = weightedSize(r.blocks);
  const next = blocks.filter(b => !r.blocks.includes(b) && b.y>=bottom(r)-1 && b.x<right(r) && right(b)>r.x).sort((a,b) => a.y-b.y)[0];
  r.height += Math.min(size*(r.role==='caption'?3:r.role==='label' ? .12 : .7),Math.max(0,(next?.y ?? viewport.height)-bottom(r)-size*.15));
  r.size = size;
 }
 return regions;
}

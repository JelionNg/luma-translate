// Display formula ownership is independent of artwork/caption classification.
const right=b=>b.x+b.width,bottom=b=>b.y+b.height;
function extent(boxes){const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));return{x,y,width:Math.max(...boxes.map(right))-x,height:Math.max(...boxes.map(bottom))-y};}
export function displayFormulas(horizontal,bodySize,{lane,within,prose,figureCaption,algorithm,section,captionLine,regions}){
 // A displayed equation is a local layout region, not a string containing '='.
 // Grow from operators/equation numbers until a real prose or heading boundary.
 const proseFonts=new Set(horizontal.flatMap(l=>(l.runs||[]).filter(r=>/[A-Za-z]{4,}/.test(r.text)&&r.text.length>35).map(r=>r.font)));
 const proseRun=l=>(l.runs||[]).some(r=>proseFonts.has(r.font)&&/[A-Za-z]{2,}/.test(r.text)&&!/^\s*[,;]?\s*(?:where|if|otherwise|max|min|log|sin|cos)\s*[,;]?\s*$/i.test(r.text));
 const narrative=l=>proseRun(l)||/\b(?:denoted|corresponds|duration|means)\b/i.test(l.text)||/^where\b/i.test(l.text)&&(l.text.match(/[A-Za-z]{3,}/g)||[]).length>2||l.text.length>35&&(l.text.match(/[A-Za-z]{3,}/g)||[]).length>4;
 const barrier=l=>/:\s*$/.test(l.text)||narrative(l)||prose(l)||figureCaption.test(l.text)||algorithm.test(l.text)||section.test(l.text);
 const covered=l=>captionLine(l)||regions.some(r=>r.lines.includes(l));
 for(const seed of horizontal){
  if(covered(seed)||barrier(seed))continue;
  const operator=/[=∑∏∫≤≥∈]/.test(seed.text);
  const number=/^\(\d+[a-z]?\)$/.test(seed.text.trim());
  if(!operator&&!number)continue;
  const area=lane(seed),local=horizontal.filter(l=>within(l,area));
  if(local.some(l=>l!==seed&&Math.abs(l.baseline-seed.baseline)<bodySize*.55&&narrative(l)))continue;
  const selected=new Set([seed]);let upper=seed.y,lower=bottom(seed),changed=true;
  while(changed){
   changed=false;
   for(const line of local){
    if(selected.has(line)||covered(line)||barrier(line))continue;
    const gap=Math.max(upper-bottom(line),line.y-lower,0);
    if(gap>bodySize*1.45)continue;
    // No expansion through a prose baseline, even when a glyph bbox overlaps it.
    const low=Math.min(line.baseline,seed.baseline),high=Math.max(line.baseline,seed.baseline);
    if(local.some(l=>barrier(l)&&l.baseline>low+bodySize*.25&&l.baseline<high-bodySize*.25))continue;
    if(local.some(l=>narrative(l)&&Math.abs(l.baseline-line.baseline)<bodySize*.85))continue;
    selected.add(line);upper=Math.min(upper,line.y);lower=Math.max(lower,bottom(line));changed=true;
   }
  }
  const lines=[...selected];
  // Equation-number seeds require actual mathematical content nearby.
  if(number&&!lines.some(l=>/[=∑∏∫≤≥∈]|[\x00-\x1f]/.test(l.text)))continue;
  const box=extent(lines);
  const nextProse=local.filter(l=>narrative(l)&&l.y>=seed.y&&l.y>box.y).sort((a,b)=>a.y-b.y)[0];
  if(nextProse)box.height=Math.min(box.height,nextProse.y-box.y-.5);
  regions.push({...box,kind:'formula',lines});
 }
 return regions.filter(r=>r.kind==='formula');
}

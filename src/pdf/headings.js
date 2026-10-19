// Heading ownership is established before paragraph assembly. Consumers must
// not reclassify a wrapped title from its final line or translated wording.
export const numberedHeading=text=>/^\d+(?:\.\d+)*(?:\s+|(?=\p{Lu}))\p{L}/u.test(text);
export const namedHeading=text=>/^(abstract|references|acknowledg(?:e)?ments?|appendix|摘要|参考文献|致谢)$/i.test(text.trim());
const fontOf=line=>{const counts=new Map();for(const r of line.runs)counts.set(r.font,(counts.get(r.font)||0)+r.text.length);return [...counts].sort((a,b)=>b[1]-a[1])[0]?.[0];};
export function headingGroups(lines,excluded){
 const owners=new Map(),fontMass=new Map();
 for(const l of lines)if(!excluded(l)&&l.text.length>25&&!numberedHeading(l.text))for(const r of l.runs)fontMass.set(r.font,(fontMass.get(r.font)||0)+r.text.length);
 const bodyFont=[...fontMass].sort((a,b)=>b[1]-a[1])[0]?.[0];
 const seeds=lines.filter(l=>!excluded(l)&&(numberedHeading(l.text)||namedHeading(l.text)));
 const headingFonts=new Set(seeds.map(fontOf).filter(f=>bodyFont&&f!==bodyFont));
 for(const l of lines)if(!excluded(l)&&!seeds.includes(l)&&l.text.length<160&&!/[.!?。！？]$/.test(l.text)&&headingFonts.has(fontOf(l))&&l.runs.filter(r=>headingFonts.has(r.font)).reduce((n,r)=>n+r.text.length,0)>l.text.length*.85)seeds.push(l);
 seeds.sort((a,b)=>a.baseline-b.baseline||a.x-b.x);
 for(const seed of seeds){
  if(owners.has(seed))continue;
  const group={lines:[seed]};owners.set(seed,group);let last=seed;
  if(namedHeading(seed.text))continue;
  for(;;){
   // Only the immediate next row in this column can continue a title.
   const next=lines.filter(l=>l!==last&&l.baseline>last.baseline+last.size*.5&&l.x<last.x+last.width+last.size&&l.x+l.width>last.x-last.size).sort((a,b)=>a.baseline-b.baseline)[0];
   if(!next||excluded(next)||owners.has(next)||numberedHeading(next.text)||namedHeading(next.text))break;
   const gap=next.baseline-last.baseline-last.size,font=fontOf(seed);
   const titleWords=next.text.match(/[A-Za-z][A-Za-z0-9-]*/g)||[];
   const titleCase=titleWords.length>0&&titleWords.filter(w=>/^[A-Z]/.test(w)||/^(and|or|of|on|in|for|to|the|with|a|an)$/.test(w)).length===titleWords.length;
   const uniform=next.runs.filter(r=>r.font===font).reduce((n,r)=>n+r.text.length,0)/Math.max(1,next.text.length)>.85;
   if(gap<0||gap>last.size*.65||Math.abs(next.size-seed.size)>seed.size*.08||Math.abs(next.x-seed.x)>seed.size*3.3||!uniform||/[.!?。！？]$/.test(next.text)||!((bodyFont&&font!==bodyFont)||titleCase))break;
   group.lines.push(next);owners.set(next,group);last=next;
  }
 }
 return owners;
}

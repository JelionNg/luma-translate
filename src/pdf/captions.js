// A caption owns all of its continuation lines and its local column. Both the
// artwork classifier and paragraph builder consume this single ownership map.
export const isCaption=text=>/^(?:fig(?:ure)?\.?|table|图|表)\s*\d+\s*[.:：]/i.test(text);
const right=b=>b.x+b.width;
export function captionGroups(lines,viewport){
 const owners=new Map(),groups=[];
 const seeds=lines.filter(l=>isCaption(l.text));
 for(const seed of seeds){
  const peers=seeds.filter(l=>l!==seed&&Math.abs(l.baseline-seed.baseline)<seed.size*.8).sort((a,b)=>a.x-b.x);
  const next=peers.find(l=>l.x>seed.x);
  const limit=next?next.x-seed.size*.3:Math.min(viewport.width,Math.max(right(seed)+seed.size,viewport.width*.92));
  const group={seed,lines:[seed]};owners.set(seed,group);groups.push(group);
  let last=seed;
  for(const line of lines.filter(l=>l.baseline>seed.baseline+seed.size*.25).sort((a,b)=>a.baseline-b.baseline||a.x-b.x)){
   const gap=line.baseline-last.baseline-last.size;
   if(line.baseline-last.baseline>last.size*2)break;
   if(owners.has(line)||isCaption(line.text)||Math.abs(line.angle-seed.angle)>.05||Math.abs(line.size-seed.size)>seed.size*.22)continue;
   if(Math.abs(line.x-seed.x)>seed.size*1.6||right(line)>limit+1||gap< -seed.size*.1||gap>seed.size*.8)continue;
   if(/[.!?。！？][)\]]*$/.test(last.text)&&last.width<seed.width*.72)break;
   group.lines.push(line);owners.set(line,group);last=line;
  }
 }
 return {groups,owners};
}

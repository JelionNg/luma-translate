// Context is source evidence, never generated instructions or translated output.
export function documentContext(states,page,batch){
 const first=states[0]?.blocks||[];
 const title=first.filter(b=>b.role==='title').map(b=>b.text).join(' ').slice(0,600);
 const overview=first.filter(b=>!b.preserve&&b.role!=='metadata').map(b=>b.text).join(' ').slice(0,4500);
 const ordered=states.flatMap(s=>(s.blocks||[]).filter(b=>!b.preserve).map(b=>({b,page:s.number})));
 const start=ordered.findIndex(x=>x.b===batch[0]),end=ordered.findIndex(x=>x.b===batch.at(-1));
 const section=ordered.slice(0,start+1).filter(x=>x.b.role==='heading').at(-1)?.b.text||'';
 return {title,overview,section,page:page.number,before:ordered.slice(Math.max(0,start-2),start).map(x=>x.b.text).join(' ').slice(-2200),after:ordered.slice(end+1,end+3).map(x=>x.b.text).join(' ').slice(0,2200)};
}

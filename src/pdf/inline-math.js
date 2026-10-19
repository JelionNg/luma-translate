// PDF font/run geometry owns math identity; translated prose only carries opaque slots.
const right=b=>b.x+b.width,bottom=b=>b.y+b.height;
const words=s=>(s.match(/[A-Za-z]{3,}/g)||[]).length;
function proseFonts(lines){return new Set(lines.flatMap(l=>l.runs.filter(r=>words(r.text)>=3&&r.text.length>22).map(r=>r.font)));}
export function attachMathFragments(lines){
 const fonts=proseFonts(lines);
 // Ownership uses the immutable prose baseline, never a bbox enlarged by
 // previously attached delimiters. Otherwise assignments drift into prior rows.
 const proseCenter=l=>{const prose=l.runs.filter(r=>fonts.has(r.font)&&/[A-Za-z]{2}/.test(r.text));return prose.length?prose.reduce((n,r)=>n+(r.baseline-r.size*.3)*r.text.length,0)/prose.reduce((n,r)=>n+r.text.length,0):l.y+l.height/2;};
 const centers=new Map(lines.map(l=>[l,proseCenter(l)]));
 // PDF extraction may split every word around an equation into a different
 // run. Language evidence belongs to the whole line, not one text-show run.
 const narrative=l=>words(l.runs.filter(r=>fonts.has(r.font)).map(r=>r.text).join(" "))>=2;
 // Raised/lowered glyphs can be separate PDF lines. Give them back to the
 // narrative baseline before classifying display equations or paragraphs.
 for(const line of [...lines]){
  if(narrative(line))continue;
  const owner=lines.filter(l=>l!==line&&narrative(l)&&Math.abs(centers.get(l)-centers.get(line))<l.size*.85&&line.x>=l.x-l.size*.8&&right(line)<=right(l)+l.size*.8).sort((a,b)=>Math.abs(centers.get(a)-centers.get(line))-Math.abs(centers.get(b)-centers.get(line)))[0];
  if(!owner)continue;
  owner.runs.push(...line.runs);
  const x=Math.min(owner.x,line.x),y=Math.min(owner.y,line.y);
  owner.width=Math.max(right(owner),right(line))-x;owner.height=Math.max(bottom(owner),bottom(line))-y;owner.x=x;owner.y=y;
  lines.splice(lines.indexOf(line),1);
 }
 return fonts;
}
export function inlineMath(block,fonts){
 const slots=[];let text='';
 for(const line of block.boxes){
  const runs=[...line.runs].sort((a,b)=>a.x-b.x||a.baseline-b.baseline);let group=[];
  const flush=()=>{
   if(!group.length)return;
   const x=Math.min(...group.map(r=>r.x)),y=Math.min(...group.map(r=>r.y));
   const slot={token:'⟦M'+slots.length+'⟧',x,y,width:Math.max(...group.map(right))-x,height:Math.max(...group.map(bottom))-y,baseline:line.baseline,size:block.size,runs:[...group],line,kind:'inline-formula',text:group.map(r=>r.text).join('')};
   slots.push(slot);text+=' '+slot.token+' ';group=[];
  };
  for(const [index,run] of runs.entries()){
   // Alternate math fonts carry variables/operators and their script fonts.
   // Long italic prose or a short bold heading is still ordinary language.
   // A font switch is typography, not mathematical evidence. Ordinary words
   // such as italic how/whom stay in prose; scripts or operators can establish
   // a mathematical use of a word (for example a function with a subscript).
   const lexical=/[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/.test(run.text)&&!/[=∑∏∫≤≥∈]/.test(run.text);
   const adjacentScript=[runs[index-1],runs[index+1]].some(r=>r&&r.size<block.size*.86&&Math.abs(r.x-run.x)<run.width+block.size*.7);
   const languageArrow=/^[\s↔→←⟷⇔]+$/.test(run.text)&&[runs[index-1],runs[index+1]].some(r=>r&&/[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/.test(r.text));
   const proseWord=languageArrow||lexical&&run.size>=block.size*.86&&!adjacentScript;
   const math=!proseWord&&!fonts.has(run.font)&&words(run.text)<2&&(!/[A-Za-z]{5,}/.test(run.text)||run.size<block.size*.86)&&!/^\d{4}$/.test(run.text.trim());
   if(math){group.push(run);continue;}
   flush();text+=(text&&!/\s$/.test(text)?' ':'')+run.text;
  }
  flush();text+=' ';
 }
 // A wrapped equation can end one source line and resume at the start of
 // the next. Keep its source fragments, never crop the prose-sized union box.
 for(let i=slots.length-1;i>0;i--){
  const prior=slots[i-1],slot=slots[i];
  const adjacent=text.includes(prior.token+'  '+slot.token)||new RegExp(prior.token+'\\s+'+slot.token).test(text);
  if(prior.line!==slot.line&&adjacent){prior.fragments=[...(prior.fragments||[{...prior}]),slot];text=text.replace(slot.token,'');slots.splice(i,1);}
 }
 // Join line-wrap hyphens in prose, leaving math slots untouched.
 text=text.replace(/([A-Za-z]+)- +(?=[a-z])/g,'$1').replace(/\s+/g,' ').trim();
 return {math:slots,translationText:slots.length?text:block.text};
}
export function validateMath(block,text){
 const expected=block.math||[],found=text.match(/⟦M\d+⟧/g)||[];
 if(found.length!==expected.length||expected.some(s=>found.filter(t=>t===s.token).length!==1))throw Error('公式占位未完整保留，请重试本段');
}

// Recover formatting-only marker changes; identity/count still must validate.
export function normalizeMath(block,text){
 const known=new Set((block.math||[]).map(s=>s.token));
 return text.replace(/(?:⟦|\[)\s*M\s*(\d+)\s*(?:⟧|\])/g,(raw,n)=>known.has('⟦M'+n+'⟧')?'⟦M'+n+'⟧':raw);
}
export async function recoverMath(block,translate){
 // The fallback translates prose spans only. Formula positions and original
 // pixels stay local, so model compliance cannot lose or duplicate a formula.
 const parts=(block.translationText||block.text).split(/(⟦M\d+⟧)/);
 const prose=parts.flatMap((text,index)=>text.trim()&&!/^⟦M\d+⟧$/.test(text)?[{id:String(index),text}]:[]);
 const results=new Map();
 for(let i=0;i<prose.length;i+=4){
  const batch=prose.slice(i,i+4),items=await translate(batch);
  for(const item of batch){const result=items.find(x=>x.id===item.id);if(typeof result?.text!=='string'||!result.text.trim())throw Error('公式周边译文缺失');results.set(Number(item.id),result.text.trim());}
 }
 const text=parts.map((part,index)=>results.has(index)?results.get(index):part).join(' ');
 validateMath(block,text);return text;
}

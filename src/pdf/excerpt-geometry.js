import {sourcePassage,anchoredExcerpt} from './selection.js';
const measured=new WeakMap();
// Measure only a selected excerpt, after translation. No geometry preparation
// or source-word table is added to the translation path.
export async function excerptGeometry(block,selected,excerpt,page,TextLayer){
 const passage=sourcePassage(block),span=anchoredExcerpt(passage.text,selected,excerpt);
 if(!span)return [];
 const identity=JSON.stringify([passage.text,block.result]),key=JSON.stringify([selected,excerpt]);
 let cache=measured.get(block);if(!cache||cache.identity!==identity){cache={identity,items:new Map()};measured.set(block,cache);}
 if(cache.items.has(key))return cache.items.get(key);
 const content=await page.getTextContent(),viewport=page.getViewport({scale:1});
 const container=document.createElement('div');container.className='pdf-excerpt-measure';
 for(const [key,value] of Object.entries({'--total-scale-factor':'1','--scale-round-x':'1px','--scale-round-y':'1px'}))container.style.setProperty(key,value);
 document.body.append(container);
 try{
  const layer=new TextLayer({textContentSource:content,container,viewport});await layer.render();
  const divs=new Map();let i=0;content.items.forEach((item,index)=>{if(item.str!==undefined)divs.set(index,layer.textDivs[i++]);});
  const origin=container.getBoundingClientRect(),range=document.createRange();
  const boxes=passage.runs.flatMap(({run,index,end,offset})=>{
   const start=offset+Math.max(span.start,index)-index,finish=offset+Math.min(span.end,end)-index;
   const node=divs.get(run.index)?.firstChild;
   if(finish<=start||!node||finish>node.length||Math.abs(run.angle)>.05)return [];
   range.setStart(node,start);range.setEnd(node,finish);
   return [...range.getClientRects()].filter(r=>r.width>0).map(r=>({x:r.left-origin.left,y:run.y,width:r.width,height:run.height}));
  });
  if(boxes.length){if(cache.items.size>=32)cache.items.delete(cache.items.keys().next().value);cache.items.set(key,boxes);}
  return boxes;
 }finally{container.remove();}
}

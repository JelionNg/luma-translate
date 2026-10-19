// Only this module turns formula source geometry into pixels. Source fragments
// remain separate so a line wrap cannot pull neighboring prose into the crop.
export function formulaCanvas(block,slot){
 const source=block.page?.mathCanvas,scale=source?.width/block.page?.width;
 const canvas=document.createElement('canvas');canvas.className='inline-math';canvas.setAttribute('role','img');canvas.setAttribute('aria-label',slot.text);
 if(!scale||!source.height)return canvas;
 const pieces=(slot.fragments||[slot]).map(fragment=>{
  const pad=block.size*.18,owned=new Set(fragment.runs),neighbors=fragment.line.runs.filter(r=>!owned.has(r));
  let left=Math.max(0,fragment.x-pad),top=Math.max(0,fragment.y-pad),right=Math.min(block.page.width,fragment.x+fragment.width+pad),bottom=Math.min(block.page.height,fragment.y+fragment.height+pad);
  for(const r of neighbors){
   if(r.y+r.height<top||r.y>bottom)continue;
   if(r.x+r.width<=fragment.x)left=Math.max(left,(r.x+r.width+fragment.x)/2);
   if(r.x>=fragment.x+fragment.width)right=Math.min(right,(r.x+fragment.x+fragment.width)/2);
  }
  const x=Math.floor(left*scale),y=Math.floor(top*scale),w=Math.max(1,Math.ceil(right*scale)-x),h=Math.max(1,Math.ceil(bottom*scale)-y);
  const crop=document.createElement('canvas');crop.width=w;crop.height=h;const ctx=crop.getContext('2d');
  // Composite member glyph areas only. The union rectangle of a tall delimiter
  // and a variable can span unrelated words; those pixels have no ownership.
  // Transparent backing cannot erase surrounding translated prose.
  ctx.clearRect(0,0,w,h);
  for(const run of fragment.runs){
   const rx=Math.max(x,Math.floor((run.x-block.size*.035)*scale)),ry=Math.max(y,Math.floor((run.y-block.size*.12)*scale));
   const rw=Math.min(x+w,Math.ceil((run.x+run.width+block.size*.035)*scale))-rx,rh=Math.min(y+h,Math.ceil((run.y+run.height+block.size*.12)*scale))-ry;
   if(rw>0&&rh>0)ctx.drawImage(source,rx,ry,rw,rh,rx-x,ry-y,rw,rh);
  }
  // Tighten to actual rendered ink only after obtaining a safe source crop.
  const data=ctx.getImageData(0,0,w,h).data;let x0=w,y0=h,x1=-1,y1=-1;
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const i=(yy*w+xx)*4;if(data[i+3]&&Math.min(data[i],data[i+1],data[i+2])<210){x0=Math.min(x0,xx);y0=Math.min(y0,yy);x1=Math.max(x1,xx);y1=Math.max(y1,yy);}}
  if(x1<0)return null;
  x0=Math.max(0,x0-1);y0=Math.max(0,y0-1);x1=Math.min(w-1,x1+1);y1=Math.min(h-1,y1+1);
  return {crop,x:x0,y:y0,w:x1-x0+1,h:y1-y0+1,baseline:fragment.baseline*scale-y-y0};
 }).filter(Boolean);
 if(!pieces.length){canvas.width=canvas.height=1;canvas.style.width=canvas.style.height='0px';return canvas;}
 const ascent=Math.max(...pieces.map(p=>p.baseline)),descent=Math.max(...pieces.map(p=>p.h-p.baseline)),gap=Math.max(1,Math.round(scale*block.size*.12));
 canvas.width=pieces.reduce((n,p)=>n+p.w,0)+gap*(pieces.length-1);canvas.height=Math.max(1,Math.ceil(ascent+descent));
 let x=0;for(const p of pieces){canvas.getContext('2d').drawImage(p.crop,p.x,p.y,p.w,p.h,x,ascent-p.baseline,p.w,p.h);x+=p.w+gap;}
 Object.assign(canvas.style,{width:canvas.width/scale/block.size+'em',height:canvas.height/scale/block.size+'em',verticalAlign:-descent/scale/block.size+'em'});
 return canvas;
}

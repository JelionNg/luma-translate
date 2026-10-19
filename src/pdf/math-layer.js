// Render formula-font ink separately. Cropping a full page can never establish
// pixel ownership: PDF font extents often overlap neighboring narrative rows.
export async function renderMathLayer(page,operators,viewport,canvas,fonts,ops,onTask){
 canvas.width=viewport.width;canvas.height=viewport.height;
 const ctx=canvas.getContext('2d'),textOps=new Set(['showText','showSpacedText','nextLineShowText','nextLineSetSpacingShowText'].map(k=>ops[k]).filter(v=>v!==undefined));
 let font,hide=false;const stack=[],originals=new Map();
 // Suppress painting, not text operations: skipped showText operations would
 // lose glyph advances and move every later formula in the same text object.
 for(const name of ['fillText','strokeText','fill','stroke']){
  const original=ctx[name];originals.set(name,original);
  ctx[name]=function(...args){if(!hide)return original.apply(this,args);};
 }
 try{
  const task=page.render({canvasContext:ctx,viewport,operationsFilter:i=>{
   const op=operators.fnArray[i];
   if(op===ops.save)stack.push(font);
   else if(op===ops.restore)font=stack.pop();
   else if(op===ops.setFont)font=operators.argsArray[i][0];
   hide=textOps.has(op)&&!fonts.has(font);
   return true;
  }});
  onTask(task);await task.promise;
 }finally{for(const [name,fn] of originals)ctx[name]=fn;}
}

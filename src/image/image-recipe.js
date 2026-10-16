// One validation boundary shared by the page adapter, background and OCR document.
(()=>{
  function parse(value){
    if(!value||value.version!==1||!Number.isInteger(value.width)||!Number.isInteger(value.height)||value.width<1||value.height<1||value.width>16384||value.height>16384||value.width*value.height>20*1024*1024||!Array.isArray(value.draws)||!value.draws.length||value.draws.length>256)throw Error('未捕获完整漫画绘制信息，请刷新页面后重试');
    const sources=new Set();const draws=value.draws.map(d=>{
      if(typeof d.url!=='string'||d.url.length>8192)throw Error('无效漫画来源');const u=new URL(d.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('无效漫画来源');sources.add(u.href);
      if(!Array.isArray(d.args)||![2,4,8].includes(d.args.length)||d.args.some(n=>!Number.isFinite(n)||Math.abs(n)>100000)||!Array.isArray(d.matrix)||d.matrix.length!==6||d.matrix.some(n=>!Number.isFinite(n)||Math.abs(n)>100000))throw Error('无效漫画绘制参数');
      return {url:u.href,args:d.args.slice(),matrix:d.matrix.slice(),smoothing:!!d.smoothing};
    });if(sources.size>8)throw Error('漫画页面来源数量超过限制');return {version:1,width:value.width,height:value.height,draws};
  }
  async function rebuild(raw,read,signal){const recipe=parse(raw),images=new Map();let pixels=0;
    try{for(const {url}of recipe.draws){if(images.has(url))continue;signal.throwIfAborted();const bitmap=await createImageBitmap(await read(url));images.set(url,bitmap);pixels+=bitmap.width*bitmap.height;if(pixels>40*1024*1024)throw Error('漫画源图超过像素预算');}
      signal.throwIfAborted();const canvas=new OffscreenCanvas(recipe.width,recipe.height),ctx=canvas.getContext('2d');
      for(const d of recipe.draws){ctx.setTransform(...d.matrix);ctx.imageSmoothingEnabled=d.smoothing;ctx.drawImage(images.get(d.url),...d.args);}return await canvas.convertToBlob({type:'image/png'});
    }finally{for(const bitmap of images.values())bitmap.close();}
  }
  globalThis.ReaderImageRecipe=Object.freeze({parse,rebuild});
})();

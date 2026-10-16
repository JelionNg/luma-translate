// Record bounded image-only drawing recipes; page metadata is untrusted at consumers.
(()=>{
  if(globalThis.__readerImageCapture)return;globalThis.__readerImageCapture=true;
  const states=new WeakMap();
  function state(canvas){let s=states.get(canvas);if(!s||s.width!==canvas.width||s.height!==canvas.height){s={width:canvas.width,height:canvas.height,revision:(s?.revision||0)+1,draws:[],invalid:false,clipped:false,timer:null};states.set(canvas,s);}return s;}
  function publish(canvas,s){s.revision++;if(s.timer)return;s.timer=setTimeout(()=>{s.timer=null;if(states.get(canvas)!==s||!canvas.isConnected)return;
    canvas.setAttribute('data-reader-image-recipe',JSON.stringify({version:1,width:s.width,height:s.height,revision:s.revision,draws:s.invalid||s.clipped?[]:s.draws}));
    canvas.setAttribute('data-reader-image-revision',String(s.revision));},200);}
  for(const key of ['width','height']){const descriptor=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,key);if(!descriptor?.set)continue;Object.defineProperty(HTMLCanvasElement.prototype,key,{...descriptor,set(value){descriptor.set.call(this,value);const old=states.get(this);if(old)clearTimeout(old.timer);states.delete(this);this.removeAttribute('data-reader-image-recipe');const fresh=state(this);publish(this,fresh);}});}
  for(const name of ['drawImage','putImageData','clearRect','fillText','strokeText','fill','stroke','fillRect','strokeRect','clip']){
    const original=CanvasRenderingContext2D.prototype[name];
    CanvasRenderingContext2D.prototype[name]=function(...args){
      const result=Reflect.apply(original,this,args),canvas=this.canvas;if(!(canvas instanceof HTMLCanvasElement))return result;
      const s=state(canvas),matrix=this.getTransform();
      const identity=matrix.a===1&&matrix.b===0&&matrix.c===0&&matrix.d===1&&matrix.e===0&&matrix.f===0;
      if(name==='clearRect'&&identity&&args[0]===0&&args[1]===0&&args[2]>=canvas.width&&args[3]>=canvas.height){s.draws=[];s.invalid=false;}
      else if(name==='drawImage'){
        const [image,...values]=args,url=image instanceof HTMLImageElement?image.currentSrc||image.src:null;
        if(!url||!/^https?:/.test(url)||url.length>8192||![2,4,8].includes(values.length)||values.some(x=>!Number.isFinite(x))||s.draws.length>=256||this.globalAlpha!==1||this.globalCompositeOperation!=='source-over'||this.filter!=='none'||this.shadowBlur||this.shadowOffsetX||this.shadowOffsetY)s.invalid=true;
        else s.draws.push({url,args:values,matrix:[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f],smoothing:this.imageSmoothingEnabled});
      }else{s.invalid=true;if(name==='clip')s.clipped=true;}
      if(canvas.width>=120&&canvas.height>=70)publish(canvas,s);return result;
    };
  }
})();

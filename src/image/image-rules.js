// Independent capability profiles: selectors identify content, adapters own pixels/geometry.
(()=>{
  if(globalThis.ReaderImageRules)return;
  const profiles=[
    {id:'jumpplus-canvas-reader',hosts:['shonenjumpplus.com'],selectors:['.js-viewer canvas.page-image'],category:'canvas',canvas:true,continuous:true,readerRoot:'.js-viewer',axis:'horizontal',direction:'rtl'},
    {id:'reddit-gallery',hosts:['reddit.com'],selectors:['shreddit-post img','[role="dialog"] img'],category:'gallery'},
    {id:'social-gallery',hosts:['x.com','twitter.com'],selectors:['[data-testid="tweetPhoto"] img','[role="dialog"] img'],category:'gallery'},
    {id:'article-images',hosts:['github.com','huggingface.co'],selectors:['article img','.markdown-body img','.prose img'],category:'article'},
    {id:'webtoon-reader',hosts:['webtoons.com'],selectors:['#_imageList img','img._images'],category:'continuous',continuous:true},
    {id:'pixiv-background-reader',hosts:['comic.pixiv.net','comic-store-viewer.pixiv.net'],selectors:['div[id*="page-"]'],category:'background',background:true,continuous:true},
    {id:'bilibili-canvas-reader',hosts:['manga.bilibili.com'],selectors:['.image-container canvas','canvas#aniber-reader'],category:'canvas',canvas:true,continuous:true}
  ];
  let userRules={};
  function parseOverride(value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('image 须为规则对象');
    const result={};
    for(const [key,item]of Object.entries(value)){
      if(['selectors','exclude'].includes(key)){if(!Array.isArray(item)||item.length>32||item.some(s=>typeof s!=='string'||!s.trim()||s.length>512))throw Error(key+' 须为最多32个选择器');for(const selector of item)document.querySelector(selector);result[key]=item.slice();}
      else if(['enabled','background','canvas','continuous'].includes(key)){if(typeof item!=='boolean')throw Error(key+' 须为布尔值');result[key]=item;}
      else if(['minWidth','minHeight','ahead'].includes(key)){const min=key==='ahead'?0:32,max=key==='ahead'?2:2048;if(!Number.isFinite(item)||item<min||item>max)throw Error(key+' 超出范围');result[key]=item;}
      else throw Error('未知图片规则字段：'+key);
    }return result;
  }
  function setUserRules(parsed){userRules=parsed;}
  function resolve(url=location.href){
    const u=new URL(url),host=u.hostname;
    const result={enabled:true,exclude:[],minWidth:120,minHeight:70,ahead:0.5,...(profiles.find(p=>p.hosts.some(h=>host===h||host.endsWith('.'+h)))||{id:'generic-image',category:'article',selectors:[]})};
    for(const entry of userRules[host]?.entries||[])if(entry.image&&(entry.path==='*'||entry.path===u.pathname)){Object.assign(result,entry.image);result.id='custom:'+host+entry.path;}
    return result;
  }
  const matches=(el,s)=>{try{return el.matches(s);}catch{return false;}};
  function background(el){const value=getComputedStyle(el).backgroundImage;const m=/^url\(["']?(.*?)["']?\)$/.exec(value);return m?new URL(m[1],location.href).href:null;}
  function describe(el,rule=resolve()){
    if(!(el instanceof Element)||!rule.enabled||el.closest('[data-reader-ui]')||rule.exclude.some(selector=>el.closest(selector)))return null;
    if(el instanceof HTMLImageElement){const url=el.currentSrc||el.src;if(!url||!el.complete||!el.naturalWidth||/(?:^|\/)(?:blank|loading|spacer|transparent)\.(?:gif|png|svg)(?:[?#]|$)/i.test(url))return null;return {kind:'image',url,key:url};}
    const selected=rule.selectors.some(s=>matches(el,s));
    if(el instanceof HTMLCanvasElement&&((rule.canvas&&selected)||el.clientWidth>=120&&el.clientHeight>=70))return {kind:'canvas',key:`canvas:${el.width}:${el.height}:${el.getAttribute('data-reader-image-revision')||0}`,url:null};
    if(rule.background&&selected){const url=background(el);if(url)return {kind:'background',url,key:url};}
    return null;
  }
  function eligible(el,rule=resolve()){const source=describe(el,rule);if(!source)return false;const r=el.getBoundingClientRect();return r.width>=rule.minWidth&&r.height>=rule.minHeight&&getComputedStyle(el).visibility!=='hidden';}
  let rootCache=[document],rootCacheTime=0;
  function roots(){if(Date.now()-rootCacheTime<1000)return rootCache;const out=[document];let examined=0;for(let i=0;i<out.length&&i<32&&examined<5000;i++){const walker=document.createTreeWalker(out[i],NodeFilter.SHOW_ELEMENT);let el;while((el=walker.nextNode())&&examined++<5000)if(el.shadowRoot&&out.length<32)out.push(el.shadowRoot);}rootCache=out;rootCacheTime=Date.now();return out;}
  function candidates(rule=resolve()){const result=new Set();for(const root of roots())for(const selector of (rule.continuous?rule.selectors:['img','canvas',...rule.selectors]))try{for(const el of root.querySelectorAll(selector)){if(eligible(el,rule))result.add(el);if(result.size>=256)return [...result];}}catch{}return [...result];}
  function hit(x,y,rule=resolve()){
    if(!rule.readerRoot)return null;
    const top=document.elementsFromPoint(x,y).find(el=>!el.closest('[data-reader-ui]'));
    if(!top?.closest(rule.readerRoot))return null;
    // Readers may deliberately disable pointer events on their actual page canvas.
    return candidates(rule).find(el=>{const r=el.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;})||null;
  }
  function nearby(el,rule=resolve()){
    const r=el.getBoundingClientRect();let left=0,top=0,right=innerWidth,bottom=innerHeight;
    const container=rule.readerRoot&&el.closest(rule.readerRoot);if(container){const c=container.getBoundingClientRect();left=Math.max(left,c.left);top=Math.max(top,c.top);right=Math.min(right,c.right);bottom=Math.min(bottom,c.bottom);}
    if(right<=left||bottom<=top)return false;
    if(rule.axis==='horizontal'){const ahead=(right-left)*rule.ahead;if(rule.direction==='rtl')left-=ahead;else right+=ahead;}else bottom+=(bottom-top)*rule.ahead;
    return r.right>left&&r.left<right&&r.bottom>top&&r.top<bottom;
  }
  function order(a,b,rule=resolve()){const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return rule.axis==='horizontal'?(rule.direction==='rtl'?y.right-x.right:x.left-y.left):x.top-y.top;}
  async function dataURL(blob){if(blob.size>12*1024*1024)throw Error('图片超过 12 MiB');return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(blob);});}
  async function acquire(el,source,signal){
    if(source.kind==='canvas'){
      if(el.width*el.height>20*1024*1024)throw Error('图片超过 2000 万像素');
      try{const blob=await new Promise((resolve,reject)=>{try{el.toBlob(resolve,'image/png');}catch(e){reject(e);}});if(!blob)throw Error();return await dataURL(blob);}catch(error){if(error?.name!=='SecurityError')throw error;const raw=el.getAttribute('data-reader-image-recipe');if(!raw||raw.length>512*1024)throw Error('未捕获漫画绘制信息，请刷新页面后重试');return {recipe:ReaderImageRecipe.parse(JSON.parse(raw))};}
    }
    const url=new URL(source.url);if(url.protocol==='blob:'){const response=await fetch(url.href,{signal});if(!response.ok)throw Error('图片读取失败');
      if(Number(response.headers.get('content-length'))>12*1024*1024)throw Error('图片超过 12 MiB');
      const reader=response.body.getReader(),chunks=[];let size=0;
      try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>12*1024*1024)throw Error('图片超过 12 MiB');chunks.push(value);}}catch(e){await reader.cancel();throw e;}finally{reader.releaseLock();}
      return dataURL(new Blob(chunks,{type:response.headers.get('content-type')||'image/png'}));}
    if(!['https:','http:','data:'].includes(url.protocol))throw Error('此图片地址暂不支持');return url.href;
  }
  // Geometry describes the displayed content box, independent of OCR resolution.
  function geometry(el,source,width,height){
    const r=el.getBoundingClientRect(),s=getComputedStyle(el),sx=r.width/el.offsetWidth||1,sy=r.height/el.offsetHeight||1;
    const w=el.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),h=el.clientHeight-parseFloat(s.paddingTop)-parseFloat(s.paddingBottom);
    let dw=w,dh=h,fit=s.objectFit,pos=s.objectPosition;
    if(source.kind==='background'){fit=s.backgroundSize;pos=s.backgroundPosition;if(s.backgroundRepeat!=='no-repeat')return null;}
    if(['contain','cover','none','scale-down'].includes(fit)){let scale=fit==='cover'?Math.max(w/width,h/height):Math.min(w/width,h/height);if(fit==='none')scale=1;if(fit==='scale-down')scale=Math.min(1,scale);dw=width*scale;dh=height*scale;}
    else if(source.kind==='background')return null;
    const parts=pos.split(/\s+/),offset=(p,space)=>p?.endsWith('%')?parseFloat(p)/100*space:p?.endsWith('px')?parseFloat(p):space/2;
    return {left:r.left+(parseFloat(s.paddingLeft)+parseFloat(s.borderLeftWidth))*sx,top:r.top+(parseFloat(s.paddingTop)+parseFloat(s.borderTopWidth))*sy,width:w*sx,height:h*sy,dx:offset(parts[0],w-dw)*sx,dy:offset(parts[1],h-dh)*sy,dw:dw*sx,dh:dh*sy};
  }
  globalThis.ReaderImageRules=Object.freeze({resolve,describe,eligible,candidates,acquire,geometry,hit,nearby,order,profiles,parseOverride,setUserRules});
})();

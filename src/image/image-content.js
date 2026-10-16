(()=>{
  if(globalThis.__readerImageUI)return;globalThis.__readerImageUI=true;
  const rules=ReaderImageRules,jobs=new Map(),suppressed=new WeakMap(),events=new AbortController();
  const MAX_JOBS=12,MAX_ACTIVE=2;
  let host,root,toolbar,button,note,modes,divider,autoButton,hover,current,frame,observer,resizeObserver,scanTimer,viewerTimer,disposed=false,auto=false,viewerUntil=0,readerObserver,readerRoot,lastPoint={x:0,y:0};
  const listen=(target,type,handler,options={})=>target.addEventListener(type,handler,{...(typeof options==='boolean'?{capture:options}:options),signal:events.signal});
  function dispose(){if(disposed)return;disposed=true;chrome.storage?.onChanged?.removeListener(settingsChanged);events.abort();observer?.disconnect();readerObserver?.disconnect();resizeObserver?.disconnect();clearTimeout(scanTimer);clearTimeout(viewerTimer);cancelAnimationFrame(frame);for(const job of jobs.values()){job.controller.abort();job.observer?.disconnect();job.canvas.width=job.canvas.height=1;job.host.remove();}jobs.clear();host?.remove();}
  function alive(){if(disposed)return false;try{if(chrome.runtime?.id)return true;}catch{}dispose();return false;}
  async function send(message){if(!alive())throw Error('扩展已更新，请刷新网页');try{return await chrome.runtime.sendMessage(message);}catch(e){if(!alive()||/Extension context invalidated/i.test(e.message)){dispose();throw Error('扩展已更新，请刷新网页');}throw e;}}
  function surface(container,el){const parent=el.closest('dialog[open]')||document.fullscreenElement||document.documentElement;if(container.parentNode!==parent)parent.append(container);if(container.showPopover&&!container.matches(':popover-open'))try{container.showPopover();}catch{}}
  function makeHost(){const el=document.createElement('div');el.dataset.readerUi='image';el.setAttribute('translate','no');el.setAttribute('popover','manual');el.style.cssText='all:initial!important;position:fixed!important;inset:0!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;pointer-events:none!important;z-index:2147483646!important;';return el;}
  function mount(){if(host)return;host=makeHost();root=host.attachShadow({mode:'closed'});
root.innerHTML=`<style>
      :host::backdrop{background:transparent;pointer-events:none}*{box-sizing:border-box}#toolbar{position:fixed;display:flex;align-items:center;gap:3px;max-width:calc(100vw - 16px);padding:4px;border:1px solid #e6e3ec;border-radius:11px;background:#fffffff2;color:#292433;box-shadow:0 2px 9px #201b2e12;pointer-events:auto;font:12px/1.3 system-ui}button{border:0;background:transparent;color:inherit;font:inherit;padding:6px 9px;border-radius:7px;cursor:pointer;white-space:nowrap}button:hover{background:#f0edf5}button[aria-pressed=true]{background:#eee8fa;color:#603bb0}button:focus-visible,#divider:focus-visible{outline:2px solid #8b5cf6;outline-offset:2px}
      #action.busy{display:inline-flex;align-items:center;gap:6px}#action.busy::before{content:'';width:11px;height:11px;border:1.5px solid currentColor;border-right-color:transparent;border-radius:50%;animation:reader-image-spin .75s linear infinite}@keyframes reader-image-spin{to{transform:rotate(360deg)}}#modes{display:flex;border-right:1px solid #e8e5ed;padding-right:4px;margin-right:2px}#note{max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 5px;color:#60586b}#layer{position:fixed;overflow:hidden;pointer-events:none}canvas{position:absolute;max-width:none!important;max-height:none!important}
      #divider{position:fixed;width:20px;transform:translateX(-50%);pointer-events:auto;cursor:ew-resize;touch-action:none;border:0;background:transparent;padding:0;border-radius:0}#divider::before{content:'';position:absolute;inset:0 auto 0 9px;width:2px;background:white;box-shadow:0 0 3px #201b2e88}#divider::after{content:'‹ ›';position:absolute;left:-5px;top:50%;transform:translateY(-50%);width:30px;height:30px;border:1px solid #e5dfef;border-radius:50%;background:white;color:#68547f;display:grid;place-items:center;box-shadow:0 2px 8px #201b2e22;font:15px system-ui} [hidden]{display:none!important}
      </style><div id="divider" hidden role="slider" tabindex="0" aria-label="原图与译文分界，左侧原图，右侧译文" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"></div><div id="toolbar" hidden><div id="modes" hidden><button data-mode="original">原图</button><button data-mode="translated">译文</button><button data-mode="compare" title="拖动分界线，左侧原图、右侧译文">对照</button></div><span id="note" role="status" hidden></span><button id="action" title="在本机识别图片，仅文字发送至翻译服务">✦ 翻译图片</button></div>`;
    button=root.querySelector('#action');note=root.querySelector('#note');toolbar=root.querySelector('#toolbar');modes=root.querySelector('#modes');divider=root.querySelector('#divider');
    autoButton=document.createElement('button');autoButton.textContent='连续翻译';autoButton.title='只处理当前阅读器视区附近的图片';autoButton.hidden=!rules.resolve().continuous;toolbar.prepend(autoButton);
    autoButton.onclick=()=>{auto=!auto;autoButton.setAttribute('aria-pressed',String(auto));if(auto)scheduleScan();};
    button.onclick=()=>{const job=jobs.get(hover);if(job){suppressed.set(hover,job.source.key);remove(job);position();}else if(hover)start(hover);};
    for(const control of modes.children)control.onclick=()=>{if(current){current.mode=control.dataset.mode;position();}};
    const drag=e=>{if(!current||!divider.hasPointerCapture(e.pointerId))return;const r=current.layer.getBoundingClientRect();current.split=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100));position();};
    divider.onpointerdown=e=>{e.preventDefault();divider.setPointerCapture(e.pointerId);drag(e);};divider.onpointermove=drag;divider.onpointerup=e=>{if(divider.hasPointerCapture(e.pointerId))divider.releasePointerCapture(e.pointerId);};
    divider.onkeydown=e=>{if(!current)return;const delta={ArrowLeft:-5,ArrowRight:5,Home:-100,End:100}[e.key];if(delta===undefined)return;e.preventDefault();current.split=Math.max(0,Math.min(100,current.split+delta));position();};
    document.documentElement.append(host);
  }
  function remove(job){if(jobs.get(job.img)!==job)return;jobs.delete(job.img);job.controller.abort();job.observer?.disconnect();send({type:'reader-image-stop',id:job.id}).catch(()=>{});resizeObserver?.unobserve(job.img);job.host.remove();job.canvas.width=job.canvas.height=1;if(current===job)current=null;}
  function valid(job){return alive()&&jobs.get(job.img)===job&&!job.controller.signal.aborted;}
  function makeLayer(){const h=makeHost();h.dataset.readerUi='image-result';const r=h.attachShadow({mode:'closed'});r.innerHTML='<style>:host::backdrop{background:transparent;pointer-events:none}[hidden]{display:none!important}.layer{position:fixed;overflow:hidden;pointer-events:none}canvas{position:absolute;max-width:none!important;max-height:none!important}</style><div id="layer" class="layer" hidden><canvas></canvas></div>';return {host:h,layer:r.querySelector('div'),canvas:r.querySelector('canvas')};}
  function positionJob(job){
    const el=job.img,source=rules.describe(el);
    if(!el.isConnected||!source||source.key!==job.source.key){remove(job);return;}
    const r=el.getBoundingClientRect();if(r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth||!job.result||!job.translations.size||job.mode==='original'){job.layer.hidden=true;if(job.canvas.width>1){job.canvas.width=job.canvas.height=1;}return;}
    if(job.canvas.width===1)raster(job);
    const g=rules.geometry(el,job.source,job.result.width,job.result.height);if(!g){job.layer.hidden=true;job.message='此背景布局暂不支持原位覆盖';return;}
    surface(job.host,el);job.layer.hidden=false;job.layer.style.cssText=`left:${g.left}px;top:${g.top}px;width:${g.width}px;height:${g.height}px;clip-path:${job.mode==='compare'?`inset(0 0 0 ${job.split}%)`:'none'};`;
    job.canvas.style.cssText=`left:${g.dx}px;top:${g.dy}px;width:${g.dw}px;height:${g.dh}px;`;
  }
  function position(){if(!alive())return;for(const job of [...jobs.values()])positionJob(job);if(!host)return;current=jobs.get(hover)||null;
    if(!hover?.isConnected){toolbar.hidden=true;divider.hidden=true;return;}
    const r=hover.getBoundingClientRect();toolbar.hidden=r.width<40||r.height<40||r.bottom<=0||r.top>=innerHeight;if(toolbar.hidden){divider.hidden=true;return;}
    surface(host,hover);autoButton.hidden=!rules.resolve().continuous;
    const busy=current&&['acquiring','recognizing','translating'].includes(current.phase);button.classList.toggle('busy',!!busy);button.textContent=busy?(current.phase==='translating'?'正在翻译':'正在识别'):current?'关闭':'✦ 翻译图片';
    button.title=current?`阶段：${({acquiring:'读取图片',recognizing:'排队或识别',translating:'翻译文字',done:'已完成',error:'失败'})[current.phase]} · 规则：${current.rule.id}${current.cacheHit?' · 识别缓存命中':''}`:'在本机识别图片，仅文字发送至翻译服务';
    note.textContent=current?.message||'';note.title=note.textContent;note.hidden=!note.textContent;modes.hidden=!current?.translations.size;
    for(const control of modes.children)control.setAttribute('aria-pressed',String(control.dataset.mode===current?.mode));
    toolbar.style.left=Math.max(8,Math.min(innerWidth-toolbar.offsetWidth-8,r.left+(r.width-toolbar.offsetWidth)/2))+'px';toolbar.style.top=Math.max(8,Math.min(innerHeight-toolbar.offsetHeight-8,r.bottom-toolbar.offsetHeight-8))+'px';
    divider.hidden=!current||current.layer.hidden||current.mode!=='compare';if(!divider.hidden){const box=current.layer.getBoundingClientRect();divider.style.left=(box.left+box.width*current.split/100)+'px';divider.style.top=box.top+'px';divider.style.height=box.height+'px';divider.setAttribute('aria-valuenow',String(Math.round(current.split)));}
  }
  function schedulePosition(){if(frame||disposed)return;frame=requestAnimationFrame(()=>{frame=null;position();});}
  function raster(job){const {width,height}=job.result;const scale=Math.min(1,Math.sqrt(16000000/MAX_JOBS/(width*height)),2400/Math.max(width,height));job.canvas.width=Math.round(width*scale);job.canvas.height=Math.round(height*scale);const ctx=job.canvas.getContext('2d');ctx.setTransform(scale,0,0,scale,0,0);ReaderImageLayout.render(ctx,job.plan.groups,job.translations);}
  function paint(job){const r=job.img.getBoundingClientRect();if(r.bottom>0&&r.top<innerHeight)raster(job);position();}
  async function start(img,automatic=false){
    if(!alive()||jobs.has(img))return;const source=rules.describe(img);if(!source||automatic&&suppressed.get(img)===source.key)return;if(!automatic)suppressed.delete(img);mount();
    if(automatic&&[...jobs.values()].filter(j=>['acquiring','recognizing','translating'].includes(j.phase)).length>=MAX_ACTIVE)return;
    if(jobs.size>=MAX_JOBS){const oldest=[...jobs.values()].find(j=>['done','error'].includes(j.phase)&&j.img!==hover&&(j.img.getBoundingClientRect().bottom<0||j.img.getBoundingClientRect().top>innerHeight));if(oldest)remove(oldest);else return;}
    const job={...makeLayer(),img,source,rule:rules.resolve(),id:crypto.randomUUID(),controller:new AbortController(),translations:new Map(),phase:'acquiring',mode:'translated',split:50,message:'',timings:{},started:performance.now()};jobs.set(img,job);resizeObserver?.observe(img);
    job.observer=new MutationObserver(()=>{const next=rules.describe(img);if(!next||next.key!==job.source.key){remove(job);scheduleScan();}schedulePosition();});
    job.observer.observe(img,{attributes:true,attributeFilter:['src','srcset','width','height','style','class','data-reader-image-revision']});position();
    try{
      const url=await rules.acquire(img,source,job.controller.signal);if(!valid(job))return;job.timings.acquire=performance.now()-job.started;job.phase='recognizing';position();
      const answer=await send({type:'reader-image-recognize',id:job.id,...(typeof url==='string'?{url}:{recipe:url.recipe})});if(!valid(job))return;if(!answer?.ok)throw Error(answer?.error||'图片识别失败');
      job.result=answer.result;job.timings.ocr=answer.elapsedMs;job.cacheHit=!!answer.cacheHit;
      if(!job.result.regions.length){job.phase='done';job.message='未识别到文字';position();return;}
      job.plan=ReaderImageLayout.plan(job.result.regions);job.phase='translating';position();
      let next=0,failure;const consume=async()=>{while(valid(job)&&!failure&&next<job.plan.items.length){const offset=next;next+=4;const items=job.plan.items.slice(offset,offset+4);try{const result=await send({type:'reader-image-translate',id:job.id,items,context:{before:job.plan.items.slice(Math.max(0,offset-3),offset).map(x=>x.text.slice(0,400)),after:job.plan.items.slice(offset+items.length,offset+items.length+3).map(x=>x.text.slice(0,400))}});if(!valid(job))return;if(!result?.ok)throw Error(result?.error||'文字翻译失败');ReaderImageLayout.accept(job.plan,job.translations,result.items);paint(job);}catch(e){failure=e;}}};
      await Promise.all([consume(),consume()]);if(!valid(job))return;if(failure)throw failure;job.phase='done';job.timings.total=performance.now()-job.started;
    }catch(e){if(valid(job)){job.phase='error';job.message=e.message;}}
    finally{if(valid(job)){position();send({type:'reader-image-release',id:job.id}).catch(()=>{});}if(auto)scheduleScan();}
  }
  function choose(el){if(!alive()||!rules.eligible(el))return;hover=el;mount();position();}
  function viewer(){viewerTimer=null;if(!alive())return;const container=document.fullscreenElement||[...document.querySelectorAll('dialog[open],[role="dialog"],[aria-modal="true"]')].reverse().find(el=>el.getBoundingClientRect().width>100);
    const pointed=rules.hit(lastPoint.x,lastPoint.y);if(pointed){choose(pointed);return;}
    const found=container?[...container.querySelectorAll('img,canvas')].filter(el=>rules.eligible(el)).sort((a,b)=>b.clientWidth*b.clientHeight-a.clientWidth*a.clientHeight):document.elementsFromPoint(lastPoint.x,lastPoint.y).filter(el=>rules.eligible(el));
    if(found[0])choose(found[0]);else if(document.contentType.startsWith('image/'))choose(document.querySelector('img'));position();
  }
  function scheduleViewer(){if(!viewerTimer&&!disposed)viewerTimer=setTimeout(viewer,60);}
  function scheduleScan(){if(!auto||scanTimer||disposed)return;scanTimer=setTimeout(()=>{scanTimer=null;const rule=rules.resolve();if(!rule.continuous){auto=false;return;}const candidates=rules.candidates(rule).filter(el=>{const r=el.getBoundingClientRect();return rules.nearby(el,rule)&&!jobs.has(el);}).sort((a,b)=>rules.order(a,b,rule));for(const el of candidates)start(el,true);},160);}
  function watchReader(){const rule=rules.resolve(),el=rule.readerRoot&&document.querySelector(rule.readerRoot);if(!el||el===readerRoot)return;readerObserver?.disconnect();readerRoot=el;
    readerObserver=new MutationObserver(records=>{if(records.every(r=>r.target.closest?.('[data-reader-ui]')))return;schedulePosition();scheduleViewer();scheduleScan();});
    readerObserver.observe(el,{subtree:true,attributes:true,attributeFilter:['style','class','width','height','data-reader-image-revision']});
  }
  listen(document,'pointermove',e=>{if(!rules.resolve().readerRoot||e.composedPath().some(el=>el?.dataset?.readerUi))return;lastPoint={x:e.clientX,y:e.clientY};scheduleViewer();}, {passive:true});
  listen(document,'transitionend',()=>{schedulePosition();scheduleViewer();scheduleScan();},true);
  watchReader();
  listen(document,'pointerover',e=>{lastPoint={x:e.clientX,y:e.clientY};if(e.composedPath().some(el=>el?.dataset?.readerUi))return;const el=e.composedPath().find(el=>rules.eligible(el))||rules.hit(e.clientX,e.clientY);if(el)choose(el);},true);
  listen(document,'click',e=>{if(e.composedPath().some(el=>el?.dataset?.readerUi))return;lastPoint={x:e.clientX,y:e.clientY};viewerUntil=Date.now()+2000;scheduleViewer();},true);
  listen(document,'load',e=>{if(e.target instanceof HTMLImageElement){const job=jobs.get(e.target);if(job)remove(job);scheduleViewer();scheduleScan();}},true);
  listen(document,'toggle',scheduleViewer,true);listen(document,'fullscreenchange',()=>{viewerUntil=Date.now()+2000;scheduleViewer();});
  listen(window,'scroll',()=>{schedulePosition();scheduleScan();},{passive:true,capture:true});listen(window,'resize',schedulePosition,{passive:true});
  listen(window,'pagehide',()=>{auto=false;for(const job of [...jobs.values()])remove(job);});listen(window,'popstate',()=>{auto=false;schedulePosition();});
  function settingsChanged(changes,area){if(area==='local'&&changes.readerRules){try{rules.setUserRules(ReaderUserRules.parse(changes.readerRules.newValue||{}));for(const job of [...jobs.values()])remove(job);position();scheduleScan();}catch(e){if(note){note.textContent=e.message;note.hidden=false;}}return;}if(area==='sync'&&['targetLang','model','endpoint','glossary','serviceId'].some(key=>changes[key])){for(const job of [...jobs.values()])remove(job);position();scheduleScan();}}
  chrome.storage?.onChanged?.addListener(settingsChanged);
  chrome.storage?.local?.get({readerRules:{}}).then(value=>{if(!disposed)rules.setUserRules(ReaderUserRules.parse(value.readerRules));}).catch(()=>{});
  resizeObserver=new ResizeObserver(schedulePosition);
  observer=new MutationObserver(records=>{
    watchReader();
    if(!auto&&!jobs.size&&Date.now()>viewerUntil)return;
    if(!records.some(record=>!record.target.closest?.('[data-reader-ui]')&&[...record.addedNodes,...record.removedNodes].some(node=>!node.dataset?.readerUi)))return;
    schedulePosition();if(Date.now()<viewerUntil||document.fullscreenElement)scheduleViewer();scheduleScan();
  });
  observer.observe(document,{subtree:true,childList:true});
})();

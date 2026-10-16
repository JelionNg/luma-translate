(() => {
  if(window.__readerV2) return;
  window.__readerV2=true;
  const isTop=window===window.top;
  const componentRoots=new Set();
  const baseSelector='p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,td,th,div,section,article,[data-reader-paragraph]';
  const baseExcluded='script,style,noscript,pre,code,textarea,input,select,button,svg,canvas,[contenteditable]:not([contenteditable="false"]),[translate="no"],[data-reader-ui],[data-reader-target],nav,[role="navigation"]';
  let siteRule,selector,excluded,userRules={};
  let localHost,selectionHost,localEpoch=0,localProgress=null;
  function resolveRule(){
    const custom=userRules[location.hostname];
    siteRule=ReaderSiteRules.resolve(new URL(location.href),{disabledIds:custom?.disabled?ReaderSiteRules.ids:[]});
    for(const entry of custom?.entries||[]){
      if(entry.path!=='*'&&entry.path!==location.pathname)continue;
      for(const [key,field]of [['include','roots'],['exclude','exclude']])if(typeof entry[key]==='string'&&entry[key]){
        try{document.querySelector(entry[key]);siteRule.content[field]=[siteRule.content[field],entry[key]].filter(Boolean).join(',');}catch{}
      }
    }
    document.documentElement.toggleAttribute('data-reader-discussion-layout',!!siteRule.layout.discussionRows);
    document.documentElement.toggleAttribute('data-reader-search-layout',!!siteRule.layout.searchResults);
    selector=[baseSelector,siteRule.content.roots,siteRule.content.standalone,siteRule.paragraph.block].filter(Boolean).join(',');
    excluded=[baseExcluded,siteRule.content.exclude].filter(Boolean).join(',');
  }
  resolveRule();
  function closestAcross(el,query){
    for(let node=el;node;node=node.getRootNode?.().host){
      const found=node.closest?.(query);if(found)return found;
    }
    return null;
  }
  function connectObservers(){
    if(!observer)return;
    if(document.body)observer.observe(document.body,mutationOptions);
    for(const root of componentRoots){
      if(!root.host.isConnected){componentRoots.delete(root);continue;}
      observer.observe(root,mutationOptions);
    }
  }
  function discoverComponents(root){
    if(root.nodeType===1&&closestAcross(root,excluded))return;
    const visit=el=>{
      const shadow=el.shadowRoot;
      if(!shadow||componentRoots.has(shadow)||closestAcross(el,excluded))return;
      componentRoots.add(shadow);markDirty(shadow);observer?.observe(shadow,mutationOptions);
      discoverComponents(shadow);
    };
    if(root.nodeType===1)visit(root);
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT,{acceptNode:el=>el.matches(excluded)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
    let el;while(el=walker.nextNode())visit(el);
  }
  function explicitRoot(el){return !!siteRule.content.roots&&el.matches(siteRule.content.roots);}
  function withinScope(el){
    if(siteRule.blocked)return false;
    if(!siteRule.content.roots)return true;
    if(closestAcross(el,siteRule.content.roots)||(siteRule.content.standalone&&el.matches(siteRule.content.standalone)))return true;
    // If a site's markup changed, use ordinary detection until known roots appear.
    return siteRule.content.scope!=='strict'&&!el.getRootNode().querySelector(siteRule.content.roots);
  }
  let config={mode:'dual',dynamic:true}, active=false, busy=false, epoch=0, timer, observer, pendingRun=false;
  let activeWorkers=0,translationIntent=false,scanOwner=null,stabilityTimer;
  let changingParagraphs=new WeakMap(),cacheChecked=new WeakMap();
  let startupAt=performance.now(),firstLoadingAt=null;
  const records=new Map(), failures=new Map(), paragraphWrappers=new Set();
  const tracked=new Set(), nearby=new Set(), dirtyRoots=new Set();
  const loading=new Map();
  const loadingStage=new WeakMap();
  let diagnosticHost,diagnosticController;
  let viewport, revealObserver, bodyObserver, observedBody, layoutDirty=true;
  let scopeVisibility=new WeakMap();
  const pageTranslations=new Map();let pageTranslationBytes=0;
  function pageKey(item){return JSON.stringify([route,config.endpoint,config.model,config.targetLang,config.glossary||'',config.serviceId||'legacy',item.payload||item.source]);}
  function retainTranslation(item,translated){
    const key=pageKey(item),size=(key.length+translated.length)*2;
    const previous=pageTranslations.get(key);if(previous)pageTranslationBytes-=previous.size;
    pageTranslations.delete(key);pageTranslations.set(key,{translated,size});pageTranslationBytes+=size;
    while(pageTranslations.size>1000||pageTranslationBytes>4*1024*1024){const first=pageTranslations.keys().next().value;pageTranslationBytes-=pageTranslations.get(first).size;pageTranslations.delete(first);}
  }
  
  let route=location.href;
  const unclamped=new Set();
  const mutationOptions={childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden','open','aria-expanded','aria-hidden','class','style','translate','slot','data-testid','data-post-click-location']};
  function ownWrite(fn){
    // Preserve queued host mutations before temporarily suppressing our own DOM writes.
    if(observer){const queued=observer.takeRecords();if(queued.length)processMutations(queued);observer?.disconnect();}
    try{return fn();}finally{connectObservers();}
  }
  function descendants(root){return [...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)];}
  function markDirty(root){
    if(!root?.isConnected||root.closest?.(excluded))return;
    for(const existing of dirtyRoots){if(existing.contains(root))return;if(root.contains(existing))dirtyRoots.delete(existing);}
    dirtyRoots.add(root);
  }

  let status={done:0,total:0,error:'',active:false};
  let host, label, progress;
  function ui(){
    if(host||!isTop) return;
    host=document.createElement('div'); host.dataset.readerUi='';
    const shadow=host.attachShadow({mode:'open'});
    ReaderUI.mount(shadow,`<style>
:host{position:fixed!important;right:12px!important;top:65vh!important;z-index:2147483647!important;font:13px system-ui!important;color:#333!important}
button,select{font:inherit;cursor:pointer}button{border:0;background:#f5f5f8;color:#333;border-radius:8px;padding:8px}#ball{position:relative;display:grid;place-items:center;width:40px;height:40px;border-radius:14px;background:linear-gradient(145deg,#292d40,#121522);color:#e8dcff;box-shadow:0 4px 16px #17132b30,inset 0 1px 0 #ffffff26;border:1px solid #ffffff55;touch-action:none;cursor:pointer;padding:0;transition:background .2s,box-shadow .2s,transform .2s}#ball svg{width:23px;height:23px}#ball:hover{transform:translateY(-1px);box-shadow:0 6px 20px #17132b45}#ball[data-active=true]{background:linear-gradient(145deg,#8b5cf6,#6254d9);color:white}#ball[data-busy=true]::after{content:"";position:absolute;inset:-3px;border:1.5px solid transparent;border-top-color:#a78bfa;border-right-color:#c4b5fd;border-radius:17px;animation:reader-pulse 1.4s ease-in-out infinite}#ball[data-error=true]::before{content:"";position:absolute;right:-2px;top:-2px;width:7px;height:7px;border-radius:50%;background:#f59e0b;border:2px solid white}@keyframes reader-pulse{50%{opacity:.25}}@media(prefers-reduced-motion:reduce){#ball{transition:none}#ball[data-busy=true]::after{animation:none}}#tools{position:absolute;top:43px;right:0;width:40px;height:30px;background:white;box-shadow:0 2px 10px #0001;opacity:0;pointer-events:none;transition:opacity .15s;padding:5px}#tools svg{width:18px;height:18px}:host(:hover) #tools,:host(:focus-within) #tools{opacity:1;pointer-events:auto}@media(hover:none){#tools{opacity:1;pointer-events:auto}}button:focus-visible{outline:2px solid #8b5cf6;outline-offset:3px}section{position:absolute;right:48px;top:0;background:white;border:1px solid #eee;border-radius:14px;padding:14px;box-shadow:0 5px 24px #0002;width:210px;max-width:calc(100vw - 80px)}section[hidden],button[hidden]{display:none!important}header{display:flex;justify-content:space-between;align-items:center}p{overflow-wrap:anywhere;margin:10px 0}progress,select{width:100%;accent-color:#ed5599}select{margin:8px 0;border:1px solid #ddd;padding:6px;border-radius:6px}.actions{display:flex;gap:6px;flex-wrap:wrap}#start{background:#ed5599;color:white}

section{box-sizing:border-box;width:248px;padding:18px;border:1px solid #e7e5ef;border-radius:18px;background:linear-gradient(145deg,#fff,#f8f7fc);box-shadow:0 14px 45px #20153622,0 2px 6px #2015360a;color:#282537}
header{padding-bottom:12px;border-bottom:1px solid #edeaf3;gap:10px}header b{font-size:14px;letter-spacing:.3px}header b:before{content:'✦';color:#7960c8;margin-right:8px}#close{padding:3px 7px;background:transparent;color:#91899d;font-size:18px}p{font-size:12px;line-height:1.65;color:#81798f;margin:14px 0 8px}progress{appearance:none;display:block;width:100%;height:4px;border:0;border-radius:4px;overflow:hidden;background:#eae6f2;margin-bottom:16px}progress::-webkit-progress-bar{background:#eae6f2;border-radius:4px}progress::-webkit-progress-value{background:linear-gradient(90deg,#a18bdc,#7154c2);border-radius:4px}progress::-moz-progress-bar{background:#8063ce}.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}.actions button{border:1px solid #e6e1ef;background:#fff;color:#655c76;padding:9px 6px;font-size:12px;border-radius:9px}#start{grid-column:1/-1;background:linear-gradient(135deg,#323047,#1d1a2d);border:1px solid #363148;color:#eee6ff;padding:11px;box-shadow:0 3px 9px #221a3320}.actions button:hover{filter:brightness(.96)}section label{font-size:11px;color:#948a9f;letter-spacing:.4px}select{box-sizing:border-box;background:#f1eef7;color:#62576f;border:1px solid #e7e0f0;padding:9px 10px;border-radius:9px;margin:6px 0 0;font-size:12px}#tools{color:#746387}
</style><button id="ball" aria-label="开始翻译" aria-pressed="false" title="点击翻译 · 可上下拖动"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 3c.9 5.3 2.7 7.1 8 8-5.3.9-7.1 2.7-8 8-.9-5.3-2.7-7.1-8-8 5.3-.9 7.1-2.7 8-8Z" fill="currentColor"/><path d="M19 2c.35 2.2 1.1 2.95 3.3 3.3-2.2.35-2.95 1.1-3.3 3.3-.35-2.2-1.1-2.95-3.3-3.3C17.9 4.95 18.65 4.2 19 2Z" fill="currentColor" opacity=".65"/></svg></button><button id="tools" aria-label="翻译设置与进度" aria-expanded="false" title="设置与进度"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="white"/><circle cx="15" cy="17" r="3" fill="white"/></svg></button><section hidden><header><b>双语阅读器</b><button id="close" aria-label="收起">×</button></header><p role="status"></p><progress max="1" value="0"></progress><div class="actions"><button id="start">翻译 / 恢复原文</button><button id="restore">原文</button><button id="retry" hidden>重试未成功段落</button></div><label>本站偏好<select id="site"><option value="inherit">跟随全局</option><option value="always">始终自动翻译</option><option value="never">不自动翻译</option></select></label></section>`);
    const ball=shadow.querySelector('#ball'),panel=shadow.querySelector('section');
    function expand(open){panel.hidden=!open;shadow.querySelector('#tools').setAttribute('aria-expanded',String(open));if(open){panel.style.top='0px';const r=panel.getBoundingClientRect();panel.style.top=Math.min(0,innerHeight-8-r.bottom)+'px';}}
    shadow.querySelector('#tools').onclick=()=>expand(panel.hidden);
    shadow.querySelector('#close').onclick=()=>expand(false);
    shadow.querySelector('#start').onclick=toggle;
    shadow.querySelector('#restore').onclick=clear;
    shadow.querySelector('#retry').onclick=()=>{for(const el of [...failures.keys()])removeFailure(el);status.error='';remember(true);active=true;schedule();};
    const site=shadow.querySelector('#site');site.value=config['site:'+location.hostname]||'inherit';
    site.onchange=()=>extensionCall(()=>chrome.storage.sync.set({['site:'+location.hostname]:site.value})).catch(e=>{status.error=e.message;update();});
    let drag;
    ball.onpointerdown=e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,top:host.getBoundingClientRect().top,moved:false};ball.setPointerCapture(e.pointerId);};
    ball.onpointermove=e=>{if(!drag)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>5)drag.moved=true;if(drag.moved){expand(false);host.style.setProperty('top',Math.max(8,Math.min(innerHeight-48,drag.top+e.clientY-drag.y))+'px','important');}};
    ball.onpointerup=()=>{if(drag?.moved)extensionCall(()=>chrome.storage.local.set({readerFloatTop:host.getBoundingClientRect().top})).catch(()=>{});drag=null;};
    // Pointer drags produce a click too; suppress only the click following movement.
    let dragged=false;ball.addEventListener('pointermove',()=>{if(drag?.moved)dragged=true;});
    ball.onclick=()=>{if(dragged){dragged=false;return;}expand(false);toggle();};
    ball.onpointercancel=()=>{drag=null;dragged=false;};
    shadow.addEventListener('keydown',e=>{if(e.key==='Escape')expand(false);});
    document.addEventListener('pointerdown',e=>{if(!e.composedPath().includes(host))expand(false);});
    label=shadow.querySelector('p');progress=shadow.querySelector('progress');document.body.append(host);
    extensionCall(()=>chrome.storage.local.get('readerFloatTop')).then(v=>{if(Number.isFinite(v.readerFloatTop))host.style.setProperty('top',Math.max(8,Math.min(innerHeight-48,v.readerFloatTop))+'px','important');}).catch(()=>{});
    window.addEventListener('resize',()=>{host.style.setProperty('top',Math.max(8,Math.min(innerHeight-48,host.getBoundingClientRect().top))+'px','important');});
    update();
  }
  function update(){status.siteRule=siteRule.name;status.startup={firstLoadingMs:firstLoadingAt===null?null:Math.round(firstLoadingAt-startupAt),lastScanMs:status.lastScanMs??null};status.active=active;status.hasTranslations=records.size>0;status.failed=failures.size;if(host){host.shadowRoot.querySelector('#start').textContent=active||records.size?'取消并恢复原文':'开始翻译';const retry=host.shadowRoot.querySelector('#retry');retry.hidden=failures.size===0;retry.textContent=`重试未成功段落（${failures.size}）`;}if(label){label.textContent=(status.error?status.error+' · ':'')+`${busy?'翻译中':active?'等待滚动':'已暂停'} ${status.done} / ${status.total} 段`+(failures.size?` · ${failures.size} 段失败`:'');progress.max=Math.max(1,status.total);progress.value=status.done;const ball=host.shadowRoot.querySelector('#ball');const enabled=active||records.size>0;ball.dataset.busy=String(busy&&active);ball.dataset.active=String(enabled);ball.dataset.error=String(failures.size>0);ball.setAttribute('aria-pressed',String(enabled));ball.setAttribute('aria-label',enabled?'取消翻译并恢复原文':'开始翻译');ball.title=(enabled?'点击取消翻译并恢复原文':'点击开始翻译')+' · '+label.textContent;}}
  function autoEnabled(){const pref=config['site:'+location.hostname];return pref==='always'||pref!=='never'&&config.autoTranslate;}
  function sameLanguage(value,el){
    const annotation=el?closestAcross(el,'[lang]'):null;
    // A page-wide language does not prove the language of multilingual comments.
    const local=annotation&&annotation!==document.documentElement&&annotation!==document.body;
    const lang=local?annotation.getAttribute('lang'):'';
    const chineseTarget=['简体中文','繁體中文'].includes(config.targetLang);
    return ReaderTranslationText.isTargetLanguage(value,config.targetLang,lang||(chineseTarget?document.documentElement.lang:''));
  }

  function text(el){const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const parts=[];let n;while(n=walker.nextNode()) if(!n.parentElement.closest(excluded)) parts.push(n.textContent);return parts.join(' ').replace(/\s+/g,' ').trim();}
  function appearance(){
    const root=document.documentElement;
    const size=['0.9','1','1.1'].includes(String(config.translationSize))?config.translationSize:'1';
    const gap=['0.2','0.4','0.7'].includes(String(config.translationSpacing))?config.translationSpacing:'0.4';
    root.style.setProperty('--reader-size',size+'em');root.style.setProperty('--reader-gap',gap+'em');
    root.style.setProperty('--reader-tone',config.translationTone==='violet'?'light-dark(#70529a, #c9b1ee)':'inherit');
  }
  function restore(el,r){ownWrite(()=>{r.target.remove();if(r.original?.parentNode)r.original.replaceWith(...r.original.childNodes);});}
  let contextLost=false;
  function stopInvalidContext(){
    if(contextLost)return;
    contextLost=true;localEpoch++;localHost?.remove();selectionHost?.remove();localHost=null;selectionHost=null;closeDiagnostics();clearTimeout(stabilityTimer);stabilityTimer=undefined;scanOwner=null;active=false;epoch++;activeWorkers=0;busy=false;pendingRun=false;
    clearTimeout(timer);timer=undefined;observer?.disconnect();observer=undefined;viewport?.disconnect();revealObserver?.disconnect();bodyObserver?.disconnect();
    dirtyRoots.clear();
    for(const marker of loading.values())marker.remove();loading.clear();
    status.error='扩展已更新，请刷新此网页后继续翻译';update();
    if(host){
      const shadow=host.shadowRoot;
      for(const button of shadow.querySelectorAll('#start,#retry'))button.disabled=true;
      shadow.querySelector('#ball').title=status.error;
      shadow.querySelector('#ball').setAttribute('aria-label',status.error);
      shadow.querySelector('section').hidden=false;
    }
  }
  function contextAvailable(){
    if(contextLost)return false;
    try{if(chrome.runtime?.id)return true;}catch{}
    stopInvalidContext();return false;
  }
  async function extensionCall(operation){
    // Chrome can throw synchronously before returning a Promise after an extension reload.
    if(!contextAvailable())throw new Error('扩展已更新，请刷新此网页后继续翻译');
    try{return await operation();}catch(error){
      if(/Extension context invalidated/i.test(error?.message||''))stopInvalidContext();
      else contextAvailable();
      throw error;
    }
  }
  function invalidate(){epoch++;scanOwner=null;clearTimeout(stabilityTimer);stabilityTimer=undefined;changingParagraphs=new WeakMap();cacheChecked=new WeakMap();activeWorkers=0;busy=false;pendingRun=false;clearTimeout(timer);timer=undefined;extensionCall(()=>chrome.runtime.sendMessage({type:'cancel-translation',generation:epoch})).catch(()=>{});}
  function remember(enabled){translationIntent=!!enabled;if(!isTop)return;extensionCall(()=>chrome.runtime.sendMessage({type:'set-follow',enabled})).catch(()=>{});}
  function clear(preserveIntent=false){if(preserveIntent!==true)remember(false);invalidate();active=false;for(const el of [...loading.keys()])finishLoading(el);for(const [el,r] of records){restore(el,r);} records.clear();ownWrite(()=>{for(const el of unclamped)el.classList.remove('reader-unclamped');});unclamped.clear();for(const el of [...failures.keys()])removeFailure(el);ownWrite(()=>{for(const wrapper of paragraphWrappers)if(wrapper.parentNode)wrapper.replaceWith(...wrapper.childNodes);});paragraphWrappers.clear();viewport?.disconnect();revealObserver?.disconnect();scopeVisibility=new WeakMap();tracked.clear();nearby.clear();dirtyRoots.clear();markDirty(document.body);for(const root of componentRoots)if(root.host.isConnected)markDirty(root);status={done:0,total:0,error:'',active:false};update();}
  function mode(){ownWrite(()=>{for(const [,r] of records)r.original.style.setProperty('display',config.mode==='translation'?'none':'contents','important');});}
  function blockParagraph(el){
    // Explicit boundaries precede computed layout; inline exceptions win on overlap.
    if(siteRule.paragraph.inline&&el.matches(siteRule.paragraph.inline))return false;
    if(siteRule.paragraph.block&&el.matches(siteRule.paragraph.block))return true;
    return !['inline','contents','inline-block'].includes(getComputedStyle(el).display);
  }
  function hasBlockParagraph(el){return [...el.querySelectorAll(selector)].some(node=>!node.closest(excluded)&&blockParagraph(node));}
  function collectLooseParagraphs(root,single=false){
    if(!siteRule.paragraph.splitLooseText)return;
    // Mixed containers may start with bare text + inline markup before their first <p>.
    // Wrap only contiguous inline runs; leave nested paragraphs and their nodes intact.
    for(const container of single?[root]:descendants(root)){
      if(container.closest(excluded)||container.closest('.reader-original')||records.has(container)||container.hasAttribute('data-reader-paragraph'))continue;
      if(!withinScope(container))continue;
      if(!hasBlockParagraph(container))continue;
      if(['flex','inline-flex','grid','inline-grid'].includes(getComputedStyle(container).display))continue;
      if(['TABLE','TBODY','THEAD','TFOOT','TR','UL','OL'].includes(container.tagName))continue;
      let run=[];
      function flush(){
        const content=run.map(n=>n.textContent).join('').trim();
        if(content.length>=4&&/\p{L}/u.test(content)){
          const wrapper=document.createElement('span');wrapper.dataset.readerParagraph='';
          // Own the paragraph box: host span rules must not detach text from its status.
          for(const [key,value] of Object.entries({display:'block',position:'static',float:'none',margin:'0',padding:'0',border:'0',width:'auto',height:'auto'}))wrapper.style.setProperty(key,value,'important');
          run[0].before(wrapper);wrapper.append(...run);paragraphWrappers.add(wrapper);
        }
        run=[];
      }
      for(const node of [...container.childNodes]){
        if(node.nodeType===Node.TEXT_NODE){run.push(node);continue;}
        if(node.nodeType!==Node.ELEMENT_NODE){flush();continue;}
        const boundary=node.matches(excluded)||hasBlockParagraph(node)||node.tagName==='BR'||blockParagraph(node);
        if(boundary)flush();else run.push(node);
      }
      flush();
    }
    for(const wrapper of paragraphWrappers)if(!wrapper.isConnected)paragraphWrappers.delete(wrapper);
  }
  function eligibilityReason(el){
    if(!el?.isConnected)return '节点已被网页移除';
    if(siteRule.blocked)return '当前页面规则禁止翻译（例如代码文件或设置页）';
    if(closestAcross(el,excluded))return '被排除：代码、控件、编辑区或站点忽略区域';
    if(el.closest('.reader-original')||el.querySelector('.reader-original'))return '已由原文/译文段落接管，避免重复翻译';
    if(closestAcross(el,'[hidden],[aria-hidden="true"]'))return '内容处于隐藏状态';
    const display=getComputedStyle(el).display;
    const flexHeading=el.matches('h1,h2,h3,h4,h5,h6')&&['flex','inline-flex'].includes(display);
    if(['flex','inline-flex','grid','inline-grid'].includes(display)&&!explicitRoot(el)&&!flexHeading)return '布局容器，不作为完整文本段落';
    if(!withinScope(el))return '不在当前页面规则的正文范围内';
    if(hasBlockParagraph(el))return '包含子段落，由子段落分别翻译';
    const controls=[...el.querySelectorAll('input,textarea,[contenteditable]:not([contenteditable="false"])')];
    if(controls.some(node=>!(siteRule.id==='github'&&el.closest('.markdown-body')&&node.matches('input.task-list-item-checkbox[type=checkbox]:disabled'))))return '包含可编辑内容';
    if(!explicitRoot(el)&&[...el.querySelectorAll('button')].some(button=>!button.closest('[data-reader-target]')))return '包含操作按钮，尚未识别为正文';
    if(!blockParagraph(el)&&el.parentElement?.closest(selector)&&!el.hasAttribute('data-reader-paragraph')&&!explicitRoot(el))return '行内片段，应随所属段落翻译';
    const value=text(el);
    if(value.length<4||! /\p{L}/u.test(value))return '文本过短或没有可翻译文字';
    if(sameLanguage(value,el))return '已判定为目标语言';
    return null;
  }
  function eligible(el){return eligibilityReason(el)===null;}
  function diagnoseElement(el){
    if(closestAcross(el,'[data-reader-ui]'))return '这是翻译器自己的界面';
    if(closestAcross(el,excluded)&&!el.closest('[data-reader-target]'))return eligibilityReason(el);
    const owner=el.closest('.reader-original,[data-reader-target]')?.parentElement;
    const paragraph=owner||el.closest(selector)||el;
    if(records.has(paragraph))return '已翻译';
    if(failures.has(paragraph))return '请求失败：'+(failures.get(paragraph).badge?.title||'未知错误');
    if(loading.has(paragraph))return loadingStage.get(paragraph)==='request'?'正在请求翻译（可能含后台排队）':'正在检查翻译缓存';
    const reason=eligibilityReason(paragraph);if(reason)return reason;
    if(!paragraph.getClientRects().length||getComputedStyle(paragraph).visibility==='hidden')return '不可见，等待显示';
    const rect=paragraph.getBoundingClientRect();
    if(rect.bottom < -innerHeight*.5||rect.top>innerHeight*3)return '未进入视区附近，等待滚动';
    if(!active)return '翻译未开启';
    if(paragraphSettling(paragraph))return '正文正在连续变化，等待短暂稳定';
    if(!tracked.has(paragraph))return '符合基本条件，但尚未被扫描识别';
    return '已识别，等待调度';
  }
  function paragraphFor(el){return el.closest('.reader-original,[data-reader-target]')?.parentElement||el.closest(selector)||el;}
  function selectorFor(el){
    if(el.closest('[data-reader-paragraph],.reader-original'))throw Error('此段属于临时整理结构，请在设置中选择稳定的外层区域');
    if(el===document.body||el===document.documentElement)throw Error('请选择具体段落，避免整页生效');
    if(el.getRootNode()!==document)throw Error('组件内部暂不支持保存选择器，可先单独翻译');
    if(el.id){const id='#'+CSS.escape(el.id);if(document.querySelectorAll(id).length===1)return id;}
    const path=[];
    for(let node=el;node&&node!==document.body;node=node.parentElement){
      const siblings=[...node.parentElement.children].filter(n=>n.tagName===node.tagName);
      path.unshift(node.tagName.toLowerCase()+':nth-of-type('+(siblings.indexOf(node)+1)+')');
    }
    return 'body > '+path.join(' > ');
  }
  async function savePickedRule(el,kind,path){
    if(!el?.isConnected)throw Error('内容已变化，请重新选择');
    const css=selectorFor(el),saved=await extensionCall(()=>chrome.storage.local.get({readerRules:{}}));
    const rules=structuredClone(saved.readerRules),rule=rules[location.hostname]||{disabled:false,entries:[]};
    let entry=rule.entries.find(e=>e.path===path&&(e.include===css||e.exclude===css));
    if(!entry){entry={path,include:'',exclude:''};rule.entries.push(entry);}
    entry.include=kind==='include'?css:'';entry.exclude=kind==='exclude'?css:'';
    await extensionCall(()=>ReaderUserRules.save(chrome.storage.local,{...rules,[location.hostname]:rule}));
  }
  function closeLocal(){localEpoch++;localProgress=null;localHost?.remove();localHost=null;extensionCall(()=>chrome.runtime.sendMessage({type:'cancel-local',generation:localEpoch})).catch(()=>{});}
  async function translateLocal(value){
    if(!contextAvailable())return;value=value.trim();if(!value)return;
    closeLocal();const token=localEpoch;
    localHost=ReaderUI.panel();
    const shadow=localHost.shadowRoot;shadow.querySelector('#language').textContent=config.targetLang;
    shadow.querySelector('#source').textContent=value;const output=shadow.querySelector('#output');output.textContent=loadingLabel();
    shadow.querySelector('#close').onclick=closeLocal;
    shadow.querySelector('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(output.textContent);shadow.querySelector('#feedback').textContent='已复制';}catch{shadow.querySelector('#feedback').textContent='请选中译文手动复制';}};
    document.body.append(localHost);shadow.querySelector('#feedback').textContent='等待翻译服务…';
    if(value.length>20000){output.setAttribute('aria-busy','false');output.textContent='所选内容过长，请缩小到 20000 字符以内。';return;}
    const parts=ReaderTranslationText.splitRich(value,[])?.parts||[value];const results=[];
    try{
      for(let i=0;i<parts.length;i++){
        if(token!==localEpoch)return;
        const items=[{id:String(i),text:parts[i]}],requestId=token+':'+i;
        localProgress={token,requestId,update:text=>{shadow.querySelector('#feedback').textContent=text?'正在接收译文…':'等待翻译服务…';output.textContent=[...results,text].filter(Boolean).join(' ')||loadingLabel();if(text)output.setAttribute('aria-busy','false');}};
        const result=await extensionCall(()=>chrome.runtime.sendMessage({type:'translate-local',generation:token,requestId,stream:true,items}));
        if(token!==localEpoch)return;if(!result?.ok)throw Error(result?.error||'翻译失败');
        const mapped=new Map(result.items.map(x=>[x.id,x.text]));for(const item of items){if(typeof mapped.get(item.id)!=='string')throw Error('译文映射不完整');results.push(mapped.get(item.id));}
        output.textContent=results.join(' ');
      }
      localProgress=null;output.setAttribute('aria-busy','false');shadow.querySelector('#copy').disabled=false;shadow.querySelector('#feedback').textContent='Esc 关闭';
    }catch(e){if(token===localEpoch){localProgress=null;output.setAttribute('aria-busy','false');shadow.querySelector('#feedback').textContent=e.message;if(!results.length&&output.textContent===loadingLabel())output.textContent='未能完成翻译';}}
  }
  function showSelectionAction(){
    if(!contextAvailable())return;
    selectionHost?.remove();selectionHost=null;
    const selection=getSelection(),value=selection?.toString().trim();if(!value||selection.isCollapsed)return;
    const anchor=selection.anchorNode?.parentElement;
    if(!anchor||closestAcross(anchor,'[data-reader-ui],input,textarea,[contenteditable]'))return;
    const rect=selection.getRangeAt(0).getBoundingClientRect();
    selectionHost=document.createElement('div');selectionHost.dataset.readerUi='';
    selectionHost.style.cssText='position:fixed!important;z-index:2147483647!important;left:'+Math.max(8,Math.min(innerWidth-110,rect.left))+'px!important;top:'+Math.max(8,Math.min(innerHeight-42,rect.bottom+6))+'px!important;';
    const shadow=selectionHost.attachShadow({mode:'open'});ReaderUI.mount(shadow,ReaderUI.selectionMarkup());
    shadow.querySelector('button').onpointerdown=e=>e.preventDefault();shadow.querySelector('button').onclick=()=>{selectionHost?.remove();selectionHost=null;translateLocal(value);};document.body.append(selectionHost);
  }
  document.addEventListener('mouseup',event=>{if(!event.composedPath().some(n=>n instanceof Element&&n.hasAttribute('data-reader-ui')))setTimeout(showSelectionAction,0);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){selectionHost?.remove();selectionHost=null;if(localHost)closeLocal();}});
  function closeDiagnostics(){diagnosticController?.abort();diagnosticController=null;diagnosticHost?.remove();diagnosticHost=null;}
  function openDiagnostics(){
    closeDiagnostics();
    diagnosticHost=document.createElement('div');diagnosticHost.dataset.readerUi='';
    const shadow=diagnosticHost.attachShadow({mode:'open'});
    ReaderUI.mount(shadow,`<style>:host{all:initial!important;position:fixed!important;right:20px!important;bottom:20px!important;z-index:2147483647!important}section{font:13px/1.6 system-ui;width:290px;padding:16px;background:#fff;color:#322b43;border:1px solid #e1d9ee;border-radius:14px;box-shadow:0 6px 30px #21152d25}button{border:0;border-radius:8px;padding:7px 12px;background:#f0ebf8;color:#57466c;cursor:pointer}p{overflow-wrap:anywhere}small{color:#746781}</style><section><b>段落检查</b><p id="result">点击要检查的文字；此次点击不会打开链接。Esc 退出。</p><small></small><p><button id="translateOne" disabled>只翻译这段</button> <button id="again">重新选择</button> <button id="close">关闭</button></p><label>规则范围 <select id="ruleScope"><option value="page">当前路径</option><option value="site">全站</option></select></label><p><button id="include" disabled>加入正文</button> <button id="exclude" disabled>排除此段</button></p><small>按当前结构保存；页面改版后可能需要重新选择。</small></section>`);
    shadow.querySelector('small').textContent=siteRule.name+' · '+siteRule.id+':'+siteRule.pageId+' · '+ReaderUserRules.audit(userRules,new URL(location.href));
    let picked;
    for(const kind of ['include','exclude'])shadow.querySelector('#'+kind).onclick=async()=>{try{await savePickedRule(picked,kind,shadow.querySelector('#ruleScope').value==='site'?'*':location.pathname);shadow.querySelector('#result').textContent='规则已保存';}catch(e){shadow.querySelector('#result').textContent=e.message;}};
    shadow.querySelector('#translateOne').onclick=()=>{if(picked)translateLocal(text(picked));};
    const pick=()=>{
      diagnosticController?.abort();diagnosticController=new AbortController();
      shadow.querySelector('#result').textContent='点击要检查的文字；Esc 退出。';
      document.addEventListener('click',event=>{
        const path=event.composedPath();if(path.includes(diagnosticHost))return;
        const el=path.find(node=>node instanceof Element);if(!el)return;
        event.preventDefault();event.stopImmediatePropagation();
        picked=paragraphFor(el);for(const id of ['translateOne','include','exclude'])shadow.querySelector('#'+id).disabled=false;
        shadow.querySelector('#result').textContent=diagnoseElement(el);
        diagnosticController.abort();
      },{capture:true,signal:diagnosticController.signal});
      document.addEventListener('keydown',event=>{if(event.key==='Escape')closeDiagnostics();},{signal:diagnosticController.signal});
    };
    shadow.querySelector('#close').onclick=closeDiagnostics;shadow.querySelector('#again').onclick=pick;
    document.body.append(diagnosticHost);pick();
  }
  function finishLoading(el,marker){
    const current=loading.get(el);if(!current||(marker&&current!==marker))return;
    loading.delete(el);loadingStage.delete(el);ownWrite(()=>current.remove());
  }
  function loadingLabel(){
    const labels={
      '简体中文':'正在翻译…','繁體中文':'正在翻譯…','English':'Translating…',
      '日本語':'翻訳中…','한국어':'번역 중…','Français':'Traduction en cours…',
      'Deutsch':'Wird übersetzt…','Español':'Traduciendo…'
    };
    return labels[config.targetLang]||'Translating…';
  }
  function startLoading(el){
    finishLoading(el);
    const marker=document.createElement('span');marker.dataset.readerTarget='';marker.className='reader-loading';
    if(firstLoadingAt===null)firstLoadingAt=performance.now();
    const label=loadingLabel();marker.setAttribute('role','status');marker.setAttribute('aria-label',label);
    // Reset host-page positioning; private contents cannot match the site's span/pseudo rules.
    marker.style.setProperty('all','initial','important');
    for(const [key,value] of Object.entries({display:'block',position:'static',float:'none',
      width:'auto',height:'auto','min-height':'0','max-width':'100%',
      margin:'.25em 0',padding:'0','text-align':'start',direction:'inherit'}))marker.style.setProperty(key,value,'important');
    const shadow=marker.attachShadow({mode:'closed'});
    const style=document.createElement('style');
    style.textContent=':host::before,:host::after{content:none!important;display:none!important}.status{display:flex;align-items:center;gap:6px;font:11px/1.5 system-ui;color:#79658f}.dot{flex:none;width:7px;height:7px;border:1.5px solid #d8cde8;border-top-color:#8870ac;border-radius:50%;animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.dot{animation:none}}';
    const row=document.createElement('span');row.className='status';
    const dot=document.createElement('span');dot.className='dot';dot.setAttribute('aria-hidden','true');
    const caption=document.createElement('span');caption.textContent=label;row.append(dot,caption);shadow.append(style,row);
    ownWrite(()=>el.append(marker));loading.set(el,marker);loadingStage.set(el,'cache');return marker;
  }
  function removeFailure(el){const f=failures.get(el);if(f?.badge)ownWrite(()=>f.badge.remove());failures.delete(el);if(!failures.size)status.error='';}
  function fail(item,message){
    removeFailure(item.el);
    const badge=document.createElement('button');badge.dataset.readerTarget='';badge.className='reader-retry';badge.textContent=/HTTP 503/.test(message)?'服务繁忙 · 重试':/HTTP 429/.test(message)?'服务限流 · 重试':/超时|TimeoutError/.test(message)?'请求超时 · 重试':'翻译未完成 · 重试';badge.title=message;
    badge.onclick=()=>{removeFailure(item.el);active=true;remember(true);schedule();update();};
    ownWrite(()=>item.el.append(badge));failures.set(item.el,{source:item.source,badge});
  }
  function scanScopes(root){
    const content=siteRule.content;
    if(!content.roots||closestAcross(root.nodeType===11?root.host:root,content.roots))return [root];
    const match=[content.roots,content.standalone].filter(Boolean).join(',');
    const scopes=[...(root.matches?.(match)?[root]:[]),...root.querySelectorAll(match)];
    if(!scopes.length)return content.scope==='strict'||root.getRootNode().querySelector(content.roots)?[]:[root];
    const selected=new Set(scopes);
    return scopes.filter(el=>{for(let parent=el.parentElement;parent&&root.contains(parent);parent=parent.parentElement)if(selected.has(parent))return false;return true;});
  }
  async function yieldToPage(){
    if(globalThis.scheduler?.yield)await globalThis.scheduler.yield();
    else await new Promise(resolve=>setTimeout(resolve,0));
  }
  function noteParagraphChange(el){
    if(!el?.isConnected||closestAcross(el,excluded))return;
    const value=text(el),now=performance.now(),prior=changingParagraphs.get(el);
    if(prior?.value===value)return;
    changingParagraphs.set(el,{value,at:now,count:prior&&now-prior.at<500?prior.count+1:1});
  }
  function paragraphSettling(el){
    const change=changingParagraphs.get(el);
    if(!change||change.count<2)return false;
    const wait=150-(performance.now()-change.at);
    if(wait<=0)return false;
    // Only rapidly edited paragraphs wait; do not delay fresh/static content.
    if(stabilityTimer===undefined)stabilityTimer=setTimeout(()=>{stabilityTimer=undefined;if(active)schedule();},Math.ceil(wait));
    return true;
  }
  async function candidates(token){
    let slice=performance.now();
    async function checkpoint(){
      if(performance.now()-slice>=8){await yieldToPage();slice=performance.now();}
      return active&&epoch===token;
    }
    for(const root of [...dirtyRoots]){
      dirtyRoots.delete(root);if(!root.isConnected)continue;
      const scopes=scanScopes(root);
      for(const scope of scopes){
        if(revealObserver&&scope.nodeType===1&&!scopeVisibility.has(scope)){
          const rect=scope.getBoundingClientRect();scopeVisibility.set(scope,rect.width>0&&rect.height>0);revealObserver.observe(scope);
        }
        for(const el of descendants(scope)){
          if(!await checkpoint())return [];
          if(el.isConnected)ownWrite(()=>collectLooseParagraphs(el,true));
        }
        for(const el of descendants(scope)){
          if(!await checkpoint())return [];
          if(eligible(el)&&!records.has(el)){
            if(!tracked.has(el)){tracked.add(el);viewport.observe(el);}
            const r=el.getBoundingClientRect();if(r.bottom>=-innerHeight*.5&&r.top<=innerHeight*3)nearby.add(el);
          }
        }
      }
    }
    for(const el of tracked)if(!el.isConnected){viewport.unobserve(el);tracked.delete(el);nearby.delete(el);removeFailure(el);}
    const result=[];
    for(const el of nearby){
      if(!await checkpoint())return [];
      if(!records.has(el)&&!failures.has(el)&&eligible(el)&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden')result.push(el);
    }
    return result;
  }
  async function restoreCached(list,token){
    const unchecked=[];let slice=performance.now();
    for(const el of list){
      if(!active||epoch!==token)return;
      if(loading.has(el)||paragraphSettling(el))continue;
      const source=text(el),item={el,source,...ReaderParagraphCodec.input(el,source,excluded)},key=pageKey(item);
      const hit=pageTranslations.get(key);
      if(hit)render(item,hit.translated,token);
      else if(item.payload.length<=1600&&cacheChecked.get(el)!==key)unchecked.push({...item,key});
      if(performance.now()-slice>=8){await yieldToPage();slice=performance.now();}
    }
    // A separate cache-only lane can run while every translation worker is occupied.
    if(activeWorkers<6||!unchecked.length||epoch!==token)return;
    const batch=unchecked.slice(0,4);
    try{
      const response=await extensionCall(()=>chrome.runtime.sendMessage({type:'translation-cache',generation:token,items:batch.map((item,i)=>({id:String(i),text:item.payload}))}));
      if(epoch!==token||!active)return;
      if(response?.ok){
        const hits=new Map(response.items.map(item=>[item.id,item.text]));
        for(let i=0;i<batch.length;i++){
          const item=batch[i];cacheChecked.set(item.el,item.key);
          if(typeof hits.get(String(i))==='string')render(item,hits.get(String(i)),token);
        }
        if(unchecked.length>batch.length)schedule();
      }
    }catch(error){if(!contextLost){status.error=error.message;update();}}
  }
  function render(item,translated,token=epoch){
      const {el,source}=item;
      if(!active||epoch!==token)return;
      retainTranslation(item,translated);
      if(!el.isConnected||records.has(el))return;
      if(text(el)!==source||!eligible(el)){markDirty(el);if(active&&config.dynamic)schedule();return;}
      finishLoading(el);
      const target=document.createElement('span');target.dataset.readerTarget='';target.className='reader-translation';target.setAttribute('aria-label','译文');
      const content=document.createElement('span');content.append(ReaderParagraphCodec.output(translated,item.tags||[]));target.append(content);
      // Critical layout is inline to survive page rules that override span display.
      target.style.setProperty('display','block','important');
      target.style.setProperty('margin','var(--reader-gap,.4em) 0 .15em','important');
      target.style.setProperty('white-space','normal','important');
      target.style.setProperty('padding','0 0 0 .65em','important');
      target.style.setProperty('border','0','important');
      target.style.setProperty('border-inline-start','2px solid rgba(139,112,184,.32)','important');
      target.style.setProperty('text-indent','0','important');
      target.style.setProperty('min-height','0','important');
      target.style.setProperty('line-height','1.6','important');
      target.style.setProperty('font-weight','500','important');
      target.style.setProperty('opacity','1','important');
      target.style.setProperty('font-size','var(--reader-size,1em)','important');
      target.style.setProperty('color','var(--reader-tone,inherit)','important');
      // Keep translations inside the cell/list/flex item, never as a new layout sibling.
      const original=document.createElement('span');original.className='reader-original';
      ownWrite(()=>{
        if(siteRule.layout.unclamp){
          let node=el;
          for(let depth=0;node&&depth<6;depth++,node=node.parentElement){
            if(node.matches(siteRule.layout.boundary))break;
            const style=getComputedStyle(node);
            if((style.webkitLineClamp&&style.webkitLineClamp!=='none')||[...node.classList].some(c=>c.includes('line-clamp'))){node.classList.add('reader-unclamped');unclamped.add(node);}
          }
        }
        original.append(...el.childNodes);el.append(original,target);
      });
      layoutDirty=true;
      records.set(el,{source,target,original});ownWrite(()=>original.style.setProperty('display',config.mode==='translation'?'none':'contents','important'));status.done++;update();
    }
  async function run(){
    if(!contextAvailable()||!active)return;
    if(scanOwner){pendingRun=true;return;}
    pendingRun=false;const token=epoch,owner={};scanOwner=owner;
    const scanAt=performance.now();let list;
    try{list=await candidates(token);await restoreCached(list,token);}
    catch(error){if(epoch===token&&!contextLost){status.error=error.message;update();}return;}
    finally{if(scanOwner===owner){scanOwner=null;if(pendingRun&&active)schedule();}}
    if(!active||epoch!==token)return;
    if(activeWorkers>=6){pendingRun=true;return;}
    status.lastScanMs=Math.round(performance.now()-scanAt);
    status.total=status.done+[...tracked].filter(el=>!records.has(el)).length;update();
    let positions=new Map();
    function prioritize(){
      if(!layoutDirty&&positions.size)return positions;
      layoutDirty=false;
      positions=new Map(list.map(el=>[el,el.getBoundingClientRect()]));
      const tier=r=>r.bottom>=0&&r.top<=innerHeight?0:1;
      list.sort((a,b)=>{const x=positions.get(a),y=positions.get(b);return tier(x)-tier(y)||Math.round(x.top/8)-Math.round(y.top/8)||x.left-y.left;});
      return positions;
    }
    async function worker(){
      while(active&&epoch===token&&list.length){
        const positions=prioritize();
        const batch=[];let length=0;
        while(list.length&&batch.length<2){
          const el=list[0],rect=positions.get(el);
          if(records.has(el)||loading.has(el)||paragraphSettling(el)||!eligible(el)){list.shift();continue;}
          // Do not spend requests on distant content; scrolling wakes the scheduler.
          if(rect.bottom < -innerHeight*.5 || rect.top > innerHeight*3){
            list.shift();continue;
          }
          const source=text(el);
          const item={el,source,...ReaderParagraphCodec.input(el,source,excluded),id:String(batch.length)};
          if(batch.length&&length+item.payload.length>1600)break;
          list.shift();if(!el.isConnected)continue;
          const hit=pageTranslations.get(pageKey(item));
          if(hit){render(item,hit.translated,token);continue;}
          batch.push(item);length+=item.payload.length;
          if(item.parts?.length>1)break;
        }
        if(!batch.length)continue;
        for(const item of batch)item.loadingMarker=startLoading(item.el);
        try{
          if(batch.length===1&&(batch[0].parts?.length>1||batch[0].payload.length>1600)){
            const item=batch[0];loadingStage.set(item.el,'request');
            const parts=item.parts||ReaderTranslationText.splitRich(item.source,[])?.parts;
            if(!parts)throw Error('无法安全拆分此段落');
            const translated=[];
            for(let i=0;i<parts.length;i+=2){
              if(!active||epoch!==token)return;
              const r=await extensionCall(()=>chrome.runtime.sendMessage({type:'translate-batch',generation:token,items:parts.slice(i,i+2).map((t,j)=>({id:String(i+j),text:t}))}));
              if(!r?.ok)throw Error(r?.error||'长段翻译失败');
              const mapped=new Map(r.items.map(x=>[x.id,x.text]));for(let j=i;j<Math.min(i+2,parts.length);j++){if(typeof mapped.get(String(j))!=='string')throw Error('长段映射不完整');translated.push(mapped.get(String(j)));}
            }
            render(item,translated.join(' '),token);continue;
          }
          const cached=await extensionCall(()=>chrome.runtime.sendMessage({type:'translation-cache',generation:token,items:batch.map(x=>({id:x.id,text:x.payload}))}));
          if(!active||epoch!==token)return;
          const hits=new Map(cached?.ok?cached.items.map(x=>[x.id,x.text]):[]);
          const missing=batch.filter(x=>{const hit=hits.get(x.id);if(typeof hit==='string'){render(x,hit,token);return false;}return true;});
          if(!missing.length)continue;
          for(const item of missing)loadingStage.set(item.el,'request');
          const response=await extensionCall(()=>chrome.runtime.sendMessage({type:'translate-batch',generation:token,items:missing.map(x=>({id:x.id,text:x.payload}))}));
          if(!active||epoch!==token)return;
          if(!response?.ok)throw Error(response?.error||'后台连接失败，请刷新网页');
          const results=new Map(response.items.map(x=>[x.id,x.text]));
          for(const item of missing){const translated=results.get(item.id);if(typeof translated!=='string')throw Error('段落映射不完整');render(item,translated,token);}
          update();
        }catch(e){if(epoch===token){for(const item of batch)if(item.el.isConnected&&!records.has(item.el))fail(item,e.message);status.error=e.message;update();}else return;}finally{for(const item of batch)finishLoading(item.el,item.loadingMarker);}
      }
    }
    // Each free worker can accept fresh DOM work; do not wait for the slowest request.
    const slots=Math.min(6-activeWorkers,list.length);
    for(let i=0;i<slots;i++){
      activeWorkers++;busy=true;
      worker().catch(e=>{if(epoch===token){status.error=e.message;update();}}).finally(()=>{
        if(epoch!==token)return;
        activeWorkers--;busy=activeWorkers>0;update();
        if(active&&pendingRun)schedule();
      });
    }
  }
  function schedule(){
    if(!contextAvailable())return;
    pendingRun=true;
    if(timer!==undefined||scanOwner)return;
    timer=setTimeout(()=>{timer=undefined;if(active)run();},50);
  }
  window.addEventListener('scroll',()=>{layoutDirty=true;if(active)schedule();},{passive:true,capture:true});
  window.addEventListener('resize',()=>{layoutDirty=true;if(active)schedule();},{passive:true});
  function toggle(){if(!contextAvailable())return;if(active||records.size){clear();}else{remember(true);active=true;status.error='';run();}}
  chrome.runtime.onMessage.addListener((m,s,reply)=>{
    if(m.type==='local-progress'){if(localProgress&&m.generation===localEpoch&&m.requestId===localProgress.requestId&&typeof m.text==='string')localProgress.update(m.text);return;}
    if(m.type==='frame-intent'){
      if(isTop)return;
      translationIntent=!!m.enabled;
      if(m.enabled&&config.translateFrames&&config['site:'+location.hostname]!=='never'){active=true;markDirty(document.body);schedule();}else clear(true);
      reply({ok:true});return;
    }
    if(!isTop&&['toggle','translate-page','clear-page','status','diagnose'].includes(m.type))return;
    if(m.type==='route-changed'){checkRoute();reply({ok:true});return;}
    if(m.type==='translate-selection'){const value=getSelection()?.toString();if(value?.trim())translateLocal(value);else openDiagnostics();reply({ok:true});return;}
    if(m.type==='diagnose'){openDiagnostics();reply({ok:true});return;}
    if(m.type==='status'){reply(status);return;}
    if(!['translate-page','toggle','clear-page'].includes(m.type))return;
    if(m.type==='translate-page'){remember(true);active=true;status.error='';run();}
    if(m.type==='toggle') toggle();
    if(m.type==='clear-page') clear();
    reply({ok:true});
  });
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.readerRules){const resume=active;clear(true);try{userRules=ReaderUserRules.parse(changes.readerRules.newValue||{});}catch(error){status.error=error.message;update();return;}resolveRule();active=resume&&!siteRule.blocked;if(active)schedule();return;}if(area!=='sync')return;for(const [k,v] of Object.entries(changes))config[k]=v.newValue;
    if(changes.translationSize||changes.translationSpacing||changes.translationTone)appearance();
    if(changes.targetLang||changes.model||changes.endpoint||changes.glossary||changes.serviceId||changes.apiKey){if(localHost)closeLocal();const resume=active;clear(true);active=resume;if(active)schedule();}
    if(changes.mode)mode();
    if(changes.translateFrames){
      if(isTop)remember(active);
      else if(!config.translateFrames)clear(true);
      else extensionCall(()=>chrome.runtime.sendMessage({type:'get-frame-intent'})).then(r=>{if(r?.enabled){active=true;schedule();}}).catch(()=>{});
    }
    if(isTop&&(changes.autoTranslate||changes['site:'+location.hostname])){active=!!autoEnabled();remember(active);invalidate();if(active)schedule();update();}
  });
  function checkRoute(){
    if(!contextAvailable())return;
    if(location.href===route)return;
    if(localHost)closeLocal();selectionHost?.remove();selectionHost=null;route=location.href;startupAt=performance.now();firstLoadingAt=null;const resume=translationIntent;clear(true);resolveRule();active=resume&&!siteRule.blocked;layoutDirty=true;
    if(active)schedule();update();if(isTop)remember(resume);
  }
  window.addEventListener('popstate',checkRoute);
  window.addEventListener('hashchange',checkRoute);
  window.addEventListener('pageshow',event=>{if(event.persisted){const resume=active;clear(true);active=resume;if(active)schedule();}});
  document.addEventListener('toggle',event=>{if(event.target instanceof Element){markDirty(event.target);layoutDirty=true;if(active)schedule();}},true);
  function processMutations(mutations){
    if(!contextAvailable())return;
    // SPA navigation often replaces the body before tabs.onUpdated arrives.
    if(location.href!==route){checkRoute();return;}
    const roots=[],changed=new Set();
    for(const m of mutations){
      const el=m.target.nodeType===1?m.target:m.target.nodeType===11?m.target.host:m.target.parentElement;
      if(!el||el.closest('[data-reader-ui],[data-reader-target]'))continue;
      if(m.type==='attributes'&&el.classList.contains('reader-original'))continue;
      if(m.type==='characterData'||m.type==='childList'){const original=el.closest('.reader-original');const owner=original?.parentElement||el.closest(selector);if(owner)changed.add(owner);}
      roots.push(el);markDirty(el.closest(selector)||el);
      // Child removal or late slot assignment can change the owning paragraph's eligibility.
      const parent=el.parentElement?.closest(selector);if(parent&&!parent.closest('[data-reader-target],.reader-original'))markDirty(parent);
      if(m.type==='attributes')for(const root of componentRoots)if(root.host===el||el.contains(root.host))markDirty(root);
      if(m.type==='attributes')for(const candidate of tracked)if(el===candidate||el.contains(candidate)){const r=candidate.getBoundingClientRect();if(r.bottom>=-innerHeight*.5&&r.top<=innerHeight*3)nearby.add(candidate);}
      for(const n of m.addedNodes)if(n.nodeType===1){discoverComponents(n);markDirty(n);}
    }
    if(!roots.length)return;
    for(const el of changed)noteParagraphChange(el);
    for(const [el,marker]of loading)if(!el.isConnected||!el.contains(marker))finishLoading(el,marker);
    for(const [el,r]of [...records])if(!el.isConnected||roots.some(root=>root===el||root.contains(el)||el.contains(root))){
      if(!el.isConnected||!el.contains(r.target)||!el.contains(r.original)||text(el)!==r.source){
        records.delete(el);restore(el,r);tracked.delete(el);nearby.delete(el);viewport?.unobserve(el);markDirty(el);status.done=Math.max(0,status.done-1);
      }
    }
    for(const [el,f]of [...failures])if(!el.isConnected||text(el)!==f.source)removeFailure(el);
    layoutDirty=true;if(active&&config.dynamic)schedule();
  }
  function watchRevealedContent(entries){
    if(!contextAvailable()||!active||!config.dynamic)return;
    for(const entry of entries){
      const el=entry.target;
      if(!el.isConnected){revealObserver.unobserve(el);scopeVisibility.delete(el);continue;}
      const visible=entry.contentRect.width>0&&entry.contentRect.height>0;
      const before=scopeVisibility.get(el);scopeVisibility.set(el,visible);
      // Ignore ordinary resizing caused by our own translation insertions.
      if(visible&&before===false){markDirty(el);layoutDirty=true;schedule();}
    }
  }
  function watchBodyReplacement(){
    if(!contextAvailable()||!document.body||document.body===observedBody)return;
    observedBody=document.body;
    const resume=active;clear(true);active=resume;
    observer?.disconnect();connectObservers();discoverComponents(observedBody);
    if(host&&!host.isConnected)observedBody.append(host);
    markDirty(observedBody);if(active)schedule();
  }
  async function init(){config=await extensionCall(()=>chrome.storage.sync.get({...ReaderConfig.defaults,['site:'+location.hostname]:'inherit'}));const local=await extensionCall(()=>chrome.storage.local.get({readerRules:{}}));userRules=ReaderUserRules.parse(local.readerRules||{});resolveRule();appearance();ui();
    viewport=new IntersectionObserver(entries=>{
      for(const entry of entries){if(entry.isIntersecting)nearby.add(entry.target);else nearby.delete(entry.target);}
      layoutDirty=true;if(active)schedule();
    },{rootMargin:'50% 0px 200% 0px'});
    revealObserver=new ResizeObserver(watchRevealedContent);
    observedBody=document.body;
    bodyObserver=new MutationObserver(watchBodyReplacement);
    bodyObserver.observe(document.documentElement,{childList:true});
    markDirty(document.body);
    observer=new MutationObserver(processMutations);observer.observe(document.body,mutationOptions);discoverComponents(document.body);
    const initialEpoch=epoch;
    const follow=await extensionCall(()=>chrome.runtime.sendMessage({type:isTop?'get-follow':'get-frame-intent'})).catch(()=>null);
    if(epoch!==initialEpoch||active)return;
    const pref=config['site:'+location.hostname];
    const enabled=isTop?pref!=='never'&&(typeof follow?.enabled==='boolean'?follow.enabled:autoEnabled()):pref!=='never'&&config.translateFrames&&follow?.enabled===true;
    if(enabled){translationIntent=true;active=!siteRule.blocked;if(isTop)remember(true);if(active)run();}

  }
  // Start when a body exists; DOMContentLoaded may wait for unrelated page scripts.
  if(document.body)init().catch(e=>{if(!contextLost){status.error=e.message;update();}});
  else{
    const bodyReady=new MutationObserver(()=>{if(document.body){bodyReady.disconnect();init().catch(e=>{if(!contextLost){status.error=e.message;update();}});}});
    bodyReady.observe(document.documentElement||document,{childList:true,subtree:true});
  }
})();

// Player adapters expose caption text and change notifications. Scheduling and
// translation stay in video-reader, independent of a site's DOM vocabulary.
(()=>{
 const adapters=[
  {id:'bilibili',player:'.bpx-player-container,#bilibili-player',text:'.bpx-player-subtitle-panel-text',container:'.bpx-player-subtitle-wrap'},
  {id:'youtube',player:'#movie_player,.html5-video-player',text:'.caption-window .ytp-caption-segment',cc:'.ytp-subtitles-button',container:'.ytp-caption-window-container,.caption-window'},
  {id:'videojs',player:'.video-js',text:'.vjs-text-track-display .vjs-text-track-cue',container:'.vjs-text-track-display'},
  {id:'plyr',player:'.plyr',text:'.plyr__captions .plyr__caption',container:'.plyr__captions'},
  {id:'jwplayer',player:'.jwplayer',text:'.jw-captions .jw-text-track-cue',container:'.jw-captions'},
  {id:'shaka',player:'.shaka-video-container',text:'.shaka-text-container span',container:'.shaka-text-container'}
 ];
 // Resolve controls inside this player's open component roots, never another video.
 function redditPlayer(video){
  let player=null;
  for(let node=video;node;node=node.getRootNode?.().host){
   player=node.closest?.('shreddit-player-2,shreddit-player');if(player)break;
  }
  return player;
 }
 function captionsEnabled(video){
  const player=redditPlayer(video);if(!player)return undefined;
  function find(root){
   const control=root.querySelector('[aria-label="Toggle captions"],[aria-label="切换字幕"]');if(control)return control;
   for(const node of root.querySelectorAll('*'))if(node.shadowRoot){const found=find(node.shadowRoot);if(found)return found;}
   return null;
  }
  const control=find(player.shadowRoot||player);
  if(!control)return null;
  if(['true','false'].includes(control.getAttribute('aria-pressed')))return control.getAttribute('aria-pressed')==='true';
  if(['true','false'].includes(control.getAttribute('aria-checked')))return control.getAttribute('aria-checked')==='true';
  return null;
 }
 const captionBoundsCache=new WeakMap();
 function redditCaptionBounds(video,source){
  const player=redditPlayer(video);if(!player||!source)return null;
  const normalize=s=>s.replace(/\s+/g,' ').trim().toLowerCase();
  const expected=normalize(source),boxes=[],frame=video.getBoundingClientRect();
  const previous=captionBoundsCache.get(video),key=[expected,frame.top,frame.left,frame.width,frame.height].join('|');
  if(previous?.key===key&&performance.now()-previous.time<150)return previous.value;
  function scan(root){
   const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
   while(node=walker.nextNode()){
    const parent=node.parentElement;if(!parent||parent.closest('[data-reader-ui],button,script,style'))continue;
    const text=normalize(node.textContent);if(text.length<12||!(expected.includes(text)||text.includes(expected)))continue;
    if(!parent.checkVisibility({checkVisibilityCSS:true,checkOpacity:true}))continue;
    const range=document.createRange();range.selectNodeContents(node);const r=range.getBoundingClientRect();
    if(r.width&&r.height&&r.top>=frame.top&&r.bottom<=frame.bottom&&r.left>=frame.left&&r.right<=frame.right)boxes.push(r);
   }
   for(const node of root.querySelectorAll('*'))if(node.shadowRoot)scan(node.shadowRoot);
  }
  scan(player);if(player.shadowRoot)scan(player.shadowRoot);
  const value=boxes.length?{top:Math.min(...boxes.map(b=>b.top)),bottom:Math.max(...boxes.map(b=>b.bottom))}:null;
  captionBoundsCache.set(video,{key,time:performance.now(),value});return value;
 }
 function forVideo(video){
  const rule=adapters.find(a=>video.closest(a.player));if(!rule)return null;
  const root=video.closest(rule.player);
  return {id:rule.id,bounds(){
   const boxes=[...root.querySelectorAll(rule.text)].filter(n=>n.textContent.trim()&&n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden').map(n=>n.getBoundingClientRect()).filter(b=>b.width&&b.height);
   const value=boxes.length?{top:Math.min(...boxes.map(b=>b.top)),bottom:Math.max(...boxes.map(b=>b.bottom))}:null;
   return value;
  },read(){
   const nodes=[...root.querySelectorAll(rule.text)].filter(n=>!n.closest('[data-reader-ui]')&&n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden');
   // Nested caption spans must not duplicate their children's words.
   return nodes.filter(n=>!nodes.some(other=>other!==n&&n.contains(other))).map(n=>n.textContent).join(' ').replace(/\s+/g,' ').trim();
  },observe(changed,signal){
   let timer,first=0;
   const schedule=()=>{const now=performance.now();if(!first)first=now;clearTimeout(timer);timer=setTimeout(()=>{first=0;changed();},Math.min(100,Math.max(0,250-(now-first))));};
   const observer=new MutationObserver(records=>{
    if(records.some(r=>{
     const el=r.target.nodeType===1?r.target:r.target.parentElement;
     if(el?.closest('[data-reader-ui]'))return false;
     return (el===root&&r.type==='attributes')||el?.closest(rule.container)||el?.matches(rule.cc||':not(*)')||[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&(n.matches(rule.container)||n.querySelector(rule.container)));
    }))schedule();
   });
   const resize=new ResizeObserver(schedule);resize.observe(root);
   observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','aria-pressed']});
   signal.addEventListener('abort',()=>{observer.disconnect();resize.disconnect();clearTimeout(timer);},{once:true});
  }};
 }
 globalThis.ReaderVideoSources=Object.freeze({forVideo,captionsEnabled,redditCaptionBounds});
})();

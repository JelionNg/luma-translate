// Generated from video-rules.js; regenerate with scripts/sync-video-rules.cjs.
// Independent, declarative resource contracts. No executable vendor rules.
(()=>{
 const rules=[
  {id:'wistia',hosts:['wistia.net','wistia.com','ahrefs.com'],format:'json',resource:{hosts:['wistia.net','wistia.com'],path:'^/embed/captions/[^/]+\\.json$'},mapping:{items:['captions'],nested:['hash','lines'],text:'text',start:'start',end:'end'},identity:'url',verification:'static'},

  {id:'youtube',hosts:['youtube.com'],format:'auto',resource:{hosts:['youtube.com'],path:'^/api/timedtext$'},identity:'youtube',verification:'fixture'},
  {id:'reddit',hosts:['reddit.com'],format:'auto',resource:{hosts:['redd.it','reddit.com'],path:'\\.vtt$'},identity:'url',verification:'fixture'},
  {id:'bilibili',hosts:['bilibili.com'],format:'json',resource:{hosts:['aisubtitle.hdslb.com','subtitle.hdslb.com'],path:'^/bfs/'},mapping:{items:['body'],text:'content',start:'from',end:'to'},identity:'url',verification:'fixture'}
 ];
 const hostMatches=(host,domains)=>domains.some(d=>host===d||host.endsWith('.'+d));
 function resolve(page){try{const u=new URL(page);return rules.find(r=>hostMatches(u.hostname,r.hosts))||null;}catch{return null;}}
 function resource(page,address){
  const rule=resolve(page);if(!rule)return null;
  try{const u=new URL(address),p=new URL(page);if(u.protocol!=='https:'||u.username||u.password||!hostMatches(u.hostname,rule.resource.hosts)||!new RegExp(rule.resource.path,'i').test(u.pathname))return null;
   let videoId='',language='',key=u.origin+u.pathname;
   if(rule.identity==='youtube'){
    videoId=p.searchParams.get('v')||p.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1]||'';
    if(!videoId||u.searchParams.get('v')!==videoId)return null;
    language=u.searchParams.get('tlang')||u.searchParams.get('lang')||'';
    key=JSON.stringify([videoId,language,u.searchParams.get('kind')||'',u.searchParams.get('name')||'']);
   }else key=u.href; // Query parameters may identify distinct tracks. Never discard them.
   return {rule,url:u.href,videoId,language,key:rule.id+':'+key};
  }catch{return null;}
 }
 function mapJSON(value,mapping){
  let rows=value;for(const key of mapping.items||[])rows=rows?.[key];
  if(mapping.nested&&Array.isArray(rows)){const outer=rows;rows=[];for(let item of outer){for(const key of mapping.nested)item=item?.[key];if(Array.isArray(item)){if(rows.length+item.length>20000)throw Error('字幕超过数量限制');rows.push(...item);}}}
  if(!Array.isArray(rows)||rows.length>20000)throw Error('字幕数组缺失或超过数量限制');
  return rows.filter(r=>r&&typeof r[mapping.text]==='string'&&Number.isFinite(r[mapping.start])&&Number.isFinite(r[mapping.end])).map(r=>({text:r[mapping.text],start:r[mapping.start],end:r[mapping.end]}));
 }
 // Only callers with a verified stable track key may append segments.
 function segmentIdentity(manifestUrl,trackId,language,segmentUrls,address){
  // Explicit membership supplied by an authoritative track manifest only.
  if(typeof trackId!=='string'||!trackId||typeof language!=='string'||!Array.isArray(segmentUrls)||segmentUrls.length>20000)return null;
  try{const base=new URL(manifestUrl);if(base.protocol!=='https:')return null;const url=new URL(address,base).href;
   if(!segmentUrls.some(s=>typeof s==='string'&&new URL(s,base).href===url))return null;
   return JSON.stringify([base.href,trackId,language]);
  }catch{return null;}
 }
 function merge(previous,incoming){
  const map=new Map(previous.map(c=>[JSON.stringify([c.start,c.end]),c]));
  for(const c of incoming)map.set(JSON.stringify([c.start,c.end]),c);
  if(map.size>20000)throw Error('字幕轨道超过 20000 条');
  return [...map.values()].sort((a,b)=>a.start-b.start||a.end-b.end);
 }
 globalThis.ReaderVideoRules=Object.freeze({resolve,resource,mapJSON,merge,segmentIdentity});
})();

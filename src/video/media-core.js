(() => {
  const MAX_CUES=20000,MAX_TEXT=2*1024*1024;
  function plain(value){
    const doc=new DOMParser().parseFromString(String(value),'text/html');
    doc.querySelectorAll('script,style').forEach(el=>el.remove());
    return (doc.body.textContent||'').replace(/\s+/g,' ').trim();
  }
  function time(value){const parts=value.replace(',','.').split(':').map(Number);if(parts.some(v=>!Number.isFinite(v)))return NaN;return parts.reduce((n,v)=>n*60+v,0);}
  function normalize(rows){
    if(rows.length>MAX_CUES)throw Error('字幕超过 20000 条，请分段导入');
    const seen=new Set();return rows.map(row=>({start:Number(row.start),end:Number(row.end),text:plain(row.text)})).filter(row=>{
      if(!Number.isFinite(row.start)||!Number.isFinite(row.end)||row.start<0||row.end<=row.start||!row.text)return false;
      if(row.text.length>20000)throw Error('单条字幕过长');
      const key=JSON.stringify(row);if(seen.has(key))return false;seen.add(key);return true;
    }).sort((a,b)=>a.start-b.start||a.end-b.end).map((row,i)=>({...row,id:JSON.stringify([row.start,row.end,row.text])}));
  }
  function splitTimed(row){
    const tokens=row.tokens;if(!tokens||tokens.length<2)return [row];
    const out=[];let first=0,text='';
    for(let i=0;i<tokens.length;i++){
      text+=tokens[i].text;const next=tokens[i+1];
      const elapsed=(next?.start??row.end)-tokens[first].start;
      const terminal=sentenceEnd(text)&&(text.trim().split(/\s+/).length>=3||/[。！？]/.test(text));
      if(!next||(elapsed>=.8&&(terminal||text.trim().split(/\s+/).length>=20||text.length>=100||elapsed>=6))){
        out.push({start:tokens[first].start,end:next?.start??row.end,text});first=i+1;text='';
      }
    }
    // A duration/length split can leave a tiny tail. Keep it with its own
    // source sentence rather than producing a separate two-character caption.
    if(out.length>1){const tail=out.at(-1),previous=out.at(-2);
      if(!sentenceEnd(previous.text)&&tail.text.trim().length<=8&&tail.end-previous.start<=9){previous.text+=tail.text;previous.end=tail.end;out.pop();}
    }
    return out;
  }
  function ttml(doc){
    const root=doc.documentElement,attr=(el,name)=>[...el.attributes].find(a=>a.localName===name)?.value;
    if(attr(root,'timeBase')&&attr(root,'timeBase')!=='media')throw Error('暂不支持非媒体时间基准 TTML');
    const fps=Number(attr(root,'frameRate')||30),mult=(attr(root,'frameRateMultiplier')||'1 1').split(/\s+/).map(Number);
    const rate=fps*mult[0]/mult[1],tick=Number(attr(root,'tickRate')||rate*Number(attr(root,'subFrameRate')||1));
    const seconds=value=>{
      if(value==null)return null;
      const unit=value.match(/^([0-9]+(?:\.[0-9]+)?)(h|m|s|ms|f|t)$/);
      if(unit)return Number(unit[1])*({h:3600,m:60,s:1,ms:.001,f:1/rate,t:1/tick}[unit[2]]);
      if(/^\d+:\d{2}:\d{2}(?:\.\d+)?$/.test(value))return time(value);
      const frame=value.match(/^(\d+):(\d{2}):(\d{2}):(\d+)$/);if(frame)return +frame[1]*3600 + +frame[2]*60 + +frame[3] + +frame[4]/rate;
      throw Error('不支持的 TTML 时间表达式');
    };
    const rows=[];
    function visit(el,base,end){
      if(attr(el,'timeContainer')==='seq')throw Error('暂不支持顺序时间容器 TTML');
      const start=base+(seconds(el.getAttribute('begin'))??0),finish=Math.min(end,el.hasAttribute('end')?base+seconds(el.getAttribute('end')):Infinity,el.hasAttribute('dur')?start+seconds(el.getAttribute('dur')):Infinity);
      if(el.localName==='p'){
        if([...el.querySelectorAll('*')].some(n=>n.hasAttribute('begin')||n.hasAttribute('end')||n.hasAttribute('dur')))throw Error('暂不支持段内动态计时 TTML');
        const copy=el.cloneNode(true);for(const br of copy.querySelectorAll('*'))if(br.localName==='br')br.replaceWith(' ');
        rows.push({start,end:finish,text:copy.textContent});return;
      }
      for(const child of el.children)visit(child,start,finish);
    }
    visit(root,0,Infinity);return rows;
  }
  function parse(value){
    if(typeof value!=='string'||value.length>MAX_TEXT)throw Error('字幕文件过大（最多 2 MiB 文本）');
    value=value.replace(/^\uFEFF/,'').trim();if(!value)throw Error('字幕响应为空，请开启 CC 后重试');let rows=[];
    if(value.startsWith('{')){
      const data=JSON.parse(value);if(Array.isArray(data.body)){if(data.body.length>MAX_CUES)throw Error('字幕超过 20000 条');const parsed=normalize(data.body.filter(c=>c&&typeof c.from==='number'&&typeof c.to==='number'&&typeof c.content==='string').map(c=>({start:c.from,end:c.to,text:c.content})));if(!parsed.length)throw Error('字幕 JSON 中没有有效时间轴');return parsed;}if(!Array.isArray(data.events))throw Error('不支持此字幕 JSON');
      if(data.events.length>MAX_CUES)throw Error('字幕事件超过 20000 条');
      const windows=new Map();
      for(const e of data.events){
        if(!Array.isArray(e.segs))continue;
        const start=Number(e.tStartMs)/1000,duration=Number(e.dDurationMs)/1000;
        if(!Number.isFinite(start)||!Number.isFinite(duration)||duration<=0)continue;
        const text=e.segs.map(s=>typeof s.utf8==='string'?s.utf8:'').join('');if(!text.trim())continue;
        const previous=Number.isInteger(e.wWinId)?windows.get(e.wWinId):null,end=start+duration;
        if(previous&&start>=previous.start&&start<previous.end){
          if(e.aAppend){delete previous.tokens;previous.text+=text;previous.end=Math.max(previous.end,end);continue;}
          if(text.startsWith(previous.text)){delete previous.tokens;previous.text=text;previous.end=Math.max(previous.end,end);continue;}
          // Rolling replacements share one window; distinct windows may overlap.
          if(start>previous.start)previous.end=start;
        }
        const row={start,end,text};
        const tokens=e.segs.map((s,i)=>({start:start+(i===0&&s.tOffsetMs===undefined?0:Number(s.tOffsetMs))/1000,text:typeof s.utf8==='string'?s.utf8:''}));
        if(tokens.length>1&&tokens.every((t,i)=>Number.isFinite(t.start)&&t.start>=start&&t.start<end&&(!i||t.start>tokens[i-1].start)))row.tokens=tokens;
        rows.push(row);if(Number.isInteger(e.wWinId))windows.set(e.wWinId,row);
      }
    }else if(value.startsWith('<')){
      const doc=new DOMParser().parseFromString(value,'text/xml');if(doc.querySelector('parsererror'))throw Error('字幕 XML 无法解析');
      rows=doc.documentElement.localName==='tt'?ttml(doc):[...doc.querySelectorAll('text,p')].map(el=>{const ms=el.hasAttribute('t'),start=Number(el.getAttribute(ms?'t':'start'))/(ms?1000:1),duration=Number(el.getAttribute(ms?'d':'dur'))/(ms?1000:1);return{start,end:start+duration,text:el.textContent};});
    }else{
      for(const block of value.replace(/\r\n?/g,'\n').split(/\n\s*\n/)){
        const lines=block.split('\n');if(/^(NOTE|STYLE|REGION)(\s|$)/.test(lines[0]))continue;
        const index=lines.findIndex(line=>line.includes('-->'));if(index<0)continue;
        const match=lines[index].match(/([\d:.,]+)\s*-->\s*([\d:.,]+)/);if(!match)continue;
        rows.push({start:time(match[1]),end:time(match[2]),text:lines.slice(index+1).join(' ')});
      }
    }
    const cues=normalize(rows.flatMap(splitTimed));if(!cues.length)throw Error('响应中没有可用的字幕时间轴，请开启 CC 或切换字幕轨道');return cues;
  }
  // Join fragments for interpretation, never rewrite their presentation times.
  function sentenceEnd(text){
    const t=text.trim();
    if(/(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc)|\b[A-Z]|\d)\.$/i.test(t))return false;
    return /[.!?。！？]["”’」』)]*$/.test(t);
  }
  function contextWindow(cues,first,last){
    const before=[],after=[];
    for(let i=first-1;i>=0&&before.length<2;i--){
      if(cues[i+1].start-cues[i].end>2||cues[i].end>cues[i+1].start+.1)break;
      before.unshift(cues[i]);if(sentenceEnd(cues[i].text))break;
    }
    for(let i=last+1;i<cues.length&&after.length<2;i++){
      if(cues[i].start-cues[i-1].end>2||cues[i-1].end>cues[i].start+.1)break;
      after.push(cues[i]);if(sentenceEnd(cues[i].text))break;
    }
    return {before,after};
  }
  function windowAt(cues,seconds,ahead=35){
    // Track size is capped. A full pass also retains long overlapping cues.
    return cues.filter(c=>c.end>seconds&&c.start<=seconds+ahead);
  }
  globalThis.ReaderMediaCore=Object.freeze({parse,normalize,windowAt,contextWindow,MAX_TEXT});
})();

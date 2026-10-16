const output=document.querySelector('#result');
const items=[{id:'0',text:'This software translates web pages.'},{id:'1',text:'The project supports local models and image processing.'}];
const log=value=>output.textContent+=value+'\n';
async function direct(c,stream){
 const began=performance.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
 const label=stream?'直接流式':'直接非流式';let bytes=0,visible=0,content='',reader;
 const elapsed=()=>Math.round(performance.now()-began);
 try{
  const body={model:c.model,stream,messages:[{role:'system',content:'Translate into Simplified Chinese. Return ONLY a JSON array of objects {"id":string,"text":string}, preserving every id.'},{role:'user',content:JSON.stringify(items)}]};
  if(['deepseek-flash','deepseek-v4-flash','deepseek-v4-pro'].includes(c.model.trim()))body.thinking={type:'disabled'};
  const response=await fetch(c.endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+c.apiKey.trim()},body:JSON.stringify(body),signal:controller.signal});
  log(`${label} HTTP ${response.status} · 响应头 ${elapsed()}ms · ${response.headers.get('Content-Type')||'未知类型'}`);
  reader=response.body.getReader();const decoder=new TextDecoder();let buffer='',first=false,done=false;
  while(!done){
   const part=await reader.read();bytes+=part.value?.length||0;
   if(bytes>1000000)throw Error('响应超过诊断读取上限');
   const chunk=decoder.decode(part.value,{stream:!part.done});visible+=chunk.replace(/\s/g,'').length;
   if(stream&&response.ok){
    buffer+=chunk;buffer=buffer.replace(/\r\n/g,'\n');let split;
    while((split=buffer.indexOf('\n\n'))>=0){
     const block=buffer.slice(0,split);buffer=buffer.slice(split+2);
     const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
     if(!data)continue;if(data.trim()==='[DONE]'){done=true;continue;}
     const event=JSON.parse(data);if(event.error)throw Error('接口返回流式错误');
     const choice=event.choices?.[0];if(choice?.delta?.content){content+=choice.delta.content;if(!first){first=true;log(`${label} 首个译文 ${elapsed()}ms`);}}
     if(choice?.finish_reason==='stop')done=true;
    }
   }else content+=chunk;
   if(part.done)break;
  }
  if(!response.ok){log(`${label} 失败 · HTTP ${response.status} · ${elapsed()}ms`);return;}
  if(stream&&!done)throw Error('流式响应未完成');
  if(!stream)content=JSON.parse(content).choices?.[0]?.message?.content||'';
  const parsed=JSON.parse(content.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
  const valid=Array.isArray(parsed)&&parsed.length===items.length&&items.every(x=>parsed.filter(y=>y.id===x.id&&typeof y.text==='string'&&y.text.trim()).length===1);
  log(`${label} ${valid?'译文校验通过':'译文格式不完整'} · ${elapsed()}ms · ${bytes}字节`);
 }catch(error){log(`${label} ${controller.signal.aborted?'65秒超时':error.name} · ${elapsed()}ms · 已接收 ${bytes}字节 / 非空白 ${visible}字符 / 译文 ${stream?content.length:0}字符`);}
 finally{clearTimeout(timer);if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}}
}
async function run(mode){
 const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);output.textContent='';
 try{
  const c=await chrome.storage.sync.get(ReaderConfig.defaults);if(!c.apiKey?.trim())throw Error('未配置密钥');
  c.endpoint=c.endpoint.trim().replace(/\/+$/,'').replace(/(?:\/chat\/completions)?$/,'/chat/completions');
  log('版本 '+chrome.runtime.getManifest().version+' · '+new URL(c.endpoint).hostname+' · '+c.model);
  if(mode==='direct')await Promise.all([direct(c,false),direct(c,true)]);
  else{const began=performance.now();const result=await chrome.runtime.sendMessage({type:'translate-batch',generation:Date.now(),force:true,items});log('插件批量通道 '+(result?.ok?'成功':result?.error||'无响应')+' · '+Math.round(performance.now()-began)+'ms');}
 }catch(error){log(error.message);}finally{buttons.forEach(b=>b.disabled=false);}
}
document.querySelector('#start').onclick=()=>run('direct');
document.querySelector('#batch').onclick=()=>run('batch');

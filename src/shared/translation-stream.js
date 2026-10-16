// OpenAI-compatible SSE decoder; completion is explicit, never inferred from EOF.
async function readTranslationStream(response,signal,onText){
  const reader=response.body?.getReader();if(!reader)throw Error('翻译服务没有返回可读取的内容');
  const decoder=new TextDecoder();let buffer='',text='',complete=false;
  function event(block){
    const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
    if(!data)return;if(data.trim()==='[DONE]'){complete=true;return;}
    const value=JSON.parse(data);if(value.error)throw Error(value.error.message||'流式翻译失败');
    const choice=value.choices?.[0];const delta=choice?.delta?.content;
    if(typeof delta==='string'){text+=delta;if(text.length>200000)throw Error('译文超过长度限制');onText(text);}
    if(choice?.finish_reason==='length')throw Error('译文被服务截断，请缩小选择范围');
    if(choice?.finish_reason==='content_filter')throw Error('服务未能完成此段翻译');
    if(choice?.finish_reason==='stop')complete=true;
  }
  try{
    while(true){signal.throwIfAborted();const part=await reader.read();buffer+=decoder.decode(part.value,{stream:!part.done});if(buffer.length>1000000)throw Error('流式响应超过缓冲限制');
      buffer=buffer.replace(/\r\n/g,'\n');let split;
      while((split=buffer.indexOf('\n\n'))>=0){event(buffer.slice(0,split));buffer=buffer.slice(split+2);}
      if(complete)break;if(part.done){if(buffer.trim())event(buffer);break;}
    }
    signal.throwIfAborted();if(!complete||!text.trim())throw Error('翻译连接提前结束，请重试');return text;
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}

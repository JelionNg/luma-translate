const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
function harness(){
 let markerNoise=false,numericIds=false;const prompts=[];
 let listener,calls=0,active=0,peak=0,malformed=false,retry=false,networkFailures=0,busy=false,latency=()=>25;
 const starts=[],updates=[];
 const config={apiKey:'test',endpoint:'https://api.deepseek.com',model:'deepseek-flash',targetLang:'简体中文',minInterval:0},local={};
 const chrome={tabs:{sendMessage:async(id,m)=>updates.push(m),onRemoved:{addListener(){}},onUpdated:{addListener(){}}},storage:{sync:{get:async d=>({...d,...config})},local:{get:async key=>Array.isArray(key)?Object.fromEntries(key.map(k=>[k,local[k]])):{...local},set:async v=>Object.assign(local,v),remove:async keys=>keys.forEach(k=>delete local[k])}},runtime:{onMessage:{addListener:f=>listener=f}},commands:{onCommand:{addListener(){}}}};
 vm.runInNewContext(fs.readFileSync(__dirname+'/../background.js','utf8'),{importScripts(){},...vm.runInNewContext(fs.readFileSync(__dirname+'/../reader-config.js','utf8')+';({ReaderConfig})'),chrome,TextEncoder,TextDecoder,readTranslationStream:vm.runInNewContext(fs.readFileSync(__dirname+'/../translation-stream.js','utf8')+';readTranslationStream',{TextDecoder}),crypto:require('node:crypto').webcrypto,AbortSignal,AbortController,setTimeout,clearTimeout,TypeError,fetch:async(url,options)=>{
 starts.push(Date.now());calls++;if(networkFailures-->0)throw new TypeError('Failed to fetch');active++;peak=Math.max(peak,active);assert.equal(url,'https://api.deepseek.com/chat/completions');
 const body=JSON.parse(options.body);prompts.push(body.messages[0].content);
 if(['deepseek-flash','deepseek-v4-flash','deepseek-v4-pro'].includes(config.model.trim()))assert.deepEqual(body.thinking,{type:'disabled'});else assert.equal(body.thinking,undefined);
 if(body.stream){active--;return new Response(new ReadableStream({async start(controller){controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"先出现"}}]}\n\n'));await new Promise(r=>setTimeout(r,80));controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"后完成"},"finish_reason":"stop"}]}\n\n'));controller.close();}}),{headers:{'Content-Type':'text/event-stream'}});}
 const items=JSON.parse(body.messages[1].content);await new Promise(r=>setTimeout(r,latency(calls)));active--;
 if(busy)return {ok:false,status:503,headers:{get:()=>null},json:async()=>({error:{message:'Service is too busy'}})};
 if(retry){retry=false;return{ok:false,status:429,headers:{get:()=>null},json:async()=>({})};}
 return{ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(malformed&&items.length>1?[]:items.slice().reverse().map(x=>({id:numericIds?Number(x.id):x.id,text:markerNoise?'⟦R9⟧译:'+x.text+'⟦/R9⟧':'译:'+x.text})))}}]})};
 }});
 return{config,starts,updates,prompts,set numericIds(v){numericIds=v;},set busy(v){busy=v;},set markerNoise(v){markerNoise=v;},local:text=>new Promise(resolve=>listener({type:'translate-local',generation:1,requestId:'1:0',stream:true,items:[{id:'0',text}]},{tab:{id:1},documentId:'fixture'},resolve)),set latency(v){latency=v;},set networkFailures(v){networkFailures=v;},set malformed(v){malformed=v;},set retry(v){retry=v;},get calls(){return calls;},get peak(){return peak;},request:(texts,format,imageContext)=>new Promise(resolve=>listener({type:'translate-batch',format,imageContext,items:texts.map((text,i)=>({id:String(i),text}))},{},resolve))};
}
test('乱序响应按 ID 恢复，缓存和语言隔离',async()=>{const h=harness();let r=await h.request(['a','b']);assert.equal(r.items[0].text,'译:a');await h.request(['a','b']);assert.equal(h.calls,1);h.config.targetLang='English';await h.request(['a']);assert.equal(h.calls,2);});
test('并发上限 6，同文在途去重',async()=>{const h=harness();await Promise.all(Array.from({length:8},(_,i)=>h.request(['段'+i])));assert.equal(h.peak,6);const before=h.calls;await Promise.all([h.request(['same']),h.request(['same'])]);assert.equal(h.calls,before+1);});
test('损坏批次退化为单段，不产生错位',async()=>{const h=harness();h.malformed=true;const r=await h.request(['a','b']);assert.equal(r.ok,true);assert.equal(r.items[1].text,'译:b');assert.equal(h.calls,3);});
test('429 有界重试',async()=>{const h=harness();h.retry=true;assert.equal((await h.request(['a'])).ok,true);assert.equal(h.calls,2);});
test('24 段冷缓存与暖缓存模拟基准',async()=>{const h=harness();const texts=Array.from({length:24},(_,i)=>'bench'+i);const t=performance.now();await Promise.all(Array.from({length:6},(_,i)=>h.request(texts.slice(i*4,i*4+4))));const elapsed=performance.now()-t;assert.equal(h.calls,6);await h.request(texts.slice(0,4));assert.equal(h.calls,6);console.log(JSON.stringify({simulatedLatencyMs:25,paragraphs:24,requests:6,peakConcurrency:h.peak,coldMs:Math.round(elapsed),serialBaselineNominalMs:600,warmExtraRequests:0}));});

test('一个服务退避时，另一个服务仍能完成请求',async()=>{const h=harness();h.config.serviceId='A';h.retry=true;let aDone=false;const a=h.request(['service A']).then(r=>{aDone=true;return r});await new Promise(r=>setTimeout(r,60));h.config.serviceId='B';const b=await h.request(['service B']);assert.equal(b.ok,true);assert.equal(aDone,false);assert.equal((await a).ok,true);});

test('并发队列阻塞后仍按实际启动时间限速',async()=>{const h=harness();h.config.concurrency=2;h.config.minInterval=40;h.latency=n=>n<=2?200:25;await Promise.all(Array.from({length:8},(_,i)=>h.request(['paced'+i])));for(let i=1;i<h.starts.length;i++)assert.ok(h.starts[i]-h.starts[i-1]>=40);assert.equal(h.peak,2);});
test('暂时断网可恢复，连续断网最多三次',async()=>{const h=harness();h.networkFailures=1;assert.equal((await h.request(['recover'])).ok,true);const before=h.calls;h.networkFailures=9;const result=await h.request(['offline']);assert.equal(result.ok,false);assert.match(result.error,/已尝试 3 次/);assert.equal(h.calls-before,3);});

test('划词在完整响应前显示流式增量，完成后才缓存',async()=>{const h=harness();let done=false;const request=h.local('selection').then(result=>{done=true;return result;});await new Promise(r=>setTimeout(r,35));assert.equal(done,false);assert.ok(h.updates.some(m=>m.text==='先出现'));const result=await request;assert.equal(result.items[0].text,'先出现后完成');const before=h.calls;await h.local('selection');assert.equal(h.calls,before);});

test('SSE 支持 UTF-8/事件边界拆包，截断与取消不作为完成',async()=>{
 const read=vm.runInNewContext(fs.readFileSync(__dirname+'/../translation-stream.js','utf8')+';readTranslationStream',{TextDecoder});
 const make=value=>new Response(new ReadableStream({start(c){for(const byte of new TextEncoder().encode(value))c.enqueue(Uint8Array.of(byte));c.close();}}));
 const event='data: {"choices":[{"delta":{"content":"中文"}}]}\r\n\r\n';
 assert.equal(await read(make(event+'data: [DONE]\r\n\r\n'),new AbortController().signal,()=>{}),'中文');
 await assert.rejects(read(make(event),new AbortController().signal,()=>{}),/提前结束/);
 const controller=new AbortController();controller.abort();await assert.rejects(read(make(event),controller.signal,()=>{}));
});

 test('图片纯文本隔离富文本提示和旧缓存，移除虚构标记并保留原文符号',async()=>{
 const h=harness();h.markerNoise=true;
 assert.equal((await h.request(['photo'])).items[0].text,'⟦R9⟧译:photo⟦/R9⟧');
 assert.equal((await h.request(['photo'],'plain')).items[0].text,'译:photo');assert.equal(h.calls,2);
 assert(!h.prompts[1].includes('R0'));assert(h.prompts[0].includes('R0'));
 await h.request(['photo'],'plain');assert.equal(h.calls,2);
 assert.equal((await h.request(['[R0] literal [/R0]'],'plain')).items[0].text,'译:[R0] literal [/R0]');
 });

test('服务繁忙有界重试并返回可读原因',async()=>{const h=harness();h.busy=true;const result=await h.request(['busy fixture']);assert.equal(result.ok,false);assert.match(result.error,/HTTP 503.*服务繁忙/);assert.equal(h.calls,3);h.busy=false;assert.equal((await h.request(['busy fixture'])).ok,true);});

test('图片相邻上下文参与提示、缓存身份和边界校验',async()=>{const h=harness();const a={before:['A river'],after:['flows here']},b={before:['A bank account'],after:['holds money']};assert.equal((await h.request(['bank'],'plain',a)).ok,true);assert(h.prompts[0].includes('same image'));await h.request(['bank'],'plain',a);assert.equal(h.calls,1);await h.request(['bank'],'plain',b);assert.equal(h.calls,2);assert.equal((await h.request(['bank'],'plain',{before:['x'.repeat(401)],after:[]})).ok,false);assert.equal(h.calls,2);});

test('数值段落 ID 按精确字符串身份映射',async()=>{const h=harness();h.numericIds=true;const r=await h.request(['first','second']);assert.equal(r.ok,true);assert.equal(r.items[0].text,'译:first');assert.equal(r.items[1].text,'译:second');assert.equal(h.calls,1);});

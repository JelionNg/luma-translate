const $=id=>document.getElementById(id);let worker=null,file=null,image=null,job=0,last=null,translationJob=0;
function stop(){job++;translationJob++;if(globalThis.chrome?.runtime?.id)chrome.runtime.sendMessage({type:'cancel-translation',generation:translationJob}).catch(()=>{});worker?.terminate();worker=null;$('cancel').disabled=true;$('again').disabled=!file;$('status').textContent='已取消并停止模型 Worker';$('cancel').textContent='释放模型';}
function draw(highlight=-1){if(!image)return;const c=$('canvas');const scale=Math.min(1,1600/Math.max(image.width,image.height));c.width=Math.round(image.width*scale);c.height=Math.round(image.height*scale);const ctx=c.getContext('2d');ctx.scale(scale,scale);ctx.drawImage(image,0,0);ctx.lineWidth=Math.max(1.5,image.width/650);(last?.regions||[]).forEach((region,i)=>{ctx.beginPath();region.polygon.forEach(([x,y],j)=>j?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.strokeStyle=i===highlight?'#e7832d':'#8b5cf6';ctx.stroke();});}
function show(result){last=result;globalThis.ocrResult=result;draw();$('results').replaceChildren(...result.regions.map((r,i)=>{const row=document.createElement('div');row.className='region';const label=document.createElement('small');label.textContent=`${i+1} · 识别置信度 ${(r.score*100).toFixed(0)}%`;const p=document.createElement('p');p.textContent=r.text;row.append(label,p);row.onmouseenter=()=>draw(i);row.onmouseleave=()=>draw();return row;}));
  $('metrics').textContent=`${result.regions.length} 块文字 · 模型加载 ${(result.timing.loadMs/1000).toFixed(2)}s · 检测 ${(result.timing.detectMs/1000).toFixed(2)}s · 识别 ${(result.timing.recognizeMs/1000).toFixed(2)}s`;
  $('details').textContent=JSON.stringify({engine:result.engine,timing:result.timing,metadata:result.metadata},null,2);$('status').textContent=result.regions.length?'识别完成 · 图片没有上传':'未识别到文字，可尝试更清晰的截图';$('copy').disabled=!result.regions.length;$('translate').disabled=!result.regions.length||!globalThis.chrome?.runtime?.id;
}
async function run(){
  if(!file)return;translationJob++;if(globalThis.chrome?.runtime?.id)chrome.runtime.sendMessage({type:'cancel-translation',generation:translationJob}).catch(()=>{});const id=++job;globalThis.ocrResult=null;globalThis.ocrError=null;$('results').replaceChildren();$('metrics').textContent='';$('copy').disabled=true;$('translate').disabled=true;$('again').disabled=true;$('cancel').disabled=false;$('cancel').textContent='取消识别';$('status').textContent='正在读取图片…';
  try{const bitmap=await createImageBitmap(file);if(id!==job){bitmap.close();return;}if(bitmap.width*bitmap.height>20*1024*1024){bitmap.close();throw Error('图片过大，请裁剪至 2000 万像素以内');}
    image?.close();image=await createImageBitmap(bitmap);if(id!==job){bitmap.close();return;}last=null;draw();$('canvas').style.display='block';$('empty').hidden=true;
    if(!worker){worker=new Worker(new URL('./ocr-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{if(data.id!==job)return;if(data.type==='progress')$('status').textContent=data.message;else{$('cancel').disabled=false;$('cancel').textContent='释放模型';$('again').disabled=false;if(data.type==='result')show(data.result);else{$('status').textContent='识别失败：'+data.error;$('details').textContent=data.stack||data.error;globalThis.ocrError=data;}}};worker.onerror=event=>{$('status').textContent='识别引擎无法启动：'+event.message;$('again').disabled=false;$('cancel').disabled=false;globalThis.ocrError={error:event.message};};}
    worker.postMessage({type:'recognize',id,bitmap},[bitmap]);
  }catch(e){if(id===job){$('status').textContent=e.message;$('cancel').disabled=true;$('again').disabled=false;}}
}
$('file').onchange=()=>{const next=$('file').files[0];if(!next)return;if(next.size>12*1024*1024){$('status').textContent='图片文件请控制在 12 MiB 以内';return;}stop();file=next;run();};$('again').onclick=run;$('cancel').onclick=stop;
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(last.regions.map(r=>r.text).join('\n'));$('status').textContent='已复制识别文字';}catch{$('status').textContent='请选中文字手动复制';}};
window.addEventListener('pagehide',()=>{worker?.terminate();image?.close();});

$('translate').onclick=async()=>{
  if(!last||!globalThis.chrome?.runtime?.id)return;
  const token=++translationJob,source=last;const plan=ReaderImageLayout.plan(source.regions),rows=[...$('results').children];for(const row of rows)row.querySelector('.translated')?.remove();$('translate').disabled=true;
  try{for(let i=0;i<plan.items.length;i+=4){
    if(token!==translationJob)return;$('status').textContent=`正在翻译文字 ${i+1} / ${plan.items.length}…`;
    const items=plan.items.slice(i,i+4);
    const result=await chrome.runtime.sendMessage({type:'translate-batch',format:'plain',generation:token,items,imageContext:{before:plan.items.slice(Math.max(0,i-3),i).map(x=>x.text.slice(0,400)),after:plan.items.slice(i+items.length,i+items.length+3).map(x=>x.text.slice(0,400))}});
    if(token!==translationJob)return;if(!result?.ok)throw Error(result?.error||'翻译失败');
    for(const item of result.items){const row=rows[Number(item.id)];if(!row)continue;let p=row.querySelector('.translated');if(!p){p=document.createElement('p');p.className='translated';row.append(p);}p.textContent=item.text;}
  }$('status').textContent='翻译完成 · 图片仍留在本机';}
  catch(e){if(token===translationJob)$('status').textContent=e.message;}
  finally{if(token===translationJob)$('translate').disabled=false;}
};

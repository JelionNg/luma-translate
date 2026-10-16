import {traceTextLines,unwrapTextLine} from './curve-lines.js';
import * as ort from './assets/ort/ort.wasm.min.mjs';

// One worker and one WASM thread keep OCR off the webpage's main thread.
ort.env.wasm.wasmPaths=new URL('./assets/ort/',import.meta.url).href;
ort.env.wasm.numThreads=1;
ort.env.wasm.proxy=false;
let detector,recognizer,characters,loading;
const post=(id,type,data)=>self.postMessage({id,type,...data});
async function initialize(id){
  if(loading)return loading;
  loading=(async()=>{
    post(id,'progress',{message:'正在加载本地检测模型…'});
    detector=await ort.InferenceSession.create(new URL('./assets/det.onnx',import.meta.url).href,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
    post(id,'progress',{message:'正在加载本地识别模型…'});
    recognizer=await ort.InferenceSession.create(new URL('./assets/rec.onnx',import.meta.url).href,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
    const r=await fetch(new URL('./characters.json',import.meta.url));if(!r.ok)throw Error('识别字典缺失');characters=['',...await r.json()];
    return {detector:detector.inputMetadata,recognizer:recognizer.inputMetadata,outputs:recognizer.outputMetadata,characters:characters.length};
  })();
  try{return await loading;}catch(e){await detector?.release();await recognizer?.release();detector=recognizer=null;loading=null;throw e;}
}
function canvas(w,h){return new OffscreenCanvas(w,h);}
function tensorFrom(canvas,kind){
  const {width:w,height:h}=canvas,data=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data,values=new Float32Array(3*w*h);
  const mean=[.485,.456,.406],std=[.229,.224,.225];
  for(let c=0;c<3;c++)for(let i=0;i<w*h;i++){const value=data[i*4+(2-c)]/255;values[c*w*h+i]=kind==='det'?(value-mean[c])/std[c]:(value-.5)/.5;}
  return new ort.Tensor('float32',values,[1,3,h,w]);
}
function hull(points){
  points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lower=[],upper=[];for(const p of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(let i=points.length-1;i>=0;i--){const p=points[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}lower.pop();upper.pop();return lower.concat(upper);
}
function box(points){
  const poly=hull(points);if(poly.length<3)return null;let best;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],angle=Math.atan2(b[1]-a[1],b[0]-a[0]),cos=Math.cos(angle),sin=Math.sin(angle);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const [x,y]of poly){const u=x*cos+y*sin,v=-x*sin+y*cos;minX=Math.min(minX,u);maxX=Math.max(maxX,u);minY=Math.min(minY,v);maxY=Math.max(maxY,v);}
    const area=(maxX-minX)*(maxY-minY);if(!best||area<best.area)best={area,minX,minY,maxX,maxY,cos,sin};
  }
  const {minX,minY,maxX,maxY,cos,sin}=best;let area=0,perimeter=0;
  for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];area+=p[0]*q[1]-q[0]*p[1];perimeter+=Math.hypot(p[0]-q[0],p[1]-q[1]);}
  const delta=Math.abs(area)/2*1.4/Math.max(1,perimeter);
  if(Math.min(maxX-minX,maxY-minY)<2)return null;
  let corners=[[minX-delta,minY-delta],[maxX+delta,minY-delta],[maxX+delta,maxY+delta],[minX-delta,maxY+delta]].map(([u,v])=>[u*cos-v*sin,u*sin+v*cos]);
  // Keep the first edge predominantly horizontal for stable reading crops.
  if(Math.abs(corners[1][0]-corners[0][0])<Math.abs(corners[1][1]-corners[0][1]))corners=[corners[3],corners[0],corners[1],corners[2]];
  if(corners[1][0]<corners[0][0])corners=[corners[2],corners[3],corners[0],corners[1]];
  return corners;
}
function detectBoxes(map,w,h,originalW,originalH){
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),regions=[];
  for(let start=0;start<w*h;start++){
    if(seen[start]||map[start]<.2)continue;let head=0,tail=1,sum=0;const boundary=[];queue[0]=start;seen[start]=1;
    while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);sum+=map[i];let edge=false;
      for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]]){const nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h){edge=true;continue;}const n=ny*w+nx;if(map[n]<.2){edge=true;continue;}if(!seen[n]){seen[n]=1;queue[tail++]=n;}}
      if(edge)boundary.push([x,y]);
    }
    if(tail<8||sum/tail<.45||boundary.length<3)continue;
    if(regions.length>=300)throw Error('图片文字块过多，请裁剪后识别（最多 300 块）');
    const sampled=boundary.length>12000?boundary.filter((_,i)=>i%Math.ceil(boundary.length/12000)===0):boundary;
    const polygon=box(sampled);if(!polygon)continue;
    regions.push({polygon:polygon.map(([x,y])=>[Math.max(0,Math.min(originalW-1,x*originalW/w)),Math.max(0,Math.min(originalH-1,y*originalH/h))]),detectionScore:sum/tail});
  }
  regions.sort((a,b)=>{const ay=Math.min(...a.polygon.map(p=>p[1])),by=Math.min(...b.polygon.map(p=>p[1]));return Math.abs(ay-by)>10?ay-by:a.polygon[0][0]-b.polygon[0][0];});return regions;
}
function crop(source,polygon){
  const [p0,p1,p2,p3]=polygon;const w=Math.max(1,Math.ceil(Math.max(Math.hypot(p1[0]-p0[0],p1[1]-p0[1]),Math.hypot(p2[0]-p3[0],p2[1]-p3[1])))),h=Math.max(1,Math.ceil(Math.max(Math.hypot(p3[0]-p0[0],p3[1]-p0[1]),Math.hypot(p2[0]-p1[0],p2[1]-p1[1]))));
  const out=canvas(w,h),ctx=out.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,w,h);ctx.rotate(-Math.atan2(p1[1]-p0[1],p1[0]-p0[0]));ctx.translate(-p0[0],-p0[1]);ctx.drawImage(source,0,0);
  if(h/w<1.5)return out;const rotated=canvas(h,w),r=rotated.getContext('2d');r.translate(0,w);r.rotate(-Math.PI/2);r.drawImage(out,0,0);return rotated;
}
function recognitionInput(source){
  const width=Math.min(1536,Math.max(320,Math.ceil(48*source.width/source.height/32)*32)),resized=Math.min(width,Math.ceil(48*source.width/source.height));
  const out=canvas(width,48),ctx=out.getContext('2d');ctx.fillStyle='#808080';ctx.fillRect(0,0,width,48);ctx.drawImage(source,0,0,resized,48);
  const t=tensorFrom(out,'rec');for(let c=0;c<3;c++)for(let y=0;y<48;y++)t.data.fill(0,c*width*48+y*width+resized,c*width*48+(y+1)*width);return t;
}
function decode(tensor){
  const dims=tensor.dims,n=dims.at(-1),steps=dims.at(-2),data=tensor.data;
  if(n!==characters.length&&n!==characters.length+1)throw Error('识别输出与字符字典不一致：'+n+'/'+characters.length);
  const dict=n===characters.length+1?[...characters,' ']:characters;let text='',previous=-1,total=0,count=0;
  for(let t=0;t<steps;t++){let id=0,score=-Infinity;for(let c=0;c<n;c++)if(data[t*n+c]>score){id=c;score=data[t*n+c];}if(id!==0&&id!==previous){text+=dict[id]||'';total+=score;count++;}previous=id;}
  return {text,score:count?total/count:0};
}
async function recognize(id,bitmap){
  const started=performance.now(),metadata=await initialize(id),loaded=performance.now();
  const scale=Math.min(1,960/Math.max(bitmap.width,bitmap.height));const w=Math.max(32,Math.round(bitmap.width*scale/32)*32),h=Math.max(32,Math.round(bitmap.height*scale/32)*32);
  const input=canvas(w,h),ctx=input.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,w,h);ctx.drawImage(bitmap,0,0,w,h);
  post(id,'progress',{message:'正在本地检测文字位置…'});
  const detInput=tensorFrom(input,'det');let detection;
  try{detection=await detector.run({[detector.inputNames[0]]:detInput});}finally{detInput.dispose();}
  const output=detection[detector.outputNames[0]],shape=output.dims,regions=detectBoxes(output.data,shape.at(-1),shape.at(-2),bitmap.width,bitmap.height);
  const map=Float32Array.from(output.data),mapW=shape.at(-1),mapH=shape.at(-2);for(const value of Object.values(detection))value.dispose();const detected=performance.now(),recognized=new Array(regions.length);let next=0,completed=0;
  const recognizeLane=async()=>{while(true){const i=next++;if(i>=regions.length)return;post(id,'progress',{message:`正在本地识别 ${Math.min(completed+1,regions.length)} / ${regions.length}…`});const t=recognitionInput(crop(bitmap,regions[i].polygon));let outputs;
    try{outputs=await recognizer.run({[recognizer.inputNames[0]]:t});const value=decode(outputs[recognizer.outputNames[0]]);if(value.text.trim())recognized[i]={...regions[i],...value};}
    finally{t.dispose();if(outputs)for(const value of Object.values(outputs))value.dispose();}completed++;}}
  await Promise.all([recognizeLane(),recognizeLane()]);
  const enhancedAt=performance.now(),enhancement={attempted:0,recovered:0,skipped:{},rejected:0};
  for(let i=0;i<regions.length&&enhancement.attempted<4;i++){
    if(recognized[i]?.score>=.70)continue;
    const diagnostic={},lines=traceTextLines(map,mapW,mapH,regions[i].polygon,bitmap.width,bitmap.height,diagnostic);if(!lines.length){enhancement.skipped[diagnostic.reason]=(enhancement.skipped[diagnostic.reason]||0)+1;continue;}enhancement.attempted++;
    const recovered=[];for(const line of lines){const t=recognitionInput(unwrapTextLine(bitmap,line));let outputs;
      try{outputs=await recognizer.run({[recognizer.inputNames[0]]:t});const value=decode(outputs[recognizer.outputNames[0]]);if(value.text.trim()&&value.score>=.70)recovered.push({...value,polygon:line.polygon,contour:line.contour,detectionScore:regions[i].detectionScore,geometry:'curved-band',textGroup:`curve-${i}`});}finally{t.dispose();if(outputs)for(const value of Object.values(outputs))value.dispose();}}
    if(recovered.length===lines.length){recognized[i]=recovered;enhancement.recovered+=recovered.length;}else enhancement.rejected++;
  }
  enhancement.elapsedMs=performance.now()-enhancedAt;
  const result=recognized.flat().filter(value=>value&&value.score>=0.70);
  return {enhancement,regions:result,width:bitmap.width,height:bitmap.height,metadata,timing:{loadMs:loaded-started,detectMs:detected-loaded,recognizeMs:performance.now()-detected,totalMs:performance.now()-started},engine:'PP-OCRv6 small / ONNX Runtime Web 1.30.0 / WASM SIMD / 2 recognizer lanes'};
}
self.onmessage=async({data})=>{
  if(data.type!=='recognize')return;
  try{const result=await recognize(data.id,data.bitmap);post(data.id,'result',{result});}catch(e){post(data.id,'error',{error:e.message,stack:e.stack});}finally{data.bitmap?.close();}
};

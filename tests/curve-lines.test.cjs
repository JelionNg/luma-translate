// Geometry boundary: recover two curved bands without inventing lines in blank/single-line maps.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../ocr/curve-lines.js'),'utf8');
 const {traceTextLines}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const w=320,h=120,polygon=[[0,0],[319,0],[319,119],[0,119]];
 function fixture(count){const map=new Float32Array(w*h);for(let x=25;x<295;x++)for(let band=0;band<count;band++){const y=32+band*35+18*(1-((x-160)/140)**2);for(let dy=-6;dy<=6;dy++)map[Math.round(y+dy)*w+x]=.95;}return map;}
 assert.deepEqual(traceTextLines(new Float32Array(w*h),w,h,polygon,w,h),[]);
 assert.deepEqual(traceTextLines(fixture(1),w,h,polygon,w,h),[]);
 const lines=traceTextLines(fixture(2),w,h,polygon,w,h);assert.equal(lines.length,2);
 for(let i=0;i<2;i++){const line=lines[i];assert(line.halfHeight>=6);assert(line.centers.at(-1)[0]-line.centers[0][0]>250);for(const [x,y] of line.centers)assert(Math.abs(y-(32+i*35+18*(1-((x-160)/140)**2)))<2);for(const [x,y]of line.contour){assert(x>=0&&x<w);assert(y>=0&&y<h);}}
 const scaled=traceTextLines(fixture(2),w,h,polygon.map(p=>p.map(v=>v*2)),w*2,h*2);assert.equal(scaled.length,2);assert.equal(scaled[0].centers[0][0],lines[0].centers[0][0]*2);assert.equal(scaled[0].halfHeight,lines[0].halfHeight*2);
 // The second line starts later. Its unsupported left extrapolation crosses
 // the first line, but the observed text bands are well separated.
 const edgeMap=new Float32Array(w*h);
 for(let x=25;x<295;x++)for(let band=0;band<2;band++){
   if(band===1&&x<105)continue;
   const y=band===0?35:80-.0018*(x-210)**2;
   for(let dy=-5;dy<=5;dy++)edgeMap[Math.round(y+dy)*w+x]=.95;
 }
 const diagnostic={},edgeLines=traceTextLines(edgeMap,w,h,polygon,w,h,diagnostic);
 assert.equal(edgeLines.length,2,'unsupported curve extension must not discard supported lines');
 assert.equal(diagnostic.reason,'ready');
 const blankDiagnostic={};traceTextLines(new Float32Array(w*h),w,h,polygon,w,h,blankDiagnostic);
 assert.equal(blankDiagnostic.reason,'line-count');
 console.log('PASS: curved bands, blank/single-line rejection, original-image coordinate mapping');
})().catch(e=>{console.error(e);process.exitCode=1});

// Recover 2–3 mostly horizontal text bands from a failed detector region.
// Reuse detector probabilities; never lower the recognition acceptance threshold.
// A quadratic approximates gentle arcs, not arbitrary circular/vertical lettering.
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
function fit(points,left,width){
  const matrix=Array.from({length:3},()=>[0,0,0,0]);
  for(const p of points){const x=(p.x-left)/width*2-1,v=[1,x,x*x];for(let i=0;i<3;i++){for(let j=0;j<3;j++)matrix[i][j]+=v[i]*v[j];matrix[i][3]+=v[i]*p.y;}}
  for(let i=0;i<3;i++){let k=i;for(let j=i+1;j<3;j++)if(Math.abs(matrix[j][i])>Math.abs(matrix[k][i]))k=j;[matrix[i],matrix[k]]=[matrix[k],matrix[i]];const d=matrix[i][i];if(Math.abs(d)<1e-6)return null;for(let j=i;j<4;j++)matrix[i][j]/=d;for(let k=0;k<3;k++)if(k!==i){const d=matrix[k][i];for(let j=i;j<4;j++)matrix[k][j]-=d*matrix[i][j];}}
  const c=matrix.map(row=>row[3]);return x=>{const u=(x-left)/width*2-1;return c[0]+c[1]*u+c[2]*u*u;};
}
export function traceTextLines(map,w,h,polygon,originalW,originalH,diagnostic={}){
  const reject=reason=>{diagnostic.reason=reason;return [];};
  const left=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p[0]))*w/originalW)),right=Math.min(w-1,Math.ceil(Math.max(...polygon.map(p=>p[0]))*w/originalW));
  const top=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p[1]))*h/originalH)),bottom=Math.min(h-1,Math.ceil(Math.max(...polygon.map(p=>p[1]))*h/originalH)),width=right-left,height=bottom-top;
  if(width<48||height<20||width/height<1.5)return reject('region-shape');
  const step=Math.max(3,Math.round(width/28)),radius=Math.max(2,Math.round(step/2)),tracks=[];
  for(let x=left+radius;x<right-radius;x+=step){
    const profile=[];for(let y=top;y<=bottom;y++){let sum=0;for(let xx=x-radius;xx<=x+radius;xx++)for(let dy=-1;dy<=1;dy++)sum+=map[Math.max(0,Math.min(h-1,y+dy))*w+xx];profile.push(sum/((radius*2+1)*3));}
    const runs=[];let start=-1;for(let y=0;y<=profile.length;y++){if(profile[y]>.45){if(start<0)start=y;}else if(start>=0){const last=runs.at(-1);if(last&&start-last.end<=3)last.end=y;else runs.push({start,end:y});start=-1;}}
    const used=new Set();for(const r of runs){const size=r.end-r.start;if(size<4||size>height*.30)continue;let mass=0,weighted=0;for(let y=r.start;y<r.end;y++){mass+=profile[y];weighted+=profile[y]*y;}const p={x,y:top+weighted/mass,size};let best=null,distance=Infinity;
      for(const t of tracks){const last=t.at(-1);if(used.has(t)||x-last.x>width*.4)continue;const d=Math.abs(last.y-p.y);if(d<Math.max(7,Math.min(last.size,size)*.7)&&d<distance){best=t;distance=d;}}
      if(best){best.push(p);used.add(best);}else{const t=[p];tracks.push(t);used.add(t);}
    }
  }
  const bands=[];for(const t of tracks){if(t.length<6||t.at(-1).x-t[0].x<width*.45)continue;let curve=fit(t,left,width);if(!curve)continue;const size=median(t.map(p=>p.size)),inliers=t.filter(p=>Math.abs(p.y-curve(p.x))<=Math.max(3,size*.3));if(inliers.length<t.length*.75)continue;curve=fit(inliers,left,width);if(!curve)continue;
    const supportLeft=inliers[0].x,supportRight=inliers.at(-1).x;
    const a=Math.max(left,supportLeft-size*1.5),b=Math.min(right,supportRight+size);
    bands.push({curve,size,left:a,right:b,supportLeft,supportRight,half:size*.85,support:inliers.length});
  }
  bands.sort((a,b)=>a.curve((left+right)/2)-b.curve((left+right)/2));
  if(bands.length<2||bands.length>3)return reject('line-count');
  // Compare only measured support, never the extrapolated crop padding.
  // Keep one stable recognition height per line; edge padding cannot shrink it.
  for(let i=0;i<bands.length-1;i++){
    const a=bands[i],b=bands[i+1],start=Math.max(a.supportLeft,b.supportLeft),end=Math.min(a.supportRight,b.supportRight);
    if(end-start<Math.min(a.supportRight-a.supportLeft,b.supportRight-b.supportLeft)*.4)return reject('insufficient-overlap');
    const gaps=[];
    for(let j=0;j<=24;j++){const x=start+(end-start)*j/24;gaps.push(b.curve(x)-a.curve(x));}
    if(gaps.filter(g=>g<Math.min(a.size,b.size)*.65).length>gaps.length*.25)return reject('ambiguous-lines');
    // Isolated edge noise must not squeeze every glyph in the line.
    const gap=median(gaps);
    a.half=Math.min(a.half,gap*.47);b.half=Math.min(b.half,gap*.47);
  }
  const sx=originalW/w,sy=originalH/h,lines=[];
  for(const band of bands){const centers=[],half=band.half;
    for(let j=0;j<=24;j++){
      const x=band.left+(band.right-band.left)*j/24,y=band.curve(x);
      // The support must be valid; only padding can be clipped to the region.
      if(x>=band.supportLeft&&x<=band.supportRight&&(y<top||y>bottom))return reject('outside-region');
      centers.push([x*sx,Math.max(top,Math.min(bottom,y))*sy]);
    }
    if(half<4)return reject('line-too-thin');const topEdge=centers.map(([x,y])=>[x,Math.max(0,y-half*sy)]),bottomEdge=centers.map(([x,y])=>[x,Math.min(originalH-1,y+half*sy)]);
    const minX=topEdge[0][0],maxX=topEdge.at(-1)[0],minY=Math.min(...topEdge.map(p=>p[1])),maxY=Math.max(...bottomEdge.map(p=>p[1]));
    lines.push({centers,halfHeight:half*sy,contour:[...topEdge,...bottomEdge.reverse()],polygon:[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY]],support:band.support});
  }
  diagnostic.reason='ready';
  return lines;
}
// Supersample before recognizer resizing: one-pixel strips lose thin glyph strokes.
// Coordinates and contours always remain in the original image, not this raster.
export function unwrapTextLine(bitmap,line){
  const points=line.centers,left=points[0][0],right=points.at(-1)[0],out=new OffscreenCanvas(Math.max(1,Math.ceil((right-left)*3)),Math.max(1,Math.ceil(line.halfHeight*6))),ctx=out.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,out.width,out.height);let segment=0;
  for(let x=0;x<out.width;x++){const sourceX=left+x/3;while(segment<points.length-2&&sourceX>points[segment+1][0])segment++;const a=points[segment],b=points[segment+1],t=(sourceX-a[0])/(b[0]-a[0]),y=a[1]+(b[1]-a[1])*t;ctx.drawImage(bitmap,sourceX,y-line.halfHeight,1/3,line.halfHeight*2,x,0,1,out.height);}return out;
}

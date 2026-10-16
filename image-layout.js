// Owns image text grouping, translation units and their display geometry.
// Original OCR regions and coordinates remain unchanged.
(()=>{
  function layout(regions){
    const boxes=regions.map((r,id)=>{const p=r.polygon,angle=Math.atan2(p[1][1]-p[0][1],p[1][0]-p[0][0]);return {id,text:r.text||'',group:r.textGroup,left:Math.min(...p.map(q=>q[0])),right:Math.max(...p.map(q=>q[0])),top:Math.min(...p.map(q=>q[1])),bottom:Math.max(...p.map(q=>q[1])),height:Math.hypot(p[3][0]-p[0][0],p[3][1]-p[0][1]),angle:Math.abs(angle)<=Math.PI/36?0:angle,polygon:p};}).filter(b=>b.right>b.left&&b.bottom>b.top);
    const titles=new Set();
    const parent=boxes.map((_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i],b=boxes[j];if(a.group!==undefined&&a.group===b.group){parent[find(j)]=find(i);continue;}if(a.angle||b.angle)continue;
      const overlapX=Math.min(a.right,b.right)-Math.max(a.left,b.left),overlapY=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
      const close=overlapX>Math.min(a.right-a.left,b.right-b.left)*.65&&Math.abs(a.left-b.left)<Math.min(a.height,b.height)*.5&&Math.max(a.height,b.height)<Math.min(a.height,b.height)*1.45&&-overlapY<=Math.min(a.height,b.height)*.3;
      const shortTitle=t=>/^[A-Z][A-Z &'’!-]{1,23}$/.test(t);
      const stacked=overlapY<=Math.min(a.height,b.height)*.15&&-overlapY<=Math.min(a.height,b.height)*.65;
      const centered=Math.abs((a.left+a.right-b.left-b.right)/2)<Math.min(a.height,b.height)*.4;
      // Pair only: prevents transitive merging of an entire poster hierarchy.
      if(shortTitle(a.text)&&shortTitle(b.text)&&stacked&&centered&&overlapX>0&&Math.max(a.height,b.height)<Math.min(a.height,b.height)*1.3&&find(i)===i&&find(j)===j&&!titles.has(i)&&!titles.has(j)){
        parent[j]=i;titles.add(i);titles.add(j);
      }else if(close&&a.text.length>=24&&b.text.length>=24)parent[find(j)]=find(i);
    }
    const groups=new Map();boxes.forEach((b,i)=>{const key=find(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(b);});
    return [...groups.values()].map(items=>{items.sort((a,b)=>a.top-b.top||a.left-b.left);const left=Math.min(...items.map(x=>x.left)),right=Math.max(...items.map(x=>x.right)),top=Math.min(...items.map(x=>x.top)),bottom=Math.max(...items.map(x=>x.bottom));const p=items[0].polygon,angle=items[0].angle;
      const title=items.length===2&&items.every(x=>titles.has(boxes.indexOf(x)));
      const semantic=title||items.length>1&&(items.every(x=>x.group!==undefined&&x.group===items[0].group)||items.every(x=>x.text.length>=24&&x.right-x.left>x.height*5));
      return {semantic,source:items.map(x=>x.text.trim()).join(' '),ids:items.map(x=>x.id),x:(left+right)/2,y:(top+bottom)/2,width:angle?Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1]):right-left,height:angle?items[0].height:bottom-top,angle,fontHeight:Math.min(...items.map(x=>x.height)),align:title?'center':items.length>1||right-left>items[0].height*5?'left':'center'};});
  }
  function plan(regions){
    const groups=layout(regions),items=[],members=new Map();
    for(const group of groups){
      if(group.semantic){const id=String(group.ids[0]);items.push({id,text:group.ids.map(i=>regions[i].text.trim()).join(' ')});members.set(id,group.ids);}
      else for(const i of group.ids){const id=String(i);items.push({id,text:regions[i].text});members.set(id,[i]);}
    }
    items.sort((a,b)=>Number(a.id)-Number(b.id));
    return {groups,items,members};
  }
  function accept(plan,translations,items){
    for(const item of items){const ids=plan.members.get(item.id);if(!ids)continue;ids.forEach((id,index)=>translations.set(String(id),index===0?item.text:''));}
  }
  function wrap(ctx,text,width){const lines=[''];const tokens=text.match(/\n|[^\S\n]+|[\p{Script=Latin}\p{Script=Arabic}\p{Script=Hebrew}\p{N}]+|./gu)||[];
    for(const token of tokens){if(token==='\n'){lines.push('');continue;}let i=lines.length-1;if(ctx.measureText(token).width>width){for(const ch of token){i=lines.length-1;if(lines[i]&&ctx.measureText(lines[i]+ch).width>width)lines.push(ch);else lines[i]+=ch;}continue;}if(lines[i]&&ctx.measureText(lines[i]+token).width>width)lines.push(token.trimStart());else lines[i]+=token;}return lines.map(line=>line.trimEnd());}
  function render(ctx,groups,translations){
    const cards=[];
    for(const g of groups){
      if(!g.ids.every(id=>translations.has(String(id))))continue;
      const text=g.ids.map(id=>translations.get(String(id))).filter(Boolean).join(' ');
      // Unchanged labels/numbers are already present at their exact source position.
      if(!text||text.trim()===g.source||/^[\d\s.,%％+−–—\-/:()]+$/u.test(g.source))continue;
      const pad=g.fontHeight*.12,width=Math.max(1,g.width-pad*2),height=Math.max(1,g.height-pad*2);
      let size=g.fontHeight*.68,lines;
      do{ctx.font=`500 ${size}px system-ui,sans-serif`;lines=wrap(ctx,text,width);if(lines.length*size*1.22<=height||size<=1)break;size=Math.max(1,size*.94);}while(true);
      cards.push({g,rtl:/[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(text),lines,size,pad,width:g.width,height:g.height,left:-g.width/2,top:-g.height/2});
    }
    // Cover source extents even when the translation is shorter; keep unrelated regions separate.
    for(const card of cards){const {g,left,top,width,height,size}=card;ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.angle);ctx.beginPath();ctx.roundRect(left,top,width,height,Math.min(size*.22,height/4));ctx.fillStyle='#fff';ctx.fill();ctx.restore();}
    for(const card of cards){const {g,rtl,lines,size,pad,left,top,width,height}=card;ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.angle);ctx.beginPath();ctx.rect(left,top,width,height);ctx.clip();ctx.font=`500 ${size}px system-ui,sans-serif`;ctx.fillStyle='#211b2d';ctx.direction=rtl?'rtl':'ltr';ctx.textAlign=g.align==='center'?'center':rtl?'right':'left';ctx.textBaseline='middle';lines.forEach((line,i)=>ctx.fillText(line,g.align==='left'?(rtl?left+width-pad:left+pad):0,(g.align==='center'?-lines.length*size*1.22/2:top+pad)+(i+.5)*size*1.22,Math.max(1,width-pad*2)));ctx.restore();}
  }
  globalThis.ReaderImageLayout=Object.freeze({layout,render,plan,accept});
})();

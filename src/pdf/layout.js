// Coordinates belong to the unscaled PDF viewport, independent of translated layout.
export function paragraphs(content,viewport){
 const lines=[];
 for(const item of content.items){
  if(!item.str?.trim())continue;
  const t=item.transform,[x,y]=viewport.convertToViewportPoint(t[4],t[5]);
  const size=Math.max(1,Math.hypot(t[2],t[3])),width=Math.abs(item.width);
  const box={x,y:y-size,width,height:size*1.25,text:item.str,size};
  let line=lines.find(l=>Math.abs(l.y-box.y)<size*.3&&Math.abs(l.size-size)<size*.3&&box.x>=l.x-2&&box.x-(l.x+l.width)<size*2);
  if(line){line.text+=(box.x>line.x+line.width+size*.15?' ':'')+box.text;line.width=Math.max(line.width,box.x+width-line.x);}
  else lines.push(box);
 }
 // Column detection uses a substantial central gutter, rather than splitting every page at its midpoint.
 const center=viewport.width/2;
 const left=lines.filter(l=>l.x<center&&l.x+l.width<center+10),right=lines.filter(l=>l.x>center);
 const columns=left.length>=4&&right.length>=4;
 const lane=l=>columns?(l.width>viewport.width*.65?0:l.x<center?1:2):0;
 lines.sort((a,b)=>lane(a)-lane(b)||a.y-b.y||a.x-b.x);
 const blocks=[];
 for(const line of lines){
  const prior=blocks.at(-1),last=prior?.boxes.at(-1);
  const merge=last&&lane(last)===lane(line)&&line.y-last.y>0&&line.y-last.y<line.size*1.85&&Math.abs(last.size-line.size)<line.size*.2&&Math.abs(last.x-line.x)<line.size*1.6;
  if(merge){prior.text=prior.text.endsWith('-')?prior.text.slice(0,-1)+line.text:prior.text+' '+line.text;prior.boxes.push(line);}
  else blocks.push({id:String(blocks.length),text:line.text,boxes:[line]});
 }
 return blocks;
}

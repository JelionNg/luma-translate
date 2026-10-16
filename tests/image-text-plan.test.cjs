const assert=require('node:assert/strict');require('../image-layout.js');
const api=globalThis.ReaderImageLayout;
const rect=(text,x,y,w,h,extra={})=>({text,polygon:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],...extra});
const regions=[rect("IT'S NEVER QUIET ON",20,20,240,38,{textGroup:'curve-0'}),rect('THE WESTERN FRONT',12,50,260,40,{textGroup:'curve-0'}),rect('Save',300,20,50,20),rect('Cancel',360,20,60,20)];
const plan=api.plan(regions);assert.equal(plan.items.length,3);assert.equal(plan.items[0].text,"IT'S NEVER QUIET ON THE WESTERN FRONT");assert.deepEqual(plan.members.get('0'),[0,1]);
const translations=new Map();api.accept(plan,translations,[{id:'0',text:'西线从未平静。'}]);assert.equal(translations.get('0'),'西线从未平静。');assert.equal(translations.get('1'),'');assert(!translations.has('2'));
const paragraph=api.plan([rect('This is the first line of a longer paragraph',0,0,480,30),rect('and this is the continuation of that paragraph.',0,34,450,30)]);assert.equal(paragraph.items.length,1);assert.equal(paragraph.groups[0].align,'left');
assert.equal(plan.groups.at(-1).align,'center');
function paint(scale){const calls=[],ctx={save(){},restore(){},translate(){},rotate(){},fillRect(){},roundRect(){},fill(){},beginPath(){},rect(){},clip(){},measureText(t){return {width:t.length*parseFloat(this.font.split(' ')[1])*.6}},fillText(text,x,y){calls.push({text,x,y,font:this.font})}};const r=[rect('A long line of document text',0,0,600*scale,60*scale)];api.render(ctx,api.layout(r),new Map([['0','这是正文译文']]));return calls[0];}
const a=paint(1),b=paint(4);assert(a.x<0);assert(Math.abs(parseFloat(b.font.split(' ')[1])/parseFloat(a.font.split(' ')[1])-4)<.001);assert.equal(b.x/a.x,4);
const poster=api.layout([rect('Ardoq',100,10,250,40),rect('50',90,45,250,150),rect('%',310,45,45,60),rect('of EA Tasks Will Be',50,185,400,50)]);assert.deepEqual(poster.map(g=>g.ids),[[0],[1],[2],[3]]);
console.log('PASS: grouped request, single translation, paragraph continuity, independent labels, scale-invariant typography');

const cta=api.plan([rect('NOW',110,90,120,48),rect('REGISTER',50,30,240,50)]);
assert.equal(cta.items.length,1);assert.equal(cta.items[0].text,'REGISTER NOW');assert.equal(cta.groups[0].align,'center');
const values=new Map();api.accept(cta,values,[{id:cta.items[0].id,text:'立即注册'}]);assert.equal([...values.values()].filter(Boolean).length,1);

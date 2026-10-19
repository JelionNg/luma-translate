const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const fixture=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'luma-pdf-')),'sample.pdf');fs.writeFileSync(fixture,Buffer.from('JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA0IDAgUiA+PiA+PiAvQ29udGVudHMgNSAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iago1IDAgb2JqCjw8IC9MZW5ndGggMjAzID4+CnN0cmVhbQpCVCAvRjEgMTYgVGYgNTAgNzIwIFRkIChBIGNsZWFyIHBhcmFncmFwaCBmb3IgYmlsaW5ndWFsIFBERiByZWFkaW5nLikgVGogMCAtMjQgVGQgKEhvdmVyIG92ZXIgaXRzIHRyYW5zbGF0aW9uIHRvIGxvY2F0ZSB0aGUgb3JpZ2luYWwuKSBUaiAwIC02NSBUZCAoVGhpcyBzZWNvbmQgcGFyYWdyYXBoIHRlc3RzIGluZGVwZW5kZW50IG1hcHBpbmcuKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwMzExIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNTY1CiUlRU9G','base64'));
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
const {paragraphs,readingRegions}=await import('../src/pdf/layout.js');
const {translatedText}=await import('../src/pdf/typeset.js');
const {sourceSelection,sourcePassage}=await import('../src/pdf/selection.js');
const splitBlock={size:10,node:{textContent:'性能'},boxes:[{runs:[
 {text:'Stream',x:0,y:0,width:30,height:10,baseline:10},
 {text:'Speech per-',x:30,y:0,width:60,height:10,baseline:10}]},
 {runs:[{text:'formance',x:0,y:12,width:40,height:10,baseline:22}]}]};
assert.equal(sourcePassage(splitBlock).text,'StreamSpeech performance');
const splitMarks=sourceSelection(splitBlock,0,2,'performance');assert.equal(splitMarks.length,2);assert(splitMarks[0].x>30);assert.equal(splitMarks[1].width,40);
const selectionBlock={node:{textContent:'第一句。第二句。'},boxes:[{runs:[{text:'First sentence.',x:10,y:10,width:100,height:10,baseline:20},{text:'Second sentence.',x:10,y:25,width:110,height:10,baseline:35}]}]};
assert.deepEqual(sourceSelection(selectionBlock,0,1,'First'),[]);
assert.deepEqual(sourceSelection(selectionBlock,0,2),[]);
assert(sourceSelection(selectionBlock,4,7,'Second').every(b=>b.y===25&&b.width<60));
assert.deepEqual(sourceSelection(selectionBlock,4,7,'invented'),[]);
selectionBlock.node.textContent='First sentence.';
assert.equal(sourceSelection(selectionBlock,0,5).length,1);
assert.deepEqual(sourceSelection(selectionBlock,0,2),[]); // No partial English word anchor.
selectionBlock.node.textContent='词语';
assert.deepEqual(sourceSelection({...selectionBlock,boxes:[{runs:[{text:'A very long sentence '.repeat(20),x:0,y:0,width:500,height:10}]}]},0,2,'A very long sentence '.repeat(20)),[]);
const {renderMathLayer}=await import('../src/pdf/math-layer.js');
// Narrative painting is suppressed while its text advance remains authoritative.
const painted=[],inkContext={fillText:(text,x)=>painted.push([text,x]),strokeText(){},fill(){},stroke(){}};
const inkOps={setFont:1,showText:2,save:3,restore:4};
const inkList={fnArray:[1,2,3,1,2,4,2],argsArray:[['body'],['word'],[],['math'],['X'],[],['tail']]};
const inkPage={render:({operationsFilter})=>({promise:(async()=>{let x=0;for(let i=0;i<inkList.fnArray.length;i++){assert(operationsFilter(i));if(inkList.fnArray[i]===2){inkContext.fillText(inkList.argsArray[i][0],x);x+=10;}}})()})};
const originalFill=inkContext.fillText;
await renderMathLayer(inkPage,inkList,{width:100,height:100},{getContext:()=>inkContext},new Set(['math']),inkOps,()=>{});
assert.deepEqual(painted,[['X',10]]);assert.equal(inkContext.fillText,originalFill);

const {technicalRegions}=await import('../src/pdf/technical-regions.js');
const items=[];const add=(str,x,y,width,size=10)=>items.push({str,width,fontName:'body',transform:[size,0,0,size,x,800-y]});
add('Document title',100,70,400,16);
// Justified word gaps and a mixed-font final fragment must not create tiny paragraphs.
add('Simultaneous',70,220,55);add('speech translation',133,220,120);
add('continues across the complete paragraph.',70,233,190);
add('Another column stays separate.',320,220,210);add('It uses the same source baseline.',320,233,210);
add('2 Methods',70,300,100,12);
const viewport={width:600,height:800,scale:1,transform:[1,0,0,-1,0,800],convertToViewportPoint:(x,y)=>[x,800-y]};
const blocks=paragraphs({items,styles:{}},viewport),sourceIds=blocks.flatMap(b=>b.runs.map(r=>r.index));
assert.deepEqual(sourceIds.sort((a,b)=>a-b),items.map((_,i)=>i));
const abstract=blocks.find(b=>b.text.startsWith('Simultaneous'));
assert(abstract.text.includes('speech translation continues'));
assert(!abstract.text.includes('Another column'));
assert(readingRegions(blocks,viewport).every(r=>!r.blocks.some(b=>b.text.includes('Methods'))||r.role==='heading'));
// A two-row section heading owns its continuation but never the next prose
// paragraph, including when extraction omits whitespace after its number.
const headingItems=[];
const headingAdd=(str,x,y,width,font='body')=>headingItems.push({str,width,fontName:font,transform:[10,0,0,10,x,800-y]});
headingAdd('The paragraph above introduces the experimental results.',60,160,230);
headingAdd('5.4Performance on Auxiliary Tasks:',60,190,220,'bold');
headingAdd('Streaming ASR and Simultaneous S2TT',85,203,205,'bold');
headingAdd('StreamSpeech learns translation and policy through multi-task learning.',60,221,235);
headingAdd('A second line continues the same ordinary paragraph.',60,234,235);
const headingBlocks=paragraphs({items:headingItems,styles:{}},viewport);
const sectionHeading=headingBlocks.find(b=>b.text.startsWith('5.4'));
assert.equal(sectionHeading.role,'heading');assert.equal(sectionHeading.boxes.length,2);
assert(sectionHeading.text.endsWith('Simultaneous S2TT'));
assert(!sectionHeading.text.includes('learns translation'));
assert(readingRegions(headingBlocks,viewport).some(r=>r.role==='heading'&&r.blocks.includes(sectionHeading)));

assert.equal(translatedText('同声    翻译  DeepSeek API'),'同声翻译 DeepSeek API');
// Justification spaces establish one author row without joining the other
// column. Discarding their geometry leaves translated labels over the entry.
const referenceItems=[];
const referenceAdd=(str,x,y,width)=>referenceItems.push({str,width,fontName:'body',transform:[10,0,0,10,x,800-y]});
referenceAdd('Naveen Arivazhagan,',60,250,88);
referenceAdd(' ',148,250,11.1);referenceAdd('Colin Cherry,',159.3,250,60);
referenceAdd(' ',219.3,250,11.1);referenceAdd('Wolfgang',230.6,250,40);
referenceAdd('Macherey and colleagues. 2019. A translation method.',60,263,215);
referenceAdd('Another reference remains in the right column.',320,250,215);
const referenceBlocks=paragraphs({items:referenceItems,styles:{}},viewport);
const entry=referenceBlocks.find(b=>b.text.startsWith('Naveen'));
assert(entry.text.includes('Colin Cherry, Wolfgang Macherey'));
assert(!entry.text.includes('Another reference'));
assert(!referenceBlocks.some(b=>/^Colin Cherry,?$|^Wolfgang$/.test(b.text)));
assert.equal(new Set(referenceBlocks.flatMap(b=>b.runs.map(r=>r.index))).size,referenceItems.filter(i=>i.str.trim()).length);

const technicalLine=(text,x,y,width=180,size=10)=>({text,x,y,width,height:size,size,angle:0,baseline:y+size});
const chartRows=[technicalLine('Models',60,80,50),technicalLine('ASR-BLEU',160,80,70),technicalLine('StreamSpeech',60,96,70),technicalLine('27.58',170,96,30)];
const tableCaption=technicalLine('Table 1: Results on the evaluation set.',60,125,200);
const ordinary=technicalLine('This paragraph explains the experimental results in detail.',60,155,220,11);
const zones=technicalRegions([...chartRows,tableCaption,ordinary],{width:600,height:800},11);
assert(zones.some(z=>z.kind==='table'&&chartRows.every(l=>z.lines.includes(l))));
assert(!zones.some(z=>z.lines.includes(tableCaption)||z.lines.includes(ordinary)));
assert(!technicalRegions([technicalLine('Methods',60,80,80,12)],{width:600,height:800},11).length);
const equation=[technicalLine('f(x) =',90,210,65),technicalLine('Conv(x, y)',90,232,100),technicalLine('2',130,245,7,7),technicalLine('(3)',265,210,20)];
const explanation=technicalLine('where the convolution operates on the input.',60,270,220);
const equationZones=technicalRegions([...equation,explanation],{width:600,height:800},11);
assert(equation.every(l=>equationZones.some(r=>r.kind==='formula'&&r.lines.includes(l))));
assert(!equationZones.some(r=>r.lines.includes(explanation)));

assert(!technicalRegions([technicalLine('Figure 3 shows how the architecture works in this model.',60,180,220)],{width:600,height:800},11).length);
assert(!technicalRegions([technicalLine('where C = 8 means the model waits for input.',60,180,220)],{width:600,height:800},11).some(z=>z.kind==='formula'));

// A real font split must preserve math identity without sending its glyph text.
const mathItems=[];const mathAdd=(str,x,y,width,font='body',size=10)=>mathItems.push({str,width,fontName:font,transform:[size,0,0,size,x,800-y]});
mathAdd('The hidden state is given by',60,210,135);mathAdd('D',198,210,8,'math');mathAdd('text',207,206,12,'script',7);mathAdd('and is used by the decoder.',224,210,125);
mathAdd('The next line explains the complete method.',60,224,220);
const mathBlocks=paragraphs({items:mathItems,styles:{}},viewport),mathBlock=mathBlocks.find(b=>b.math?.length);
assert(mathBlock&&!mathBlock.preserve);assert(mathBlock.translationText.includes('⟦M0⟧'));assert(!mathBlock.translationText.includes('D text'));
assert.equal(mathBlock.math[0].text,'Dtext');
// Split prose still owns raised delimiters, even beyond its last word.
const splitItems=[];
const splitAdd=(str,x,y,width,font='body')=>splitItems.push({str,width,fontName:font,transform:[10,0,0,10,x,800-y]});
splitAdd('This longer paragraph establishes the body font.',60,180,220);
splitAdd('where',60,210,24);splitAdd('X',88,210,8,'math');splitAdd('=',98,210,8,'math');
splitAdd('\x00',108,202,4,'delimiter');splitAdd('x',113,210,8,'math');
splitAdd('is',124,210,8);splitAdd('the',136,210,12);splitAdd('\x01',151,202,4,'delimiter');
const splitBlocks=paragraphs({items:splitItems,styles:{delimiter:{ascent:.04,descent:-.6}}},viewport);
assert(!splitBlocks.some(b=>b.preserve&&/[\x00\x01]/.test(b.text)));
const splitSlots=splitBlocks.flatMap(b=>b.math||[]);
assert.equal(splitSlots.filter(s=>s.text.includes('\x00')).length,1);
assert.equal(splitSlots.filter(s=>s.text.includes('\x01')).length,1);
assert.equal(new Set(splitBlocks.flatMap(b=>b.runs.map(r=>r.index))).size,splitItems.length);

const emphasisItems=[
 {str:'It redefines not only',width:100,fontName:'body',transform:[10,0,0,10,60,590]},
 {str:'how',width:18,fontName:'italic',transform:[10,0,0,10,162,590]},
 {str:'we connect but also',width:95,fontName:'body',transform:[10,0,0,10,183,590]},
 {str:'whom',width:26,fontName:'italic',transform:[10,0,0,10,281,590]},
 {str:'we connect with in human relationships.',width:180,fontName:'body',transform:[10,0,0,10,310,590]}
];
const emphasis=paragraphs({items:emphasisItems,styles:{}},viewport);
assert.equal(emphasis.length,1);assert.equal(emphasis[0].math.length,0);assert(emphasis[0].translationText.includes('how we connect but also whom'));
const {validateMath,normalizeMath,recoverMath}=await import('../src/pdf/inline-math.js');
assert.equal(normalizeMath(mathBlock,'状态 [ M 0 ]。'),'状态 ⟦M0⟧。');
const recovered=await recoverMath(mathBlock,async items=>items.map(x=>({id:x.id,text:'这是公式周边的译文'})));
validateMath(mathBlock,recovered);assert.equal((recovered.match(/⟦M0⟧/g)||[]).length,1);
validateMath(mathBlock,'对应的隐藏状态 ⟦M0⟧ 用于解码。');assert.throws(()=>validateMath(mathBlock,'遗漏公式'));assert.throws(()=>validateMath(mathBlock,'⟦M0⟧ ⟦M0⟧'));

// Embedded figure fonts can expose NaN metrics in PDF.js. Every coordinate
// must stay finite and the caption must remain outside the protected artwork.
const figureItems=[];
const figAdd=(str,x,y,width,font='embedded',size=10)=>figureItems.push({str,width,fontName:font,transform:[size,0,0,size,x,800-y]});
figAdd('Study overview',60,100,140,'embedded',14);
figAdd('Users seek empathy advice and emotional support from companions.',60,130,220);
figAdd('Another panel explains the interactions and their meaning.',60,150,220);
figAdd('Fig. 1: Study overview and explanatory caption.',60,190,450,'body');
figAdd('This is the continuation of the figure explanation.',60,203,450,'body');
const figureBlocks=paragraphs({items:figureItems,styles:{embedded:{ascent:NaN,descent:NaN}}},viewport);
assert(figureBlocks.every(b=>['x','y','width','height'].every(k=>Number.isFinite(b[k]))));
assert(figureBlocks.filter(b=>b.y<170).every(b=>b.preserveReason==='figure'));
const figureNote=figureBlocks.find(b=>b.text.startsWith('Fig. 1:'));
assert(figureNote&&!figureNote.preserve&&figureNote.role==='caption'&&figureNote.y>170);
assert(figureNote.text.includes('continuation'));

const narrativeItems=[];const narrativeAdd=(str,x,y,width,size=10)=>narrativeItems.push({str,width,fontName:'body',transform:[size,0,0,size,x,800-y]});
narrativeAdd('An indented first line belongs to the same natural paragraph',78,250,200);
narrativeAdd('and its continuation must be translated in the same request.',60,264,220);
const narrative=paragraphs({items:narrativeItems,styles:{}},viewport);
assert.equal(narrative.length,1);assert.equal(narrative[0].role,'body');assert(narrative[0].text.includes('and its continuation'));
const {documentContext}=await import('../src/pdf/document-context.js');
const intro={text:'A study of human psychology',role:'title'},prior={text:'Earlier context',role:'body'},target={text:'Target paragraph',role:'body'},later={text:'Following explanation',role:'body'};
const context=documentContext([{number:1,blocks:[intro,prior,target,later]}],{number:1},[target]);
assert(context.overview.includes(intro.text));assert(context.before.includes(prior.text));assert.equal(context.after,later.text);

const firstCaption=technicalLine('Table 1: The first table results.',60,180,450);
const sharedFont=(text,y)=>({...technicalLine(text,60,y,180),runs:[{text,font:'table'}]});
const secondCaption=technicalLine('Table 2: The second table results.',60,340,450);
const multiTables=technicalRegions([sharedFont('Models',100),sharedFont('Scores',120),firstCaption,sharedFont('Models',290),sharedFont('Scores',310),secondCaption],{width:600,height:800},11);
assert(!multiTables.some(r=>r.y<firstCaption.y&&r.y+r.height>firstCaption.y));
const noteItems=[{str:'ASR and TTS form a cascaded system that continues here.',width:220,fontName:'body',transform:[11,0,0,11,320,110]},{str:'3https://example.org/model',width:190,fontName:'link',transform:[9,0,0,9,320,97]}];
const noteBlocks=paragraphs({items:noteItems,styles:{}},viewport);
assert(!noteBlocks.some(b=>b.text.includes('ASR')&&b.text.includes('https')));assert(noteBlocks.find(b=>b.text.includes('https')).preserve);

// Caption ownership overrides footer/paragraph heuristics and isolates peers.
const captionItems=[];const captionAdd=(str,x,y,width)=>captionItems.push({str,width,fontName:'body',transform:[10,0,0,10,x,800-y]});
captionAdd('Figure 5: Comparison of direct and',60,710,145);captionAdd('Figure 6: Effect of multi-chunk train-',230,710,145);captionAdd('Figure 7: Ablation study on align-',400,710,145);
captionAdd('cascaded systems.',60,722,90);captionAdd('ing in StreamSpeech.',230,722,105);captionAdd('ments in policy.',400,722,80);
const peerCaptions=paragraphs({items:captionItems,styles:{}},viewport).filter(b=>b.role==='caption');
assert.equal(peerCaptions.length,3);assert(peerCaptions[0].text.includes('cascaded systems'));assert(peerCaptions[1].text.includes('training in StreamSpeech'));assert(!peerCaptions[0].text.includes('StreamSpeech'));assert(peerCaptions.every(b=>b.boxes.length===2&&!b.preserve));
const linkedCaption=paragraphs({items:[{str:'Figure 4: Results of our system.',width:450,fontName:'body',transform:[9,0,0,9,60,100]},{str:'The complete outputs are at https://example.org/results.',width:440,fontName:'body',transform:[9,0,0,9,60,89]}],styles:{}},viewport);
assert.equal(linkedCaption.length,1);assert.equal(linkedCaption[0].role,'caption');assert(!linkedCaption[0].preserve);assert(linkedCaption[0].text.includes('complete outputs'));

const languageExample=paragraphs({items:[{str:'For example, French',width:100,fontName:'body',transform:[10,0,0,10,60,550]},{str:'‘début’↔‘beginning’',width:90,fontName:'italic',transform:[10,0,0,10,162,550]},{str:'expresses the same meaning in another language.',width:220,fontName:'body',transform:[10,0,0,10,254,550]}],styles:{}},viewport);
assert(languageExample.every(b=>!b.math?.length));
const caseLines=[technicalLine('DAL = sum',80,200,120),technicalLine('where t = {',60,225,80),technicalLine('t if i = 1',160,225,90),technicalLine('max(t, y) if i > 1',160,240,100),technicalLine('(16)',265,255,20),technicalLine('StartOffset measures the waiting time before speech.',60,290,230)];
const caseRegions=technicalRegions(caseLines,viewport,10);
assert(caseLines.slice(0,5).every(l=>caseRegions.some(r=>r.kind==='formula'&&r.lines.includes(l))));assert(!caseRegions.some(r=>r.lines.includes(caseLines[5])));

let alignmentRequests=0;
const c=await chromium.launchPersistentContext('',{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--enable-unsafe-extension-debugging']});try{const cd=await c.browser().newBrowserCDPSession();const {id}=await cd.send('Extensions.loadUnpacked',{path:path.resolve(__dirname,'..')});const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));const server=require('node:http').createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{const payload=JSON.parse(body);
if(payload.messages[0].content.startsWith('Align a selected')){
 alignmentRequests++;
 const items=JSON.parse(payload.messages[1].content);const q=JSON.parse(items[0].text);assert.equal(q.selected,'这是对应');
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify([{id:items[0].id,text:'clear paragraph'}])}}]}));return;
}
assert(payload.messages[0].content.includes('Copy every opaque math slot'));assert(payload.messages[0].content.includes('professional terminology'));assert(payload.messages[0].content.includes('Preserve every personal name exactly'));assert(payload.messages[0].content.includes('never 美'));assert(payload.messages.some(m=>m.content.includes('referenceOnly')));const items=JSON.parse(payload.messages[1].content),long=payload.messages[0].content.includes('Translate each text into English.');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(items.map(x=>({id:x.id,text:long?'Long translation content stays available inside its own region. '.repeat(35):'这是对应段落的译文，用于验证对照阅读。'})))}}]}));});});await new Promise(r=>server.listen(0,'127.0.0.1',r));c.on('close',()=>server.close());await p.goto('chrome-extension://'+id+'/src/pdf/index.html');await p.evaluate(port=>chrome.storage.sync.set({apiKey:'mock',endpoint:'http://127.0.0.1:'+port,minInterval:0}),server.address().port);await p.locator('#file').setInputFiles(fixture);await p.waitForFunction(()=>document.querySelectorAll('.block').length>=2);await p.locator('#translate').click();await p.waitForFunction(()=>[...document.querySelectorAll('.block')].every(b=>b.textContent.includes('这是对应')));await p.locator('.block').first().hover();assert.equal(await p.locator('.highlight i').count(),0);
assert.equal(await p.locator('.block').first().getAttribute('title'),null);
await p.locator('.block').first().evaluate(node=>{const range=document.createRange();range.setStart(node.firstChild,0);range.setEnd(node.firstChild,1);getSelection().removeAllRanges();getSelection().addRange(range);});
await p.waitForTimeout(450);assert.equal(await p.locator('.highlight i').count(),0);assert.equal(alignmentRequests,0);
await p.locator('.block').first().evaluate(node=>{const range=document.createRange();range.setStart(node.firstChild,0);range.setEnd(node.firstChild,4);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});
await p.waitForFunction(()=>document.querySelectorAll('.highlight i').length>0);assert(await p.locator('.highlight i').first().evaluate(n=>parseFloat(n.style.width)<25));
await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('.highlight i'));
assert.equal(alignmentRequests,1);
await p.locator('.block').first().evaluate(node=>{const r=document.createRange();r.setStart(node.firstChild,0);r.setEnd(node.firstChild,4);getSelection().addRange(r);});
await p.waitForFunction(()=>document.querySelector('.highlight i'));assert.equal(alignmentRequests,1);
await p.keyboard.press('Escape');await p.waitForFunction(()=>!document.querySelector('.highlight i'));

await p.locator('.block').first().evaluate(node=>{const range=document.createRange();range.setStart(node.firstChild,0);const next=document.querySelectorAll('.block')[1];range.setEnd(next.firstChild,2);getSelection().addRange(range);});
await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await p.locator('.highlight i').count(),0);
await p.evaluate(()=>getSelection().removeAllRanges());
assert(await p.locator('.paper canvas').evaluate(c=>c.width>0));assert(await p.locator('.translation canvas').evaluate(c=>c.width>0));assert(await p.locator('.block').first().evaluate(n=>getComputedStyle(n).position==='static'&&getComputedStyle(n.closest('.region')).position==='absolute'));assert(await p.locator('.region-flow').first().evaluate(n=>parseFloat(getComputedStyle(n).lineHeight)/parseFloat(getComputedStyle(n).fontSize)>1.3));assert(await p.evaluate(()=>Math.abs(document.querySelector('.paper').clientHeight-document.querySelector('.translation').clientHeight)<2));await p.locator('#language').selectOption('English');await p.waitForFunction(()=>document.querySelector('.block')?.textContent==='等待翻译');await p.locator('#translate').click();await p.waitForFunction(()=>[...document.querySelectorAll('.block')].every(b=>b.textContent.includes('Long translation')));await p.waitForFunction(()=>document.querySelector('.region.overflowing'));assert(await p.locator('.region.overflowing').first().evaluate(n=>n.scrollHeight>n.clientHeight));await p.locator('#cancel').click();await p.locator('#translate').click();
assert.deepEqual(errors,[]);console.log('PASS PDF source coverage, justified line grouping, region typography, rendering, messaging, selection highlighting, language invalidation and readable overflow');}finally{await c.close();fs.rmSync(path.dirname(fixture),{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});

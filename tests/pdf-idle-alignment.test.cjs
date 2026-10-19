const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('PDF alignment waits for ordinary work and dispatches only one idle request',async()=>{
 const source=fs.readFileSync(__dirname+'/../src/background/background.js','utf8').split('function session(')[0];
 const ctx={importScripts(){},ReaderConfig:{defaults:{}},AbortController,setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(source+';globalThis.schedule=limited;',ctx);
 const c={owner:'body',rateKey:'same',concurrency:6,minInterval:0},signal=new AbortController().signal,order=[];let release;
 const body=ctx.schedule(()=>new Promise(r=>{order.push('body');release=r;}),c,signal);await Promise.resolve();await Promise.resolve();
 const alignment=ctx.schedule(()=>{order.push('align');}, {...c,owner:'align',format:'pdf-align'},signal);
 const second=ctx.schedule(()=>{order.push('second');},c,signal);await second;assert.deepEqual(order,['body','second']);release();await body;await alignment;assert.deepEqual(order,['body','second','align']);
});

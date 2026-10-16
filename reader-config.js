(() => {
  const defaults=Object.freeze({endpoint:'https://api.deepseek.com/chat/completions',apiKey:'',model:'deepseek-flash',targetLang:'简体中文',glossary:'',serviceId:'legacy',concurrency:6,minInterval:150,mode:'dual',dynamic:true,autoTranslate:false,translateFrames:false,translationSize:'1',translationSpacing:'0.4',translationTone:'inherit'});
  const profileKeys=Object.freeze(['endpoint','apiKey','model','concurrency','minInterval']);
  globalThis.ReaderConfig=Object.freeze({defaults,profileKeys,pick:keys=>Object.fromEntries(keys.map(k=>[k,defaults[k]]))});
})();

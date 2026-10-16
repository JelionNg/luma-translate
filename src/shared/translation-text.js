(() => {
  // Split serialized inline markup into bounded, independently balanced requests.
  // Reopened elements receive new ids so the final output still has unique markers.
  function splitRich(payload,tags,limit=1200){
    const parts=[],outputTags=[],stack=[];let current='';
    const closing=()=>[...stack].reverse().map(x=>'⟦/R'+x.output+'⟧').join('');
    function flush(){
      if(current)parts.push(current+closing());
      current='';
      for(const entry of stack){entry.output=outputTags.length;outputTags.push(tags[entry.source]);current+='⟦R'+entry.output+'⟧';}
    }
    for(const token of payload.split(/(⟦\/?R\d+⟧)/g)){
      const marker=/^⟦(\/?)R(\d+)⟧$/.exec(token);
      if(marker){
        const source=Number(marker[2]);
        if(marker[1]){
          const entry=stack.pop();if(!entry||entry.source!==source)return null;
          current+='⟦/R'+entry.output+'⟧';
        }else{
          if(!tags[source])return null;
          if(current.length+closing().length+32>limit)flush();
          if(current.length+closing().length+32>limit)return null;
          const output=outputTags.length;outputTags.push(tags[source]);stack.push({source,output});current+='⟦R'+output+'⟧';
        }
        continue;
      }
      let rest=token;
      while(rest){
        const room=limit-current.length-closing().length;
        if(room<2){flush();if(limit-current.length-closing().length<2)return null;continue;}
        let end=Math.min(room,rest.length);
        if(end<rest.length){
          const head=rest.slice(0,end);const boundary=Math.max(head.lastIndexOf('。'),head.lastIndexOf('. '),head.lastIndexOf('! '),head.lastIndexOf('? '),head.lastIndexOf(' '));
          if(boundary>end*.5)end=boundary+1;
          if(/[\uD800-\uDBFF]/.test(rest[end-1]))end--;
        }
        current+=rest.slice(0,end);rest=rest.slice(end);
        if(rest)flush();
      }
    }
    if(stack.length)return null;
    if(current)parts.push(current);
    return {parts,tags:outputTags,payload:parts.join(' ')};
  }
  function isTargetLanguage(text,target,explicitLang=''){
    const letters=text.match(/\p{L}/gu)||[];if(letters.length<12)return false;
    const ratio=pattern=>(text.match(pattern)||[]).length/letters.length;
    const lang=explicitLang.toLowerCase();
    const kana=ratio(/\p{Script=Hiragana}|\p{Script=Katakana}/gu),han=ratio(/\p{Script=Han}/gu),hangul=ratio(/\p{Script=Hangul}/gu);
    if(target==='简体中文')return /^zh-(cn|hans)(-|$)/.test(lang)&&han>.9&&kana===0&&hangul===0;
    if(target==='繁體中文')return /^zh-(tw|hk|mo|hant)(-|$)/.test(lang)&&han>.9&&kana===0&&hangul===0;
    if(target==='한국어')return hangul>.8;
    if(target==='日本語')return kana>.15&&han+kana>.85&&hangul===0;
    // Latin alphabets alone do not distinguish English, French, German or Spanish.
    // Only trust an explicit local language annotation supplied by the caller.
    const codes={English:'en',Français:'fr',Deutsch:'de',Español:'es'};
    return !!codes[target]&&lang.split('-')[0]===codes[target]&&ratio(/\p{Script=Latin}/gu)>.95;
  }
  globalThis.ReaderTranslationText=Object.freeze({splitRich,isTargetLanguage});
})();

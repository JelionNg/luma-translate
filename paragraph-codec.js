(() => {
  function richInput(el,source,excluded){
    if(source.includes('⟦'))return {payload:source,tags:[]};
    const tags=[];
    function visit(node){
      if(node.nodeType===Node.TEXT_NODE)return node.textContent;
      if(node.nodeType!==Node.ELEMENT_NODE||node.matches(excluded))return '';
      if(node.tagName==='BR')return '\n';
      const allowed=['A','B','STRONG','I','EM','U','S','SUP','SUB'].includes(node.tagName);
      let id;if(allowed){id=tags.length;tags.push(node);}
      const inner=[...node.childNodes].map(visit).join('');
      return allowed?'⟦R'+id+'⟧'+inner+'⟦/R'+id+'⟧':inner;
    }
    const payload=[...el.childNodes].map(visit).join('').trim();
    if(payload.length>1600){
      const rich=ReaderTranslationText.splitRich(payload,tags);
      if(rich)return rich;
      return ReaderTranslationText.splitRich(source,[])||{payload:source,tags:[]};
    }
    return tags.length?{payload,tags}:{payload:source,tags:[]};
  }
  function richOutput(value,tags){
    const fragment=document.createDocumentFragment(),stack=[fragment],ids=[],seen=new Set();
    value=value.replace(/\s+/g,' ').trim();
    const tokens=value.split(/(⟦\/?R\d+⟧)/g);let valid=true;
    for(const token of tokens){const m=/^⟦(\/?)R(\d+)⟧$/.exec(token);
      if(!m){stack.at(-1).append(document.createTextNode(token));continue;}
      const id=Number(m[2]);
      if(m[1]){if(ids.pop()!==id||stack.length===1){valid=false;break;}stack.pop();}
      else{if(!tags[id]||seen.has(id)){valid=false;break;}seen.add(id);ids.push(id);
        const original=tags[id],node=document.createElement(original.tagName.toLowerCase());
        for(const [key,value]of Object.entries({display:'inline',margin:'0',padding:'0','text-indent':'0','white-space':'normal',float:'none',position:'static'}))node.style.setProperty(key,value,'important');
        if(original.tagName==='A'){try{const url=new URL(original.getAttribute('href'),location.href);if(['http:','https:','mailto:'].includes(url.protocol)){node.href=url.href;if(original.target==='_blank'){node.target='_blank';node.rel='noopener noreferrer';}}}catch{}}
        stack.at(-1).append(node);stack.push(node);
      }
    }
    if(!valid||ids.length||seen.size!==tags.length){fragment.replaceChildren(document.createTextNode(value.replace(/⟦\/?R\d+⟧/g,'')));}
    return fragment;
  }
  globalThis.ReaderParagraphCodec=Object.freeze({input:richInput,output:richOutput});
})();

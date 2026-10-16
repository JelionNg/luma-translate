(() => {
  const version=1;
  function parse(input){
    if(input?.schemaVersion!==undefined){if(input.schemaVersion!==version)throw Error('不支持此规则版本，请更新扩展');input=input.rules;}
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('规则必须是按域名索引的对象');
    const result={};
    for(const [host,rule]of Object.entries(input)){
      if(new URL('https://'+host).hostname!==host||/[/:\s]/.test(host))throw Error('无效域名：'+host);
      if(!rule||typeof rule!=='object'||(rule.disabled!==undefined&&typeof rule.disabled!=='boolean')||!Array.isArray(rule.entries))throw Error(host+' 的 entries 须为数组');
      result[host]={disabled:!!rule.disabled,entries:rule.entries.map(entry=>{
        if(!entry||typeof entry.path!=='string'||(entry.path!=='*'&&!entry.path.startsWith('/')))throw Error('path 须为 * 或页面路径');
        const item={path:entry.path};if(entry.image!==undefined)item.image=ReaderImageRules.parseOverride(entry.image);for(const key of ['include','exclude']){item[key]=entry[key]??'';if(typeof item[key]!=='string')throw Error(key+' 须为字符串');if(item[key])document.querySelector(item[key]);}return item;
      })};
    }
    return result;
  }
  async function save(storage,input){
    const rules=parse(input),old=await storage.get({readerRules:{},readerRulesMeta:null});
    await storage.set({readerRulesBackup:old.readerRules,readerRulesMetaBackup:old.readerRulesMeta,readerRules:rules,readerRulesMeta:{schemaVersion:version,updatedAt:Date.now()}});return rules;
  }
  function audit(rules,url){
    const missing=[];
    for(const entry of rules[url.hostname]?.entries||[])if(entry.path==='*'||entry.path===url.pathname)for(const key of ['include','exclude'])if(entry[key]&&!document.querySelector(entry[key]))missing.push(entry[key]);
    return missing.length?'自定义规则有 '+missing.length+' 个选择器暂未匹配（内容可能尚未加载或页面结构已变化）':'';
  }
  globalThis.ReaderUserRules=Object.freeze({parse,save,audit,export:rules=>({schemaVersion:version,rules:parse(rules)})});
})();

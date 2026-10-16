const defaults=ReaderConfig.defaults;
const profileKeys=ReaderConfig.profileKeys;
const commonKeys=['targetLang','glossary','translationSize','translationSpacing','translationTone'];
const field=id=>document.getElementById(id);
let profiles={},selected='legacy',initial;
function list(){field('service').replaceChildren(...Object.entries(profiles).map(([id,p])=>new Option(p.name||id,id)));field('service').value=selected;}
function showProfile(p){field('serviceName').value=p.name||'';for(const key of profileKeys)field(key).value=p[key]??defaults[key];}
async function activate(id){const p=profiles[id];if(!p)throw Error('服务不存在');await chrome.storage.sync.set(Object.fromEntries([['serviceId',id],...profileKeys.map(k=>[k,p[k]??defaults[k]])]));selected=id;list();showProfile(p);}
const ready=(async()=>{
 initial=await chrome.storage.sync.get(defaults);const local=await chrome.storage.local.get({readerServices:{},readerRules:{}});profiles=local.readerServices;
 if(!Object.keys(profiles).length)profiles={legacy:{name:'当前服务',...Object.fromEntries(profileKeys.map(k=>[k,initial[k]]))}};
 selected=profiles[initial.serviceId]?initial.serviceId:Object.keys(profiles)[0];list();showProfile(profiles[selected]);for(const key of commonKeys)field(key).value=initial[key];
 field('rulesJson').value=JSON.stringify(local.readerRules,null,2);
})();
ready.catch(e=>field('msg').textContent=e.message);
field('service').onchange=async()=>{try{await ready;await activate(field('service').value);field('msg').textContent='已切换服务';}catch(e){field('msg').textContent=e.message;}};
field('newService').onclick=async()=>{await ready;selected=crypto.randomUUID();profiles[selected]={name:'新服务',...Object.fromEntries(profileKeys.map(k=>[k,defaults[k]])),apiKey:''};list();showProfile(profiles[selected]);field('msg').textContent='填写后保存并启用';};
field('deleteService').onclick=async()=>{try{await ready;if(Object.keys(profiles).length<=1)throw Error('至少保留一个服务');const removed=selected;const next=Object.keys(profiles).find(k=>k!==removed);await activate(next);delete profiles[removed];const prior=await chrome.storage.local.get({readerServices:{}});await chrome.storage.local.set({readerServicesBackup:prior.readerServices,readerServices:profiles});list();field('msg').textContent='已删除并切换服务';}catch(e){field('msg').textContent=e.message;}};
field('save').onclick=async()=>{
 try{
  await ready;const c=Object.fromEntries([...profileKeys,...commonKeys].map(id=>[id,field(id).value.trim()]));
  const lines=c.glossary.split('\n').filter(x=>x.trim());
  if(lines.length>50||new TextEncoder().encode(c.glossary).length>6000)throw Error('术语表最多 50 条、6000 字节');
  if(lines.some(x=>!/^.+?\s*=\s*.+$/.test(x)))throw Error('每行术语请填写：原词 = 译法');
  const url=new URL(c.endpoint);if(!['https:','http:'].includes(url.protocol))throw Error('接口地址须为 HTTP 或 HTTPS');
  for(const [key,min,max]of [['concurrency',1,6],['minInterval',0,60000]]){c[key]=Number(c[key]);if(!Number.isInteger(c[key])||c[key]<min||c[key]>max)throw Error('并发或请求间隔超出范围');}
  if(!c.apiKey||!c.model)throw Error('请填写 API Key 和模型');
  profiles[selected]={name:field('serviceName').value.trim()||'翻译服务',...Object.fromEntries(profileKeys.map(k=>[k,c[k]]))};
  const backup=await chrome.storage.local.get({readerLegacyServiceBackup:null,readerServices:{}});
  await chrome.storage.local.set({readerServicesBackup:backup.readerServices,readerServices:profiles,...(!backup.readerLegacyServiceBackup?{readerLegacyServiceBackup:initial}:{})});
  await chrome.storage.sync.set({...c,serviceId:selected});list();field('msg').textContent='已保存并启用，网页立即生效';
 }catch(e){field('msg').textContent=e.message;}
};
field('clearCache').onclick=async()=>{try{const all=await chrome.storage.local.get(null);await chrome.storage.local.remove(Object.keys(all).filter(k=>k.startsWith('cache:')));field('msg').textContent='缓存已清空';}catch(e){field('msg').textContent=e.message;}};
const validateRules=ReaderUserRules.parse;
field('saveRules').onclick=async()=>{try{const readerRules=validateRules(JSON.parse(field('rulesJson').value));await ReaderUserRules.save(chrome.storage.local,readerRules);field('ruleMsg').textContent='规则已保存，网页立即重新识别';}catch(e){field('ruleMsg').textContent=e.message;}};
field('exportRules').onclick=()=>{try{const data=validateRules(JSON.parse(field('rulesJson').value));const url=URL.createObjectURL(new Blob([JSON.stringify(ReaderUserRules.export(data),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='reader-site-rules.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){field('ruleMsg').textContent=e.message;}};
field('importRules').onchange=async()=>{try{const file=field('importRules').files[0];if(!file)return;const imported=validateRules(JSON.parse(await file.text()));const existing=validateRules(JSON.parse(field('rulesJson').value));field('rulesJson').value=JSON.stringify({...existing,...imported},null,2);field('ruleMsg').textContent='已导入预览；点击保存规则后生效';}catch(e){field('ruleMsg').textContent=e.message;}};

// 문서 작업대 (GitHub copy) — AI through the person's own free Google Gemini key.
// Speaks the same shape as the Claude page's `sample` capability, so the app's summary and Q&A code runs unchanged.
(()=>{
const LS={ get:(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch{ return d; } }, set:(k,v)=>{ try{ v==null?localStorage.removeItem(k):localStorage.setItem(k,v); }catch{} } };
const KEY='desk.ai.gemini.key', MODEL='desk.ai.gemini.model', MODELS='desk.ai.gemini.models';
const API='https://generativelanguage.googleapis.com/v1beta';
const hasKey=()=>!!LS.get(KEY,'');
const fallback='gemini-2.5-flash';

// models this key can use, best first (names change over time, so ask Google instead of hard-coding).
// Later ones are spares for when the first is busy or out of free quota.
async function listModels(key){
  const r=await fetch(`${API}/models?pageSize=200`,{headers:{'x-goog-api-key':key}});
  if(!r.ok) throw await apiErr(r);
  const j=await r.json();
  const ok=(j.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent')).map(m=>m.name.replace(/^models\//,''));
  const ver=n=>{ const m=n.match(/gemini-(\d+(?:\.\d+)?)/); return m?parseFloat(m[1]):0; };
  const bad=/(image|tts|live|audio|embedding|exp|thinking|8b|vision|robotics|computer|native)/;
  const by=(f)=>ok.filter(n=>/^gemini-/.test(n)&&!bad.test(n)&&f(n)).sort((a,b)=>ver(b)-ver(a)||a.length-b.length);
  const order=[...by(n=>/flash/.test(n)&&!/lite|preview/.test(n)), ...by(n=>/flash-lite/.test(n)&&!/preview/.test(n)), ...by(n=>/flash/.test(n)&&/preview/.test(n)), ...by(n=>/pro/.test(n)&&!/preview/.test(n))];
  const uniq=[...new Set(order)].slice(0,6);
  return uniq.length?uniq:[fallback];
}
async function pickModel(key){ const list=await listModels(key); LS.set(MODELS,JSON.stringify(list)); return list[0]; }
async function apiErr(r){
  let msg=''; try{ msg=(await r.json())?.error?.message||''; }catch{}
  if(r.status===503||/high demand|overloaded|UNAVAILABLE|try again later/i.test(msg)) return {gemini:true,code:'busy',message:'제미나이에 사람이 몰려 잠시 바쁩니다. 1~2분 뒤에 다시 해 주세요.'};
  if(r.status===429) return {gemini:true,code:'rate_limited',message:'제미나이 무료 사용량을 잠시 다 썼습니다. 1분쯤 뒤에 다시 해 주세요.'};
  if(r.status===400&&/api key/i.test(msg)||r.status===401||r.status===403) return {gemini:true,code:'bad_key',message:'제미나이 키가 맞지 않습니다. 설정 → AI 연결에서 키를 다시 넣어 주세요.'};
  return {gemini:true,code:'error',message:'제미나이가 답하지 못했습니다'+(msg?` (${msg.slice(0,120)})`:'')};
}
const b64=blob=>new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(String(fr.result).split(',')[1]); fr.onerror=()=>rej(fr.error); fr.readAsDataURL(blob); });

async function sample(input, opts={}){
  const key=LS.get(KEY,''); if(!key) throw {gemini:true,code:'not_granted',message:'설정 → AI 연결에서 제미나이 키를 넣어 주세요.'};
  let model=LS.get(MODEL,''); if(!model){ try{ model=await pickModel(key); LS.set(MODEL,model); }catch(e){ if(e?.code) throw e; model=fallback; } }
  let spares=[]; try{ spares=JSON.parse(LS.get(MODELS,'[]')); }catch{}
  if(!spares.length){ try{ spares=await listModels(key); LS.set(MODELS,JSON.stringify(spares)); }catch{} }
  const tries=[model,...spares.filter(m=>m!==model)].slice(0,4);
  const msgs=typeof input==='string'?[{role:'user',content:input}]:input;
  const contents=msgs.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:String(m.content||'')}]}));
  if(opts.images?.length){ const last=contents[contents.length-1]; for(const im of opts.images) last.parts.push({inline_data:{mime_type:im.type||'image/jpeg',data:await b64(im)}}); }
  const ctl=new AbortController(); if(opts.signal){ if(opts.signal.aborted) ctl.abort(); else opts.signal.addEventListener('abort',()=>ctl.abort(),{once:true}); }
  const ver=m=>{ const x=m.match(/gemini-(\d+(?:\.\d+)?)/); return x?parseFloat(x[1]):0; };
  const think=m=>ver(m)>=3?{thinkingConfig:{thinkingLevel:'low'}}:(/2\.5-flash/.test(m)?{thinkingConfig:{thinkingBudget:0}}:null);
  const noThink=new Set();
  // while nothing has come back yet, show that it is working
  const t0=Date.now(); let got=false; const tick=setInterval(()=>{ if(!got) opts.onText?.({text:`*제미나이가 읽고 생각하는 중… ${Math.round((Date.now()-t0)/1000)}초*`,delta:''}); },1000);
  try{
  let r=null, lastErr=null;
  for(let t=0;t<tries.length;t++){ model=tries[t];
    let first=false; const wd=setTimeout(()=>{ if(!first) ctl.abort('slow'); },90000);
    const gc=noThink.has(model)?null:think(model);
    try{ r=await fetch(`${API}/models/${model}:streamGenerateContent?alt=sse`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(gc?{contents,generationConfig:gc}:{contents}),signal:ctl.signal}); }
    catch(e){ clearTimeout(wd); if(ctl.signal.reason==='slow') throw {gemini:true,code:'timeout',message:'제미나이가 90초 동안 답하지 않았습니다. 잠시 뒤 다시 해 주세요.'}; if(opts.signal?.aborted) throw e; throw {gemini:true,code:'error',message:'제미나이에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.'}; }
    first=true; clearTimeout(wd);
    if(r.ok) break;
    lastErr=await apiErr(r); r=null;
    if(gc && r===null && /thinking/i.test(lastErr.message)){ noThink.add(model); t--; continue; }
    if(lastErr.code==='bad_key') throw lastErr;
    if(lastErr.code==='busy'||lastErr.code==='rate_limited'||/not found|404/i.test(lastErr.message)){ opts.onText?.({text:t+1<tries.length?'다른 제미나이 모델로 다시 해 보는 중…':'',delta:''}); await new Promise(z=>setTimeout(z,1200)); continue; }
    throw lastErr;
  }
  if(!r) throw lastErr||{gemini:true,code:'error',message:'제미나이가 답하지 못했습니다'};
  got=true;
  const rd=r.body.getReader(); const dec=new TextDecoder(); let buf='', text='', stop='';
  for(;;){ const {value,done}=await rd.read(); if(done) break; buf+=dec.decode(value,{stream:true});
    let i; while((i=buf.indexOf('\n'))>=0){ const line=buf.slice(0,i).trim(); buf=buf.slice(i+1); if(!line.startsWith('data:')) continue;
      try{ const j=JSON.parse(line.slice(5)); const c=j.candidates?.[0]; const d=(c?.content?.parts||[]).map(p=>p.text||'').join(''); if(c?.finishReason) stop=c.finishReason; if(d){ text+=d; opts.onText?.({text,delta:d}); } }catch{} } }
  if(!text && stop==='SAFETY') throw {gemini:true,code:'error',message:'제미나이가 이 내용에는 답하지 않았습니다'};
  return {text, truncated:stop==='MAX_TOKENS', modelApplied:model};
  } finally { clearInterval(tick); }
}
sample.limits=async()=>({images:true});
sample.json=async(input,opts)=>{ const r=await sample((typeof input==='string'?input:input.map(m=>m.content).join('\n'))+'\n\nJSON만 출력해. 설명이나 ``` 표시는 붙이지 마.',opts); const t=r.text.replace(/^```(?:json)?|```$/gm,'').trim(); return JSON.parse(t); };

// a stalled connection should not leave the person waiting forever
const withTimeout=(p,ms,msg)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej({gemini:true,code:'timeout',message:msg}),ms))]);
// checking a key = asking Google which models it may use (quick, and fails at once for a wrong key)
async function test(key,step){
  step?.('구글에 키 확인 중');
  const model=await withTimeout(pickModel(key),20000,'키 확인 단계에서 구글이 20초 동안 답하지 않았습니다. 와이파이를 바꾸거나 잠시 뒤 다시 해 보세요.');
  step?.('확인됨 · '+model);
  return model;
}
async function ping(model){
  const key=LS.get(KEY,''); const t0=performance.now(); const ver=(model.match(/gemini-(\d+(?:\.\d+)?)/)||[])[1]||0;
  const gc=ver>=3?{thinkingConfig:{thinkingLevel:'low'}}:(/2\.5-flash/.test(model)?{thinkingConfig:{thinkingBudget:0}}:undefined);
  const call=async cfg=>fetch(`${API}/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(cfg?{contents:[{role:'user',parts:[{text:'"네"라고만 답해.'}]}],generationConfig:cfg}:{contents:[{role:'user',parts:[{text:'"네"라고만 답해.'}]}]})});
  let r=await withTimeout(call(gc),40000,'40초 응답 없음'); if(!r.ok&&gc){ const e=await apiErr(r.clone()); if(/thinking/i.test(e.message)) r=await withTimeout(call(),40000,'40초 응답 없음'); }
  if(!r.ok) throw await apiErr(r); return Math.round(performance.now()-t0);
}
window.DESK_AI={ hasKey, sample, test, ping,
  models:()=>{ try{ return JSON.parse(LS.get(MODELS,'[]')); }catch{ return []; } },
  async refreshModels(){ const l=await listModels(LS.get(KEY,'')); LS.set(MODELS,JSON.stringify(l)); return l; },
  setModel(m){ LS.set(MODEL,m); },
  key:()=>LS.get(KEY,''), model:()=>LS.get(MODEL,''),
  async setKey(k,step){ k=String(k||'').trim().replace(/\s+/g,''); let model=await test(k,step); LS.set(KEY,k); LS.set(MODEL,model);
    // try the first few models at once and keep whichever answers fastest (the newest one is often the busiest)
    step?.('빠른 모델 고르는 중');
    const list=JSON.parse(LS.get(MODELS,'[]')).slice(0,4);
    const res=await Promise.all(list.map(m=>ping(m).then(ms=>({m,ms})).catch(()=>null)));
    const best=res.filter(Boolean).sort((a,b)=>a.ms-b.ms)[0];
    if(best){ model=best.m; LS.set(MODEL,model); }
    return model; },
  async pickFastest(){ const list=this.models().slice(0,4); const res=await Promise.all(list.map(m=>ping(m).then(ms=>({m,ms})).catch(()=>null))); const best=res.filter(Boolean).sort((a,b)=>a.ms-b.ms)[0]; if(best) LS.set(MODEL,best.m); return best; },
  clear(){ LS.set(KEY,null); LS.set(MODEL,null); LS.set(MODELS,null); } };
})();

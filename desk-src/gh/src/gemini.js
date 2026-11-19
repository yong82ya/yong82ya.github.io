// 문서 작업대 (GitHub copy) — AI through the person's own free Google Gemini key.
// Speaks the same shape as the Claude page's `sample` capability, so the app's summary and Q&A code runs unchanged.
(()=>{
const LS={ get:(k,d)=>{ try{ const v=localStorage.getItem(k); return v==null?d:v; }catch{ return d; } }, set:(k,v)=>{ try{ v==null?localStorage.removeItem(k):localStorage.setItem(k,v); }catch{} } };
const KEY='desk.ai.gemini.key', MODEL='desk.ai.gemini.model', MODELS='desk.ai.gemini.models';
const API='https://generativelanguage.googleapis.com/v1beta';
const hasGemini=()=>!!LS.get(KEY,'');
/* Groq: a second, free and very fast road for short text (no pictures). Long or scanned material still goes to Gemini. */
const GKEY='desk.ai.groq.key', GAPI='https://api.groq.com/openai/v1';
const GMODELS=['llama-3.3-70b-versatile','openai/gpt-oss-120b','llama-3.1-8b-instant'];
const GROQ_MAX=6000;   // characters of question+document Groq's free plan takes in one go (its per-minute token cap is small)
const hasGroq=()=>!!LS.get(GKEY,'');
const hasKey=()=>hasGemini()||hasGroq();
async function groqSample(msgs,opts){
  const key=LS.get(GKEY,''); let last=null;
  for(const model of GMODELS){
    const ctl=new AbortController(); const onStop=()=>ctl.abort('stop'); opts.signal?.addEventListener('abort',onStop,{once:true});
    let wd=setTimeout(()=>ctl.abort('slow'),20000);
    try{
      const r=await fetch(`${GAPI}/chat/completions`,{method:'POST',signal:ctl.signal,headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
        body:JSON.stringify({model,stream:true,temperature:0.3,max_tokens:2048,messages:msgs.map(m=>({role:m.role==='assistant'?'assistant':'user',content:String(m.content||'')}))})});
      if(!r.ok){ let msg=''; try{ msg=(await r.json())?.error?.message||''; }catch{}
        if(r.status===401) throw {groq:true,code:'bad_key',message:'Groq 키가 맞지 않습니다. 설정 → AI 연결에서 다시 넣어 주세요.'};
        last={groq:true,code:r.status===429||r.status===413?'rate_limited':'error',message:msg}; continue; }
      const rd=r.body.getReader(), dec=new TextDecoder(); let buf='', text='';
      const arm=()=>{ clearTimeout(wd); wd=setTimeout(()=>ctl.abort('stall'),30000); }; arm();
      for(;;){ const {value,done}=await rd.read(); if(done) break; buf+=dec.decode(value,{stream:true}); arm();
        let i; while((i=buf.indexOf('\n'))>=0){ const line=buf.slice(0,i).trim(); buf=buf.slice(i+1); if(!line.startsWith('data:')) continue; const d=line.slice(5).trim(); if(d==='[DONE]') continue;
          try{ const j=JSON.parse(d); const t=j.choices?.[0]?.delta?.content||''; if(t){ text+=t; opts.onText?.({text,delta:t}); } }catch{} } }
      if(!text.trim()){ last={groq:true,code:'error',message:'빈 답'}; continue; }
      return {text, modelApplied:'Groq · '+model};
    }catch(e){ if(opts.signal?.aborted) throw {code:'cancelled'}; if(e?.code==='bad_key') throw e; last={groq:true,code:'error',message:e?.message||String(ctl.signal.reason||'')}; }
    finally{ clearTimeout(wd); opts.signal?.removeEventListener('abort',onStop); }
  }
  throw last||{groq:true,code:'error',message:'Groq가 답하지 못했습니다'};
}
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
  const msgs0=typeof input==='string'?[{role:'user',content:input}]:input;
  const size=msgs0.reduce((a,m)=>a+String(m.content||'').length,0);
  if(hasGroq() && !opts.images?.length && size<=GROQ_MAX){
    try{ return await groqSample(msgs0,opts); }
    catch(e){ if(e?.code==='cancelled') throw e; if(!hasGemini()) throw {gemini:true,code:e?.code==='bad_key'?'bad_key':'error',message:e?.code==='bad_key'?e.message:'Groq가 답하지 못했습니다'+(e?.message?` (${String(e.message).slice(0,100)})`:'')+'. 제미나이 키도 넣어 두면 대신 답해요.'}; console.warn('groq → gemini',e); opts.onText?.({text:'*Groq가 답하지 않아 제미나이로 바꾸는 중…*',delta:''}); }
  }
  const key=LS.get(KEY,''); if(!key) throw {gemini:true,code:'not_granted',message:opts.images?.length?'스캔본(사진)은 제미나이만 읽을 수 있어요. 설정 → AI 연결에서 제미나이 키를 넣어 주세요.':(size>GROQ_MAX&&hasGroq()?'글이 길어서 Groq 무료 한도를 넘어요. 범위를 줄이거나 제미나이 키도 넣어 주세요.':'설정 → AI 연결에서 제미나이 키를 넣어 주세요.')};
  let model=LS.get(MODEL,''); if(!model){ try{ model=await pickModel(key); LS.set(MODEL,model); }catch(e){ if(e?.code) throw e; model=fallback; } }
  let spares=[]; try{ spares=JSON.parse(LS.get(MODELS,'[]')); }catch{}
  if(!spares.length){ try{ spares=await listModels(key); LS.set(MODELS,JSON.stringify(spares)); }catch{} }
  const tries=[model,...spares.filter(m=>m!==model)].slice(0,4);
  const msgs=typeof input==='string'?[{role:'user',content:input}]:input;
  const contents=msgs.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:String(m.content||'')}]}));
  if(opts.images?.length){ const last=contents[contents.length-1]; for(const im of opts.images) last.parts.push({inline_data:{mime_type:im.type||'image/jpeg',data:await b64(im)}}); }
  if(opts.signal?.aborted) throw {code:'cancelled'};
  let ctl=null; const onStop=()=>ctl?.abort('stop'); opts.signal?.addEventListener('abort',onStop,{once:true});
  const ver=m=>{ const x=m.match(/gemini-(\d+(?:\.\d+)?)/); return x?parseFloat(x[1]):0; };
  const think=m=>ver(m)>=3?{thinkingConfig:{thinkingLevel:'low'}}:(/2\.5-flash/.test(m)?{thinkingConfig:{thinkingBudget:0}}:null);
  const noThink=new Set();
  // while nothing has come back yet, show that it is working
  const t0=Date.now(); let got=false; const tick=setInterval(()=>{ if(!got) opts.onText?.({text:`*제미나이가 읽고 생각하는 중… ${Math.round((Date.now()-t0)/1000)}초*`,delta:''}); },1000);
  try{
  let r=null, lastErr=null, text='', stop='', slow=0;
  const WAIT=60000, STALL=45000;
  for(let t=0;t<tries.length;t++){ model=tries[t]; text=''; stop='';
    ctl=new AbortController(); let wd=setTimeout(()=>ctl.abort('slow'),WAIT);
    const gc=noThink.has(model)?null:think(model);
    try{ r=await fetch(`${API}/models/${model}:streamGenerateContent?alt=sse`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(gc?{contents,generationConfig:gc}:{contents}),signal:ctl.signal}); }
    catch(e){ clearTimeout(wd); r=null;
      if(opts.signal?.aborted) throw {code:'cancelled'};
      if(ctl.signal.reason==='slow'){ slow++; lastErr={gemini:true,code:'timeout',message:'제미나이 모델들이 모두 1분 넘게 답하지 않았습니다. 구글 쪽이 붐비는 때라 잠시 뒤 다시 해 주세요. 범위를 줄이면 더 빨리 됩니다.'}; if(t+1<tries.length) opts.onText?.({text:'*이 모델이 너무 느려서 다른 제미나이 모델로 바꾸는 중…*',delta:''}); continue; }
      throw {gemini:true,code:'error',message:'제미나이에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.'}; }
    clearTimeout(wd);
    if(r.ok){
      // read the answer; if it stops coming before any text arrives, move on to the next model
      got=true;
      const rd=r.body.getReader(); const dec=new TextDecoder(); let buf='';
      const arm=()=>{ clearTimeout(wd); wd=setTimeout(()=>ctl.abort('stall'),text?STALL:WAIT); }; arm();
      try{
        for(;;){ const {value,done}=await rd.read(); if(done) break; buf+=dec.decode(value,{stream:true}); arm();
          let i; while((i=buf.indexOf('\n'))>=0){ const line=buf.slice(0,i).trim(); buf=buf.slice(i+1); if(!line.startsWith('data:')) continue;
            try{ const j=JSON.parse(line.slice(5)); const c=j.candidates?.[0]; const d=(c?.content?.parts||[]).map(p=>p.text||'').join(''); if(c?.finishReason) stop=c.finishReason; if(d){ text+=d; opts.onText?.({text,delta:d}); } }catch{} } }
      }catch(e){
        clearTimeout(wd);
        if(opts.signal?.aborted) throw {code:'cancelled',text};
        if(text){ stop='STALL'; }
        else { got=false; r=null; slow++; lastErr={gemini:true,code:'timeout',message:'제미나이 모델들이 모두 1분 넘게 답하지 않았습니다. 구글 쪽이 붐비는 때라 잠시 뒤 다시 해 주세요. 범위를 줄이면 더 빨리 됩니다.'}; if(t+1<tries.length) opts.onText?.({text:'*답이 멈춰서 다른 제미나이 모델로 바꾸는 중…*',delta:''}); continue; }
      }
      clearTimeout(wd);
      if(slow) LS.set(MODEL,model);   // remember the one that answered
      break;
    }
    lastErr=await apiErr(r); r=null;
    if(gc && r===null && /thinking/i.test(lastErr.message)){ noThink.add(model); t--; continue; }
    if(lastErr.code==='bad_key') throw lastErr;
    if(lastErr.code==='busy'||lastErr.code==='rate_limited'||/not found|404/i.test(lastErr.message)){ opts.onText?.({text:t+1<tries.length?'다른 제미나이 모델로 다시 해 보는 중…':'',delta:''}); await new Promise(z=>setTimeout(z,1200)); continue; }
    throw lastErr;
  }
  if(!r) throw lastErr||{gemini:true,code:'error',message:'제미나이가 답하지 못했습니다'};
  if(stop==='STALL') throw {gemini:true,code:'timeout',text,message:'제미나이 답이 중간에 끊겼습니다. 여기까지 받은 내용만 보여 드려요.'};
  if(!text && stop==='SAFETY') throw {gemini:true,code:'error',message:'제미나이가 이 내용에는 답하지 않았습니다'};
  return {text, truncated:stop==='MAX_TOKENS', modelApplied:model};
  } finally { clearInterval(tick); opts.signal?.removeEventListener('abort',onStop); }
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
window.DESK_AI={ hasKey, hasGemini, hasGroq, sample, test, ping,
  groqKey:()=>LS.get(GKEY,''),
  async setGroq(k){ k=String(k||'').trim().replace(/\s+/g,''); if(!/^gsk_/.test(k)) throw {message:'Groq 키는 gsk_ 로 시작해요'};
    let r; try{ r=await withTimeout(fetch(`${GAPI}/models`,{headers:{'Authorization':'Bearer '+k}}),15000,'Groq가 15초 동안 답하지 않았습니다'); }catch(e){ throw {message:e?.message||'Groq에 연결하지 못했습니다'}; }
    if(r.status===401) throw {message:'Groq 키가 맞지 않습니다'}; if(!r.ok) throw {message:'Groq 확인 실패 ('+r.status+')'};
    LS.set(GKEY,k); return true; },
  clearGroq(){ LS.set(GKEY,null); },
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

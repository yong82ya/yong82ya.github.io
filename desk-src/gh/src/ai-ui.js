// settings panel: connect Gemini with the person's own free key (kept on this device only)
function openAiPanel(){
  const A=window.DESK_AI; const scrim=$('#scrim'); $('#sheetTitle').textContent='AI 연결 (제미나이)'; const body=$('#sheetBody'); body.replaceChildren();
  const p=(t,h)=>{ const x=el('p'); if(h) x.innerHTML=t; else x.textContent=t; x.style.margin='0 0 10px'; return x; };
  const box=el('div','fpick');
  if(A.hasKey()){
    body.append(p(`켜짐 · 지금 쓰는 모델 ${A.model()||'자동'}`), p('이 앱에서 AI 요약과 질문이 제미나이로 됩니다. 키는 이 기기에만 저장돼요. 느리면 아래에서 속도를 시험해 보고 빠른 모델을 고르세요.'));
    // model list with a speed test; the chosen one is tried first, the rest stay as spares
    const ml=el('div','fpick'); body.append(ml);
    const draw=list=>{ ml.replaceChildren(); for(const m of list){ const row=el('button'); row.style.cssText='display:flex;justify-content:space-between;gap:8px'; if(m===A.model()) row.setAttribute('aria-current','true');
        const nm=el('span',null,m); const res=el('small',null,m===A.model()?'사용 중':''); res.style.color='var(--muted)'; row.append(nm,res);
        row.onclick=async()=>{ res.textContent='시험 중…'; try{ const ms=await A.ping(m); res.textContent=`${(ms/1000).toFixed(1)}초 · 이걸로 씀`; A.setModel(m); ml.querySelectorAll('button').forEach(b=>{ b.removeAttribute('aria-current'); const sm=b.querySelector('small'); if(sm&&sm.textContent==='사용 중') sm.textContent=''; }); row.setAttribute('aria-current','true'); toast(`${m} 모델을 씁니다 (${(ms/1000).toFixed(1)}초)`,3000); }catch(e){ res.textContent=e?.code==='busy'?'바쁨':e?.code==='rate_limited'?'한도 참':(e?.message||'실패').slice(0,24); } };
        ml.append(row); } };
    const lst=A.models(); if(lst.length) draw(lst); else A.refreshModels().then(draw).catch(()=>{});
    body.append(p('<small>모델을 누르면 짧은 시험 질문을 보내 응답 시간을 재고, 되면 그 모델로 바꿔요.</small>',true));
    const fast=el('button','btn btn-ghost','제일 빠른 모델 자동으로 고르기'); fast.style.marginTop='4px';
    fast.onclick=async()=>{ fast.disabled=true; fast.textContent='여러 모델 시험 중…'; const b=await A.pickFastest().catch(()=>null); fast.disabled=false; fast.textContent='제일 빠른 모델 자동으로 고르기';
      if(b){ toast(`${b.m} 모델을 씁니다 (${(b.ms/1000).toFixed(1)}초)`,3500); openAiPanel(); } else toast('지금은 모든 모델이 바쁩니다. 잠시 뒤 다시 해 주세요',3500); };
    body.append(fast);
  } else {
    body.append(p('구글 제미나이의 무료 키를 넣으면 이 앱에서도 AI 요약과 질문이 됩니다. 결제 정보를 등록하지 않으면 돈이 나가지 않고, 무료 한도를 넘으면 잠시 멈출 뿐이에요.'),
      p('<b>키 받는 법</b><br>1. <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> 를 열고 구글 계정으로 로그인<br>2. <b>API 키 만들기</b>(Create API key)를 누르기<br>3. 나온 키(AQ. 또는 AIza로 시작)를 복사해서 아래에 붙여넣기',true),
      p('키는 이 기기에만 저장돼요. 아이패드·노트북·폰에서 각각 한 번씩 넣어 주세요. 무료 키로 보낸 내용은 구글이 서비스 개선에 쓸 수 있으니, 아주 개인적인 문서는 조심하세요.'));
  }
  const inp=el('input'); inp.placeholder=A.hasKey()?'새 키로 바꾸려면 여기에 붙여넣기':'AQ. 또는 AIza로 시작하는 키 붙여넣기'; inp.autocomplete='off'; inp.spellcheck=false; box.append(inp); body.append(box);
  const acts=$('#sheetActs'); acts.replaceChildren();
  const close=el('button','btn btn-ghost','닫기'); close.onclick=()=>scrim.hidden=true;
  const save=el('button','btn btn-primary','연결 확인하고 저장');
  save.onclick=async()=>{ const k=inp.value.trim(); if(!k){ toast('키를 붙여넣어 주세요'); return; } save.disabled=true; save.textContent='확인 중…';
    try{ const m=await A.setKey(k,t=>{ save.textContent=t; }); toast(`제미나이 연결됨 · ${m}`,3500); scrim.hidden=true; samp=null; }
    catch(e){ toast(e?.message||'키를 확인하지 못했습니다',4500); }
    finally{ save.disabled=false; save.textContent='연결 확인하고 저장'; } };
  acts.append(close);
  if(A.hasKey()){ const off=el('button','btn btn-ghost','연결 끊기'); off.onclick=()=>{ A.clear(); samp=null; toast('제미나이 연결을 끊었습니다'); scrim.hidden=true; }; acts.append(off); }
  // step-by-step check of the road to Google's AI, with timings, to see where it stops
  const diag=el('button','btn btn-ghost','연결 진단'); const out=el('pre'); out.style.cssText='white-space:pre-wrap;font:12px/1.5 var(--f-mono);background:var(--bg);border-radius:8px;padding:8px;margin:8px 0 0;display:none';
  diag.onclick=async()=>{ out.style.display='block'; out.textContent=''; const log=t=>out.textContent+=t+'\n'; const k=(inp.value.trim()||A.key()).replace(/\s+/g,'');
    const go=async(label,url,init)=>{ const t0=performance.now(); const c=new AbortController(); const tm=setTimeout(()=>c.abort(),15000);
      try{ const r=await fetch(url,{...init,signal:c.signal}); log(`${label}: ${r.status} (${Math.round(performance.now()-t0)}ms)`); return r; }catch(e){ log(`${label}: 실패 ${e.name==='AbortError'?'15초 응답 없음':e.message} (${Math.round(performance.now()-t0)}ms)`); return null; } finally{ clearTimeout(tm); } };
    log('버전 '+DESK_BUILD+' · 키 '+(k?k.slice(0,4)+'…'+k.length+'자':'없음'));
    await go('1. 구글 AI 서버 연결','https://generativelanguage.googleapis.com/v1beta/models?pageSize=1');
    if(k){ const r=await go('2. 키로 모델 목록','https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',{headers:{'x-goog-api-key':k}}); if(r&&!r.ok){ try{ log('   '+((await r.json())?.error?.message||'').slice(0,160)); }catch{} } }
    log('끝 · 이 화면을 찍어서 보내 주세요'); };
  acts.prepend(diag); body.append(out);
  body.append(Object.assign(el('p'),{textContent:'버전 '+DESK_BUILD,style:'margin:8px 0 0;font-size:12px;color:var(--muted)'}));
  acts.append(save); scrim.hidden=false; setTimeout(()=>inp.focus(),50);
}

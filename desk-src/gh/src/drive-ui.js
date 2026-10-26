/* ================= Google Drive (GitHub Pages copy) ================= */
window.deskReload=async()=>{ await loadLibrary(); };
window.deskOpenFile=f=>openLocalFile(f);
window.deskBundle=fl=>bundleImages(fl);
window.deskBusyIds=()=>[V.meta?.id, ED.meta?.id, SH.meta?.id].filter(Boolean);
const agoText=t=>{ if(!t) return '아직 안 함'; const s=(Date.now()-t)/1000; if(s<60) return '방금'; if(s<3600) return Math.floor(s/60)+'분 전'; if(s<86400) return Math.floor(s/3600)+'시간 전'; return new Date(t).toLocaleDateString('ko-KR'); };
function driveLine(){
  const line=$('#storeLine'); const dot=line.querySelector('.dot'); const txt=line.lastChild; const D=window.DRIVE; if(!D) return;
  line.onclick=null; line.style.cursor='';
  if(!D.isOn()){ dot.className='dot warn'; txt.textContent='이 기기에만 저장됩니다 · 설정에서 구글 드라이브를 연결하면 다른 기기와 이어집니다'; return; }
  const S=D.state;
  if(S.err==='auth'){ dot.className='dot warn'; txt.textContent='구글 드라이브 연결이 잠시 끊겼습니다 · 여기를 눌러 다시 연결'; line.style.cursor='pointer'; line.onclick=()=>D.reconnect().catch(e=>toast(e.message||'연결하지 못했습니다',3500)); return; }
  if(S.err){ dot.className='dot warn'; txt.textContent='동기화 문제: '+S.err.slice(0,80)+' · 여기를 눌러 다시 시도'; line.style.cursor='pointer'; line.onclick=()=>D.sync(); return; }
  dot.className='dot ok'; txt.textContent=S.busy?'구글 드라이브와 맞추는 중…':`구글 드라이브와 동기화됨 · ${agoText(S.last)} · 눌러서 지금 맞추기`; line.style.cursor='pointer'; line.onclick=()=>D.sync();
}
function renderInbox(){
  const D=window.DRIVE, wrap=$('#inboxWrap'), box=$('#inboxList'); if(!D||!wrap) return;
  const items=D.isOn()?D.state.inbox:[]; wrap.hidden=!items.length; box.replaceChildren(); if(!items.length) return;
  $('#inboxCount').textContent=`${items.length}개`;
  for(const f of items.slice(0,12)){ const b=el('button','rc'); b.append(el('span','f',(k=>k==='img'?'사진':k.toUpperCase().slice(0,4))(D.kindOf(f))), el('b',null,f.name.replace(/\.[^.]+$/,'')), el('small',null,f.modifiedTime?fmtDate(Date.parse(f.modifiedTime)):''));
    b.title=f.name+' 가져와서 열기'; b.disabled=!!D.state.importing; b.onclick=async()=>{ if(D.state.importing) return; toast('드라이브에서 가져오는 중…',6000); try{ await D.importInbox([f.id]); }catch(e){ console.warn(e); toast('가져오지 못했습니다',3000); } }; box.append(b); }
  const imgs=items.filter(f=>D.kindOf(f)==='img'); $('#inboxBundle').hidden=imgs.length<2; $('#inboxBundle').textContent=`사진 ${imgs.length}장 PDF 하나로 묶기`;
  if(D.state.importing){ $('#inboxBundle').disabled=true; $('#inboxBundle').textContent='가져오는 중…'; } else $('#inboxBundle').disabled=false;
  $('#inboxBundle').onclick=async()=>{ if(D.state.importing) return; toast(`사진 ${imgs.length}장을 드라이브에서 가져오는 중…`,8000); try{ await D.importInbox(imgs.map(f=>f.id)); }catch(e){ console.warn(e); toast('가져오지 못했습니다',3000); } };
}
function openDrivePanel(){
  const D=window.DRIVE; const scrim=$('#scrim'); $('#sheetTitle').textContent='구글 드라이브 동기화'; const body=$('#sheetBody'); body.replaceChildren();
  const S=D.state; const box=el('div','set-list');
  const p=(t)=>{ const x=el('p',null,t); x.style.cssText='margin:0 0 8px;color:var(--ink);font-size:14px;line-height:1.6'; return x; };
  if(!D.isOn()){
    box.append(p('연결하면 이 기기의 문서와 필기가 구글 드라이브의 "문서 작업대" 폴더에 저장되고, 노트북·아이패드·폰 어디서 열어도 이어집니다.'), p('폰에서 V플랫 등으로 찍은 스캔을 드라이브의 "문서 작업대/스캔함" 폴더로 보내면, 작업대 첫 화면에 바로 떠요. PDF·사진뿐 아니라 한글·워드·PPT·엑셀 파일과 구글 문서도 넣을 수 있어요.'));
    const note=el('p',null,'처음 연결할 때 구글이 "확인되지 않은 앱"이라고 경고할 수 있어요. 직접 만든 앱이라 그렇습니다. "고급" → "문서 작업대(으)로 이동"을 누르면 됩니다.'); note.style.cssText='margin:0;font-size:12px;color:var(--muted)'; box.append(note);
  } else {
    box.append(p(`연결된 계정: ${S.email||'확인 중'}`), p(`마지막 동기화: ${agoText(S.last)}${S.busy?' · 지금 맞추는 중':''}`), p('작업대로 가져올 파일(스캔, PDF, 한글·워드·PPT·엑셀, 구글 문서)은 드라이브의 "문서 작업대/스캔함" 폴더에 넣으세요. 가져온 파일은 "가져온 스캔" 폴더로 옮겨 둡니다.'));
    if(S.err) box.append(p('최근 문제: '+(S.err==='auth'?'연결이 끊겨 다시 연결이 필요합니다':S.err)));
  }
  body.append(box);
  const acts=$('#sheetActs'); acts.replaceChildren();
  const back=el('button','btn btn-ghost','‹ 설정'); back.onclick=()=>openSettings(); acts.append(back);
  if(!D.isOn()){ const go=el('button','btn btn-primary','구글 드라이브 연결'); go.onclick=async()=>{ go.disabled=true; go.textContent='연결하는 중…'; try{ await D.connect(); toast('구글 드라이브와 연결했습니다',3000); openDrivePanel(); }catch(e){ toast(e.message||'연결하지 못했습니다',4000); go.disabled=false; go.textContent='구글 드라이브 연결'; } }; acts.append(go); }
  else {
    const off=el('button','btn btn-ghost','연결 끊기'); off.onclick=async()=>{ const ok=await sheet('연결을 끊을까요?','이 기기의 문서는 그대로 남고, 드라이브에 있는 것도 지워지지 않습니다. 다만 다른 기기와 더 이상 맞추지 않습니다.',[{label:'취소',value:false},{label:'연결 끊기',value:true,cls:'btn-danger'}]); if(ok){ D.disconnect(); toast('연결을 끊었습니다'); } };
    const now=el('button','btn btn-primary',S.err==='auth'?'다시 연결':'지금 동기화'); now.onclick=async()=>{ now.disabled=true; try{ if(S.err==='auth'||!D.tokenOk()) await D.reconnect(); else await D.sync(); }catch(e){ toast(e.message||'실패했습니다',3500); } openDrivePanel(); };
    acts.append(off,now);
  }
  scrim.hidden=false;
}
if(window.DRIVE){ window.DRIVE.onChange(()=>{ driveLine(); renderInbox(); }); }

// GitHub copy: name the device and the way it is opened, and whether it is tied to Drive
function whereTag(){
  const w=$('#whereTag'); if(!w) return; const ua=navigator.userAgent;
  const ipad=/iPad/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1), iphone=/iPhone/.test(ua), android=/Android/.test(ua);
  const dev=ipad?'아이패드':iphone?'아이폰':android?'폰':'노트북·PC';
  const app=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  const br=/SamsungBrowser/.test(ua)?'삼성 인터넷':/Edg\//.test(ua)?'엣지':/Whale/.test(ua)?'웨일':/CriOS|Chrome/.test(ua)?'크롬':/Firefox|FxiOS/.test(ua)?'파이어폭스':/Safari/.test(ua)?'사파리':'브라우저';
  const where=app?`${dev} 앱`:`${dev} ${br}`;
  const on=window.DRIVE?.isOn?.();
  w.hidden=false; w.className='where'+((!on)||(ipad&&!app)?' warn':'');
  let note=on?'· 드라이브 연결됨 · 다른 기기와 이어져요':'· 이 기기에만 저장 · 설정에서 드라이브를 연결하세요';
  if((ipad||iphone)&&!app) note+=' · 홈 화면 앱과 보관함이 따로예요';
  w.replaceChildren('📍 '+where, el('small',null,note));
}
if(window.DRIVE){ window.DRIVE.onChange(()=>whereTag()); }

// Galaxy share menu → 문서 작업대 (the service worker keeps what was shared until the app picks it up)
async function deskShareIn(){
  if(!/[?&]share=1/.test(location.search)) return;
  history.replaceState(null,'',location.pathname);
  let got=null;
  try{ const d=await DESK.idb(); got=await new Promise((res,rej)=>{ const t=d.transaction('blobs','readwrite'); const s=t.objectStore('blobs'); const q=s.get('share:pending'); q.onsuccess=()=>{ res(q.result); s.delete('share:pending'); }; q.onerror=()=>rej(q.error); }); }catch(e){ console.warn('share',e); }
  if(!got){ toast('공유한 내용을 받지 못했습니다. 다시 공유해 주세요',4000); return; }
  const files=(got.files||[]).filter(f=>f&&f.size);
  const audio=files.filter(f=>/^audio\//.test(f.type)||/\.(m4a|mp3|wav|aac|ogg|3gp|amr)$/i.test(f.name));
  const rest=files.filter(f=>!audio.includes(f));
  if(rest.length){ intake(rest); return; }
  const text=[got.title,got.text,got.url].filter(Boolean).join('\n\n').trim();
  if(text){ const d=new Date(); const base=(got.title||text.split('\n')[0]||'공유한 글').replace(/[\\/:*?"<>|]/g,' ').slice(0,30).trim()||'공유한 글'; openLocalFile(new File([text],`${base} ${d.getMonth()+1}-${d.getDate()}.txt`,{type:'text/plain'})); return; }
  if(audio.length){ toast('녹음 파일은 아직 바로 열 수 없습니다. 녹음 앱에서 글로 바꾼 뒤 그 글을 공유해 주세요',5000); return; }
  toast('공유한 내용이 비어 있습니다',3000);
}
window.deskShareIn=deskShareIn;

// 문서 작업대 — Google Drive sync (GitHub Pages copy only).
// Drive layout:  내 드라이브/문서 작업대/스캔함        ← put scans here from any device (PDF or pictures)
//                                     /스캔함/가져온 스캔
//                                     /작업대 데이터/<docId>.json   one file per library document (meta, ink, memos, text…)
//                                     /작업대 데이터/파일/<assetId> originals, recordings, pictures
(()=>{
const CLIENT_ID='502702795476-0p5hgtuqsll1p7o6pm8e4650el2qu4ge.apps.googleusercontent.com';
const SCOPE='https://www.googleapis.com/auth/drive';
const API='https://www.googleapis.com/drive/v3', UP='https://www.googleapis.com/upload/drive/v3';
const BASE='data/users/me/';
const ls={ get(k,d){ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v); }catch{ return d; } }, set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch{} } };
const ss={ get(k){ try{ return JSON.parse(sessionStorage.getItem(k)||'null'); }catch{ return null; } }, set(k,v){ try{ sessionStorage.setItem(k,JSON.stringify(v)); }catch{} } };
const S={ token:null, exp:0, folders:null, busy:false, last:ls.get('desk.drive.last',0), err:null, inbox:[], listeners:new Set(), email:ls.get('desk.drive.email','') };
const emit=()=>S.listeners.forEach(f=>{ try{ f(); }catch{} });
const on=()=>!!ls.get('desk.drive.on',false);

/* ---------- sign-in (Google Identity Services token client) ---------- */
let gisP=null;
function loadGis(){ if(window.google?.accounts?.oauth2) return Promise.resolve(); if(!gisP) gisP=new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='https://accounts.google.com/gsi/client'; s.async=true; s.onload=()=>res(); s.onerror=()=>{ gisP=null; rej(new Error('구글 로그인 도구를 불러오지 못했습니다')); }; document.head.append(s); }); return gisP; }
function tokenOk(){ if(S.token && Date.now()<S.exp-60000) return true; const t=ls.get('desk.drive.tok',null); if(t && Date.now()<t.exp-60000){ S.token=t.token; S.exp=t.exp; return true; } return false; }
// interactive: must run from a tap (it opens Google's window)
let signing=null;   // one Google window at a time, even if two taps ask
function signIn(){ if(!signing) signing=signIn1().finally(()=>{ signing=null; }); return signing; }
async function signIn1(){
  await loadGis();
  return new Promise((res,rej)=>{
    const tc=google.accounts.oauth2.initTokenClient({ client_id:CLIENT_ID, scope:SCOPE, prompt:on()?'':'consent',
      callback:r=>{ if(r.error){ rej(new Error(r.error)); return; } S.token=r.access_token; S.exp=Date.now()+(+r.expires_in||3600)*1000; ls.set('desk.drive.tok',{token:S.token,exp:S.exp}); ls.set('desk.drive.on',true); S.err=null; res(S.token); },
      error_callback:e=>rej(new Error(e?.type==='popup_closed'?'로그인 창이 닫혔습니다':'구글 로그인에 실패했습니다')) });
    tc.requestAccessToken();
  });
}
async function api(method,url,body,headers){
  if(!tokenOk()) throw Object.assign(new Error('auth'),{code:'auth'});
  const r=await fetch(url,{method,headers:{Authorization:'Bearer '+S.token,...(headers||{})},body});
  if(r.status===401){ S.token=null; ls.set('desk.drive.tok',null); throw Object.assign(new Error('auth'),{code:'auth'}); }
  if(!r.ok){ let t=''; try{ t=await r.text(); }catch{} throw new Error(`드라이브 오류 ${r.status} ${t.slice(0,160)}`); }
  return r;
}
const J=async r=>r.json();
const qe=s=>encodeURIComponent(s);
const esc=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");

/* ---------- folders ---------- */
async function folder(name,parent){
  const q=`name='${esc(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parent}' in parents`;
  const r=await J(await api('GET',`${API}/files?q=${qe(q)}&fields=files(id)&pageSize=10`));
  if(r.files?.length) return r.files[0].id;
  const c=await J(await api('POST',`${API}/files?fields=id`,JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parent]}),{'Content-Type':'application/json'}));
  return c.id;
}
async function folders(){
  if(S.folders) return S.folders;
  const saved=ls.get('desk.drive.folders',null);
  if(saved){ try{ await api('GET',`${API}/files/${saved.root}?fields=id,trashed`).then(J).then(f=>{ if(f.trashed) throw 0; }); S.folders=saved; return saved; }catch(e){ if(e?.code==='auth') throw e; } }
  const root=await folder('문서 작업대','root'); const inbox=await folder('스캔함',root); const done=await folder('가져온 스캔',inbox); const data=await folder('작업대 데이터',root); const files=await folder('파일',data);
  S.folders={root,inbox,done,data,files}; ls.set('desk.drive.folders',S.folders); return S.folders;
}
async function listAll(q,fields){ let out=[], pt=''; do{ const r=await J(await api('GET',`${API}/files?q=${qe(q)}&fields=nextPageToken,files(${fields})&pageSize=1000${pt?'&pageToken='+qe(pt):''}`)); out=out.concat(r.files||[]); pt=r.nextPageToken; }while(pt); return out; }
// create or replace a file's content (resumable upload works for any size)
async function put(fileId, meta, blob){
  const init=await api(fileId?'PATCH':'POST', fileId?`${UP}/files/${fileId}?uploadType=resumable`:`${UP}/files?uploadType=resumable`, JSON.stringify(meta), {'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':blob.type||'application/octet-stream'});
  const loc=init.headers.get('Location'); if(!loc) throw new Error('업로드 주소를 받지 못했습니다');
  const r=await fetch(loc,{method:'PUT',body:blob}); if(!r.ok) throw new Error('업로드 실패 '+r.status);
  return (await r.json()).id;
}
const download=id=>api('GET',`${API}/files/${id}?alt=media`).then(r=>r.blob());

/* ---------- library documents ---------- */
const assetRe=/(?:"|_blob\/)(a[0-9a-z]{10,16})(?=["\\/?#\s]|$)/g;
function assetsIn(obj){ const s=JSON.stringify(obj); const out=new Set(); let m; assetRe.lastIndex=0; while((m=assetRe.exec(s))) out.add(m[1]); return [...out]; }
const busyIds=()=>{ try{ return window.deskBusyIds?.()||[]; }catch{ return []; } };
async function pushBlobs(ids,F){
  const map=ls.get('desk.drive.blobs',{});
  for(const id of ids){ if(map[id]) continue; const b=await DESK.raw.getBlob(id); if(!b) continue;
    const fid=await put(null,{name:id,parents:[F.files],appProperties:{asset:id}},b); map[id]=fid; ls.set('desk.drive.blobs',map); }
}
async function blobFileId(id,F){
  const map=ls.get('desk.drive.blobs',{}); if(map[id]) return map[id];
  const r=await listAll(`'${F.files}' in parents and name='${esc(id)}' and trashed=false`,'id'); if(!r.length) return null;
  map[id]=r[0].id; ls.set('desk.drive.blobs',map); return r[0].id;
}
async function fetchBlob(id){
  if(!on()||!tokenOk()) return null; const F=await folders(); const fid=await blobFileId(id,F); if(!fid) return null;
  const b=await download(fid); await DESK.raw.putBlob(id,b); return b;
}
async function sync(){
  if(S.busy||!on()) return; if(!tokenOk()){ S.err='auth'; emit(); return; }
  S.busy=true; S.err=null; emit(); let pulled=0, pushed=0;
  try{
    const F=await folders();
    const known=ls.get('desk.drive.known',{}), remoteIds=ls.get('desk.drive.rid',{});
    // 1) what is on Drive
    const files=await listAll(`'${F.data}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,'id,name,appProperties');
    const remote={}; for(const f of files){ const id=f.appProperties?.deskId; if(!id) continue; remote[id]={fid:f.id, upd:+f.appProperties.updatedAt||0, del:f.appProperties.deleted==='1'}; remoteIds[id]=f.id; }
    const dirty=DESK.raw.loadDirty(); const busy=new Set(busyIds());
    // 2) bring newer documents here (unless this device changed them later, or one is open right now)
    const wantBlobs=new Set();
    for(const [id,r] of Object.entries(remote)){
      if(r.upd<=(known[id]||0)) continue; if(dirty[id] && dirty[id]>r.upd) continue; if(busy.has(id)) continue;
      const doc=JSON.parse(await (await download(r.fid)).text());
      window.DESK_SYNC_APPLYING=true;
      try{ await DESK.raw.replace(BASE+id, doc.deleted?{}:doc.entries); } finally{ window.DESK_SYNC_APPLYING=false; }
      known[id]=r.upd; pulled++;
      if(!doc.deleted) for(const a of assetsIn(doc.entries)) wantBlobs.add(a);
    }
    { const d=DESK.raw.loadDirty(); for(const k of Object.keys(d)) if(known[k] && known[k]>=d[k]) delete d[k]; DESK.raw.saveDirty(d); } // replaced by a newer copy from Drive
    // 3) send this device's changes
    const d2=DESK.raw.loadDirty();
    for(const [id,t] of Object.entries(d2)){
      if(busy.has(id) && Date.now()-t<4000) continue; // let a save in progress settle
      const entries=await DESK.raw.entries(BASE+id); const deleted=!Object.keys(entries).length;
      if(deleted && !remote[id]){ delete d2[id]; continue; }
      if(!deleted) await pushBlobs(assetsIn(entries),F);
      const body=new Blob([JSON.stringify({v:1,id,updatedAt:t,deleted,entries:deleted?{}:entries})],{type:'application/json'});
      const meta={name:id+'.json',appProperties:{deskId:id,updatedAt:String(t),deleted:deleted?'1':'0'}}; if(!remote[id]) meta.parents=[F.data];
      const fid=await put(remote[id]?.fid||null,meta,body); remoteIds[id]=fid; known[id]=t; pushed++;
      const cur=DESK.raw.loadDirty(); if(cur[id]===t){ delete cur[id]; DESK.raw.saveDirty(cur); }
    }
    ls.set('desk.drive.known',known); ls.set('desk.drive.rid',remoteIds);
    // 4) scans waiting in the inbox
    S.inbox=(await listAll(`'${F.inbox}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,'id,name,mimeType,size,modifiedTime')).filter(inboxKind);
    S.inbox.sort((a,b)=>(b.modifiedTime||'').localeCompare(a.modifiedTime||''));
    S.last=Date.now(); ls.set('desk.drive.last',S.last);
    if(pulled) await window.deskReload?.();
    emit();
    // originals for documents that just arrived, in the background
    for(const a of wantBlobs){ try{ if(!(await DESK.raw.getBlob(a))) await fetchBlob(a); }catch(e){ console.warn('blob',a,e); } }
  }catch(e){ console.warn('sync',e); S.err=e?.code==='auth'?'auth':(e?.message||'동기화 실패'); }
  finally{ S.busy=false; emit(); }
  return {pulled,pushed};
}
// what can come in through the inbox: PDFs, pictures, office files, and Google's own docs/slides/sheets (exported)
const GEXP={'application/vnd.google-apps.document':['application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx'],
  'application/vnd.google-apps.presentation':['application/vnd.openxmlformats-officedocument.presentationml.presentation','pptx'],
  'application/vnd.google-apps.spreadsheet':['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','xlsx']};
const OFFICE=/\.(docx|hwpx|hwp|pptx|xlsx|xlsm|csv|txt|md)$/i;
function inboxKind(f){ if(f.mimeType==='application/pdf'||/\.pdf$/i.test(f.name)) return 'pdf'; if((f.mimeType||'').startsWith('image/')) return 'img'; if(GEXP[f.mimeType]) return GEXP[f.mimeType][1]; const m=f.name.match(OFFICE); return m?m[1].toLowerCase():null; }
async function fetchInboxFile(f){
  const g=GEXP[f.mimeType];
  if(g){ const b=await api('GET',`${API}/files/${f.id}/export?mimeType=${encodeURIComponent(g[0])}`).then(r=>r.blob()); const name=/\.[a-z]+$/i.test(f.name)&&f.name.toLowerCase().endsWith('.'+g[1])?f.name:f.name+'.'+g[1]; return new File([b],name,{type:g[0]}); }
  return new File([await download(f.id)],f.name,{type:f.mimeType||''});
}
// take scans from the inbox: documents open as they are, pictures are bundled into one PDF
async function importInbox(ids){
  if(S.importing) return; S.importing=true; emit();
  try{ await importInboxNow(ids); } finally{ S.importing=false; emit(); }
}
async function importInboxNow(ids){
  const F=await folders(); const pick=S.inbox.filter(f=>ids.includes(f.id)); if(!pick.length) return;
  const imgs=pick.filter(f=>inboxKind(f)==='img'), docs=pick.filter(f=>inboxKind(f)!=='img');
  const move=f=>api('PATCH',`${API}/files/${f.id}?addParents=${F.done}&removeParents=${F.inbox}&fields=id`,'{}',{'Content-Type':'application/json'}).catch(e=>console.warn('move',e));
  for(const f of docs){ const file=await fetchInboxFile(f); await window.deskOpenFile(inboxKind(f)==='pdf'?new File([file],file.name,{type:'application/pdf'}):file); await move(f); }
  if(imgs.length){ const fl=[]; for(const f of imgs) fl.push(new File([await download(f.id)],f.name,{type:f.mimeType})); await window.deskBundle(fl); for(const f of imgs) await move(f); }
  S.inbox=S.inbox.filter(f=>!ids.includes(f.id)); emit();
}
// first connection on this device: everything already here goes up too
async function seed(){ if(ls.get('desk.drive.seeded',false)) return; try{ const snap=await DESK.db.collection('data/users/me').get(); const d=DESK.raw.loadDirty(); const t=Date.now(); for(const x of snap.docs) if(!d[x.id]) d[x.id]=t; DESK.raw.saveDirty(d); ls.set('desk.drive.seeded',true); }catch(e){ console.warn('seed',e); } }
async function connect(){ await signIn(); await seed(); try{ const u=await J(await api('GET',`${API}/about?fields=user(emailAddress)`)); S.email=u.user?.emailAddress||''; ls.set('desk.drive.email',S.email); }catch{} emit(); await sync(); }
function disconnect(){ try{ if(S.token) google?.accounts?.oauth2?.revoke?.(S.token,()=>{}); }catch{} S.token=null; ls.set('desk.drive.tok',null); ls.set('desk.drive.on',false); ls.set('desk.drive.folders',null); ls.set('desk.drive.seeded',false); S.folders=null; S.inbox=[]; emit(); }

// Google's login lasts an hour and a new one can only be asked for from a tap.
// So when it has run out (or is about to), the next tap anywhere quietly renews it and syncs —
// the person no longer has to notice the warning line and press it.
let renewAt=0;
document.addEventListener('click',()=>{
  if(!on() || Date.now()-renewAt<60000) return;
  const ok=tokenOk(); if(ok && S.exp-Date.now()>10*60000) return;
  if(!window.google?.accounts?.oauth2){ loadGis().catch(()=>{}); return; }   // not loaded yet: the tap after this one will do it
  renewAt=Date.now();
  signIn().then(()=>{ S.err=null; emit(); if(!ok) window.deskToast?.('구글 드라이브와 다시 연결해서 맞추는 중이에요',3000); sync(); }).catch(()=>{ if(!tokenOk()){ S.err='auth'; emit(); } });
},true);
// have Google's login script ready so the renewing tap can open it straight away
window.addEventListener('load',()=>{ if(on()) loadGis().catch(()=>{}); });
window.DRIVE={ connect, disconnect, sync, importInbox, fetchBlob, kindOf:inboxKind, state:S, isOn:on, tokenOk, onChange(f){ S.listeners.add(f); return ()=>S.listeners.delete(f); },
  reconnect:()=>signIn().then(()=>sync()) };
// keep in step: shortly after changes, every couple of minutes, and when the app comes back to the front
let dT=null; window.addEventListener('desk-dirty',()=>{ if(!on()||!tokenOk()) return; clearTimeout(dT); dT=setTimeout(sync,4000); });
// every 30 seconds on the home screen, every 90 seconds while a document is open
let lastAuto=0; setInterval(()=>{ if(!on()||!tokenOk()||document.hidden) return; const home=!document.getElementById('home')?.hidden; if(Date.now()-lastAuto < (home?30000:90000)) return; lastAuto=Date.now(); sync(); },5000);
// coming back to the home screen (closing a document) checks right away
window.addEventListener('load',()=>{ const h=document.getElementById('home'); if(!h) return; new MutationObserver(()=>{ if(!h.hidden && on() && tokenOk()){ lastAuto=Date.now(); setTimeout(sync,600); } }).observe(h,{attributes:true,attributeFilter:['hidden']}); });
document.addEventListener('visibilitychange',()=>{ if(on()&&tokenOk()) sync(); });
window.addEventListener('load',()=>setTimeout(()=>{ if(on()) { if(tokenOk()) sync(); else { S.err='auth'; emit(); } } },1500));
})();

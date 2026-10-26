// 문서 작업대 — GitHub Pages platform layer.
// Replaces the Claude artifact capabilities (db, assets, user) with storage inside this device (IndexedDB).
(()=>{
const DBN='deskapp', VER=1;
let dbp=null;
function idb(){
  if(dbp) return dbp;
  dbp=new Promise((res,rej)=>{
    const r=indexedDB.open(DBN,VER);
    r.onupgradeneeded=()=>{ const d=r.result; if(!d.objectStoreNames.contains('docs')) d.createObjectStore('docs'); if(!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs'); };
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn){
  const d=await idb();
  return new Promise((res,rej)=>{ const t=d.transaction(store,mode); const s=t.objectStore(store); let out; const r=fn(s); if(r) r.onsuccess=()=>{ out=r.result; }; t.oncomplete=()=>res(out); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error); });
}
const clone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));
const snap=(id,data)=>({id, exists:data!==undefined, data:()=>clone(data), metadata:{}});

function coll(path, filters=[], lim=1e9){
  return {
    path,
    where(f,op,v){ return coll(path,[...filters,[f,op,v]],lim); },
    limit(n){ return coll(path,filters,n); },
    orderBy(){ return this; },
    doc(id){ return docr(path+'/'+(id||rid())); },
    async add(d){ const r=docr(path+'/'+rid()); await r.set(d); return r; },
    async get(){
      const pre=path+'/'; const rows=[];
      await tx('docs','readonly',s=>{ const c=s.openCursor(IDBKeyRange.bound(pre, pre+'￿')); c.onsuccess=()=>{ const cur=c.result; if(!cur) return; const k=cur.key.slice(pre.length); if(!k.includes('/')) rows.push([k,cur.value]); cur.continue(); }; return null; });
      const ok=v=>filters.every(([f,op,val])=>{ const x=v?.[f]; if(op==='=='||op==='===') return x===val; if(op==='in') return val.includes(x); if(op==='!=') return x!==val; if(op==='<') return x<val; if(op==='<=') return x<=val; if(op==='>') return x>val; if(op==='>=') return x>=val; return true; });
      const docs=rows.filter(([,v])=>ok(v)).slice(0,lim).map(([k,v])=>snap(k,v));
      return {docs, size:docs.length, empty:!docs.length};
    }
  };
}
// which library documents changed since the last Drive sync (doc id = 4th path part: data/users/me/<id>/...)
const DIRTY_KEY='desk.sync.dirty';
function loadDirty(){ try{ return JSON.parse(localStorage.getItem(DIRTY_KEY)||'{}'); }catch{ return {}; } }
function markDirty(path){ if(window.DESK_SYNC_APPLYING) return; const p=path.split('/'); if(p[0]!=='data'||p[1]!=='users'||p.length<4) return; const d=loadDirty(); d[p[3]]=Date.now(); try{ localStorage.setItem(DIRTY_KEY,JSON.stringify(d)); }catch{} window.dispatchEvent(new Event('desk-dirty')); }
function docr(path){
  return {
    path, id:path.split('/').pop(),
    async get(){ const v=await tx('docs','readonly',s=>s.get(path)); return snap(this.id,v); },
    async set(d,opt){ let v=clone(d); if(opt?.merge){ const old=await tx('docs','readonly',s=>s.get(path)); v={...(old||{}),...v}; } await tx('docs','readwrite',s=>s.put(v,path)); markDirty(path); },
    async update(d){ const old=await tx('docs','readonly',s=>s.get(path)); if(old===undefined) throw {code:'not_found'}; await tx('docs','readwrite',s=>s.put({...old,...clone(d)},path)); markDirty(path); },
    async delete(){
      // remove the doc and everything nested under it
      await tx('docs','readwrite',s=>{ s.delete(path); const pre=path+'/'; s.delete(IDBKeyRange.bound(pre, pre+'￿')); return null; }); markDirty(path);
    },
    collection(c){ return coll(path+'/'+c); }
  };
}
function rid(){ return Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4); }

const db={ doc:docr, collection:p=>coll(p) };
const assets={
  async upload(blob,opt){ const id='a'+rid(); const b=opt?.type&&blob.type!==opt.type?new Blob([blob],{type:opt.type}):blob; await tx('blobs','readwrite',s=>s.put(b,id)); return {id, url:'./_blob/'+id, sizeBytes:b.size, contentType:b.type}; },
  async delete(id){ await tx('blobs','readwrite',s=>s.delete(id)); },
  async list(){ let usage={}; try{ const e=await navigator.storage.estimate(); usage={bytes:e.usage||0, maxBytes:e.quota||0}; }catch{} return {assets:[], usage}; },
  async getBlob(id){ return tx('blobs','readonly',s=>s.get(id)); }
};
const user={ async id(){ return 'me'; } };
// raw access for the Drive sync
const raw={
  async entries(base){ const out={}; await tx('docs','readonly',s=>{ const c=s.openCursor(IDBKeyRange.bound(base, base+'/￿')); c.onsuccess=()=>{ const cur=c.result; if(!cur) return; if(cur.key===base||cur.key.startsWith(base+'/')) out[cur.key.slice(base.length)]=cur.value; cur.continue(); }; return null; }); return out; },
  async replace(base, map){ await tx('docs','readwrite',s=>{ s.delete(base); s.delete(IDBKeyRange.bound(base+'/', base+'/￿')); for(const [k,v] of Object.entries(map||{})) s.put(v, base+k); return null; }); },
  async hasBlob(id){ return !!(await tx('blobs','readonly',s=>s.getKey?s.getKey(id):s.get(id))); },
  async putBlob(id,b){ await tx('blobs','readwrite',s=>s.put(b,id)); },
  getBlob:id=>assets.getBlob(id),
  loadDirty, saveDirty(d){ try{ localStorage.setItem(DIRTY_KEY,JSON.stringify(d)); }catch{} }
};
window.DESK={ idb, assets, db, raw };
window.claude={ use: async n=>n==='sample'?(window.DESK_AI?.hasKey()?window.DESK_AI.sample:null):(({db,assets,user})[n]??null) };

// stored files are addressed as "_blob/<id>"; answer those from this device even before the service worker runs
const of=window.fetch.bind(window);
window.fetch=async(u,...r)=>{
  const s=typeof u==='string'?u:(u?.url||'');
  const m=s.match(/(?:^|\/)_blob\/([\w-]+)$/);
  if(m){ let b=await assets.getBlob(m[1]); if(!b && window.DRIVE?.fetchBlob){ try{ b=await window.DRIVE.fetchBlob(m[1]); }catch(e){ console.warn('drive blob',e); } } if(!b) return new Response('not found',{status:404}); return new Response(b,{headers:{'content-type':b.type||'application/octet-stream'}}); }
  return of(u,...r);
};
// ask the browser not to clear this storage on its own
try{ navigator.storage?.persist?.(); }catch{}
if('serviceWorker' in navigator) addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('sw',e)));
})();

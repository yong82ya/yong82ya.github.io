// 문서 작업대 service worker: serves stored files (_blob/<id>) from this device and keeps the app usable offline.
const CACHE='desk-v3';
const CDN=/^https:\/\/(cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com)\//;
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','./index.html','./manifest.webmanifest','./icon.png']).catch(()=>{}))); });
self.addEventListener('activate',e=>{ e.waitUntil((async()=>{ for(const k of await caches.keys()) if(k!==CACHE) await caches.delete(k); await self.clients.claim(); })()); });

function idb(){ return new Promise((res,rej)=>{ const r=indexedDB.open('deskapp',1); r.onupgradeneeded=()=>{ const d=r.result; if(!d.objectStoreNames.contains('docs')) d.createObjectStore('docs'); if(!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs'); }; r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function blobRes(id){
  const d=await idb();
  const b=await new Promise((res,rej)=>{ const q=d.transaction('blobs').objectStore('blobs').get(id); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); });
  return b ? new Response(b,{headers:{'content-type':b.type||'application/octet-stream'}}) : new Response('not found',{status:404});
}
// shared from the phone's share menu: keep it, then open the app to pick it up
async function takeShare(req){
  try{ const f=await req.formData(); const v={title:f.get('title')||'',text:f.get('text')||'',url:f.get('url')||'',files:f.getAll('files').filter(x=>x&&typeof x==='object'),at:Date.now()};
    const d=await idb(); await new Promise((res,rej)=>{ const t=d.transaction('blobs','readwrite'); t.objectStore('blobs').put(v,'share:pending'); t.oncomplete=res; t.onerror=()=>rej(t.error); }); }catch(e){}
  return Response.redirect('./?share=1',303);
}
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method==='POST' && new URL(req.url).pathname.endsWith('/share-target')){ e.respondWith(takeShare(req)); return; }
  if(req.method!=='GET') return;
  const u=new URL(req.url);
  const m=u.origin===location.origin && u.pathname.match(/\/_blob\/([\w-]+)$/);
  if(m){ e.respondWith(blobRes(m[1])); return; }
  if(u.origin===location.origin){
    // the app itself: newest from the network, cached copy when offline
    e.respondWith((req.mode==='navigate'?fetch(req.url,{cache:'no-store',credentials:'same-origin'}):fetch(req,{cache:'no-cache'})).then(r=>{ if(r.ok){ const c=r.clone(); caches.open(CACHE).then(x=>x.put(req,c)); } return r; }).catch(()=>caches.match(req,{ignoreSearch:true}).then(r=>r||caches.match('./index.html'))));
    return;
  }
  if(CDN.test(req.url)){
    // libraries never change at a fixed version: cache first
    e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{ if(r.ok||r.type==='opaque'){ const c=r.clone(); caches.open(CACHE).then(x=>x.put(req,c)); } return r; })));
  }
});

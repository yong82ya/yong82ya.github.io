#!/usr/bin/env python3
# Build the GitHub Pages copy of 문서 작업대 from the artifact source (site/index.html).
import re, pathlib, shutil
ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT.parent / 'site' / 'index.html'
OUT = ROOT / 'desk'
OUT.mkdir(exist_ok=True)
h = SRC.read_text(encoding='utf-8')
PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/legacy/build/'
PDFJS_ROOT = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/'
PDFLIB = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'
CLAUDE_URL = 'https://claude.ai/artifact/11Yd9qdJcCkHJpmH19voWZ'

def rep(old, new, count=1):
    global h
    n = h.count(old)
    assert n == count, f'expected {count} of {old[:70]!r}, found {n}'
    h = h.replace(old, new)

# ---- head: platform layer, manifest, icons
rep('<script type="module">',
    '<script>' + (ROOT/'src'/'platform.js').read_text(encoding='utf-8') + '</script>\n<script type="module">')
rep('<title>문서 작업대</title>', '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>문서 작업대</title>\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icon.png">\n<link rel="icon" href="icon.png">\n<meta name="theme-color" content="#7C5CE0">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-title" content="문서 작업대">')
rep('</style>', '</style>\n</head>\n<body>', 1)
h = h + '\n</body>\n</html>\n'

# ---- libraries from the CDN (one file to upload instead of 190)
rep("const LIB = new URL('lib/', location.href).href;", f"const LIB = '{PDFJS}';")
rep("cMapUrl: LIB+'cmaps/', cMapPacked:true, standardFontDataUrl: LIB+'standard_fonts/', wasmUrl: LIB+'wasm/', BinaryDataFactory: B64Factory, useWorkerFetch:false,",
    f"cMapUrl: '{PDFJS_ROOT}cmaps/', cMapPacked:true, standardFontDataUrl: '{PDFJS_ROOT}standard_fonts/', wasmUrl: '{PDFJS_ROOT}wasm/',")
rep("s.src=LIB+'pdf-lib.min.js';", f"s.src='{PDFLIB}';")

# ---- stored files live at ./_blob/<id> (served from this device)
h = h.replace("'/_blob/'", "'./_blob/'")
rep(r"|\/_blob\/|blob:)/i.test(a.value)", r"|\/_blob\/|\.\/_blob\/|blob:)/i.test(a.value)")

# ---- wording: storage is on this device; AI lives in the Claude copy
rep("txt.textContent='보관함 연결됨 · 필기는 자동 저장되고 다른 기기에서도 이어집니다';",
    "txt.textContent='이 기기에 자동 저장됩니다 · 브라우저 데이터를 지우면 함께 지워지니 중요한 필기는 PDF로도 남겨 두세요';")
rep("""$('#sumOut').innerHTML='<p class="ai-hint">이 화면에서는 AI를 쓸 수 없습니다.</p>';""", "noAiHint();")
# documents: show the same hint when the AI panel opens here
rep("loadSums(); getSample(); } };", "loadSums(); getSample().then(s=>{ if(!s) noAiHint(); }); } };")
# no AI on this copy: hand the text over to the Claude copy in one tap
rep("/* ================= boot ================= */", f"""function noAiHint(){{
  const o=$('#sumOut'); o.innerHTML='<p class="ai-hint">이 앱에서 AI를 쓰려면 <b>제미나이 무료 키</b>를 연결하세요. 아니면 글을 복사해서 클로드 버전에서 요약할 수 있어요.</p>'; const g=el('button','btn btn-primary','제미나이 연결하기'); g.style.cssText='margin:8px 8px 0 0'; g.onclick=()=>openAiPanel(); o.append(g);
  const b=el('button','btn btn-ghost',(matchMedia('(display-mode: standalone)').matches||navigator.standalone)?'글 복사하기':'글 복사하고 클로드 버전 열기'); b.style.marginTop='8px'; b.onclick=copyToClaude; o.append(b);
}}
async function copyToClaude(){{
  let ok=false;
  try{{ let text='';
    if(AI.src==='doc') text=docSegs().map(s=>s.text).join('\\n');
    else {{ const parts=[]; for(let i=1;i<=V.n;i++){{ const t=await pageText(i); if(t) parts.push(t); }} text=parts.join('\\n\\n'); }}
    text=((AI.src==='doc'?ED.meta?.name:document.querySelector('#docTitle')?.textContent)||'')+'\\n\\n'+text.trim();
    await navigator.clipboard.writeText(text); ok=true; toast('글을 복사했습니다. 클로드 버전의 새 문서에 붙여넣으세요',5000);
  }}catch(e){{ console.warn(e); toast('복사하지 못했습니다. 문서 글을 직접 선택해서 복사해 주세요',4500); }}
  const appMode=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
  if(ok && appMode){{ toast('글을 복사했습니다 · Claude 앱이나 사파리에서 클로드 버전 문서 작업대를 열고, 새 문서에 붙여넣은 뒤 AI → 강의 녹음 정리를 누르세요',9000); return; }}
  if(ok){{ const w=window.open('{CLAUDE_URL}','_blank'); if(!w) setTimeout(()=>location.href='{CLAUDE_URL}',1200); }}
}}
/* ================= boot ================= */""")
h = h.replace("toast('이 화면에서는 AI를 쓸 수 없습니다')", "toast('설정 → AI 연결에서 제미나이 무료 키를 넣으면 이 앱에서도 AI가 됩니다',4000)")

rep('보관함에 넣어 둔 문서는 노트북, 데스크탑, 아이패드 어디서 열어도 이어집니다.', '여기서 바로 녹음하면 필기와 함께 다시 볼 수 있고, 내보낸 파일은 바로 공유할 수 있습니다.')

# ---- saving files: share sheet when the device has one, else a normal download
rep("""async function offerFile(name,blob){
  if(cap.downloads){""", """async function offerFile(name,blob){
  const file=new File([blob],name,{type:blob.type||'application/octet-stream'});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    const how=await sheet('파일 내보내기', name, [{label:'취소',value:null},{label:'기기에 저장',value:'save'},{label:'공유하기',value:'share',cls:'btn-primary'}]);
    if(!how) return;
    if(how==='share'){ try{ await navigator.share({files:[file],title:name}); }catch(e){ if(e?.name!=='AbortError') toast('공유하지 못했습니다. 기기에 저장으로 다시 해 주세요.',3500); } return; }
  }
  if(cap.downloads){""")

# ---- recording inside the app
rep('<button class="ib" id="recBtn"', '<button class="ib rec-live" id="micBtn" hidden title="녹음 중 · 눌러서 멈추기"><span class="rdot"></span><span id="micT">0:00</span></button>\n    <button class="ib" id="recBtn"')
rep('.ib[aria-pressed="true"]{', '.rec-live{color:var(--danger);font-variant-numeric:tabular-nums;font-weight:600}.rec-live .rdot{width:10px;height:10px;border-radius:50%;background:var(--danger);animation:rblink 1.2s infinite}@keyframes rblink{50%{opacity:.25}}\n.ib[aria-pressed="true"]{')
rep("""const intro=el('p',null,'수업은 휴대폰이나 아이패드 녹음 앱으로 녹음하세요. 끝나고 그 파일을 불러오면 필기한 시각에 맞춰 함께 재생됩니다.');""",
    """const intro=el('p',null,MIC.ok()?'여기서 바로 녹음하면 필기한 시각에 맞춰 함께 재생됩니다. 다른 녹음 앱으로 녹음한 파일도 불러올 수 있습니다.':'수업은 휴대폰이나 아이패드 녹음 앱으로 녹음하세요. 끝나고 그 파일을 불러오면 필기한 시각에 맞춰 함께 재생됩니다.');""")
rep("""  acts.append(inp,close,lab); scrim.hidden=false;
}""", """  acts.append(inp,close,lab);
  if(MIC.ok()){ lab.className='btn btn-ghost'; const go=el('button','btn btn-primary',MIC.rec?'녹음 멈추기':'지금 녹음 시작'); go.onclick=()=>{ scrim.hidden=true; MIC.rec?MIC.stop():MIC.start(); }; acts.append(go); }
  scrim.hidden=false;
}""")
rep("""async function addRecording(file){
  const url=URL.createObjectURL(file); let dur;""", """async function addRecording(file, knownStart){
  const url=URL.createObjectURL(file); let dur;""")
rep("const g=guessStart(file.name, file.lastModified, dur);",
    "const g=knownStart?{start:knownStart,src:'앱에서 녹음'}:guessStart(file.name, file.lastModified, dur);")
rep("""async function recUrl(r){""", r"""// in-app recorder (works where the page may use the microphone: this site, not inside Claude)
const MIC={rec:null, chunks:[], t0:0, t:null, wake:null, stream:null, docId:null,
  ok(){ return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder); },
  type(){ for(const t of ['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus']) if(MediaRecorder.isTypeSupported?.(t)) return t; return ''; },
  async start(){
    if(!V.meta){ toast('문서를 연 상태에서 녹음해 주세요'); return; }
    try{ MIC.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}); }
    catch(e){ toast(e?.name==='NotAllowedError'?'마이크 사용을 허락해 주세요. 주소창 왼쪽 자물쇠에서 바꿀 수 있습니다.':'마이크를 찾지 못했습니다',4500); return; }
    const type=MIC.type(); MIC.chunks=[];
    MIC.rec=new MediaRecorder(MIC.stream, type?{mimeType:type,audioBitsPerSecond:64000}:{audioBitsPerSecond:64000});
    MIC.rec.ondataavailable=e=>{ if(e.data?.size) MIC.chunks.push(e.data); };
    MIC.rec.onstop=()=>MIC.finish();
    MIC.rec.start(5000); MIC.t0=Date.now(); MIC.docId=V.meta.id;
    $('#micBtn').hidden=false; MIC.tick(); MIC.t=setInterval(MIC.tick,1000);
    try{ MIC.wake=await navigator.wakeLock?.request('screen'); }catch{}
    toast('녹음을 시작했습니다. 화면이 꺼지지 않게 해 두세요.',3000);
  },
  tick(){ $('#micT').textContent=fmtT((Date.now()-MIC.t0)/1000); },
  stop(){ if(MIC.rec && MIC.rec.state!=='inactive') MIC.rec.stop(); },
  async finish(){
    clearInterval(MIC.t); $('#micBtn').hidden=true; try{ MIC.wake?.release(); }catch{} MIC.wake=null;
    MIC.stream?.getTracks().forEach(t=>t.stop());
    const type=(MIC.rec.mimeType||'audio/webm').split(';')[0]; const ext=/mp4/.test(type)?'m4a':/ogg/.test(type)?'ogg':'webm';
    const d=new Date(MIC.t0), p=n=>String(n).padStart(2,'0');
    const name=`녹음 ${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}.${ext}`;
    const file=new File(MIC.chunks,name,{type,lastModified:Date.now()}); const start=MIC.t0;
    MIC.rec=null; MIC.chunks=[];
    if(!file.size){ toast('녹음된 소리가 없습니다'); return; }
    if(V.meta?.id===MIC.docId) await addRecording(file,start);
    else toast('녹음을 시작한 문서가 닫혀 있어 저장하지 못했습니다',4000);
  }
};
$('#micBtn').onclick=()=>MIC.stop();
addEventListener('beforeunload',e=>{ if(MIC.rec){ e.preventDefault(); e.returnValue=''; } });
async function recUrl(r){""")
# leaving the document stops and keeps the recording first
rep("""$('#backBtn').onclick=async()=>{
  if(editing) commitText();""", """$('#backBtn').onclick=async()=>{
  if(MIC.rec){ const done=new Promise(r=>{ const o=MIC.finish; MIC.finish=async()=>{ MIC.finish=o; await o(); r(); }; }); MIC.stop(); await done; }
  if(editing) commitText();""")


# ---- this device holds files whole (no 20MB limit), and low-memory computers render lighter
rep("const MAX_ASSET = 20*1024*1024;", "const MAX_ASSET = 4*1024*1024*1024;")
rep("const IS_TABLET = navigator.maxTouchPoints>1 && /Mac|iPad|Android/.test(navigator.userAgent);",
    "const IS_TABLET = navigator.maxTouchPoints>1 && /Mac|iPad|Android/.test(navigator.userAgent);\nconst LOW_MEM = IS_TABLET || (navigator.deviceMemory||8)<=4;")
rep("maxImageSize: IS_TABLET ? 6e7 : -1,", "maxImageSize: LOW_MEM ? 4e7 : -1,")
rep("const max=IS_TABLET?3.5e6:6e6;", "const max=LOW_MEM?3e6:6e6;")

# ---- Google Drive sync (this copy only)
rep("<script type=\"module\">", "<script>" + (ROOT/'src'/'drive.js').read_text(encoding='utf-8') + "</script>\n<script type=\"module\">")
rep("<script type=\"module\">", "<script>" + (ROOT/'src'/'gemini.js').read_text(encoding='utf-8') + "</script>\n<script type=\"module\">")
import datetime
BUILD=(datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)+datetime.timedelta(hours=9)).strftime('%m-%d %H:%M')
rep("/* ================= boot ================= */", "const DESK_BUILD='"+BUILD+"';\n"+(ROOT/'src'/'ai-ui.js').read_text(encoding='utf-8') + "\n/* ================= boot ================= */")
rep("/* ================= boot ================= */", (ROOT/'src'/'drive-ui.js').read_text(encoding='utf-8') + "\n/* ================= boot ================= */")
rep("/* ================= boot ================= */", (ROOT/'src'/'share.js').read_text(encoding='utf-8') + "\n/* ================= boot ================= */")
rep("  await loadLibrary();\n})();", "  await loadLibrary();\n  deskShareIn();\n})();")
rep("  item('💾','저장 공간'", "  if(window.DRIVE) item('☁','구글 드라이브 동기화', !DRIVE.isOn()?'꺼짐 · 노트북·아이패드·폰을 이어 주고 스캔함을 받습니다':(DRIVE.state.err==='auth'?'다시 연결이 필요합니다':'켜짐 · '+agoText(DRIVE.state.last)), ()=>openDrivePanel());\n  item('✨','AI 연결 (제미나이)', DESK_AI.hasKey()?'켜짐 · 이 앱에서 요약과 질문이 됩니다':'꺼짐 · 무료 키를 넣으면 이 앱에서 바로 요약과 질문', ()=>openAiPanel());\n  item('💾','저장 공간'")
rep("  body.append(list,inp);\n", "  body.append(list,inp); body.append(Object.assign(el('p'),{textContent:'앱 버전 '+DESK_BUILD,style:'margin:10px 0 0;font-size:12px;color:var(--muted);text-align:right'}));\n")
rep('    <div class="drop" id="drop">', (ROOT/'src'/'inbox.html').read_text(encoding='utf-8') + '    <div class="drop" id="drop">')
rep("  setStoreLine(); whereTag();\n  loadDeco();", "  setStoreLine(); if(window.DRIVE) driveLine(); whereTag();\n  loadDeco();")
rep("function whereTag(){ const w=$('#whereTag'); if(!w) return; w.hidden=false; w.className='where'; w.replaceChildren('✦ Claude 버전', el('small',null,'· AI 요약 가능 · 보관함은 깃허브 버전과 따로예요')); }\n", "")

assert '/_blob/' not in h.replace('./_blob/','').replace(r'\/_blob\/','').replace(r'\.\/_blob\/',''), 'leftover absolute blob path'
(OUT/'index.html').write_text(h, encoding='utf-8')
shutil.copy(ROOT/'src'/'sw.js', OUT/'sw.js')
shutil.copy(ROOT/'src'/'manifest.webmanifest', OUT/'manifest.webmanifest')
shutil.copy(ROOT/'src'/'icon-192.png', OUT/'icon-192.png')
shutil.copy(ROOT/'src'/'icon.png', OUT/'icon.png')
print('built', OUT, len(h))

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SEED_FILE = path.join(__dirname, 'seed.json');
const DATA_DIR = process.env.MAGICSCANNER_DATA_DIR || __dirname;
const RUNTIME_FILE = path.join(DATA_DIR, 'runtime-store.json');
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();

function normId(v){
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
function matchKey(m){
  return normId(`${m?.home||''}-${m?.away||''}`) || normId(m?.id||'');
}
function blankStore(){ return {matchdays:{},details:{},deletedDates:{}}; }
function safeRead(file,fallback=blankStore()){
  try{
    if(!fs.existsSync(file)) return fallback;
    const x=JSON.parse(fs.readFileSync(file,'utf8')||'{}');
    return x&&typeof x==='object'?x:fallback;
  }catch(e){ console.error('Read error',file,e.message); return fallback; }
}
function readSeed(){
  const x=safeRead(SEED_FILE,{matchdays:{},details:{}});
  return {matchdays:x.matchdays||{},details:x.details||{}};
}
function readRuntime(){
  const x=safeRead(RUNTIME_FILE,blankStore());
  return {matchdays:x.matchdays||{},details:x.details||{},deletedDates:x.deletedDates||{}};
}
function writeRuntime(x){
  fs.mkdirSync(path.dirname(RUNTIME_FILE),{recursive:true});
  const tmp=RUNTIME_FILE+'.tmp';
  fs.writeFileSync(tmp,JSON.stringify(x,null,2));
  fs.renameSync(tmp,RUNTIME_FILE);
}
function mergeMatches(...lists){
  const map=new Map();
  for(const list of lists){
    for(const m of (Array.isArray(list)?list:[])){
      const k=matchKey(m); if(!k) continue;
      map.set(k,{...(map.get(k)||{}),...m});
    }
  }
  return [...map.values()];
}
function mergePack(a,b,date){
  if(!a&&!b) return null;
  return {...(a||{}),...(b||{}),date, matches:mergeMatches(a?.matches,b?.matches)};
}
function effectiveStore(){
  const seed=readSeed();
  const run=readRuntime();
  const matchdays={};
  const keys=new Set([...Object.keys(seed.matchdays||{}),...Object.keys(run.matchdays||{})]);
  for(const key of keys){
    if(run.deletedDates?.[key]) continue;
    const p=mergePack(seed.matchdays?.[key],run.matchdays?.[key],key);
    if(p) matchdays[key]=p;
  }
  return {matchdays,details:{...(seed.details||{}),...(run.details||{})}};
}
function requireAdmin(req,res,next){
  if(!ADMIN_TOKEN) return next();
  const token=String(req.get('x-admin-token')||'').trim();
  if(token!==ADMIN_TOKEN) return res.status(401).json({ok:false,error:'ADMIN_TOKEN non valido'});
  next();
}

app.disable('x-powered-by');
app.use(express.json({limit:'30mb'}));

app.get('/api/health',(req,res)=>{
  const s=effectiveStore();
  res.set('Cache-Control','no-store');
  res.json({ok:true,version:'3.3.1',storage:'seed+runtime',admin_token_required:!!ADMIN_TOKEN,
    matchdays:Object.keys(s.matchdays).length,
    counts:Object.fromEntries(Object.entries(s.matchdays).map(([k,p])=>[k,Array.isArray(p.matches)?p.matches.length:0])),
    details:Object.keys(s.details).length});
});
app.get('/api/matchdays',(req,res)=>{res.set('Cache-Control','no-store');res.json({ok:true,matchdays:effectiveStore().matchdays});});
app.get('/api/matchdays/:date',(req,res)=>{
  const p=effectiveStore().matchdays[req.params.date];
  if(!p) return res.status(404).json({ok:false,error:'Giornata non trovata'});
  res.set('Cache-Control','no-store');res.json({ok:true,matchday:p});
});
app.post('/api/matchdays/:date',requireAdmin,(req,res)=>{
  const key=String(req.params.date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key)) return res.status(400).json({ok:false,error:'Data non valida'});
  const pack=req.body&&typeof req.body==='object'?req.body:{};
  if(!Array.isArray(pack.matches)) return res.status(400).json({ok:false,error:'matches deve essere un array'});
  const before=effectiveStore().matchdays[key]||null;
  const run=readRuntime();
  delete run.deletedDates[key];
  const currentRun=run.matchdays[key]||null;
  const mergedRun=mergePack(currentRun,pack,key)||{date:key,matches:[]};
  mergedRun.published_at=new Date().toISOString();
  run.matchdays[key]=mergedRun;
  writeRuntime(run);
  const after=effectiveStore().matchdays[key];
  res.json({ok:true,date:key,imported:pack.matches.length,matches:after?.matches?.length||0,
    preserved:Math.max(0,(after?.matches?.length||0)-pack.matches.length),
    before:before?.matches?.length||0});
});
app.delete('/api/matchdays/:date',requireAdmin,(req,res)=>{
  const key=req.params.date; const run=readRuntime();
  delete run.matchdays[key]; run.deletedDates[key]=true; writeRuntime(run);
  res.json({ok:true,deleted:true,date:key});
});
app.delete('/api/matchdays',requireAdmin,(req,res)=>{
  const eff=effectiveStore(); const run=readRuntime();
  run.matchdays={}; run.deletedDates={};
  for(const key of Object.keys(eff.matchdays)) run.deletedDates[key]=true;
  writeRuntime(run); res.json({ok:true,deleted:Object.keys(eff.matchdays).length});
});

app.get('/api/match/:id',(req,res)=>{
  const wanted=normId(req.params.id); const s=effectiveStore();
  let match=null,date=null;
  for(const [dayKey,pack] of Object.entries(s.matchdays)){
    const found=(pack.matches||[]).find(m=>normId(m?.id)===wanted||normId(`${m?.home||''}-${m?.away||''}`)===wanted);
    if(found){match=found;date=dayKey;break;}
  }
  if(!match) return res.status(404).json({ok:false,error:'Partita non trovata',id:req.params.id});
  let detail=s.details[match.id]||s.details[req.params.id]||null;
  if(!detail) detail=Object.values(s.details).find(d=>d&&normId(`${d.home||''}-${d.away||''}`)===wanted)||null;
  res.set('Cache-Control','no-store');res.json({ok:true,match,detail,date});
});
app.get('/api/details',(req,res)=>{res.set('Cache-Control','no-store');res.json({ok:true,details:effectiveStore().details});});
app.post('/api/details/bulk',requireAdmin,(req,res)=>{
  const incoming=req.body?.details&&typeof req.body.details==='object'?req.body.details:{};
  const run=readRuntime(); let count=0;
  for(const [id,d] of Object.entries(incoming)){if(id&&d&&typeof d==='object'){run.details[id]=d;count++;}}
  writeRuntime(run); const total=Object.keys(effectiveStore().details).length;
  res.json({ok:true,saved:count,total});
});
app.delete('/api/details',requireAdmin,(req,res)=>{const run=readRuntime();const n=Object.keys(run.details||{}).length;run.details={};writeRuntime(run);res.json({ok:true,deleted:n});});

app.use(express.static(__dirname,{etag:false,lastModified:false,setHeaders(res){res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');}}));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({ok:false,error:err.message||'Errore server'});});

app.listen(PORT,()=>{
  const s=effectiveStore();
  console.log(`MagicScanner V3.3.1 listening on port ${PORT}`);
  console.log(`Seed: ${SEED_FILE}`);
  console.log(`Runtime: ${RUNTIME_FILE}`);
  console.log(`Matchday counts: ${JSON.stringify(Object.fromEntries(Object.entries(s.matchdays).map(([k,p])=>[k,p.matches?.length||0])))}`);
  console.log(`ADMIN_TOKEN: ${ADMIN_TOKEN?'required':'not configured'}`);
});

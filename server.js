const express=require('express');
const fs=require('fs');
const path=require('path');
const app=express();
const PORT=process.env.PORT||3000;
const STORE_FILE=path.join(__dirname,'runtime-store.json');
const ADMIN_TOKEN=String(process.env.ADMIN_TOKEN||'').trim();
function normId(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}
function matchKey(m){return normId((m&&m.id)||`${m?.home||''}-${m?.away||''}-${m?.time||''}`)||normId(`${m?.home||''}-${m?.away||''}-${m?.time||''}`)}
function mergeMatches(a,b){const map=new Map();for(const m of [...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])]){const k=matchKey(m);if(!k)continue;map.set(k,{...(map.get(k)||{}),...m})}return [...map.values()]}
function blank(){return{matchdays:{},details:{}}}
function read(){try{if(!fs.existsSync(STORE_FILE))return blank();const x=JSON.parse(fs.readFileSync(STORE_FILE,'utf8')||'{}');return{matchdays:x.matchdays||{},details:x.details||{}}}catch(e){console.error('store read',e.message);return blank()}}
function write(x){const tmp=STORE_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(x,null,2));fs.renameSync(tmp,STORE_FILE)}
function auth(req,res,next){if(!ADMIN_TOKEN)return next();if(String(req.get('x-admin-token')||'')!==ADMIN_TOKEN)return res.status(401).json({ok:false,error:'ADMIN_TOKEN non valido'});next()}
app.disable('x-powered-by');app.use(express.json({limit:'30mb'}));
app.get('/api/health',(req,res)=>{const s=read();res.set('Cache-Control','no-store');res.json({ok:true,version:'3.3.6',storage:'runtime-only',matchdays:Object.keys(s.matchdays).length,counts:Object.fromEntries(Object.entries(s.matchdays).map(([k,p])=>[k,p.matches?.length||0])),details:Object.keys(s.details).length,admin_token_required:!!ADMIN_TOKEN})});
app.get('/api/matchdays',(req,res)=>{res.set('Cache-Control','no-store');res.json({ok:true,matchdays:read().matchdays})});
app.get('/api/matchdays/:date',(req,res)=>{const p=read().matchdays[req.params.date];if(!p)return res.status(404).json({ok:false,error:'Giornata non trovata'});res.set('Cache-Control','no-store');res.json({ok:true,matchday:p})});
app.post('/api/matchdays/:date',auth,(req,res)=>{const key=req.params.date;if(!/^\d{4}-\d{2}-\d{2}$/.test(key))return res.status(400).json({ok:false,error:'Data non valida'});const pack=req.body||{};if(!Array.isArray(pack.matches))return res.status(400).json({ok:false,error:'matches deve essere un array'});const s=read();const prev=s.matchdays[key]||{};const merged=mergeMatches(prev.matches,pack.matches);s.matchdays[key]={...prev,...pack,date:key,published_at:new Date().toISOString(),matches:merged};write(s);res.json({ok:true,date:key,incoming:pack.matches.length,matches:merged.length,mode:'merge'})});
app.delete('/api/matchdays/:date',auth,(req,res)=>{const s=read();delete s.matchdays[req.params.date];write(s);res.json({ok:true,deleted:true,date:req.params.date})});
app.delete('/api/matchdays',auth,(req,res)=>{const s=read();const n=Object.keys(s.matchdays).length;s.matchdays={};write(s);res.json({ok:true,deleted:n})});
app.get('/api/details',(req,res)=>{res.set('Cache-Control','no-store');res.json({ok:true,details:read().details})});
app.post('/api/details/bulk',auth,(req,res)=>{const incoming=req.body?.details||{};const s=read();let n=0;for(const [id,d] of Object.entries(incoming)){if(id&&d&&typeof d==='object'){s.details[id]=d;n++}}write(s);res.json({ok:true,saved:n,total:Object.keys(s.details).length})});
app.delete('/api/details',auth,(req,res)=>{const s=read();const n=Object.keys(s.details).length;s.details={};write(s);res.json({ok:true,deleted:n})});
app.get('/api/match/:id',(req,res)=>{const wanted=normId(req.params.id),s=read();let match=null,date=null;for(const [k,p] of Object.entries(s.matchdays)){const f=(p.matches||[]).find(m=>normId(m.id)===wanted||normId(`${m.home}-${m.away}`)===wanted);if(f){match=f;date=k;break}}if(!match)return res.status(404).json({ok:false,error:'Partita non trovata'});let detail=s.details[match.id]||s.details[req.params.id]||Object.values(s.details).find(d=>d&&normId(`${d.home||''}-${d.away||''}`)===wanted)||null;res.set('Cache-Control','no-store');res.json({ok:true,match,detail,date})});
app.use(express.static(__dirname,{etag:false,lastModified:false,setHeaders(res){res.setHeader('Cache-Control','no-store, no-cache, must-revalidate')}}));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({ok:false,error:err.message||'Errore server'})});
app.listen(PORT,()=>{const s=read();console.log(`MagicScanner V3.3.6 listening on port ${PORT}`);console.log(`Store: ${STORE_FILE}`);console.log(`Matchday counts: ${JSON.stringify(Object.fromEntries(Object.entries(s.matchdays).map(([k,p])=>[k,p.matches?.length||0])))}`);console.log(`ADMIN_TOKEN: ${ADMIN_TOKEN?'required':'not configured'}`)});

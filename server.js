import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '250kb' }));

function validateSoccerStatsUrl(raw){
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  if (host !== 'soccerstats.com' && host !== 'www.soccerstats.com') return null;
  const allowed = ['/pmatch.asp','/h2h.asp','/teamstats.asp','/matchlist.asp','/matches.asp','/match.asp','/matchstats.asp','/stats.asp'];
  if (!allowed.includes(u.pathname.toLowerCase())) return null;
  u.protocol = 'https:';
  u.hash = '';
  return u.toString();
}

async function fetchWithTimeout(url, ms=12000){
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), ms);
  try{
    return await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 MagicScanner/2.6',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9,it;q=0.8',
        'cache-control': 'no-cache'
      }
    });
  } finally { clearTimeout(timer); }
}


app.post('/api/fetch-matchday', async (req,res)=>{
  const url = validateSoccerStatsUrl(req.body?.url || '');
  if (!url) return res.status(400).json({error:'Inserisci un URL SoccerSTATS valido.'});
  const parsed = new URL(url);
  if (parsed.pathname.toLowerCase() !== '/matches.asp') {
    return res.status(400).json({error:'Per la giornata usa un URL matches.asp di SoccerSTATS.'});
  }
  try{
    const r = await fetchWithTimeout(url, 15000);
    const html = await r.text();
    if(!r.ok) return res.status(r.status).json({error:`SoccerSTATS ha risposto HTTP ${r.status}`});
    if(!/Matches played|Goals per match|soccerstats/i.test(html)) {
      return res.status(502).json({error:'La risposta non sembra la pagina giornaliera SoccerSTATS.'});
    }
    res.json({ok:true,url,html});
  }catch(err){
    res.status(502).json({error:err?.name==='AbortError'?'Timeout della sorgente':String(err?.message||err)});
  }
});

app.post('/api/fetch-stats', async (req,res)=>{
  const incoming = Array.isArray(req.body?.urls) ? req.body.urls : [];
  const urls = [...new Set(incoming.map(validateSoccerStatsUrl).filter(Boolean))].slice(0,30);
  if (!urls.length) return res.status(400).json({error:'Inserisci almeno un URL SoccerSTATS valido.'});

  const items=[];
  for (const url of urls){
    try{
      const r=await fetchWithTimeout(url);
      const html=await r.text();
      if(!r.ok){
        items.push({url,ok:false,status:r.status,error:`HTTP ${r.status}`});
      }else if(!/soccerstats/i.test(html)){
        items.push({url,ok:false,status:r.status,error:'La risposta non sembra una pagina SoccerSTATS.'});
      }else{
        items.push({url,ok:true,status:r.status,html});
      }
    }catch(err){
      items.push({url,ok:false,status:0,error:err?.name==='AbortError'?'Timeout della sorgente':String(err?.message||err)});
    }
    // richiesta sequenziale e piccola pausa: evita raffiche inutili
    await new Promise(r=>setTimeout(r,250));
  }
  res.json({count:items.length,items});
});

app.use(express.static(path.join(__dirname,'dist'), { extensions: ['html'] }));
app.get('*', (req,res)=>{
  res.status(404).sendFile(path.join(__dirname,'dist','index.html'));
});

app.listen(PORT, ()=> console.log(`MagicScanner V2.6 in ascolto sulla porta ${PORT}`));

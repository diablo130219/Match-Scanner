#!/usr/bin/env python3
from pathlib import Path
import json,re,sys,unicodedata

def slug(s):
    s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','-',s).strip('-')

def section(text,title,next_titles):
    i=text.find(title)
    if i<0:return ''
    e=len(text)
    for t in next_titles:
        j=text.find(t,i+len(title))
        if j>=0:e=min(e,j)
    return text[i:e]

def vals(line):
    # markdown cells, remove urls/images and formatting
    cells=[c.strip() for c in line.strip().strip('|').split('|')]
    out=[]
    for c in cells:
        c=re.sub(r'\[[^\]]*\]\([^)]*\)','',c)
        c=re.sub(r'https?://\S+','',c)
        c=c.replace('**','').replace('&nbsp;',' ').strip()
        out.append(c)
    return out

def rowmap(block, labels):
    out={}
    for ln in block.splitlines():
        c=vals(ln)
        for lab in labels:
            if any(x.strip().lower()==lab.lower() for x in c): out[lab]=c
    return out

def parse_timing(block):
    teams=[]; current=None; scope=None; out={}
    lines=block.splitlines()
    for i,ln in enumerate(lines):
        if ln.startswith('#### '):
            current=ln.replace('#### ','').strip(); out.setdefault(current,{})
        elif ln.strip() in ('**Total**','**Home**','**Away**'):
            scope=ln.strip('* ').lower(); out.setdefault(current,{}).setdefault(scope,{}) if current else None
        elif current and scope and any(seg in ln for seg in ['0-15','16-30','31-45','46-60','61-75','76-90','1st Half','2nd Half']):
            c=vals(ln)
            seg=next((x for x in ['0-15','16-30','31-45','46-60','61-75','76-90','1st Half','2nd Half'] if x in ln),None)
            nums=re.findall(r'\b\d+(?:\.\d+)?%?\b',ln)
            out[current][scope].setdefault(seg,{})
            if 'GF' in ln: out[current][scope][seg]['gf']=nums[0] if nums else ''
            if 'GA' in ln: out[current][scope][seg]['ga']=nums[0] if nums else ''
        elif current and scope and re.search(r'^\s*\|\s*GA\s*\|',ln):
            # continuation GA row belongs to previous segment
            nums=re.findall(r'\b\d+(?:\.\d+)?%?\b',ln)
            if nums and out[current][scope]:
                last=list(out[current][scope].keys())[-1]; out[current][scope][last]['ga']=nums[0]
    return out

def parse_file(p):
    text=p.read_text(encoding='utf-8',errors='ignore')
    title=''
    for ln in text.splitlines()[:80]:
        m=re.search(r'([^|#*]+?)\s+vs\s+([^|#*]+)',ln,re.I)
        if m:
            title=(m.group(1).strip()+' vs '+m.group(2).strip()).strip(); break
    if not title:
        title=p.stem.replace('-',' ')
    a,b=[x.strip() for x in re.split(r'\s+vs\s+',title,flags=re.I,maxsplit=1)] if re.search(r'\s+vs\s+',title,re.I) else (title,'')
    goal=section(text,'## Goal statistics',['## Teams scoring stats','## Home vs Away Stats','## Scorelines'])
    contextual=section(text,'## Contextual averages',['FORM','## Results progression','## Goal times'])
    corners=section(text,'## Corner statistics',['## Teams results table','## Goal statistics'])
    avgt=section(text,'## Average goal times',['## Corner statistics'])
    total=section(text,'## Total Goals (GF + GA) stats',['## Featured Highest','## Contextual averages'])
    homeaway=section(text,'## Home vs Away Stats',['## Scorelines','## Home vs Away distribution'])
    timing=section(text,'## Goal times',['## Goal Differences by time segment'])
    labels=['Goals scored (GF)','GF per match','Goals conceded (GA)','GA per match','GF+GA per match','GF+GA over 0.5','GF+GA over 1.5','GF+GA over 2.5','GF+GA over 3.5','GF+GA over 4.5','GF+GA over 5.5','GF+GA over 0.5 at HT','GF+GA over 1.5 at HT','GF+GA over 2.5 at HT']
    c_labels=['AVG Corners For','AVG Corners Against','Total per match','Total Over 7.5','Total Over 8.5','Total Over 9.5','Total Over 10.5','Total Over 11.5','Total Over 12.5','Total Over 13.5']
    # PPG extraction
    ppg=[]
    for ln in text.splitlines()[:70]:
        if re.search(r'\*\*Home\*\*|\*\*Away\*\*|\bTotal\b',ln):
            ppg.extend(re.findall(r'\b\d+\.\d+\b',ln))
    return {
      'id':slug(a+'-'+b),'home':a,'away':b,'source_file':p.name,
      'goal_statistics':rowmap(goal,labels),
      'corners':rowmap(corners,c_labels),
      'contextual_raw':[x.strip() for x in contextual.splitlines() if x.strip().startswith('|') and not set(x.strip())<=set('|:- ')],
      'total_goals_raw':[x.strip() for x in total.splitlines() if x.strip().startswith('|') and not set(x.strip())<=set('|:- ')],
      'home_away_raw':[x.strip() for x in homeaway.splitlines() if x.strip().startswith('|') and not set(x.strip())<=set('|:- ')],
      'average_goal_times_raw':[x.strip() for x in avgt.splitlines() if 'Average minute' in x],
      'timing':parse_timing(timing)
    }

def main():
    if len(sys.argv)<2:
        raise SystemExit('Uso: python tools/batch_import_soccerstats.py CARTELLA_MD [output.js]')
    folder=Path(sys.argv[1]); out=Path(sys.argv[2]) if len(sys.argv)>2 else Path('data/imported-details.js')
    data={}
    for p in sorted(folder.glob('*.md')):
        d=parse_file(p); data[d['id']]=d
    out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text('window.IMPORTED_DETAILS = '+json.dumps(data,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
    print(f'Importate {len(data)} schede -> {out}')
if __name__=='__main__':main()

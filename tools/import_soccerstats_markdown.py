#!/usr/bin/env python3
"""MagicScanner V2 - importer base da copia Markdown SoccerSTATS.
Uso: python tools/import_soccerstats_markdown.py input.md output.json
Non effettua scraping: lavora sul contenuto che hai salvato/esportato legalmente.
"""
from pathlib import Path
import json,re,sys

def pct(s):
    m=re.search(r"(\d+(?:\.\d+)?)%",s or "")
    return float(m.group(1)) if m else None

def number(s):
    m=re.search(r"\b(\d+(?:\.\d+)?)\b",s or "")
    return float(m.group(1)) if m else None

def section(text,title,next_titles):
    start=text.find(title)
    if start<0:return ""
    end=len(text)
    for t in next_titles:
        p=text.find(t,start+len(title))
        if p>=0:end=min(end,p)
    return text[start:end]

def parse_goal_stats(text):
    block=section(text,'## Goal statistics',['## Teams scoring stats','## Home vs Away Stats','## Scorelines'])
    rows={}
    labels=['Goals scored (GF)','GF per match','Goals conceded (GA)','GA per match','GF+GA per match','GF+GA over 0.5','GF+GA over 1.5','GF+GA over 2.5','GF+GA over 3.5','GF+GA over 0.5 at HT','GF+GA over 1.5 at HT','GF+GA over 2.5 at HT']
    for line in block.splitlines():
        for lab in labels:
            if lab in line:
                vals=re.findall(r'\*\*([^*]+)\*\*|\|\s*([0-9.]+%?)\s*\|',line)
                flat=[a or b for a,b in vals if (a or b)]
                rows[lab]=flat
    return rows

def parse_average_goal_times(text):
    block=section(text,'## Average goal times',['## Corner statistics'])
    lines=[x for x in block.splitlines() if 'Average minute GF' in x or 'Average minute GA' in x]
    return lines

def parse_corners(text):
    block=section(text,'## Corner statistics',['## Teams results table','## Goal statistics'])
    out={}
    for lab in ['AVG Corners For','AVG Corners Against','Total per match','Total Over 7.5','Total Over 8.5','Total Over 9.5','Total Over 10.5']:
        for line in block.splitlines():
            if lab in line:
                out[lab]=line.strip();break
    return out

def parse_timing(text):
    block=section(text,'## Goal times',['## Goal Differences by time segment'])
    return [ln.strip() for ln in block.splitlines() if any(x in ln for x in ['0-15','16-30','31-45','46-60','61-75','76-90','1st Half','2nd Half'])]

def main():
    if len(sys.argv)!=3:
        raise SystemExit('Uso: python tools/import_soccerstats_markdown.py input.md output.json')
    src=Path(sys.argv[1]); dst=Path(sys.argv[2])
    text=src.read_text(encoding='utf-8',errors='ignore')
    title=''
    for ln in text.splitlines():
        if ' vs ' in ln:
            title=re.sub(r'[|*#]','',ln).strip();break
    data={
      'source':'SoccerSTATS markdown export',
      'match':title,
      'goal_statistics_raw':parse_goal_stats(text),
      'goal_timing_raw':parse_timing(text),
      'average_goal_times_raw':parse_average_goal_times(text),
      'corners_raw':parse_corners(text)
    }
    dst.parent.mkdir(parents=True,exist_ok=True)
    dst.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Creato: {dst}')

if __name__=='__main__': main()

# Régénère la preuve byte-exacte après une modification volontaire des modules.
# La fixture de prix boutique-ticket/pricing-before.js.gz reste l'oracle précédent.
import json,gzip,hashlib,difflib,re
from pathlib import Path
base=Path('tools/fixtures/pos-boutique');m=json.loads((base/'split.json').read_text());original=gzip.decompress((base/'original.js.gz').read_bytes()).decode()
def units(s):
 b=s.encode('utf-16-le');return ''.join(chr(int.from_bytes(b[i:i+2],'little')) for i in range(0,len(b),2))
def string(s):return b''.join(ord(c).to_bytes(2,'little') for c in s).decode('utf-16-le')
old=units(original);pieces=[]
for chunk in m['chunks']:
 text=Path(chunk['file']).read_text();lead=re.match(r'(?:import .*;\n)+',text)[0];tail=re.search(r'\nexport \{[^\n]+\};\n$',text)[0];body=units(text[len(lead):-len(tail)])
 prev=''.join(old[f['start']:f['end']] for f in chunk['fragments']);
 oldlines=prev.splitlines(True);newlines=body.splitlines(True)
 import itertools
 oldpos=[0]+list(itertools.accumulate(map(len,oldlines)));newpos=[0]+list(itertools.accumulate(map(len,newlines)))
 ops=[(tag,oldpos[a],oldpos[b],newpos[c],newpos[d]) for tag,a,b,c,d in difflib.SequenceMatcher(None,oldlines,newlines,autojunk=False).get_opcodes()]
 def at(pos):
  if pos==len(prev):return len(body)
  for tag,a,b,c,d in ops:
   if a<=pos<b:return c+pos-a if tag=='equal' else c
  return 0
 offset=0;newfrags=[]
 for f in chunk['fragments']:
  end=offset+f['end']-f['start'];part=body[at(offset):at(end)];pieces.append((f['start'],chunk,part,f.get('name')));offset=end
 chunk['lead']=lead;chunk['tail']=tail;chunk['fragments']=[]
owner=Path('assets/pos-boutique/ticket-owner.js').read_text().replace('export { ticketOwner };','')
m['prefix']=m['prefix'].split('\n/* Propriétaire')[0]+'\n'+owner+'\n';result=units(m['prefix'])
for _,chunk,part,name in sorted(pieces,key=lambda x:x[0]):
 start=len(result);result+=part;chunk['fragments'].append({'start':start,'end':len(result),'name':name})
result+=units(m['suffix']);text=string(result);m['sha256']=hashlib.sha256(text.encode()).hexdigest()
m['splitFiles']={f:hashlib.sha256(Path(f).read_bytes()).hexdigest() for f in [*(c['file'] for c in m['chunks']),'assets/pos-boutique/ticket-owner.js']}
for chunk in m['chunks']:
 actual=Path(chunk['file']).read_text()
 body=re.sub(r'^(?:import .*;\n)+','',actual)
 body=re.sub(r'\nexport \{[^\n]+\};\n$','',body)
 assert body==''.join(string(result[f['start']:f['end']]) for f in chunk['fragments']),chunk['file']
(base/'original.js.gz').write_bytes(gzip.compress(text.encode(),mtime=0));(base/'split.json').write_text(json.dumps(m,ensure_ascii=True,indent=2)+'\n')

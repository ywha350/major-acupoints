import fitz,re,json,pathlib,asyncio
import edge_tts
root=pathlib.Path(__file__).resolve().parents[1]
doc=fitz.open(r'C:\Users\polar\Downloads\쪽지시험_16문항_핵심암기_그림포함_문제번호_수정본.pdf')
assets=root/'public/assets/quiz16'; assets.mkdir(parents=True,exist_ok=True)
cards=[]
for page,section in [(1,'남성생식기계'),(3,'소화기계'),(5,'비뇨기계')]:
    doc[page+1].get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(str(assets/f'figure-{page}.png'))
    body=doc[page].get_text().split('의학용어\u00a0쪽지시험')[0]
    for m in re.finditer(r'문제 (\d+)\n(.*?)\nPPT ([^\n]+)\n(.*?)(?=\n문제 \d+\n|\Z)',body,re.S):
        num,title,ppt,answer=m.groups()
        answer=re.sub(r'\s*\n\s*',' ',answer).strip()
        terms=list(dict.fromkeys(re.findall(r'[A-Za-z]+(?:[ /’–-][A-Za-z]+)*',answer)))
        key=f'quiz16-{page}-{num}'
        cards.append(dict(id=key,prompt=f'{section} · 문제 {num}\n{title}',answer=answer,explanation='영어 발음: '+ ' · '.join(terms),source=f'제공 PDF {page+1}쪽 · PPT {ppt} · 수치와 설명은 제공 자료 기준',figure=f'assets/quiz16/figure-{page}.png',audio=f'assets/quiz16/{key}.mp3',speech='. '.join(terms)))
assert len(cards)==16,len(cards)
async def main():
    for c in cards:
        target=root/'public'/c['audio']
        if not target.exists():
            await edge_tts.Communicate(c['speech'],'en-US-JennyNeural',rate='-15%').save(str(target))
        print(c['id'],flush=True)
asyncio.run(main())
for c in cards: c.pop('speech')
(root/'public/data/quiz16.json').write_text(json.dumps(cards,ensure_ascii=False,indent=2),encoding='utf-8')
p=root/'public/data/decks.json'; decks=json.loads(p.read_text(encoding='utf-8')); decks=[d for d in decks if d['id']!='quiz16']; decks.append(dict(id='quiz16',name='쪽지시험 · 핵심 16문항',description='남성생식기계 · 소화기계 · 비뇨기계 | 원본 그림 · 영어 발음',type='text',path='data/quiz16.json')); p.write_text(json.dumps(decks,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

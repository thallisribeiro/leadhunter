# Transcreve os Reels baixados (reels-mp4/<handle>/*.mp4) com faster-whisper, local, sem API.
# Uso: python transcrever-reels.py <handle>
import json
import os
import sys

from faster_whisper import WhisperModel

handle = sys.argv[1]
base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reels-mp4", handle)
indice = json.load(open(os.path.join(base, "indice.json"), encoding="utf-8"))
model = WhisperModel("small", device="cpu", compute_type="int8")
saida = []
for r in indice:
    arq = r["arquivo"]
    if not os.path.exists(arq):
        continue
    segs, info = model.transcribe(arq, language="pt", vad_filter=True)
    texto = " ".join(s.text.strip() for s in segs).strip()
    dur = round(info.duration)
    saida.append({"url": r["url"], "views": r["views"], "curtidas": r.get("curtidas"), "comentarios": r.get("comentarios"), "data": r.get("data"), "duracao_s": dur, "transcricao": texto})
    print(f"\n### {r['views']} views · {r.get('curtidas')} curtidas · {dur}s · {r['url']}\n{texto[:900]}")
json.dump(saida, open(os.path.join(base, "transcricoes.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\n{len(saida)} transcrição(ões) em {os.path.join(base, 'transcricoes.json')}")

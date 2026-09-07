# Transcreve os Reels baixados (reels-mp4/<handle>/*.mp4) com faster-whisper, local, sem API.
# O Instagram entrega vídeo e áudio em faixas separadas: tenta cada arquivo do Reel até achar um com áudio.
# Uso: python transcrever-reels.py <handle>
import json
import os
import subprocess
import sys

import av
from faster_whisper import WhisperModel

handle = sys.argv[1]
base = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reels-mp4", handle)
indice = json.load(open(os.path.join(base, "indice.json"), encoding="utf-8"))
model = WhisperModel("small", device="cpu", compute_type="int8")


def tem_audio(arq):
    try:
        with av.open(arq) as c:
            return len(c.streams.audio) > 0
    except Exception:
        return False


# O Instagram serve faixa DASH fragmentada: o PyAV não abre o pedaço sozinho, mas o ffmpeg extrai.
# Sem isto, 11 dos 12 Reels do @pedraodalicitacao ficavam "sem faixa de áudio" (07/09/2026).
def extrair_audio(arq):
    saida = os.path.splitext(arq)[0] + ".wav"
    if os.path.exists(saida) and os.path.getsize(saida) > 40000:
        return saida
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", arq, "-vn", "-ac", "1", "-ar", "16000", saida],
            check=True, timeout=180, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except Exception:
        return None
    return saida if os.path.exists(saida) and os.path.getsize(saida) > 40000 else None


saida = []
for r in indice:
    arquivos = [a for a in (r.get("arquivos") or [r.get("arquivo")]) if a and os.path.exists(a)]
    candidatos = [a for a in arquivos if tem_audio(a)]
    if not candidatos:  # faixa fragmentada: o ffmpeg tira o áudio que o PyAV não enxerga
        candidatos = [w for w in (extrair_audio(a) for a in arquivos) if w]
    if not candidatos:
        print(f"\n### {r['views']} views · {r['url']} — sem faixa de áudio nos arquivos baixados")
        continue
    try:
        segs, info = model.transcribe(candidatos[0], language="pt", vad_filter=True)
        texto = " ".join(s.text.strip() for s in segs).strip()
        dur = round(info.duration)
    except Exception as e:  # noqa: BLE001
        print(f"\n### {r['views']} views · {r['url']} — falhou: {str(e)[:120]}")
        continue
    saida.append({"url": r["url"], "views": r["views"], "curtidas": r.get("curtidas"), "comentarios": r.get("comentarios"), "data": r.get("data"), "duracao_s": dur, "transcricao": texto})
    print(f"\n### {r['views']} views · {r.get('curtidas')} curtidas · {dur}s · {r.get('data')} · {r['url']}\n{texto[:1200]}")
json.dump(saida, open(os.path.join(base, "transcricoes.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\n{len(saida)} transcrição(ões) em {os.path.join(base, 'transcricoes.json')}")

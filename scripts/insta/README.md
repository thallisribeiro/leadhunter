# scripts/insta — prospecção e pesquisa no Instagram pelo Chrome logado (07/09/2026)

Todos falam com o Chrome do LeadHunter via CDP (`--remote-debugging-port=9222`, perfil `.chrome-profile`).
Abrir antes: ver SETUP.md §"primeira DM". Nenhum roda headless nem usa API do Instagram.

- `buscar-contas-insta.js "licitação" "pregão"` — contas do nicho por busca, com seguidores/posts.
- `perfil-insta.js handle1 handle2` — bio + estado do botão Seguir + 3 últimas legendas (pra escrever DM na mão).
- `enviar-dm.js dms.json` — segue e manda as DMs do JSON `[{handle, nome, texto}]`, registra em leads/conversations/messages
  igual ao envio pelo worker. Teto: 5 DMs em 20h. `--so-seguir a,b,c` só segue.
- `mapear-insta.js handle [max]` — posts do grid com curtidas/comentários/legenda (og:description).
- `mapear-reels.js handle [topN]` — Reels ranqueados por visualização (número do grid /reels/), top N abertos.
- `baixar-reels.js handle [topN]` + `transcrever-reels.py handle` — vídeo dos top Reels + transcrição local (faster-whisper).

Regra de ouro (memória do Thallis): nunca matar processo por nome; os scripts terminam com `process.exit` porque a
conexão CDP segura o Node vivo.

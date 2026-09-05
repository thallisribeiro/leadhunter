# Setup e operação do LeadHunter Local

## 1. Requisitos

- Node.js 24 ou superior;
- pnpm 11 ou superior;
- Windows, macOS ou Linux;
- acesso à internet apenas para fontes reais e integrações opcionais.

Confirme o ambiente:

```bash
node --version
pnpm --version
```

## 2. Instalação

Na raiz do projeto:

```bash
pnpm install
```

O projeto usa dependências nativas para SQLite. Se a instalação for interrompida, repita `pnpm install` em um terminal com permissão de escrita na pasta.

## 3. Configuração do `.env`

Copie o modelo:

```bash
cp .env.example .env
```

No PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Para o uso local básico, mantenha apenas:

```dotenv
DATABASE_URL=file:./data/leadhunter.db
EMAIL_SENDING_ENABLED=false
OVERPASS_API_URL=https://overpass-api.de/api/interpreter
APP_TIMEZONE=America/Bahia
```

O `.env` e o banco estão ignorados pelo Git. Não versione chaves ou senhas.

## 4. Banco de dados

Crie/atualize as tabelas:

```bash
pnpm db:migrate
```

O SQLite usa foreign keys, busy timeout e WAL. Para uma demonstração com 20 leads fictícios, execute:

```bash
pnpm db:seed
```

O seed é idempotente: repeti-lo não duplica a campanha, os leads, scores ou drafts da demo.

## 5. Subir o sistema

Desenvolvimento:

```bash
pnpm dev
```

Produção local:

```bash
pnpm build
pnpm start
```

Web e worker sobem juntos. Abra `http://localhost:3000`.

## 6. Onboarding

No primeiro acesso, informe empresa, oferta, ICP, localizações, claims verificadas, claims proibidas, objetivo, CTA e tom. Esses dados controlam scoring e outreach. Só inclua em “Afirmações verificadas” fatos que podem ser comprovados.

## 7. Primeira campanha

Crie uma campanha com segmento, localização, quantidade, palavras-chave, sinais desejados/excluídos e score mínimo. Depois:

1. importe um CSV ou execute as fontes habilitadas;
2. enfileire o enriquecimento;
3. aguarde os jobs concluírem;
4. recalcule os scores;
5. selecione leads e envie à shortlist;
6. gere e aprove drafts;
7. faça dry-run ou exporte o CSV;
8. atualize os resultados manualmente no perfil do lead.

## 8. Fontes disponíveis

- **CSV:** reconhece aliases comuns em português e inglês para empresa, site, email, telefone, cidade, país e redes sociais.
- **URLs iniciais:** cria leads a partir de sites informados, uma URL por linha.
- **OpenStreetMap/Overpass:** busca empresas locais em dados públicos; não exige chave e pode aplicar rate limit.
- **Google Places:** opcional e ativado somente com `GOOGLE_PLACES_API_KEY`.

Falha em uma fonte não cancela os resultados obtidos pelas demais.

## 9. IA opcional

Sem chave, scoring e textos usam o fallback determinístico. Para um endpoint compatível com OpenAI:

```dotenv
LLM_API_KEY=
LLM_BASE_URL=
LLM_MODEL=
LLM_FAST_MODEL=
LLM_MONTHLY_BUDGET_USD=10
```

Preencha `LLM_API_KEY` e os modelos do seu provedor. `LLM_BASE_URL` só é necessário para um endpoint alternativo. Toda chamada registra tokens e custo; o limite mensal impede novas chamadas ao ser atingido.

## 10. SMTP opcional

Configure apenas se quiser enviar emails reais:

```dotenv
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_NAME=
SMTP_FROM_EMAIL=
MAX_EMAILS_PER_DAY=30
MIN_SECONDS_BETWEEN_EMAILS=60
```

Use uma conta dedicada e credenciais de aplicativo quando o provedor exigir.

## 11. Dry-run

O dry-run é o padrão e grava o evento sem chamar SMTP. Mantenha:

```dotenv
EMAIL_SENDING_ENABLED=false
```

Gere o draft, revise, aprove e use “Dry-run email”. O histórico fica salvo para auditoria.

## 12. Envio real

O envio só ocorre quando todas estas condições são verdadeiras: SMTP completo, `EMAIL_SENDING_ENABLED=true`, ação explícita “Enviar email”, draft aprovado, destinatário válido, lead não suprimido, limite diário disponível, intervalo respeitado e idempotency key inédita.

Antes de habilitar, faça backup e valide um único lead selecionado. Para desligar imediatamente, volte `EMAIL_SENDING_ENABLED=false` e reinicie web/worker.

## 13. Backup e restauração

Crie um backup consistente com a API do SQLite:

```bash
pnpm db:backup
```

O arquivo é gravado em `backups/leadhunter-<timestamp>.db`. Guarde cópias fora da máquina quando os dados forem importantes.

Para restaurar: pare `pnpm dev`/`pnpm start`, faça uma cópia do banco atual, copie o backup para o caminho indicado por `DATABASE_URL` e execute `pnpm db:migrate` antes de reiniciar.

## 14. Troubleshooting

- **Banco bloqueado:** confirme que não há duas instâncias usando o mesmo arquivo; encerre processos antigos e reinicie.
- **Worker sem processar:** verifique se o terminal mostra os processos `web` e `worker`; reinicie `pnpm dev`.
- **Overpass 429/timeout:** aguarde e tente novamente ou altere `OVERPASS_API_URL` para outra instância pública confiável.
- **Site não enriquecido:** URLs privadas, localhost, metadata, conteúdo não HTML, respostas grandes e redirects excessivos são bloqueados de propósito.
- **IA indisponível:** valide chave, modelo, base URL, saldo e `LLM_MONTHLY_BUDGET_USD`; o fallback local continua funcionando.
- **Email não enviado:** confirme aprovação, suppression, endereço, SMTP, limites e `EMAIL_SENDING_ENABLED=true`. Sem isso, o evento correto é dry-run.
- **Módulo nativo/EPERM no Windows:** feche processos Node, mantenha o projeto em uma pasta gravável e repita `pnpm install`.
- **Validação completa:** execute `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm test:e2e`.

# LeadHunter Local

Aplicação local de prospecção B2B que transforma um perfil de cliente ideal em uma lista operacional de leads deduplicados, enriquecidos, pontuados e acompanhados por evidências.

O produto roda em uma única máquina com Next.js, TypeScript e SQLite. Integrações externas são opcionais: CSV, URLs iniciais e OpenStreetMap/Overpass funcionam sem conta paga; IA, Google Places e SMTP só são usados quando configurados.

## O que está incluído

- onboarding completo do negócio e do ICP;
- campanhas por segmento, região, sinais e score mínimo;
- descoberta por CSV, URLs iniciais, Overpass e Google Places opcional;
- deduplicação por domínio, email, telefone, URL canônica e nome/local;
- crawler limitado com proteção contra SSRF e registro das fontes;
- extração de contatos, sinais e evidências citáveis;
- score determinístico de 0–100 e confiança separada;
- drafts personalizados que só usam evidências e claims verificados;
- shortlist, ações em massa e pipeline manual;
- email em dry-run por padrão, aprovação e suppression global;
- jobs duráveis em SQLite, métricas e exportação CSV;
- fixture reproduzível com 20 clínicas fictícias de Miami.

## Início rápido

Requer Node.js 24+ e pnpm 11+.

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Abra `http://localhost:3000`. O comando `pnpm dev` inicia o app e o worker juntos.

Para carregar a demonstração local:

```bash
pnpm db:seed
```

## Segurança por padrão

- `EMAIL_SENDING_ENABLED=false`: toda tentativa permanece como dry-run persistido.
- Nenhuma credencial é necessária para iniciar ou executar os testes.
- Claims do lead precisam apontar para evidências salvas; claims do negócio vêm apenas do onboarding.
- O crawler aceita somente HTTP(S), bloqueia redes privadas/metadata e limita páginas, tamanho, redirects e tempo.
- Pedidos de não contato criam suppression global.
- O orçamento mensal configurado bloqueia novas chamadas de IA quando atingido.

## Comandos

| Comando | Função |
|---|---|
| `pnpm dev` | Inicia web e worker em desenvolvimento |
| `pnpm build` | Gera o build de produção |
| `pnpm start` | Inicia web e worker em produção |
| `pnpm db:migrate` | Aplica as migrations SQLite |
| `pnpm db:seed` | Cria/atualiza a demo idempotente de 20 leads |
| `pnpm db:backup` | Cria uma cópia consistente em `backups/` |
| `pnpm test` | Executa testes unitários e de integração |
| `pnpm test:e2e` | Gera o build e executa o fluxo Playwright completo |
| `pnpm smoke:real` | Testa Overpass e uma URL pública, com rede real |
| `pnpm lint` | Valida o código com ESLint |
| `pnpm typecheck` | Valida TypeScript estrito |

## Documentação

- [Instalação, operação, email e troubleshooting](SETUP.md)
- [Especificação do MVP](docs/superpowers/specs/2026-09-05-leadhunter-local-design.md)
- [Plano executado etapa por etapa](docs/superpowers/plans/2026-09-05-leadhunter-local.md)
- [Prompt histórico do Buscando 1 Milhão](docs/reference/buscandomilhao.md)

## Arquitetura

O sistema é um monólito modular: `src/app` contém a interface e endpoints; `src/features` concentra regras de negócio; `src/integrations` isola serviços externos; `src/db` mantém schema, migrations, fixtures e utilitários; `src/worker` processa a fila durável. SQLite é a fonte de verdade para dados de negócio, jobs, eventos e custos de IA.

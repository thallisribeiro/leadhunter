# Smoke test de fontes reais — 2026-09-05

Comando executado:

```powershell
$env:OVERPASS_API_URL='https://overpass.kumi.systems/api/interpreter'
pnpm smoke:real
```

O endpoint padrão `https://overpass-api.de/api/interpreter` respondeu `504` na primeira tentativa. A mesma consulta limitada foi repetida em uma instância pública independente e passou.

Resultado exato em `2026-09-05T13:08:34.542Z`:

- Overpass: 2 empresas retornadas (limite máximo solicitado: 3):
  - `Miami Village Dental` — `https://www.openstreetmap.org/node/4263664636`
  - `Vizcaya Dental Arts` — `https://www.openstreetmap.org/node/9216015433`
- Seed URL: `example.com`;
- URL final após validação/redirect: `https://example.com/`;
- HTML lido pelo crawler limitado: 559 bytes.

Este smoke depende da rede e, por isso, permanece separado da suíte automatizada determinística.

// Baixa o vídeo dos top Reels de um perfil já mapeado (reels-<handle>.json) pelo og:video da página,
// usando o Chrome logado (CDP 9222) só pra ler a meta; o download é direto do CDN.
// Uso: node baixar-reels.js <handle> [topN]
const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/thall/CODE/leadhunter/node_modules/playwright-core');
const handle = process.argv[2];
const TOP = Number(process.argv[3]) || 10;
const dir = path.join(__dirname, 'reels-mp4', handle);
fs.mkdirSync(dir, { recursive: true });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const mapa = JSON.parse(fs.readFileSync(path.join(__dirname, `reels-${handle}.json`), 'utf8'));
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  const feitos = [];
  for (const r of mapa.top.slice(0, TOP)) {
    const codigo = r.url.match(/\/reel\/([^/]+)/)?.[1];
    if (fs.existsSync(path.join(dir, `${codigo}-0.mp4`))) { const arquivos = [0, 1, 2].map((i) => path.join(dir, `${codigo}-${i}.mp4`)).filter((a) => fs.existsSync(a)); feitos.push({ ...r, arquivo: arquivos[0], arquivos }); continue; }
    try {
      // A página não expõe og:video e o <video> é blob: a URL real do CDN aparece no tráfego
      // (resourceType media, scontent…mp4 com bytestart/byteend). Pega a primeira e tira o range.
      const vistas = [];
      const ouvinte = (resp) => { const u = resp.url(); if ((resp.request().resourceType() === 'media' || /\.mp4/.test(u)) && !vistas.includes(u)) vistas.push(u); };
      page.on('response', ouvinte);
      await page.goto(r.url, { waitUntil: 'domcontentloaded' });
      await dormir(3000);
      // O Reel toca MUDO por padrão e a faixa de áudio (DASH separado) só é baixada depois de
      // desmutar: 10 de 12 vieram só com vídeo na 1ª tentativa. Clica no vídeo pra ligar o som.
      await page.locator('video').first().click({ timeout: 5000 }).catch(() => {});
      await dormir(8000);
      page.off('response', ouvinte);
      // O Instagram serve vídeo e áudio em faixas separadas (DASH): a primeira URL pode ser só vídeo.
      // Baixa até 3 faixas distintas (sem o range) e o transcritor escolhe a que tem áudio.
      const semRange = (u) => { const x = new URL(u); x.searchParams.delete('bytestart'); x.searchParams.delete('byteend'); return x.toString(); };
      // Prioriza o que parece áudio (URL com 'audio'/'heaac'); depois o resto, até 5 faixas.
      const unicas = [...new Set(vistas.map(semRange))];
      const urls = [...unicas.filter((u) => /audio|heaac|_a\.mp4/i.test(u)), ...unicas.filter((u) => !/audio|heaac|_a\.mp4/i.test(u))].slice(0, 5);
      if (!urls.length) throw new Error('nenhuma resposta de mídia vista');
      const arquivos = [];
      for (const [i, u] of urls.entries()) {
        const b64 = await page.evaluate(async (x) => { const res = await fetch(x); const buf = await res.arrayBuffer(); let s = ''; const bytes = new Uint8Array(buf); for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000)); return btoa(s); }, u);
        const arq = path.join(dir, `${codigo}-${i}.mp4`);
        fs.writeFileSync(arq, Buffer.from(b64, 'base64'));
        arquivos.push(arq);
      }
      feitos.push({ ...r, arquivo: arquivos[0], arquivos });
      console.log(`${codigo}: ${arquivos.map((a) => (fs.statSync(a).size / 1048576).toFixed(1) + ' MB').join(' + ')} · ${r.views}👁`);
    } catch (e) { console.log(`${codigo}: falhou (${e.message.slice(0, 80)})`); }
    await dormir(2000 + Math.random() * 2000);
  }
  fs.writeFileSync(path.join(dir, 'indice.json'), JSON.stringify(feitos, null, 1));
  await page.close();
  process.exit(0);
})().catch((e) => { console.error('falhou:', e.message); process.exit(1); });

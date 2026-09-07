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
    const destino = path.join(dir, `${codigo}.mp4`);
    if (fs.existsSync(destino)) { feitos.push({ ...r, arquivo: destino }); continue; }
    try {
      await page.goto(r.url, { waitUntil: 'domcontentloaded' });
      await dormir(3000);
      let src = await page.evaluate(() => document.querySelector('meta[property="og:video"]')?.content || document.querySelector('meta[property="og:video:secure_url"]')?.content || document.querySelector('video')?.src || null);
      if (!src || src.startsWith('blob:')) throw new Error('sem URL de vídeo na página');
      // Baixa de DENTRO da página (mesma origem/cookies do CDN), em base64, e grava aqui.
      const b64 = await page.evaluate(async (u) => { const res = await fetch(u); const buf = await res.arrayBuffer(); let s = ''; const bytes = new Uint8Array(buf); for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }, src);
      fs.writeFileSync(destino, Buffer.from(b64, 'base64'));
      feitos.push({ ...r, arquivo: destino });
      console.log(`${codigo}: ${(fs.statSync(destino).size / 1048576).toFixed(1)} MB · ${r.views}👁`);
    } catch (e) { console.log(`${codigo}: falhou (${e.message.slice(0, 80)})`); }
    await dormir(2000 + Math.random() * 2000);
  }
  fs.writeFileSync(path.join(dir, 'indice.json'), JSON.stringify(feitos, null, 1));
  await page.close();
  process.exit(0);
})().catch((e) => { console.error('falhou:', e.message); process.exit(1); });

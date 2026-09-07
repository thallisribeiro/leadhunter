// Reels de um perfil, ranqueados por visualizações (o número que aparece no grid da aba /reels/),
// e os top N abertos pra pegar curtidas, comentários, data e legenda. Chrome logado via CDP 9222.
// Uso: node mapear-reels.js <handle> [topN]
const fs = require('fs');
const { chromium } = require('C:/Users/thall/CODE/leadhunter/node_modules/playwright-core');
const handle = process.argv[2];
const TOP = Number(process.argv[3]) || 12;
const OUT = `${__dirname}/reels-${handle}.json`;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const num = (s) => { if (!s) return null; let x = String(s).trim().toLowerCase(); const mil = /mil$|k$/.test(x), mi = /mi$|m$/.test(x); x = x.replace(/mil|mi|k|m/g, '').trim(); const v = mil || mi ? parseFloat(x.replace(/\./g, '').replace(',', '.')) : parseInt(x.replace(/[.,]/g, ''), 10); return Number.isFinite(v) ? (mil ? Math.round(v * 1000) : mi ? Math.round(v * 1e6) : v) : null; };

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  await page.goto(`https://www.instagram.com/${handle}/reels/`, { waitUntil: 'domcontentloaded' });
  await dormir(4000);
  const grid = new Map();
  for (let i = 0; i < 9; i++) {
    const itens = await page.$$eval('a[href*="/reel/"]', (as) => as.map((a) => ({ href: a.getAttribute('href').split('?')[0], texto: a.innerText.replace(/\s+/g, ' ').trim() })));
    for (const it of itens) if (!grid.has(it.href)) grid.set(it.href, it.texto);
    await page.mouse.wheel(0, 2500);
    await dormir(1800);
  }
  const reels = [...grid.entries()].map(([href, texto]) => ({ href, views: num((texto.match(/([\d.,]+\s*(?:mil|mi|k|m)?)/i) || [])[1]) })).filter((r) => r.views != null);
  reels.sort((a, b) => b.views - a.views);
  console.log(`@${handle}: ${grid.size} reels no grid, ${reels.length} com visualizações; mediana ${reels[Math.floor(reels.length / 2)]?.views ?? '?'}`);
  const detalhes = [];
  for (const r of reels.slice(0, TOP)) {
    try {
      await page.goto(`https://www.instagram.com${r.href}`, { waitUntil: 'domcontentloaded' });
      await dormir(2500 + Math.random() * 1200);
      const d = await page.evaluate(() => ({ og: document.querySelector('meta[property="og:description"]')?.content || '', time: document.querySelector('time[datetime]')?.getAttribute('datetime') || null, h1: document.querySelector('h1')?.textContent?.trim() || '' }));
      const m = d.og.match(/([\d.,]+\s*(?:mil|K|M)?)\s*(?:curtidas|likes)[^\d]*([\d.,]+\s*(?:mil|K)?)?\s*(?:coment|comments)?/i);
      const legenda = (d.og.split(/:\s*[“"]/)[1] || d.h1 || '').replace(/[”"]\s*$/, '').replace(/\s+/g, ' ').slice(0, 260);
      detalhes.push({ url: `https://www.instagram.com${r.href}`, views: r.views, curtidas: num(m?.[1]), comentarios: num(m?.[2]), data: d.time, legenda });
      console.log(String(r.views).padStart(9) + '👁', String(detalhes.at(-1).curtidas ?? '?').padStart(6) + '❤', String(detalhes.at(-1).comentarios ?? '?').padStart(4) + '💬', (d.time || '').slice(0, 10), '|', legenda.slice(0, 110));
    } catch (e) { console.log(`${r.href} falhou: ${e.message.slice(0, 60)}`); }
  }
  fs.writeFileSync(OUT, JSON.stringify({ handle, coletadoEm: new Date().toISOString(), totalGrid: grid.size, reels, top: detalhes }, null, 1));
  await page.close();
  process.exit(0);
})().catch((e) => { console.error('falhou:', e.message); process.exit(1); });

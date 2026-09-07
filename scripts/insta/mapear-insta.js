// Mapeia os posts de um perfil do Instagram usando o Chrome logado (CDP 9222): links do grid,
// e por post o og:description (curtidas, comentários, data, legenda), tipo (reel/foto/carrossel).
// Uso: node mapear-insta.js <handle> [max]
const fs = require('fs');
const { chromium } = require('C:/Users/thall/CODE/leadhunter/node_modules/playwright-core');
const handle = process.argv[2] || 'licitacerta';
const MAX = Number(process.argv[3]) || 40;
const OUT = `${__dirname}/insta-${handle}.json`;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const ctx = browser.contexts()[0];
  const page = await ctx.newPage();
  await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'domcontentloaded' });
  await dormir(4000);
  const titulo = await page.title();
  if (/login|entrar/i.test(titulo) && !(await page.$('header'))) { console.log('parede de login:', titulo); await page.close(); process.exit(1); }
  const cab = await page.evaluate(() => {
    const m = document.querySelector('meta[property="og:description"]')?.content || '';
    const bio = [...document.querySelectorAll('header section span, header section div')].map((e) => e.textContent.trim()).filter((t) => t.length > 20).slice(0, 3);
    return { og: m, bio };
  });
  console.log('perfil:', cab.og);
  const links = new Set();
  for (let i = 0; i < 10 && links.size < MAX; i++) {
    for (const h of await page.$$eval('a[href*="/p/"], a[href*="/reel/"]', (as) => as.map((a) => a.getAttribute('href')))) links.add(h.split('?')[0]);
    await page.mouse.wheel(0, 2200);
    await dormir(1800);
  }
  const lista = [...links].slice(0, MAX);
  console.log(`${lista.length} posts no grid`);
  const posts = [];
  for (const [i, href] of lista.entries()) {
    const url = `https://www.instagram.com${href}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await dormir(2500 + Math.random() * 1500);
      const d = await page.evaluate(() => {
        const og = document.querySelector('meta[property="og:description"]')?.content || '';
        const title = document.querySelector('meta[property="og:title"]')?.content || '';
        const video = !!document.querySelector('meta[property="og:video"]') || !!document.querySelector('video');
        const time = document.querySelector('time[datetime]')?.getAttribute('datetime') || null;
        const h1 = document.querySelector('h1')?.textContent?.trim() || '';
        const views = [...document.querySelectorAll('span')].map((s) => s.textContent.trim()).find((t) => /visualiza|views|reproduç/i.test(t)) || null;
        const carrossel = !!document.querySelector('button[aria-label*="Próximo"], button[aria-label*="Next"], ul li[style*="translateX"]');
        return { og, title, video, time, h1, views, carrossel };
      });
      const m = d.og.match(/([\d.,]+[KM]?)\s*(?:curtidas|likes)[^\d]*([\d.,]+[KM]?)?\s*(?:coment|comments)?/i);
      const num = (s) => { if (!s) return null; const t = s.replace(/\./g, '').replace(',', '.'); return /K$/i.test(t) ? Math.round(parseFloat(t) * 1000) : /M$/i.test(t) ? Math.round(parseFloat(t) * 1e6) : parseInt(t, 10); };
      const legenda = (d.og.split(/:\s*[“"]/)[1] || d.h1 || '').replace(/[”"]\s*$/, '').slice(0, 220);
      posts.push({ url, tipo: href.includes('/reel/') || d.video ? 'reel' : d.carrossel ? 'carrossel' : 'foto', curtidas: num(m?.[1]), comentarios: num(m?.[2]), views: d.views, data: d.time, legenda, og: d.og.slice(0, 300) });
      console.log(`${i + 1}/${lista.length} ${posts.at(-1).tipo} ${posts.at(-1).curtidas ?? '?'}❤ ${posts.at(-1).comentarios ?? '?'}💬 ${d.time?.slice(0, 10) ?? ''} · ${legenda.slice(0, 70)}`);
    } catch (e) { console.log(`${i + 1} falhou: ${e.message.slice(0, 80)}`); }
  }
  fs.writeFileSync(OUT, JSON.stringify({ handle, perfil: cab, coletadoEm: new Date().toISOString(), posts }, null, 1));
  await page.close();
  console.log('salvo em', OUT);
})().catch((e) => { console.error('falhou:', e.message); process.exit(1); });

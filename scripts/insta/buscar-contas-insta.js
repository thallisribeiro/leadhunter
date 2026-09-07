// Busca contas do Instagram por palavra (topsearch, com a sessão logada) e lê seguidores/posts de cada uma.
// Uso: node buscar-contas-insta.js "licitação" "licitações" ...
const { chromium } = require('C:/Users/thall/CODE/leadhunter/node_modules/playwright-core');
const termos = process.argv.slice(2);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  const vistos = new Map();
  for (const t of termos) {
    await page.goto(`https://www.instagram.com/web/search/topsearch/?context=blended&query=${encodeURIComponent(t)}`, { waitUntil: 'domcontentloaded' });
    await dormir(1500);
    let j = null;
    try { j = JSON.parse(await page.evaluate(() => document.body.innerText)); } catch { console.log(`"${t}": resposta não é JSON (login?)`); continue; }
    for (const u of j.users ?? []) if (!vistos.has(u.user.username)) vistos.set(u.user.username, { username: u.user.username, nome: u.user.full_name, verificado: u.user.is_verified });
  }
  const lista = [...vistos.values()].slice(0, 25);
  for (const c of lista) {
    try {
      await page.goto(`https://www.instagram.com/${c.username}/`, { waitUntil: 'domcontentloaded' });
      await dormir(2000 + Math.random() * 1000);
      const og = await page.evaluate(() => document.querySelector('meta[property="og:description"]')?.content || '');
      // "261 seguidores, seguindo 45, 57 posts — ..." / "12,3 mil seguidores" / "1.2K followers"
      const seg = og.match(/([\d.,]+\s*(?:mil|K|M)?)\s*(?:seguidores|followers)/i);
      const pst = og.match(/([\d.,]+\s*(?:mil|K)?)\s*(?:posts|publica)/i);
      const num = (s) => { if (!s) return null; let x = s.trim(); const mil = /mil$|K$/i.test(x), mi = /M$/i.test(x); x = x.replace(/mil|K|M/gi, '').trim(); const v = mil || mi ? parseFloat(x.replace(/\./g, '').replace(',', '.')) : parseInt(x.replace(/[.,]/g, ''), 10); return mil ? Math.round(v * 1000) : mi ? Math.round(v * 1e6) : v; };
      c.seguidores = num(seg?.[1]); c.posts = num(pst?.[1]); c.bio = og.split(' — ')[1]?.slice(0, 120) ?? '';
    } catch (e) { c.erro = e.message.slice(0, 60); }
  }
  lista.sort((a, b) => (b.seguidores ?? 0) - (a.seguidores ?? 0));
  for (const c of lista) console.log(String(c.seguidores ?? '?').padStart(8), String(c.posts ?? '?').padStart(5), '@' + c.username.padEnd(26), (c.nome || '').slice(0, 40).padEnd(40), c.bio);
  await page.close();
})().catch((e) => { console.error('falhou:', e.message); process.exit(1); });

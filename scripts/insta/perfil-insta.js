// Bio + seguidores + últimas 3 legendas de perfis do Instagram (Chrome logado, CDP 9222), pra escrever DM na mão.
// Uso: node perfil-insta.js handle1 handle2 ...
const fs = require('fs');
const { chromium } = require('C:/Users/thall/CODE/leadhunter/node_modules/playwright-core');
const handles = process.argv.slice(2);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  const out = [];
  for (const h of handles) {
    try {
      await page.goto(`https://www.instagram.com/${h}/`, { waitUntil: 'domcontentloaded' });
      await dormir(3500);
      const perfil = await page.evaluate(() => {
        const og = document.querySelector('meta[property="og:description"]')?.content || '';
        const header = document.querySelector('header');
        const textos = header ? [...header.querySelectorAll('span, div, a, h1, h2')].map((e) => e.innerText?.trim()).filter((t) => t && t.length > 12 && t.length < 400) : [];
        const bio = [...new Set(textos)].sort((a, b) => b.length - a.length)[0] || '';
        const links = [...document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')].map((a) => a.getAttribute('href').split('?')[0]).slice(0, 3);
        const seguir = [...document.querySelectorAll('header button')].map((b) => b.innerText.trim()).filter(Boolean);
        return { og, bio, links, botoes: seguir };
      });
      const posts = [];
      for (const l of perfil.links) {
        await page.goto(`https://www.instagram.com${l}`, { waitUntil: 'domcontentloaded' });
        await dormir(2200);
        const d = await page.evaluate(() => ({ og: document.querySelector('meta[property="og:description"]')?.content || '', time: document.querySelector('time[datetime]')?.getAttribute('datetime') || null }));
        posts.push({ url: `https://www.instagram.com${l}`, data: d.time?.slice(0, 10), legenda: (d.og.split(/:\s*[“"]/)[1] || '').replace(/\s+/g, ' ').slice(0, 300) });
      }
      out.push({ handle: h, og: perfil.og.slice(0, 120), bio: perfil.bio.replace(/\s+/g, ' ').slice(0, 300), botoes: perfil.botoes, posts });
      console.log(`\n=== @${h} · ${perfil.og.slice(0, 60)} · botões: ${perfil.botoes.join(' / ')}\nbio: ${out.at(-1).bio}`);
      for (const p of posts) console.log(`  ${p.data} ${p.legenda.slice(0, 200)}`);
    } catch (e) { console.log(`@${h} falhou: ${e.message.slice(0, 80)}`); }
  }
  fs.writeFileSync(`${__dirname}/perfis-hoje.json`, JSON.stringify(out, null, 1));
  await page.close();
  process.exit(0);
})().catch((e) => { console.error('falhou:', e.message); process.exit(1); });

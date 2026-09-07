// Segue e manda DM no Instagram pelo Chrome logado (CDP 9222), e registra no LeadHunter igual ao
// envio de ontem (leads/conversations/messages). Uso: node enviar-dm.js dms-hoje.json [--so-seguir handle1,handle2]
const fs = require('fs');
const crypto = require('crypto');
const { chromium } = require('C:/Users/thall/CODE/leadhunter/node_modules/playwright-core');
const Database = require('C:/Users/thall/CODE/leadhunter/node_modules/better-sqlite3');
const db = new Database('C:/Users/thall/CODE/leadhunter/data/leadhunter.db');
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const agora = () => new Date().toISOString();
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

async function abrirPerfil(page, handle) {
  await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'domcontentloaded' });
  await dormir(3000 + Math.random() * 1500);
  return page.evaluate(() => {
    const og = document.querySelector('meta[property="og:description"]')?.content || '';
    const botoes = [...document.querySelectorAll('header button')].map((b) => b.innerText.trim());
    const bio = [...(document.querySelector('header')?.querySelectorAll('span, div') ?? [])].map((e) => e.innerText?.trim()).filter((t) => t && t.length > 12 && t.length < 400).sort((a, b) => b.length - a.length)[0] || '';
    const seg = og.match(/([\d.,]+\s*(?:mil|K|M)?)\s*(?:seguidores|followers)/i);
    return { og, botoes, bio, seguidoresTexto: seg?.[1] ?? null };
  });
}

async function seguir(page, handle) {
  const p = await abrirPerfil(page, handle);
  if (p.botoes.some((b) => /^seguindo$|^following$|solicitado|requested/i.test(b))) return 'já seguia';
  const btn = page.locator('header button', { hasText: /^(Seguir|Follow)$/ }).first();
  if (!(await btn.count())) return `sem botão seguir (${p.botoes.join('/')})`;
  await btn.click();
  await dormir(2500);
  return 'seguiu';
}

async function enviarDm(page, handle, texto) {
  const p = await abrirPerfil(page, handle);
  // Mesmo caminho do envio que funcionou em 06/09 (leadhunter/src/integrations/browser/instagram.ts):
  // o "Enviar mensagem" do perfil é um div com role=button, não <button>; a caixa é role=textbox.
  const btnMsg = page.getByRole('button', { name: /^(message|mensagem|enviar mensagem)$/i }).first();
  await btnMsg.waitFor({ state: 'visible', timeout: 15000 }).catch(() => { throw new Error(`sem botão de mensagem (${p.botoes.join('/')})`); });
  await dormir(600 + Math.random() * 900);
  await btnMsg.click();
  await dormir(2500);
  const agoraNao = page.getByRole('button', { name: /Agora não|Not Now/i });
  if (await agoraNao.count()) { await agoraNao.first().click().catch(() => {}); await dormir(800); }
  const caixa = page.getByRole('textbox').first();
  await caixa.waitFor({ state: 'visible', timeout: 15000 });
  await caixa.click();
  await caixa.pressSequentially(texto, { delay: 40, timeout: 90000 });
  await dormir(900 + Math.random() * 1200);
  await caixa.press('Enter');
  await dormir(3000);
  const apareceu = await page.getByText(texto.slice(0, 40), { exact: false }).first().isVisible().catch(() => false);
  if (!apareceu) throw new Error('texto não apareceu na conversa depois do Enter');
  return p;
}

function registrar({ handle, nome, texto, perfil }) {
  const lead = db.prepare('select id from leads where instagram_handle = ?').get(handle);
  const t = agora();
  let leadId = lead?.id;
  if (!leadId) {
    leadId = crypto.randomUUID();
    db.prepare(`insert into leads (id, company_name, normalized_name, location_key, description, status, shortlisted, last_action_at, created_at, updated_at, funnel, instagram_handle, profile, decision_role, channel_state)
      values (?, ?, ?, '', ?, 'contacted', 0, ?, ?, ?, 'customer', ?, ?, 'owner', 'waiting_inbound_reply')`)
      .run(leadId, nome, norm(nome), perfil.bio, t, t, t, handle, JSON.stringify({ handle, name: nome, bio: perfil.bio, followersText: perfil.seguidoresTexto }));
  } else {
    db.prepare(`update leads set status = 'contacted', channel_state = 'waiting_inbound_reply', last_action_at = ?, updated_at = ? where id = ?`).run(t, t, leadId);
  }
  let conv = db.prepare(`select id from conversations where lead_id = ? and channel = 'instagram'`).get(leadId);
  if (!conv) {
    conv = { id: crypto.randomUUID() };
    db.prepare(`insert into conversations (id, lead_id, channel, owner, state, followups_sent, last_outbound_at, created_at, updated_at) values (?, ?, 'instagram', 'browser', 'waiting_inbound_reply', 0, ?, ?, ?)`).run(conv.id, leadId, t, t, t);
  } else {
    db.prepare(`update conversations set state = 'waiting_inbound_reply', last_outbound_at = ?, updated_at = ? where id = ?`).run(t, t, conv.id);
  }
  db.prepare(`insert into messages (id, conversation_id, lead_id, direction, channel, sent_via, text, created_at) values (?, ?, ?, 'out', 'instagram', 'browser', ?, ?)`).run(crypto.randomUUID(), conv.id, leadId, texto, t);
}

(async () => {
  const args = process.argv.slice(2);
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = await browser.contexts()[0].newPage();
  const soSeguir = args.indexOf('--so-seguir');
  if (soSeguir >= 0) {
    for (const h of args[soSeguir + 1].split(',')) {
      try { console.log(`@${h}: ${await seguir(page, h)}`); } catch (e) { console.log(`@${h}: falhou (${e.message.slice(0, 80)})`); }
      await dormir(15000 + Math.random() * 20000);
    }
    await page.close(); process.exit(0); // a conexão CDP segura o processo vivo pra sempre sem isto
  }
  const lista = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  const jaHoje = db.prepare(`select count(*) n from messages where direction = 'out' and created_at >= ?`).get(new Date(Date.now() - 20 * 3600000).toISOString()).n;
  if (jaHoje + lista.length > 5) { console.log(`teto: ${jaHoje} DM(s) nas últimas 20h; lista de ${lista.length} passaria de 5`); await page.close(); process.exit(1); }
  for (const dm of lista) {
    try {
      console.log(`@${dm.handle}: ${await seguir(page, dm.handle)}`);
      await dormir(4000 + Math.random() * 3000);
      const perfil = await enviarDm(page, dm.handle, dm.texto);
      registrar({ ...dm, perfil });
      console.log(`@${dm.handle}: DM enviada e registrada (${dm.texto.length} chars)`);
    } catch (e) { console.log(`@${dm.handle}: FALHOU ${e.message.slice(0, 120)}`); }
    await dormir(30000 + Math.random() * 30000);
  }
  await page.close();
  process.exit(0);
})().catch((e) => { console.error('falhou:', e.message); process.exit(1); });

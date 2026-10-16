// POST /api/curso  -> { url }  cria o pagamento do curso (R$ 14,99) no Mercado Pago
// GET  /api/curso?ref=CURSO-XXXX -> { ok, status, url }  confirma o pagamento e libera o link do grupo
const { json } = require('./_lib');

const PRECO = 14.99;
const MP = 'https://api.mercadopago.com';

async function criar(mpToken, site) {
  const ref = 'CURSO-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  const preference = {
    items: [{ id: 'curso', title: 'Curso de revenda de placas NFC', quantity: 1, unit_price: PRECO, currency_id: 'BRL' }],
    external_reference: ref,
    statement_descriptor: 'APITOUAVALIOU',
    back_urls: {
      success: site + '/curso-obrigado.html?ref=' + ref,
      pending: site + '/curso-obrigado.html?ref=' + ref,
      failure: site + '/curso?pagamento=falhou#entrar'
    },
    auto_return: 'approved'
  };
  const r = await fetch(MP + '/checkout/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + mpToken },
    body: JSON.stringify(preference)
  });
  const d = await r.json();
  if (!r.ok || !d.init_point) { console.error('mp curso:', r.status, JSON.stringify(d).slice(0, 300)); return json(502, { erro: 'Não foi possível iniciar o pagamento. Tente de novo.' }); }
  return json(200, { url: d.init_point, ref });
}

async function acesso(mpToken, ref) {
  if (!/^CURSO-[A-Z0-9]{6,24}$/.test(String(ref || ''))) return json(400, { ok: false, erro: 'Código inválido.' });
  const r = await fetch(MP + '/v1/payments/search?sort=date_created&criteria=desc&external_reference=' + encodeURIComponent(ref), {
    headers: { Authorization: 'Bearer ' + mpToken }
  });
  const d = await r.json();
  if (!r.ok) { console.error('mp curso busca:', r.status, JSON.stringify(d).slice(0, 300)); return json(502, { ok: false, erro: 'Não foi possível confirmar agora.' }); }
  const pags = (d.results || []).filter((p) => p.external_reference === ref);
  const aprovado = pags.find((p) => p.status === 'approved');
  if (aprovado) return json(200, { ok: true, status: 'approved', url: process.env.GRUPO_CURSO_URL || null });
  const pendente = pags.find((p) => ['pending', 'in_process', 'authorized'].includes(p.status));
  return json(200, { ok: false, status: pendente ? 'pending' : (pags.length ? pags[0].status : 'none') });
}

exports.handler = async (event) => {
  const mpToken = process.env.MP_ACCESS_TOKEN;
  const site = (process.env.SITE_URL || '').replace(/\/$/, '');
  if (!mpToken || !site) return json(500, { erro: 'Pagamento não configurado.' });
  try {
    if (event.httpMethod === 'POST') return await criar(mpToken, site);
    if (event.httpMethod === 'GET') return await acesso(mpToken, (event.queryStringParameters || {}).ref);
    return json(405, { erro: 'Método não permitido.' });
  } catch (err) {
    console.error('curso:', err.message);
    return json(502, { erro: 'Não foi possível concluir agora. Tente de novo.' });
  }
};

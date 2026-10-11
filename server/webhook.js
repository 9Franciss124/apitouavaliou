// Mercado Pago avisa aqui quando um pagamento muda de status.
// Se RESEND_API_KEY e NOTIFY_EMAIL existirem, envia um e-mail com os dados do pedido aprovado.
const { json } = require('./_lib');
const db = require('./_db');

exports.handler = async (event) => {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return json(500, { erro: 'sem token' });
  let id = null;
  try {
    const q = event.queryStringParameters || {};
    const b = event.body ? JSON.parse(event.body) : {};
    const tipo = q.type || q.topic || b.type || b.topic;
    if (tipo && tipo !== 'payment') return json(200, { ok: true });
    id = q['data.id'] || (b.data && b.data.id) || q.id;
  } catch (e) { /* ignora */ }
  if (!id) return json(200, { ok: true });

  try {
    const r = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return json(200, { ok: false });
    const p = await r.json();
    console.log('pagamento', id, p.status, p.external_reference);
    const m = p.metadata || {};
    const pedidoId = m.pedido || p.external_reference;
    // Atualiza o status no painel; "primeiraVez" evita e-mail repetido quando o MP avisa mais de uma vez.
    let primeiraVez = true;
    if (db.disponivel() && pedidoId) {
      try {
        const st = p.status === 'approved' ? 'pago' : (['rejected', 'cancelled'].includes(p.status) ? 'recusado' : (p.status === 'refunded' || p.status === 'charged_back' ? 'reembolsado' : 'aguardando'));
        let reg = null;
        const atual = await db.cmd(['GET', 'ped:' + pedidoId]);
        if (atual) reg = JSON.parse(atual);
        if (!reg) { // pedido não estava salvo (ex.: banco ligado depois): recria pelos metadados
          reg = { id: pedidoId, criado: Date.now(), nome: m.nome, email: m.email, whatsapp: m.whatsapp, cep: m.cep, endereco: m.endereco, itens: m.itens || {}, frete_servico: m.frete_servico, frete_valor: Number(m.frete_valor) || 0, produtos_valor: Number(m.produtos_valor) || 0, total: Number(p.transaction_amount) || 0, enviado: false, rastreio: '' };
          await db.cmd(['ZADD', 'peds', String(reg.criado), pedidoId]);
        }
        if (st === 'pago' && reg.pago_em) primeiraVez = false;
        reg.status = st;
        if (st === 'pago' && !reg.pago_em) { reg.pago_em = Date.now(); reg.pago_dia = db.dia(); reg.total = Number(p.transaction_amount) || reg.total; }
        await db.cmd(['SET', 'ped:' + pedidoId, JSON.stringify(reg)]);
      } catch (e) { console.error('webhook/db:', e.message); }
    }
    if (p.status === 'approved' && primeiraVez && process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL) {
      const it = m.itens || {};
      const linhas = [
        'Pedido ' + (m.pedido || p.external_reference),
        'Cliente: ' + m.nome, 'WhatsApp: ' + m.whatsapp, 'E-mail: ' + m.email,
        'Entrega: ' + m.endereco + ' (CEP ' + m.cep + ')',
        'Google: ' + (it.google || 0) + ' | Instagram: ' + (it.instagram || 0) + ' | Personalizada: ' + (it.personalizada || 0),
        'Frete: ' + m.frete_servico + ' - R$ ' + m.frete_valor,
        'Produtos: R$ ' + m.produtos_valor, 'Total pago: R$ ' + p.transaction_amount
      ];
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.NOTIFY_FROM || 'Apitou Avaliou <onboarding@resend.dev>', to: [process.env.NOTIFY_EMAIL], subject: 'Pedido pago ' + (m.pedido || ''), text: linhas.join('\n') })
      });
    }
  } catch (e) { console.error('webhook:', e.message); }
  return json(200, { ok: true });
};

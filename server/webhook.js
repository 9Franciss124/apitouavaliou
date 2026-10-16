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
    if (p.status === 'approved' && primeiraVez && process.env.RESEND_API_KEY) {
      const it = m.itens || {};
      const from = process.env.NOTIFY_FROM || 'Apitou Avaliou <onboarding@resend.dev>';
      const enviar = async (corpo) => {
        try {
          const r2 = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ from }, corpo))
          });
          if (!r2.ok) console.error('resend:', r2.status, (await r2.text()).slice(0, 200));
        } catch (e) { console.error('resend:', e.message); }
      };
      // 1) aviso para o dono
      if (process.env.NOTIFY_EMAIL) {
        const linhas = [
          'Pedido ' + pedidoId,
          'Cliente: ' + m.nome, 'WhatsApp: ' + m.whatsapp, 'E-mail: ' + m.email,
          'Entrega: ' + m.endereco + ' (CEP ' + m.cep + ')',
          'Google: ' + (it.google || 0) + ' | Google azul 10x10: ' + (it.gqa || 0) + ' | Google preta 10x10: ' + (it.gqp || 0) + ' | Insta rosa 10x10: ' + (it.iqr || 0) + ' | Insta preta 10x10: ' + (it.iqp || 0) + ' | Instagram: ' + (it.instagram || 0) + ' | Personalizada: ' + (it.personalizada || 0),
          'Frete: ' + m.frete_servico + ' - R$ ' + m.frete_valor,
          'Produtos: R$ ' + m.produtos_valor, 'Total pago: R$ ' + p.transaction_amount
        ];
        await enviar({ to: [process.env.NOTIFY_EMAIL], subject: 'Pedido pago ' + (pedidoId || ''), text: linhas.join('\n') });
      }
      // 2) confirmação para o cliente (só funciona com o domínio verificado no Resend)
      if (m.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.email) && from.indexOf('resend.dev') === -1) {
        const h = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const nomes = { google: 'Placa NFC Google', gqa: 'Placa NFC Google azul com QR Code', gqp: 'Placa NFC Google preta com QR Code', iqr: 'Placa NFC Instagram rosa com QR Code', iqp: 'Placa NFC Instagram preta com QR Code', instagram: 'Placa NFC Instagram', personalizada: 'Placa NFC Personalizada' };
        const itens = Object.keys(nomes).filter((k) => it[k] > 0).map((k) => it[k] + '× ' + nomes[k]);
        const primeiro = String(m.nome || '').split(' ')[0] || 'tudo bem';
        const texto = [
          'Oi, ' + primeiro + '! Recebemos o seu pagamento. 🎉', '',
          'Pedido: ' + pedidoId, 'Itens: ' + itens.join(', '),
          'Frete (' + (m.frete_servico || '') + '): ' + brl(m.frete_valor),
          'Total pago: ' + brl(p.transaction_amount), '',
          'Entrega em: ' + m.endereco, '',
          'Vamos separar o seu pedido e avisar pelo WhatsApp quando ele for enviado.',
          'Dúvidas? Chame a gente: https://wa.me/5585997307346', '',
          'Apitou Avaliou • @apitouavaliou'
        ].join('\n');
        const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#14171c">'
          + '<h2 style="margin:0 0 6px">Pagamento confirmado ✅</h2>'
          + '<p style="margin:0 0 16px;color:#4a5360">Oi, ' + h(primeiro) + '! Recebemos o seu pagamento.</p>'
          + '<table style="width:100%;border-collapse:collapse;font-size:14px">'
          + '<tr><td style="padding:8px 0;color:#7a8494">Pedido</td><td style="padding:8px 0;text-align:right"><b>' + h(pedidoId) + '</b></td></tr>'
          + '<tr><td style="padding:8px 0;color:#7a8494">Itens</td><td style="padding:8px 0;text-align:right">' + h(itens.join(', ')) + '</td></tr>'
          + '<tr><td style="padding:8px 0;color:#7a8494">Frete</td><td style="padding:8px 0;text-align:right">' + h(m.frete_servico) + ' · ' + brl(m.frete_valor) + '</td></tr>'
          + '<tr><td style="padding:8px 0;color:#7a8494;border-top:1px solid #e3e6eb">Total pago</td><td style="padding:8px 0;text-align:right;border-top:1px solid #e3e6eb"><b>' + brl(p.transaction_amount) + '</b></td></tr>'
          + '</table>'
          + '<p style="font-size:14px;color:#4a5360"><b>Entrega em:</b> ' + h(m.endereco) + '</p>'
          + '<p style="font-size:14px;color:#4a5360">Vamos separar o seu pedido e avisar pelo WhatsApp quando ele for enviado.</p>'
          + '<p><a href="https://wa.me/5585997307346" style="display:inline-block;background:#25d366;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold">Falar no WhatsApp</a></p>'
          + '<p style="font-size:12px;color:#7a8494">Apitou Avaliou • @apitouavaliou</p></div>';
        await enviar({ to: [m.email], subject: 'Pedido ' + pedidoId + ' confirmado — Apitou Avaliou', text: texto, html, reply_to: process.env.NOTIFY_EMAIL || undefined });
      }
    }
  } catch (e) { console.error('webhook:', e.message); }
  return json(200, { ok: true });
};

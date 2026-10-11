// POST /api/checkout  { cliente, endereco, itens, freteId }  ->  { url }
// Recalcula tudo no servidor (preços e frete) antes de criar a preferência no Mercado Pago.
const { PRECOS, NOMES, precoUnit, lerItens, subtotal, soDigitos, cepValido, json, cotarFrete } = require('./_lib');
const db = require('./_db');

const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
const txt = (s, n) => String(s || '').trim().slice(0, n);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { erro: 'Método não permitido.' });
  const mpToken = process.env.MP_ACCESS_TOKEN;
  const site = (process.env.SITE_URL || '').replace(/\/$/, '');
  if (!mpToken || !site) return json(500, { erro: 'Pagamento não configurado.' });

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { erro: 'Pedido inválido.' }); }

  const { itens, total } = lerItens(b.itens);
  if (total < 1) return json(400, { erro: 'Escolha ao menos 1 placa.' });

  const c = b.cliente || {}, e = b.endereco || {};
  const nome = txt(c.nome, 80), email = txt(c.email, 120), tel = soDigitos(c.whatsapp);
  if (nome.split(' ').length < 2) return json(400, { erro: 'Informe nome e sobrenome.' });
  if (!emailOk(email)) return json(400, { erro: 'E-mail inválido.' });
  if (tel.length < 10 || tel.length > 11) return json(400, { erro: 'WhatsApp inválido. Use DDD + número.' });
  if (!cepValido(e.cep)) return json(400, { erro: 'CEP inválido.' });
  const rua = txt(e.rua, 100), numero = txt(e.numero, 15), bairro = txt(e.bairro, 60), cidade = txt(e.cidade, 60), uf = txt(e.uf, 2).toUpperCase();
  if (!rua || !numero || !cidade || uf.length !== 2) return json(400, { erro: 'Complete o endereço de entrega.' });

  let opcao;
  try {
    const opcoes = await cotarFrete(e.cep, itens, total);
    opcao = opcoes.find((o) => o.id === String(b.freteId));
  } catch (err) {
    console.error('checkout/frete:', err.message);
    return json(502, { erro: 'Não foi possível confirmar o frete. Tente de novo.' });
  }
  if (!opcao) return json(400, { erro: 'Opção de frete indisponível. Calcule o frete de novo.' });

  const pedido = 'AA-' + Date.now().toString(36).toUpperCase();
  const items = Object.keys(PRECOS).filter((k) => itens[k] > 0).map((k) => ({
    id: k, title: NOMES[k], quantity: itens[k], unit_price: precoUnit(k, total), currency_id: 'BRL'
  }));
  const complemento = txt(e.complemento, 60);
  const preference = {
    items,
    payer: { name: nome.split(' ')[0], surname: nome.split(' ').slice(1).join(' '), email, phone: { area_code: tel.slice(0, 2), number: tel.slice(2) } },
    shipments: {
      mode: 'not_specified',
      cost: opcao.preco,
      receiver_address: {
        zip_code: soDigitos(e.cep), street_name: rua, street_number: numero,
        floor: complemento, apartment: complemento, city_name: cidade, state_name: uf
      }
    },
    external_reference: pedido,
    statement_descriptor: 'APITOUAVALIOU',
    back_urls: { success: site + '/obrigado.html?pedido=' + pedido, pending: site + '/obrigado.html?pedido=' + pedido + '&status=pendente', failure: site + '/?pagamento=falhou#finalizar' },
    auto_return: 'approved',
    notification_url: site + '/api/webhook',
    metadata: {
      pedido, nome, email, whatsapp: tel, cep: soDigitos(e.cep), endereco: `${rua}, ${numero}${complemento ? ' - ' + complemento : ''} - ${bairro} - ${cidade}/${uf}`,
      itens, frete_servico: opcao.nome, frete_valor: opcao.preco, produtos_valor: subtotal(itens)
    }
  };

  try {
    const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + mpToken },
      body: JSON.stringify(preference)
    });
    const d = await r.json();
    if (!r.ok || !d.init_point) { console.error('mp:', r.status, JSON.stringify(d).slice(0, 400)); return json(502, { erro: 'Não foi possível iniciar o pagamento. Tente de novo.' }); }
    // Guarda o pedido para o painel (se o banco estiver configurado). Falha aqui não atrapalha a compra.
    if (db.disponivel()) {
      try {
        const reg = {
          id: pedido, criado: Date.now(), status: 'aguardando', nome, email, whatsapp: tel,
          cep: soDigitos(e.cep), endereco: preference.metadata.endereco, itens,
          frete_servico: opcao.nome, frete_valor: opcao.preco, produtos_valor: subtotal(itens),
          total: Math.round((subtotal(itens) + opcao.preco) * 100) / 100,
          enviado: false, rastreio: ''
        };
        await db.pipeline([['SET', 'ped:' + pedido, JSON.stringify(reg)], ['ZADD', 'peds', String(reg.criado), pedido]]);
      } catch (err) { console.error('salvar pedido:', err.message); }
    }
    return json(200, { url: d.init_point, pedido });
  } catch (err) {
    console.error('mp:', err.message);
    return json(502, { erro: 'Não foi possível iniciar o pagamento. Tente de novo.' });
  }
};

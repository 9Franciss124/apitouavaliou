// Funções compartilhadas: preços, validação e cotação de frete (Melhor Envio).
const PRECOS = { google: 19.99, gqa: 19.99, gqp: 19.99, iqr: 22.99, iqp: 22.99, instagram: 22.99, personalizada: 27.99 };
const NOMES = { google: 'Placa NFC Google 10x15', gqa: 'Placa NFC Google azul com QR Code 10x10', gqp: 'Placa NFC Google preta com QR Code 10x10', iqr: 'Placa NFC Instagram branca com QR Code 10x10', iqp: 'Placa NFC Instagram preta com QR Code 10x10', instagram: 'Placa NFC Instagram 10x15', personalizada: 'Placa NFC Personalizada 10x15' };
const MAX_POR_MODELO = 2000;

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };

function lerItens(raw) {
  const itens = {};
  let total = 0;
  for (const k of Object.keys(PRECOS)) {
    let q = parseInt(raw && raw[k], 10);
    if (!Number.isFinite(q) || q < 0) q = 0;
    if (q > MAX_POR_MODELO) q = MAX_POR_MODELO;
    itens[k] = q;
    total += q;
  }
  return { itens, total };
}

const centavos = (v) => Math.round(v * 100);

// Tabela de preços por quantidade (soma de todas as placas do pedido, de qualquer modelo).
// Preços fechados, terminando em ,00 / ,49 / ,99. Abaixo de 50 placas vale o preço base (PRECOS).
const FAIXAS = [
  { min: 150, p: { google: 16.99, gqa: 16.99, gqp: 16.99, iqr: 19.49, iqp: 19.49, instagram: 19.49, personalizada: 23.49 } },
  { min: 100, p: { google: 17.49, gqa: 17.49, gqp: 17.49, iqr: 19.99, iqp: 19.99, instagram: 19.99, personalizada: 24.49 } },
  { min: 50, p: { google: 17.99, gqa: 17.99, gqp: 17.99, iqr: 20.49, iqp: 20.49, instagram: 20.49, personalizada: 25.00 } }
];
const centavosUnit = (k, total) => {
  const f = FAIXAS.find((x) => total >= x.min);
  return centavos(f ? f.p[k] : PRECOS[k]);
};
const precoUnit = (k, total) => centavosUnit(k, total) / 100;

function subtotal(itens) {
  let total = 0;
  for (const k of Object.keys(PRECOS)) total += itens[k];
  let c = 0;
  for (const k of Object.keys(PRECOS)) c += itens[k] * centavosUnit(k, total);
  return c / 100;
}

const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const cepValido = (s) => soDigitos(s).length === 8;

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) };
}

async function cotarFrete(cepDestino, itens, total) {
  const token = process.env.ME_TOKEN;
  const origem = soDigitos(process.env.ORIGEM_CEP);
  if (!token || origem.length !== 8) throw new Error('Frete não configurado (ME_TOKEN / ORIGEM_CEP).');
  const base = process.env.ME_SANDBOX === 'true' ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
  const unit = subtotal(itens) / total;
  const body = {
    from: { postal_code: origem },
    to: { postal_code: soDigitos(cepDestino) },
    products: [{
      id: 'placa-nfc',
      width: num(process.env.LARGURA_CM, 15),
      height: num(process.env.ALTURA_CM, 3),
      length: num(process.env.COMPRIMENTO_CM, 20),
      weight: num(process.env.PESO_PLACA_KG, 0.15),
      insurance_value: Number(unit.toFixed(2)),
      quantity: total
    }],
    options: { receipt: false, own_hand: false }
  };
  const r = await fetch(base + '/api/v2/me/shipment/calculate', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
      'User-Agent': 'Apitou Avaliou (' + (process.env.ME_CONTATO_EMAIL || 'contato') + ')'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('Melhor Envio respondeu ' + r.status);
  const data = await r.json();
  const lista = (Array.isArray(data) ? data : [])
    .filter((o) => o && !o.error && (o.custom_price || o.price))
    .map((o) => {
      const preco = Number(o.custom_price || o.price);
      const dr = o.delivery_range || {};
      return {
        id: String(o.id),
        nome: [o.company && o.company.name, o.name].filter(Boolean).join(' '),
        preco: Number(preco.toFixed(2)),
        prazoMin: dr.min || o.custom_delivery_time || o.delivery_time || null,
        prazoMax: dr.max || o.custom_delivery_time || o.delivery_time || null
      };
    })
    .filter((o) => o.preco > 0)
    .sort((a, b) => a.preco - b.preco);
  return lista;
}

module.exports = { PRECOS, NOMES, FAIXAS, precoUnit, lerItens, subtotal, soDigitos, cepValido, json, cotarFrete, centavos };

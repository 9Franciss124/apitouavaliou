// POST /api/cupom  { codigo, itens }  ->  { codigo, tipo, valor, desconto }
const { lerItens, subtotal, aplicarCupom, json } = require('./_lib');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { erro: 'Método não permitido.' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { erro: 'Pedido inválido.' }); }
  const { itens, total } = lerItens(b.itens);
  if (total < 1) return json(400, { erro: 'Escolha ao menos 1 placa antes de aplicar o cupom.' });
  const r = aplicarCupom(b.codigo, subtotal(itens));
  if (!r) return json(404, { erro: 'Cupom inválido ou expirado.' });
  return json(200, { codigo: r.codigo, tipo: r.tipo, valor: r.valor, desconto: r.descontoCent / 100 });
};

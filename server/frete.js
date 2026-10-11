// POST /api/frete  { cep, itens:{google,instagram,personalizada} }  ->  { opcoes:[...] }
const { lerItens, cepValido, json, cotarFrete } = require('./_lib');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { erro: 'Método não permitido.' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { erro: 'Pedido inválido.' }); }
  const { itens, total } = lerItens(b.itens);
  if (total < 1) return json(400, { erro: 'Escolha ao menos 1 placa.' });
  if (!cepValido(b.cep)) return json(400, { erro: 'CEP inválido.' });
  try {
    const opcoes = await cotarFrete(b.cep, itens, total);
    if (!opcoes.length) return json(200, { opcoes: [], aviso: 'Nenhuma entrega disponível para esse CEP.' });
    return json(200, { opcoes });
  } catch (e) {
    console.error('frete:', e.message);
    return json(502, { erro: 'Não foi possível calcular o frete agora. Tente de novo ou fale pelo WhatsApp.' });
  }
};

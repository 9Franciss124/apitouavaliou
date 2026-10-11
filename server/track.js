// POST /api/track { v: idDoVisitante, e: evento }  -> conta visitantes únicos por dia e evento
const { json } = require('./_lib');
const db = require('./_db');

const EVENTOS = ['visita', 'simulou', 'frete', 'pagar'];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { erro: 'Método não permitido.' });
  if (!db.disponivel()) return json(200, { ok: false });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { erro: 'inválido' }); }
  const v = String(b.v || ''), e = String(b.e || '');
  if (!/^[a-z0-9]{8,40}$/i.test(v) || !EVENTOS.includes(e)) return json(400, { erro: 'inválido' });
  try {
    const chave = 'v:' + db.dia() + ':' + e;
    await db.pipeline([['SADD', chave, v], ['EXPIRE', chave, 60 * 60 * 24 * 400]]);
  } catch (err) { console.error('track:', err.message); }
  return json(200, { ok: true });
};

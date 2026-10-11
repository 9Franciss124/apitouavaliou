// Banco de dados simples: Upstash Redis via REST (grátis na Vercel: Storage > Upstash Redis).
// Aceita as variáveis KV_REST_API_URL/TOKEN ou UPSTASH_REDIS_REST_URL/TOKEN.
const URL_ = () => (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
const TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

const disponivel = () => !!(URL_() && TOKEN());

async function chamar(path, body) {
  const r = await fetch(URL_() + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('Redis respondeu ' + r.status);
  return r.json();
}

// cmd(['SADD','chave','valor']) -> resultado
async function cmd(args) {
  const d = await chamar('', args);
  if (d.error) throw new Error(d.error);
  return d.result;
}

// pipeline([[...],[...]]) -> [resultado, ...]
async function pipeline(cmds) {
  if (!cmds.length) return [];
  const d = await chamar('/pipeline', cmds);
  return d.map((x) => { if (x.error) throw new Error(x.error); return x.result; });
}

// Dia no fuso de Fortaleza (UTC-3), formato AAAA-MM-DD
function dia(ts) {
  return new Date((ts || Date.now()) - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

module.exports = { disponivel, cmd, pipeline, dia };

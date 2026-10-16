// POST /api/painel  { acao: 'login'|'dados'|'enviar', ... }
// Protegido por senha única (variável ADMIN_PASSWORD). Login devolve um token assinado válido por 12h.
const crypto = require('crypto');
const { json } = require('./_lib');
const db = require('./_db');

const DURACAO = 12 * 3600 * 1000;
const EVENTOS = ['visita', 'simulou', 'frete', 'pagar'];

const assinar = (exp, senha) => crypto.createHmac('sha256', senha).update('painel:' + exp).digest('hex');
function igual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function tokenValido(tok, senha) {
  const [exp, sig] = String(tok || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return igual(sig, assinar(exp, senha));
}

function diasAtras(n) { // lista de datas (AAAA-MM-DD), da mais antiga para hoje
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(db.dia(Date.now() - i * 86400000));
  return out;
}

async function dados(n) {
  const dias = diasAtras(n);
  const cmds = [];
  for (const d of dias) for (const e of EVENTOS) cmds.push(['SCARD', 'v:' + d + ':' + e]);
  // Únicos no período inteiro (uma pessoa que volta em outro dia conta uma vez)
  const tmp = 'tmp:' + crypto.randomBytes(4).toString('hex');
  for (const e of EVENTOS) {
    const chaves = dias.map((d) => 'v:' + d + ':' + e);
    cmds.push(['SUNIONSTORE', tmp + e, ...chaves], ['SCARD', tmp + e], ['DEL', tmp + e]);
  }
  const ids = (await db.cmd(['ZRANGE', 'peds', '0', '499', 'REV'])) || [];
  const [res, brutos] = await Promise.all([
    db.pipeline(cmds),
    ids.length ? db.cmd(['MGET', ...ids.map((i) => 'ped:' + i)]) : []
  ]);

  const porDia = dias.map((d, i) => {
    const o = { dia: d, pedidos: 0, pagos: 0, faturamento: 0 };
    EVENTOS.forEach((e, j) => { o[e] = res[i * EVENTOS.length + j] || 0; });
    return o;
  });
  const base = dias.length * EVENTOS.length;
  const unicos = {};
  EVENTOS.forEach((e, j) => { unicos[e] = res[base + j * 3 + 1] || 0; });

  const pedidos = brutos.filter(Boolean).map((x) => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean);
  const mapaDia = {}; porDia.forEach((d) => { mapaDia[d.dia] = d; });
  const inicio = dias[0];
  const modelos = { google: 0, googleqr: 0, instagram: 0, personalizada: 0 };
  let fat = 0, prod = 0, frete = 0, pagos = 0, criados = 0, enviados = 0, aEnviar = 0;
  for (const p of pedidos) {
    const dCria = db.dia(p.criado);
    if (dCria >= inicio) { criados++; if (mapaDia[dCria]) mapaDia[dCria].pedidos++; }
    if (p.status === 'pago') {
      const dPago = p.pago_dia || dCria;
      if (dPago >= inicio) {
        pagos++; fat += p.total; prod += p.produtos_valor; frete += p.frete_valor;
        for (const k of Object.keys(modelos)) modelos[k] += (p.itens && p.itens[k]) || 0;
        if (mapaDia[dPago]) { mapaDia[dPago].pagos++; mapaDia[dPago].faturamento += p.total; }
      }
      if (p.enviado) enviados++; else aEnviar++;
    }
  }
  const r2 = (x) => Math.round(x * 100) / 100;
  porDia.forEach((d) => { d.faturamento = r2(d.faturamento); });
  return {
    dias: n, porDia, unicos,
    resumo: { faturamento: r2(fat), produtos: r2(prod), frete: r2(frete), pagos, criados, ticket: pagos ? r2(fat / pagos) : 0, enviados, aEnviar, modelos },
    pedidos: pedidos.slice(0, 200)
  };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { erro: 'Método não permitido.' });
  const senha = process.env.ADMIN_PASSWORD;
  if (!senha || senha.length < 8) return json(500, { erro: 'Painel não configurado: defina ADMIN_PASSWORD (mín. 8 caracteres) na Vercel.' });
  if (!db.disponivel()) return json(500, { erro: 'Banco não conectado: crie o Upstash Redis em Storage na Vercel.' });

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { erro: 'Pedido inválido.' }); }
  const h = event.headers || {};

  try {
    if (b.acao === 'login') {
      const ip = String(h['x-forwarded-for'] || h['x-real-ip'] || 'x').split(',')[0].trim().replace(/[^0-9a-f:.]/gi, '').slice(0, 45) || 'x';
      const chave = 'rl:' + ip;
      const [n] = await db.pipeline([['INCR', chave], ['EXPIRE', chave, 900]]);
      if (n > 10) return json(429, { erro: 'Muitas tentativas. Aguarde 15 minutos.' });
      if (!igual(crypto.createHash('sha256').update(String(b.senha || '')).digest('hex'), crypto.createHash('sha256').update(senha).digest('hex'))) return json(401, { erro: 'Senha incorreta.' });
      const exp = String(Date.now() + DURACAO);
      return json(200, { token: exp + '.' + assinar(exp, senha) });
    }

    const auth = String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '');
    if (!tokenValido(auth, senha)) return json(401, { erro: 'Sessão expirada. Entre de novo.' });

    if (b.acao === 'dados') {
      const n = [7, 30, 90].includes(Number(b.dias)) ? Number(b.dias) : 30;
      return json(200, await dados(n));
    }
    if (b.acao === 'enviar') {
      const id = String(b.id || '');
      if (!/^AA-[A-Z0-9]{3,20}$/.test(id)) return json(400, { erro: 'Pedido inválido.' });
      const atual = await db.cmd(['GET', 'ped:' + id]);
      if (!atual) return json(404, { erro: 'Pedido não encontrado.' });
      const reg = JSON.parse(atual);
      reg.enviado = b.enviado !== false;
      reg.enviado_em = reg.enviado ? Date.now() : null;
      reg.rastreio = String(b.rastreio || reg.rastreio || '').slice(0, 40);
      await db.cmd(['SET', 'ped:' + id, JSON.stringify(reg)]);
      return json(200, { ok: true, pedido: reg });
    }
    return json(400, { erro: 'Ação desconhecida.' });
  } catch (err) {
    console.error('painel:', err.message);
    return json(500, { erro: 'Erro ao consultar o banco.' });
  }
};

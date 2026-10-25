// Adaptador Vercel -> lógica em server/cupom.js
const { handler } = require('../server/cupom');
module.exports = async (req, res) => {
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const r = await handler({ httpMethod: req.method, body, queryStringParameters: req.query || {} });
  Object.entries(r.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.status(r.statusCode).send(r.body);
};

// Contagem anônima de visitas e etapas do funil (sem cookies, só um ID aleatório no aparelho).
(function () {
  var vid;
  try { vid = localStorage.getItem('aa_v'); } catch (e) {}
  if (!vid) {
    vid = Array.from(crypto.getRandomValues(new Uint8Array(12))).map(function (b) { return (b % 36).toString(36); }).join('');
    try { localStorage.setItem('aa_v', vid); } catch (e) {}
  }
  var feitos = {};
  function ev(e) {
    if (feitos[e]) return; feitos[e] = 1;
    try { fetch('/api/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v: vid, e: e }) }); } catch (x) {}
  }
  ev('visita');
  document.addEventListener('click', function (t) {
    var el = t.target && t.target.closest ? t.target.closest('.qty button, #btn-frete, #btn-pagar') : null;
    if (!el) return;
    if (el.id === 'btn-frete') ev('frete');
    else if (el.id === 'btn-pagar') ev('pagar');
    else ev('simulou');
  }, true);
  document.addEventListener('input', function (t) { if (t.target && t.target.closest && t.target.closest('.qty')) ev('simulou'); }, true);
})();

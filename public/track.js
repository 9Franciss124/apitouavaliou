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

// Selos de confiança perto do botão de pagar.
(function () {
  function montar() {
    var nota = document.querySelector('.paynote');
    if (!nota || document.getElementById('selos')) return;
    var st = document.createElement('style');
    st.textContent = '#selos{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:12px 0 4px}#selos div{display:flex;align-items:center;gap:8px;padding:9px 10px;border:1px solid var(--line,#e4e8ef);border-radius:10px;background:var(--bg2,#fff);font-size:12.5px;line-height:1.25;color:var(--fg,#1b2230)}#selos svg{width:20px;height:20px;flex:none;stroke:var(--blue,#2b7de9);fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}#selos b{display:block;font-size:12.5px}#selos span{color:var(--mut,#5b6678);font-size:11.5px}@media(max-width:420px){#selos{grid-template-columns:1fr}}';
    document.head.appendChild(st);
    var d = document.createElement('div');
    d.id = 'selos';
    d.setAttribute('aria-label', 'Garantias de compra');
    d.innerHTML =
      '<div><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><p style="margin:0"><b>Pagamento seguro</b><span>Processado pelo Mercado Pago</span></p></div>' +
      '<div><svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg><p style="margin:0"><b>Dados protegidos</b><span>Não guardamos dados de cartão</span></p></div>' +
      '<div><svg viewBox="0 0 24 24"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg><p style="margin:0"><b>Envio para todo o Brasil</b><span>Rastreio pelo WhatsApp</span></p></div>' +
      '<div><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.7 7L4 20l1.1-4.9A8 8 0 1 1 21 12z"/></svg><p style="margin:0"><b>Suporte humano</b><span>Fale com a gente no WhatsApp</span></p></div>';
    nota.parentNode.insertBefore(d, nota.nextSibling);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();

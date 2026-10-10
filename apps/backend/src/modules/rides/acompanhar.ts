import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Compartilhar a corrida (Evandro, 10/10/2026): o passageiro manda um link
 * e a familia acompanha a viagem no mapa. O link leva so o numero da
 * corrida + uma assinatura do servidor (ninguem adivinha nem fabrica outro).
 */
export function tokenDeAcompanhar(rideId: string, segredo: string): string {
  const assinatura = createHmac('sha256', segredo).update(`acompanhar:${rideId}`).digest('base64url').slice(0, 22);
  return `${rideId.replace(/-/g, '')}${assinatura}`;
}

/** Corrida do link, ou null se o link for falso. */
export function corridaDoToken(token: string, segredo: string): string | null {
  if (!/^[0-9a-f]{32}[A-Za-z0-9_-]{22}$/.test(token)) return null;
  const h = token.slice(0, 32);
  const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  const certo = Buffer.from(tokenDeAcompanhar(id, segredo));
  const veio = Buffer.from(token);
  return certo.length === veio.length && timingSafeEqual(certo, veio) ? id : null;
}

/** Pagina publica do acompanhamento (mapa OpenStreetMap + Leaflet). */
export function paginaDeAcompanhar(token: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fortaleza Mov - acompanhar viagem</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
  html, body { margin: 0; height: 100%; font-family: system-ui, -apple-system, Roboto, Arial, sans-serif; background: #eef0f3; color: #14181f; }
  #mapa { position: absolute; inset: 0 0 170px 0; }
  #painel { position: absolute; left: 0; right: 0; bottom: 0; min-height: 170px; box-sizing: border-box; padding: 16px 18px; background: #fff;
    border-radius: 18px 18px 0 0; box-shadow: 0 -4px 18px rgba(0,0,0,.12); }
  .marca { display: inline-block; background: #1E5BB8; color: #fff; font-weight: 700; padding: 4px 12px; border-radius: 999px; font-size: 13px; }
  h1 { font-size: 20px; margin: 10px 0 4px; }
  .linha { font-size: 15px; color: #475467; margin: 3px 0; }
  .fim { color: #2E9E5B; font-weight: 700; }
  .carro { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 50%; background: #14181f; color: #fff; font-size: 18px; border: 3px solid #fff; box-shadow: 0 1px 6px rgba(0,0,0,.35); }
</style>
</head>
<body>
<div id="mapa"></div>
<div id="painel">
  <span class="marca">Fortaleza Mov</span>
  <h1 id="situacao">Carregando a viagem...</h1>
  <p class="linha" id="motorista"></p>
  <p class="linha" id="trajeto"></p>
  <p class="linha" id="hora"></p>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var TOKEN = ${JSON.stringify(token)};
  var mapa = L.map('mapa', { zoomControl: false }).setView([-15.8, -47.9], 4);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapa);
  var ponto = function (cor) { return L.circleMarker([0, 0], { radius: 9, color: '#fff', weight: 3, fillColor: cor, fillOpacity: 1 }); };
  var embarque = ponto('#2E9E5B'), destino = ponto('#D93A3A'), carro = null, enquadrou = false;
  function texto(id, t) { document.getElementById(id).textContent = t || ''; }
  function atualizar() {
    fetch('/api/acompanhar/' + TOKEN + '/dados', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.success) { texto('situacao', (j && j.error && j.error.message) || 'Este acompanhamento terminou.'); return; }
      var d = j.data;
      texto('situacao', d.situacao);
      document.getElementById('situacao').className = d.encerrada ? 'fim' : '';
      texto('motorista', d.motorista ? ('Motorista: ' + d.motorista + (d.carro ? ' - ' + d.carro : '') + (d.placa ? ' - placa ' + d.placa : '')) : '');
      texto('trajeto', 'De ' + d.embarque.endereco + ' para ' + d.destino.endereco);
      texto('hora', 'Atualizado as ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      embarque.setLatLng([d.embarque.latitude, d.embarque.longitude]).addTo(mapa);
      destino.setLatLng([d.destino.latitude, d.destino.longitude]).addTo(mapa);
      var pontos = [[d.embarque.latitude, d.embarque.longitude], [d.destino.latitude, d.destino.longitude]];
      if (d.posicao) {
        var ll = [d.posicao.latitude, d.posicao.longitude];
        if (!carro) {
          carro = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="carro">' + (d.moto ? '&#x1F3CD;' : '&#x1F697;') + '</div>', iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(mapa);
        } else { carro.setLatLng(ll); }
        pontos.push(ll);
      } else if (carro) { mapa.removeLayer(carro); carro = null; }
      if (!enquadrou) { mapa.fitBounds(pontos, { padding: [40, 40], maxZoom: 16 }); enquadrou = true; }
      if (!d.encerrada) setTimeout(atualizar, 5000);
    }).catch(function () { setTimeout(atualizar, 8000); });
  }
  atualizar();
</script>
</body>
</html>`;
}

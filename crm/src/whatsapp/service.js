'use strict';
// Orquestra o canal do WhatsApp: liga/desliga, recebe mensagens, roda a fila de envio.
const path = require('path');
const { createStore } = require('./store');

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createService({ db, getSetting, setSetting, dataDir, log = console, now, pausaEntreEnvios, criarCanal }) {
  const store = createStore(db, { now });
  let canal = null;
  let timer = null;
  let rodando = false;
  let cutucando = false;
  let gancho = null; // chamado quando chega uma mensagem de cliente (ex.: análise automática da IA)

  // Pausa "humana" entre envios seguidos (1,2 a 3,5 s). Nos testes, injete () => 0.
  // WA_PAUSA_MS força um valor fixo (0 desliga a pausa; usado nos testes).
  const pausa = pausaEntreEnvios || (() => (process.env.WA_PAUSA_MS !== undefined
    ? Number(process.env.WA_PAUSA_MS) : 1200 + Math.floor(Math.random() * 2300)));

  function escolherCanal() {
    if (criarCanal) return criarCanal();
    if (process.env.WA_CANAL === 'fake') return require('./fake-channel').criarCanalFalso({ conectado: true });
    return require('./baileys-channel').criar({
      authDir: path.join(dataDir, 'wa-auth'),
      libDir: process.env.WA_LIB_DIR ? path.resolve(process.env.WA_LIB_DIR) : path.join(dataDir, 'wa-lib'),
      log
    });
  }

  const handlers = {
    onMessage(evt) {
      try {
        const r = store.ingerir(evt);
        if (r && r.inserido && !evt.deMim && gancho) gancho(r.conversaId);
      } catch (err) { log.error('[whatsapp] erro ao gravar mensagem:', err.message); }
    },
    onStatus({ externoId, status }) {
      try { store.registrarStatus(externoId, status); } catch (err) { log.error('[whatsapp] erro ao gravar status:', err.message); }
    },
    onConnection(estado) {
      log.log(`[whatsapp] ${estado.state}${estado.detail ? ` — ${estado.detail}` : ''}`);
      if (estado.state === 'conectado') cutucar();
    }
  };

  async function processarFila() {
    if (rodando || !canal) return 0;
    rodando = true;
    let enviadas = 0;
    try {
      if (canal.getState().state !== 'conectado') return 0;
      for (;;) {
        const lote = store.reservarPendentes(5);
        if (!lote.length) break;
        for (const m of lote) {
          if (m.ignorado) { store.falharEnvio(m.id, 'Contato ignorado'); continue; }
          try {
            const r = await canal.sendText(m.jid, m.texto);
            store.concluirEnvio(m.id, r && r.externalId);
            enviadas += 1;
          } catch (err) {
            store.falharEnvio(m.id, err.message);
          }
          const espera = pausa();
          if (espera > 0) await dormir(espera);
        }
      }
    } finally {
      rodando = false;
    }
    return enviadas;
  }

  // Dispara o processamento logo (sem esperar o próximo ciclo do timer).
  function cutucar() {
    if (cutucando) return;
    cutucando = true;
    setImmediate(() => {
      cutucando = false;
      processarFila().catch((err) => log.error('[whatsapp] fila:', err.message));
    });
  }

  async function ligar() {
    if (!canal) canal = escolherCanal();
    store.recolocarEnviando();
    await canal.start(handlers);
    if (!timer) {
      timer = setInterval(() => { processarFila().catch((err) => log.error('[whatsapp] fila:', err.message)); }, 2000);
      if (timer.unref) timer.unref();
    }
  }

  async function desligar() {
    if (timer) { clearInterval(timer); timer = null; }
    if (canal) { try { await canal.stop(); } catch (err) { log.error('[whatsapp]', err.message); } }
  }

  async function iniciar() {
    if (getSetting('wa_ativo', '0') === '1') {
      try { await ligar(); } catch (err) { log.error('[whatsapp] não foi possível iniciar:', err.message); }
    }
  }

  async function definirAtivo(ativo) {
    setSetting('wa_ativo', ativo ? '1' : '0');
    if (ativo) await ligar(); else await desligar();
  }

  function estado() {
    const ativo = getSetting('wa_ativo', '0') === '1';
    const c = canal ? canal.getState() : { state: 'desativado', phone: null, detail: '' };
    return { ativo, canal: ativo ? c : { state: 'desativado', phone: null, detail: '' }, fila: store.resumoFila() };
  }

  async function parear(telefone) {
    if (getSetting('wa_ativo', '0') !== '1') await definirAtivo(true);
    if (!canal) throw new Error('Canal indisponível.');
    return canal.requestPairing(telefone);
  }

  async function desconectar() {
    if (canal) { try { await canal.logout(); } catch (err) { log.error('[whatsapp]', err.message); } }
    await definirAtivo(false);
  }

  const conectado = () => !!canal && canal.getState().state === 'conectado';

  // Para testes: troca o canal por um falso.
  function usarCanal(novo) { canal = novo; }
  function definirGancho(fn) { gancho = fn; }

  return { store, iniciar, definirAtivo, estado, parear, desconectar, conectado, processarFila, cutucar, usarCanal, definirGancho, desligar };
}

module.exports = { createService };

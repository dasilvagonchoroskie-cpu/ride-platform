'use strict';
// Conector do WhatsApp por "Dispositivos conectados" (pareamento por código), usando a biblioteca Baileys.
// ATENÇÃO: é um método NÃO oficial. O WhatsApp pode bloquear o número. A biblioteca é instalada à parte
// (scripts/instalar-whatsapp.sh) e carregada só quando o WhatsApp é ativado: sem ela o CRM funciona normalmente.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { onlyDigits } = require('./phone');

const NOMES_BIBLIOTECA = ['@whiskeysockets/baileys', 'baileys'];
const SEM_LOG = { level: 'silent', trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child() { return SEM_LOG; } };
const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ----------------------- funções puras (testáveis sem a biblioteca) ----------------------- */

// Encontra o arquivo de entrada de um pacote instalado em <dir>/node_modules, lendo o package.json
// (pacotes só-ESM não podem ser achados com require.resolve).
function resolverEntrada(dir, nome) {
  const pkgDir = path.join(dir, 'node_modules', ...nome.split('/'));
  const pkgFile = path.join(pkgDir, 'package.json');
  if (!fs.existsSync(pkgFile)) return null;
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  const escolher = (e) => {
    if (!e) return null;
    if (typeof e === 'string') return e;
    if (Array.isArray(e)) { for (const x of e) { const r = escolher(x); if (r) return r; } return null; }
    for (const cond of ['import', 'node', 'default', 'require']) {
      if (e[cond]) { const r = escolher(e[cond]); if (r) return r; }
    }
    return null;
  };
  let entrada = null;
  if (pkg.exports) {
    entrada = typeof pkg.exports === 'string' ? pkg.exports : escolher(pkg.exports['.'] !== undefined ? pkg.exports['.'] : pkg.exports);
  }
  entrada = entrada || pkg.module || pkg.main || 'index.js';
  return path.join(pkgDir, entrada);
}

// Aceita tanto o módulo ESM quanto o CommonJS (import() devolve formas diferentes).
function normalizarBiblioteca(mod) {
  const candidatos = [mod, mod && mod.default].filter(Boolean);
  const pegar = (k) => { for (const c of candidatos) if (c[k] !== undefined) return c[k]; return undefined; };
  let makeWASocket = typeof (mod && mod.default) === 'function' ? mod.default : pegar('makeWASocket');
  if (typeof makeWASocket !== 'function' && mod && mod.default && typeof mod.default.default === 'function') makeWASocket = mod.default.default;
  const lib = {
    makeWASocket,
    useMultiFileAuthState: pegar('useMultiFileAuthState'),
    DisconnectReason: pegar('DisconnectReason') || { loggedOut: 401, restartRequired: 515, connectionReplaced: 440 },
    Browsers: pegar('Browsers')
  };
  if (typeof lib.makeWASocket !== 'function' || typeof lib.useMultiFileAuthState !== 'function') {
    throw new Error('A biblioteca do WhatsApp instalada tem um formato inesperado.');
  }
  return lib;
}

async function carregarBiblioteca(libDir) {
  const erros = [];
  for (const nome of NOMES_BIBLIOTECA) {
    try { return normalizarBiblioteca(await import(nome)); } catch (err) { erros.push(`${nome}: ${err.message}`); }
  }
  for (const nome of NOMES_BIBLIOTECA) {
    try {
      const entrada = resolverEntrada(libDir, nome);
      if (entrada) return normalizarBiblioteca(await import(pathToFileURL(entrada).href));
    } catch (err) { erros.push(`${nome} (${libDir}): ${err.message}`); }
  }
  const e = new Error('Biblioteca do WhatsApp não instalada. Rode: bash scripts/instalar-whatsapp.sh');
  e.detalhes = erros;
  throw e;
}

const telefoneDoJid = (jid) => (typeof jid === 'string' && /@s\.whatsapp\.net$/.test(jid)
  ? onlyDigits(jid.split('@')[0].split(':')[0]) : null);

function timestampEmSegundos(ts) {
  if (ts === null || ts === undefined) return Math.floor(Date.now() / 1000);
  if (typeof ts === 'object') return Number(ts.low !== undefined ? ts.low : ts.toString());
  return Number(ts);
}

function desembrulhar(message) {
  let m = message;
  for (let i = 0; i < 5 && m; i += 1) {
    const interno = (m.ephemeralMessage && m.ephemeralMessage.message) || (m.viewOnceMessage && m.viewOnceMessage.message)
      || (m.viewOnceMessageV2 && m.viewOnceMessageV2.message) || (m.documentWithCaptionMessage && m.documentWithCaptionMessage.message)
      || (m.editedMessage && m.editedMessage.message);
    if (!interno) break;
    m = interno;
  }
  return m || {};
}

// Converte uma mensagem da biblioteca no formato do CRM. Devolve null quando deve ser ignorada.
// tipoUpsert: 'notify' = mensagem nova em tempo real (inclui as que ficaram na fila enquanto o servidor estava fora);
// 'append' = costuma ser histórico: só entra se for recente (evita importar conversas antigas).
function mensagemParaEvento(m, tipoUpsert, agoraSeg = Math.floor(Date.now() / 1000)) {
  if (!m || !m.key || !m.message || !m.key.remoteJid) return null;
  const jid = m.key.remoteJid;
  if (/(@g\.us|@broadcast|@newsletter)$/.test(jid)) return null;
  const ts = timestampEmSegundos(m.messageTimestamp);
  if (tipoUpsert !== 'notify' && agoraSeg - ts > 120) return null;
  if (agoraSeg - ts > 7 * 86400) return null;

  const msg = desembrulhar(m.message);
  if (msg.protocolMessage || msg.senderKeyDistributionMessage || msg.reactionMessage || msg.pollUpdateMessage) return null;

  let tipo = 'text';
  let texto = msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text) || '';
  const comLegenda = (rotulo, legenda) => (legenda ? `${rotulo} ${legenda}` : rotulo);
  if (!texto) {
    if (msg.imageMessage) { tipo = 'image'; texto = comLegenda('[imagem]', msg.imageMessage.caption); }
    else if (msg.videoMessage) { tipo = 'video'; texto = comLegenda('[vídeo]', msg.videoMessage.caption); }
    else if (msg.audioMessage) { tipo = 'audio'; texto = msg.audioMessage.ptt ? '[mensagem de voz]' : '[áudio]'; }
    else if (msg.documentMessage) { tipo = 'document'; texto = comLegenda('[documento]', msg.documentMessage.fileName || msg.documentMessage.caption); }
    else if (msg.stickerMessage) { tipo = 'sticker'; texto = '[figurinha]'; }
    else if (msg.locationMessage || msg.liveLocationMessage) { tipo = 'location'; texto = '[localização]'; }
    else if (msg.contactMessage || msg.contactsArrayMessage) { tipo = 'contact'; texto = '[contato]'; }
    else if (msg.pollCreationMessage || msg.pollCreationMessageV3) { tipo = 'poll'; texto = '[enquete]'; }
    else { tipo = 'outro'; texto = '[mensagem não suportada]'; }
  }

  const deMim = !!m.key.fromMe;
  const telefone = telefoneDoJid(jid) || telefoneDoJid(m.key.remoteJidAlt) || telefoneDoJid(m.key.senderPn)
    || telefoneDoJid(m.key.participantPn) || null;
  return {
    jid,
    telefone,
    nome: !deMim && m.pushName ? String(m.pushName).slice(0, 120) : null,
    externoId: m.key.id || null,
    texto,
    tipo,
    quando: new Date(ts * 1000).toISOString(),
    deMim
  };
}

const STATUS_BAILEYS = { 2: 'enviada', 3: 'entregue', 4: 'lida', 5: 'lida', SERVER_ACK: 'enviada', DELIVERY_ACK: 'entregue', READ: 'lida', PLAYED: 'lida' };

/* ------------------------------------- o canal ------------------------------------- */
function criar({ authDir, libDir, log = console } = {}) {
  let lib = null;
  let sock = null;
  let estado = 'desconectado';
  let telefone = null;
  let detalhe = '';
  let parado = true;
  let handlers = null;
  let timerReconexao = null;
  let timerPareamento = null;
  let tentativas = 0;

  function mudar(novo, texto = '') {
    estado = novo;
    detalhe = texto;
    if (handlers && handlers.onConnection) { try { handlers.onConnection({ state: estado, phone: telefone, detail: detalhe }); } catch (err) { /* não derruba o canal */ } }
  }

  function limparAutenticacao() {
    try { fs.rmSync(authDir, { recursive: true, force: true }); } catch (err) { log.error('[whatsapp] não consegui apagar a sessão:', err.message); }
  }

  async function encerrarSocket() {
    clearTimeout(timerReconexao);
    const s = sock;
    sock = null;
    if (s) { try { s.ev.removeAllListeners(); } catch (e) { /* ok */ } try { s.end(undefined); } catch (e) { /* ok */ } }
  }

  function agendarReconexao(atrasoMs) {
    if (parado) return;
    clearTimeout(timerReconexao);
    timerReconexao = setTimeout(() => { conectar().catch((err) => mudar('erro', err.message)); }, atrasoMs);
    if (timerReconexao.unref) timerReconexao.unref();
  }

  function aoMudarConexao(s, u) {
    if (s !== sock) return; // evento de um socket antigo
    const { connection, lastDisconnect } = u;
    if (connection === 'open') {
      tentativas = 0;
      clearTimeout(timerPareamento);
      telefone = String((s.user && s.user.id) || '').split(':')[0].split('@')[0] || null;
      mudar('conectado', '');
    } else if (connection === 'connecting' && estado !== 'aguardando_pareamento' && estado !== 'conectado') {
      mudar('conectando', '');
    } else if (connection === 'close') {
      if (parado) return;
      const codigo = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
      const R = lib.DisconnectReason;
      if (codigo === R.loggedOut) {
        limparAutenticacao();
        telefone = null;
        mudar('desconectado', 'O WhatsApp encerrou a sessão (aparelho removido ou número bloqueado). Gere um novo código.');
      } else if (codigo === R.connectionReplaced) {
        mudar('erro', 'Esta sessão foi aberta em outro lugar. Reconecte quando quiser.');
      } else {
        tentativas += 1;
        mudar('conectando', 'Reconectando…');
        agendarReconexao(codigo === R.restartRequired ? 500 : Math.min(30000, 2000 * 2 ** Math.min(tentativas, 4)));
      }
    }
  }

  function aoReceberMensagens({ messages, type }) {
    for (const m of messages || []) {
      try {
        const evt = mensagemParaEvento(m, type);
        if (evt && handlers && handlers.onMessage) handlers.onMessage(evt);
      } catch (err) { log.error('[whatsapp] erro ao tratar mensagem:', err.message); }
    }
  }

  function aoAtualizarMensagens(lista) {
    for (const { key, update } of lista || []) {
      try {
        if (!key || !key.fromMe || !update || update.status === undefined || update.status === null) continue;
        const status = STATUS_BAILEYS[update.status];
        if (status && handlers && handlers.onStatus) handlers.onStatus({ externoId: key.id, status });
      } catch (err) { log.error('[whatsapp] erro ao tratar status:', err.message); }
    }
  }

  async function conectar({ telefonePareamento } = {}) {
    lib = lib || await carregarBiblioteca(libDir);
    fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(authDir, 0o700); } catch (e) { /* ok */ }
    const { state: auth, saveCreds } = await lib.useMultiFileAuthState(authDir);
    const registrado = !!(auth.creds && auth.creds.registered);
    if (!registrado && !telefonePareamento) { mudar('desconectado', 'Aguardando pareamento.'); return; }

    const s = lib.makeWASocket({
      auth,
      printQRInTerminal: false,
      logger: SEM_LOG,
      browser: lib.Browsers && lib.Browsers.ubuntu ? lib.Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '22.04.4'],
      syncFullHistory: false,          // não importa o histórico antigo de conversas
      markOnlineOnConnect: false,      // não aparece "online" o tempo todo
      generateHighQualityLinkPreview: false
    });
    sock = s;
    s.ev.on('creds.update', saveCreds);
    s.ev.on('connection.update', (u) => aoMudarConexao(s, u));
    s.ev.on('messages.upsert', aoReceberMensagens);
    s.ev.on('messages.update', aoAtualizarMensagens);
    // Observação: o evento 'messaging-history.set' (histórico) NÃO é assinado de propósito.

    if (!registrado && telefonePareamento) {
      await dormir(2500); // dá tempo do socket abrir antes de pedir o código
      const codigo = await s.requestPairingCode(telefonePareamento);
      return codigo;
    }
    return null;
  }

  return {
    nome: 'baileys',
    get disponivel() { return true; },
    async start(h) {
      handlers = h;
      parado = false;
      try { await conectar(); } catch (err) { mudar('erro', err.message); }
    },
    async stop() {
      parado = true;
      clearTimeout(timerPareamento);
      await encerrarSocket();
      mudar('desconectado', '');
    },
    getState() { return { state: estado, phone: telefone, detail: detalhe }; },
    async requestPairing(telefonePareamento) {
      const digitos = onlyDigits(telefonePareamento);
      if (estado === 'conectado') throw new Error('O WhatsApp já está conectado.');
      parado = false;
      await encerrarSocket();
      limparAutenticacao(); // pareamento novo sempre começa do zero
      const codigo = await conectar({ telefonePareamento: digitos });
      if (!codigo) throw new Error('Não foi possível gerar o código.');
      const formatado = String(codigo).replace(/(.{4})(?=.)/, '$1-');
      mudar('aguardando_pareamento', 'Digite o código no WhatsApp do celular.');
      clearTimeout(timerPareamento);
      timerPareamento = setTimeout(() => {
        if (estado === 'aguardando_pareamento') { encerrarSocket(); mudar('desconectado', 'O código expirou. Gere outro.'); }
      }, 3 * 60 * 1000);
      if (timerPareamento.unref) timerPareamento.unref();
      return { code: formatado };
    },
    async logout() {
      parado = true;
      clearTimeout(timerPareamento);
      if (sock) { try { await sock.logout(); } catch (err) { log.error('[whatsapp] logout:', err.message); } }
      await encerrarSocket();
      limparAutenticacao();
      telefone = null;
      mudar('desconectado', '');
    },
    async sendText(jid, texto) {
      if (!sock || estado !== 'conectado') throw new Error('WhatsApp desconectado');
      const digitando = process.env.WA_DIGITANDO !== '0';
      if (digitando) {
        try { await sock.sendPresenceUpdate('composing', jid); } catch (e) { /* ok */ }
        await dormir(Math.min(3500, Math.max(700, texto.length * 25)));
        try { await sock.sendPresenceUpdate('paused', jid); } catch (e) { /* ok */ }
      }
      const r = await sock.sendMessage(jid, { text: texto });
      return { externalId: r && r.key ? r.key.id : null };
    }
  };
}

module.exports = { criar, mensagemParaEvento, normalizarBiblioteca, resolverEntrada, carregarBiblioteca, STATUS_BAILEYS };

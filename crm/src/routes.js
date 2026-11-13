'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { db, nowISO, getSetting, setSetting, DATA_DIR } = require('./db');
const { ENTITIES } = require('./defs');
const auth = require('./auth');
const { todayISO, addDaysISO, isDateISO, fail, sendCsv, audit, localDate } = require('./http');
const entities = require('./entities');
const policy = require('./policy');
const { createService } = require('./whatsapp/service');
const whatsappRoutes = require('./whatsapp/routes');
const { createIaService } = require('./ia/service');
const { criarCofre } = require('./ia/secret');
const { criarProvedorMulti, descobrirModelo, PROVEDORES } = require('./ia/provider');
const { criarTranscritor, lerComTentativas } = require('./ia/transcricao');
const { createRecebidos } = require('./documentos/recebidos');
const { mascararNumeros } = require('./ia/documentos');
const iaRoutes = require('./ia/routes');
const correio = require('./email');
const { createNotificacoes } = require('./notificacoes');
const { documentosRecebidos } = require('./ia/documentos');
const { gerarCodigoRecuperacao } = require('./reset');
const hasOwn = (obj, chave) => Object.prototype.hasOwnProperty.call(obj, chave);
// Rota assíncrona: erro vira resposta 500 do Express (sem rejeição solta que derrubaria o processo).
const seguro = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const router = express.Router();

// Serviço do WhatsApp (canal, fila de envio). Fica desligado até um administrador ativar em Configurações.
const wa = createService({ db, getSetting, setSetting, dataDir: DATA_DIR });

// Assistente de IA (desligado até um administrador informar a chave e ativar). Funciona com vários provedores
// (Anthropic, DeepSeek, OpenAI, OpenRouter, outro de formato OpenAI). As chaves ficam em data/ia-key*, fora do banco.
const cofreIA = criarCofre(DATA_DIR);
const ia = createIaService({
  db, waStore: wa.store, entities, ENTITIES, audit, getSetting, setSetting, cofre: cofreIA, todayISO, nowISO,
  provider: null // definido logo abaixo: precisa da configuração do próprio serviço (provedor, modelo, endereço)
});
ia.usarProvedor(criarProvedorMulti({ resolver: ia.resolverProvedor }));
wa.definirGancho((conversaId, opcoes) => ia.agendarAutomatico(conversaId, opcoes));
// Na chegada: registra a origem (site, Instagram...) e agenda a confirmação rápida de recebimento.
wa.definirChegada((conversaId, mensagemId) => ia.registrarChegada(conversaId, mensagemId));
// Recupera mensagens de cliente que ficaram sem tratamento da IA (reinício, temporizador perdido, nova tentativa vencida).
if (process.env.IA_VARREDURA !== '0') ia.iniciarRecuperacao();

// Notificações (mensagem nova, IA respondeu, IA transferiu): feed do CRM + push nos aparelhos inscritos.
const notificacoes = createNotificacoes({
  db, dataDir: DATA_DIR, waStore: wa.store, webpush: require('web-push'),
  publicUrl: String(process.env.PUBLIC_URL || '').replace(/\/+$/, '')
});

// Arquivos (fotos/PDFs) que chegam pelo WhatsApp → arquivo digital protegido da ficha (criado junto com os documentos, abaixo).
let recebidos = null;

// Leitura das mídias do WhatsApp: áudio (Gemini; Groq como reserva), foto/PDF/vídeo (Gemini), Office/texto (no servidor).
const LIMITE_TRANSCRICOES_DIA = Number(process.env.IA_LIMITE_TRANSCRICOES) || 300;
const MAX_MIDIA_BYTES = 15 * 1024 * 1024;
const LEITURAS_CONTATO_DIA = Number(process.env.IA_LEITURAS_CONTATO_DIA) || 15;
const transcritor = criarTranscritor({
  cofre: cofreIA,
  obterModeloGemini: async () => {
    const salvo = ia.obterModelo('gemini');
    if (salvo) return salvo;
    return descobrirModelo({ urlBase: PROVEDORES.gemini.urlBase, chave: cofreIA.ler('gemini'), fetchImpl: globalThis.fetch, timeoutMs: 30000 });
  }
});
wa.definirTranscritor(async ({ mensagemId, midia, deMim }) => {
  const cfg = ia.config();
  const pular = (motivo) => { console.log(`[ia] mídia da mensagem ${mensagemId} (${midia && midia.tipo}) não lida: ${motivo}`); return false; };
  if (!midia || typeof midia.baixar !== 'function') return pular('sem arquivo para baixar');
  // Contato pessoal (família/amigos): nada é lido nem guardado como documento.
  const pessoal = db.prepare('SELECT k.pessoal FROM wa_mensagens m JOIN wa_conversas c ON c.id = m.conversa_id JOIN wa_contatos k ON k.id = c.contato_id WHERE m.id = ?').get(mensagemId);
  if (pessoal && pessoal.pessoal) return pular('contato pessoal');
  // Foto/documento é GUARDADO (cifrado) mesmo quando a IA não vai ler: o arquivo não pode se perder.
  // Só o que o CLIENTE manda (foto enviada pela equipe pelo celular não é documento do candidato).
  const guardar = !deMim && ['image', 'document'].includes(midia.tipo) && recebidos && recebidos.ativo();
  const motivoSemLeitura = (() => {
    if (!cfg.ativo) return 'IA desativada';
    if (!cfg.transcrever) return 'leitura de mídias desligada';
    if (cfg.transcricoesHoje >= LIMITE_TRANSCRICOES_DIA) return 'limite diário';
    // Um contato sozinho não esgota a cota de leitura de todos.
    const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const doContato = db.prepare(`SELECT COUNT(*) n FROM ia_transcricoes t JOIN wa_mensagens m ON m.id = t.mensagem_id
      WHERE m.conversa_id = (SELECT conversa_id FROM wa_mensagens WHERE id = ?) AND t.criado_em >= ?`).get(mensagemId, desde).n;
    if (doContato >= LEITURAS_CONTATO_DIA) return 'limite diário deste contato';
    return null;
  })();
  if (midia.bytes && midia.bytes > MAX_MIDIA_BYTES) { // nem baixa
    if (guardar) await recebidos.receber({ mensagemId, tipoMidia: midia.tipo, nome: midia.nome, arquivo: null, leituraFalhou: true }).catch(() => {});
    return pular('arquivo maior que 15 MB');
  }
  if (motivoSemLeitura && !guardar) return pular(motivoSemLeitura);
  if (motivoSemLeitura) return guardarSemLer(mensagemId, midia, motivoSemLeitura);
  const registrar = (ok, provedor, erro) => db.prepare(
    'INSERT INTO ia_transcricoes (mensagem_id, provedor, segundos, ok, erro, criado_em) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(mensagemId, provedor ? `${provedor}:${midia.tipo}` : midia.tipo, Math.round(midia.segundos || 0), ok ? 1 : 0, erro ? String(erro).slice(0, 200) : null, nowISO());
  ia.marcarLeitura(mensagemId, true);
  let arquivo = null;
  try {
    arquivo = Buffer.from(await midia.baixar(MAX_MIDIA_BYTES));
    // Falha passageira do Gemini (fora do ar, tempo esgotado, rede, cota): tenta de novo algumas vezes, com espera curta.
    const esperas = String(process.env.IA_MIDIA_REPETIR_MS !== undefined ? process.env.IA_MIDIA_REPETIR_MS : '3000,8000').split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0);
    const r = await lerComTentativas(
      () => transcritor.lerMidia({ tipo: midia.tipo, arquivo, mime: midia.mime, nome: midia.nome, segundos: midia.segundos }), esperas,
      (err, ms, n) => console.log(`[ia] leitura de ${midia.tipo} da mensagem ${mensagemId}: ${err.message} — nova tentativa ${n} em ${Math.round(ms / 1000)} s`));
    const atual = db.prepare('SELECT texto FROM wa_mensagens WHERE id = ?').get(mensagemId);
    const rotulo = atual && atual.texto ? atual.texto : `[${midia.tipo}]`;
    const lido = r.simbolo === '🎤' ? r.texto : mascararNumeros(r.texto);
    const novo = r.texto === '[sem fala]' ? `${rotulo} (sem fala)` : `${rotulo} ${r.simbolo || '📎'} ${lido}`;
    wa.store.definirTranscricao(mensagemId, novo);
    registrar(true, r.provedor);
    console.log(`[ia] mídia da mensagem ${mensagemId} (${midia.tipo}, ${midia.mime}) lida por ${r.provedor}: ${r.texto.length} caracteres`);
    if (guardar) await guardarArquivo(mensagemId, midia, arquivo, r.texto, false);
    return true;
  } catch (err) {
    registrar(false, null, err.message);
    // Leitura falhou (ou o download): o arquivo é guardado assim mesmo, como "pendente de classificação" (nunca se perde calado).
    if (guardar) await guardarArquivo(mensagemId, midia, arquivo, null, true);
    console.error(`[ia] leitura de ${midia.tipo} da mensagem ${mensagemId}: ${err.message}`);
    // A equipe vê que o áudio não foi ouvido (a IA avisa o cliente com franqueza e pede o texto).
    if (midia.tipo === 'audio') {
      const atual = db.prepare('SELECT texto FROM wa_mensagens WHERE id = ?').get(mensagemId);
      if (atual && !/🎤/u.test(String(atual.texto || ''))) wa.store.definirTranscricao(mensagemId, `${atual.texto || '[áudio]'} (não foi possível ouvir o áudio)`);
    }
    return false;
  } finally {
    ia.marcarLeitura(mensagemId, false);
  }
});

async function guardarArquivo(mensagemId, midia, arquivo, textoLido, leituraFalhou) {
  try {
    const r = await recebidos.receber({ mensagemId, tipoMidia: midia.tipo, nome: midia.nome, arquivo, textoLido, leituraFalhou });
    if (r) console.log(`[documentos] arquivo da mensagem ${mensagemId}: ${r.situacao}${r.categoria ? ` (${r.categoria})` : ''}`);
  } catch (err) { console.error(`[documentos] arquivo da mensagem ${mensagemId}: ${err.message}`); }
}
async function guardarSemLer(mensagemId, midia, motivo) {
  console.log(`[ia] mídia da mensagem ${mensagemId} (${midia.tipo}) não lida: ${motivo} — arquivo guardado para a equipe classificar`);
  let arquivo = null;
  try { arquivo = Buffer.from(await midia.baixar(MAX_MIDIA_BYTES)); } catch (err) { console.error(`[documentos] download da mensagem ${mensagemId}: ${err.message}`); }
  await guardarArquivo(mensagemId, midia, arquivo, null, true);
  return false;
}

/* ------------------------- retenção de dados (LGPD) ------------------------ */
// Conversas sem cadastro vinculado e sem movimento há RETENCAO_DIAS são apagadas (mensagens, análises e leituras juntas).
// Análises da IA e registros de leitura mais velhos que o prazo também saem. Roda ao ligar e a cada 6 h.
const RETENCAO_DIAS = Number(process.env.RETENCAO_DIAS) || 180;
function aplicarRetencao() {
  try {
    const limite = new Date(Date.now() - RETENCAO_DIAS * 86400000).toISOString();
    const velhas = db.prepare(`SELECT c.id FROM wa_conversas c JOIN wa_contatos k ON k.id = c.contato_id
      WHERE (k.vinculo_tipo IS NULL OR k.vinculo_tipo = '') AND COALESCE(c.ultima_em, c.created_at) < ?`).all(limite);
    for (const { id } of velhas) {
      db.prepare('DELETE FROM ia_transcricoes WHERE mensagem_id IN (SELECT id FROM wa_mensagens WHERE conversa_id = ?)').run(id);
      db.prepare('DELETE FROM ia_analises WHERE conversa_id = ?').run(id);
      wa.store.excluirConversa(id);
    }
    const a = db.prepare('DELETE FROM ia_analises WHERE criado_em < ?').run(limite).changes;
    const t = db.prepare('DELETE FROM ia_transcricoes WHERE criado_em < ?').run(limite).changes;
    notificacoes.limpar();
    if (velhas.length || a || t) console.log(`[retenção] apagadas ${velhas.length} conversa(s) sem cadastro, ${a} análise(s) e ${t} registro(s) de leitura com mais de ${RETENCAO_DIAS} dias.`);
  } catch (err) { console.error('[retenção]', err.message); }
}
setTimeout(aplicarRetencao, 60000).unref();
setInterval(aplicarRetencao, 6 * 3600000).unref();

/* --------------------------------- helpers -------------------------------- */
function computeCenario(cenario, custos) {
  const motoristas = Number(cenario.motoristas_ativos) || 0;
  const corridasDia = Number(cenario.corridas_motorista_dia) || 0;
  const dias = Number(cenario.dias_operacao) || 0;
  const valor = Number(cenario.valor_medio_corrida) || 0;
  const pct = Number(cenario.comissao_pct) || 0;
  const custosTotal = (custos || []).reduce((s, c) => s + (Number(c.valor) || 0), 0);

  const corridasMes = Math.round(motoristas * corridasDia * dias);
  const faturamento = Math.round(corridasMes * valor * 100) / 100;
  const receita = Math.round(faturamento * (pct / 100) * 100) / 100;
  const repasse = Math.round((faturamento - receita) * 100) / 100;
  const resultado = Math.round((receita - custosTotal) * 100) / 100;
  const comissaoPorCorrida = Math.round(valor * (pct / 100) * 100) / 100;

  return {
    corridas_mes: corridasMes,
    corridas_dia: Math.round(motoristas * corridasDia),
    faturamento_bruto: faturamento,
    receita_plataforma: receita,
    repasse_motoristas: repasse,
    custos_total: Math.round(custosTotal * 100) / 100,
    resultado_operacional: resultado,
    margem_pct: receita > 0 ? Math.round((resultado / receita) * 1000) / 10 : 0,
    comissao_por_corrida: comissaoPorCorrida,
    custo_por_corrida: corridasMes > 0 ? Math.round((custosTotal / corridasMes) * 100) / 100 : 0,
    ponto_equilibrio_corridas: comissaoPorCorrida > 0 ? Math.ceil(custosTotal / comissaoPorCorrida) : null,
    resultado_por_motorista: motoristas > 0 ? Math.round((resultado / motoristas) * 100) / 100 : 0
  };
}

function cenarioCompleto(row) {
  const custos = db.prepare('SELECT * FROM cenario_custos WHERE cenario_id = ? ORDER BY id').all(row.id);
  return { ...row, custos, resultado: computeCenario(row, custos) };
}

function period(query) {
  const hoje = todayISO();
  const de = isDateISO(query.de) ? query.de : `${hoje.slice(0, 7)}-01`;
  const ate = isDateISO(query.ate) ? query.ate : hoje;
  return { de, ate };
}

function countBy(sql, params) {
  return db.prepare(sql).all(...params);
}

/* ------------------------------ rotas públicas ----------------------------- */
if (process.env.DIAG_IP === '1') {
  router.get('/diagnostico/ip', (req, res) => res.json({ ip: req.ip, ips: req.ips, saltos_xff: String(req.get('x-forwarded-for') || '').split(',').filter(Boolean).length }));
}

router.get('/health', (req, res) => {
  res.json({ ok: true, app: 'CRM Fortaleza Move', db: 'sqlite', time: new Date().toISOString() });
});

router.get('/auth/status', (req, res) => {
  const needsSetup = auth.countUsers() === 0;
  const session = auth.currentSession(req);
  res.json({
    needsSetup,
    recuperacao_email: correio.configurado(),
    org: { nome: getSetting('org_nome'), slogan: getSetting('slogan') },
    user: session ? { id: session.id, nome: session.nome, email: session.email, role: session.role } : null
  });
});

router.post('/auth/setup', (req, res) => {
  const ip = req.ip || '';
  if (auth.sensitiveBlocked(ip)) return fail(res, 429, 'too_many_attempts', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  if (auth.countUsers() > 0) return fail(res, 403, 'setup_closed', 'A configuração inicial já foi concluída. Use a tela de login.');

  const chave = String(req.body.chave || '').trim().toUpperCase();
  const nome = String(req.body.nome || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const senha = String(req.body.senha || '');

  if (nome.length < 3) return fail(res, 422, 'invalid_name', 'Informe o nome do administrador.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail(res, 422, 'invalid_email', 'E-mail inválido.');
  const pwdError = auth.passwordProblem(senha);
  if (pwdError) return fail(res, 422, 'weak_password', pwdError);

  // A chave é conferida ANTES do scrypt: sem a chave, a requisição não consome CPU e conta no limite de tentativas.
  if (!chave || !auth.checkInstallationKey(chave)) {
    auth.sensitiveFailed(ip);
    return fail(res, 403, 'invalid_key', 'Chave de instalação inválida. Consulte o arquivo data/installation-key.txt no servidor.');
  }

  // Transação IMMEDIATE impede dois primeiros administradores em requisições simultâneas.
  const senhaHash = auth.hashPassword(senha);
  let info;
  try {
    info = db.transaction(() => {
      if (auth.countUsers() > 0) throw Object.assign(new Error('setup_closed'), { code: 'setup_closed' });
      const now = nowISO();
      return db.prepare(
        `INSERT INTO users (nome, email, senha_hash, role, ativo, created_at, updated_at) VALUES (?, ?, ?, 'admin', 1, ?, ?)`
      ).run(nome, email, senhaHash, now, now);
    }).immediate();
  } catch (err) {
    if (err.code === 'setup_closed') return fail(res, 403, 'setup_closed', 'A configuração inicial já foi concluída. Use a tela de login.');
    if (String(err.code || '').startsWith('SQLITE_CONSTRAINT')) return fail(res, 409, 'email_exists', 'Já existe uma conta com esse e-mail.');
    throw err;
  }

  try { require('fs').unlinkSync(auth.KEY_PATH); } catch (err) { /* chave já removida */ }
  audit(req, 'setup', 'users', info.lastInsertRowid, 'Administrador inicial criado');
  const user = { id: Number(info.lastInsertRowid), nome, email, role: 'admin' };
  auth.createSession(user.id, req, res);
  res.status(201).json({ user });
});

router.post('/auth/login', seguro(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const senha = String(req.body.senha || '');
  const ip = req.ip || '';

  // Mesma resposta para e-mail existente ou não: o limite é por origem, nunca por conta.
  if (auth.loginBlocked(ip, email)) {
    return fail(res, 429, 'too_many_attempts', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  }
  if (!email || !senha) return fail(res, 422, 'invalid_credentials', 'Informe e-mail e senha.');

  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
  const usable = !!(user && user.ativo);
  // Sempre gasta o mesmo tempo de scrypt, exista a conta ou não.
  const valid = auth.verifyPassword(senha, usable ? user.senha_hash : auth.DUMMY_HASH) && usable;

  if (!valid) {
    auth.loginFailed(ip, email);
    if (user) db.prepare('UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = ?').run(user.id);
    audit(req, 'login_falha', 'users', user ? user.id : null, `Tentativa de login inválida (${email.replace(/[\r\n\t]/g, ' ').slice(0, 120)})`);
    return fail(res, 401, 'invalid_credentials', 'E-mail ou senha incorretos.');
  }

  // Verificação em duas etapas: só em aparelho que ainda não foi confirmado (aparelho confiável não pede código).
  if ((user.totp_ativo || user.email_2fa) && !auth.aparelhoConfiavel(req, user.id)) {
    if (user.totp_ativo) {
      audit(req, 'login_senha_ok', 'users', user.id, 'Senha correta; aguardando código do autenticador');
      return res.json({ precisa_codigo: true, via: 'totp', desafio: auth.criarDesafio(user.id) });
    }
    if (auth.envioEmailBloqueado(user.id)) return fail(res, 429, 'too_many_attempts', 'Muitos códigos enviados. Aguarde 30 minutos e tente de novo.');
    const codigo = auth.novoCodigoEmail();
    try {
      auth.envioEmailContar(user.id);
      await correio.enviarEmail({ para: user.email, assunto: `Código de acesso ao CRM: ${codigo}`, texto: textoCodigoEmail(codigo, req, 'entrar no CRM por um aparelho novo') });
    } catch (err) {
      console.error(`[e-mail] código de acesso não enviado: ${err.message}`);
      return fail(res, 503, 'email_failed', 'Não foi possível enviar o código para o seu e-mail agora. Tente de novo em alguns minutos ou entre por um aparelho já confirmado.');
    }
    audit(req, 'login_senha_ok', 'users', user.id, 'Senha correta em aparelho novo; código enviado por e-mail');
    return res.json({ precisa_codigo: true, via: 'email', email: mascararEmail(user.email), desafio: auth.criarDesafio(user.id, { via: 'email', minutos: 10, codigoHash: auth.hashCodigoEmail(user.id, codigo) }) });
  }
  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').run(nowISO(), user.id);
  auth.loginSucceeded(ip, email);
  auth.createSession(user.id, req, res);
  req.user = { id: user.id, nome: user.nome };
  audit(req, 'login', 'users', user.id, 'Acesso ao sistema');
  res.json({ user: { id: user.id, nome: user.nome, email: user.email, role: user.role } });
}));

// Segunda etapa do login: código do autenticador (ou um código de recuperação, que é gasto).
router.post('/auth/login/codigo', (req, res) => {
  const ip = req.ip || '';
  if (auth.loginBlocked(ip, '')) return fail(res, 429, 'too_many_attempts', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  const d = auth.lerDesafio(req.body.desafio);
  if (!d) return fail(res, 401, 'challenge_expired', 'O tempo para digitar o código acabou. Entre de novo com a senha.');
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND ativo = 1').get(d.userId);
  const codigo = String(req.body.codigo || '').trim().slice(0, 40);
  let ok = false;
  if (user && d.via === 'email' && user.email_2fa) {
    ok = auth.codigoEmailConfere(user.id, codigo, d.codigoHash);
  } else if (user && d.via === 'totp' && user.totp_ativo) {
    const passo = auth.verificarTotp(user.totp_segredo, codigo, user.totp_ultimo_passo || 0);
    if (passo) { db.prepare('UPDATE users SET totp_ultimo_passo = ? WHERE id = ?').run(passo, user.id); ok = true; }
    else if (codigo.replace(/[^A-Za-z0-9]/g, '').length === 12) ok = auth.consumeRecoveryCode(user.id, codigo);
  }
  if (!ok) {
    d.tentativas += 1;
    auth.loginFailed(ip, '');
    audit(req, 'login_codigo_falha', 'users', user ? user.id : null, 'Código da verificação em duas etapas inválido');
    return fail(res, 401, 'invalid_code', 'Código inválido.');
  }
  auth.encerrarDesafio(req.body.desafio);
  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').run(nowISO(), user.id);
  if (req.body.lembrar !== false) auth.lembrarAparelho(user.id, req, res);
  auth.createSession(user.id, req, res);
  req.user = { id: user.id, nome: user.nome };
  audit(req, 'login', 'users', user.id, 'Acesso ao sistema (com verificação em duas etapas)');
  res.json({ user: { id: user.id, nome: user.nome, email: user.email, role: user.role } });
});

router.post('/auth/reset', (req, res) => {
  const ip = req.ip || '';
  if (auth.sensitiveBlocked(ip)) return fail(res, 429, 'too_many_attempts', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  const token = String(req.body.token || '').trim();
  const senha = String(req.body.senha || '');
  const pwdError = auth.passwordProblem(senha);
  if (pwdError) return fail(res, 422, 'weak_password', pwdError);

  const row = db.prepare(
    `SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`
  ).get(auth.sha256(token), nowISO());

  if (!row) {
    auth.sensitiveFailed(ip);
    return fail(res, 400, 'invalid_token', 'Código inválido ou expirado. Gere um novo código no servidor.');
  }

  db.prepare('UPDATE users SET senha_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?')
    .run(auth.hashPassword(senha), nowISO(), row.user_id);
  db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(nowISO(), row.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
  auth.esquecerAparelhos(row.user_id);
  audit(req, 'senha_redefinida', 'users', row.user_id, 'Senha redefinida por código de recuperação');
  res.json({ ok: true });
});

// Recuperação pelo próprio usuário: e-mail + um dos códigos de recuperação que ele gerou em Configurações.
// Mesma resposta para e-mail inexistente, sem códigos ou código errado (sem enumeração). Limite por IP e por e-mail.
router.post('/auth/recover', (req, res) => {
  const ip = req.ip || '';
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 254);
  const codigo = String(req.body.codigo || '').slice(0, 40);
  const senha = String(req.body.senha || '');
  if (auth.recoverBlocked(ip, email)) return fail(res, 429, 'too_many_attempts', 'Muitas tentativas. Aguarde e tente novamente mais tarde.');
  const pwdError = auth.passwordProblem(senha);
  if (pwdError) return fail(res, 422, 'weak_password', pwdError);
  const user = email ? db.prepare('SELECT id, ativo FROM users WHERE lower(email) = ?').get(email) : null;
  const ok = !!(user && user.ativo) && auth.consumeRecoveryCode(user.id, codigo);
  if (!ok) {
    auth.recoverFailed(ip, email);
    audit(req, 'recuperacao_falha', 'users', user ? user.id : null, `Código de recuperação inválido (${email.replace(/[\r\n\t]/g, ' ').slice(0, 120)})`);
    return fail(res, 400, 'invalid_recovery', 'E-mail ou código de recuperação inválido (ou o código já foi usado).');
  }
  db.prepare('UPDATE users SET senha_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?')
    .run(auth.hashPassword(senha), nowISO(), user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  auth.esquecerAparelhos(user.id);
  const st = auth.recoveryStatus(user.id);
  audit(req, 'senha_recuperada', 'users', user.id, `Senha redefinida com código de recuperação (restam ${st.restantes})`);
  res.json({ ok: true, restantes: st.restantes });
});

// "Esqueci minha senha": manda um link de uso único (30 min) para o e-mail cadastrado.
// Sempre a mesma resposta, exista o e-mail ou não (sem enumeração). Cada pedido conta no limite por IP e por e-mail.
router.post('/auth/recover/email', seguro(async (req, res) => {
  const ip = req.ip || '';
  const alvo = String(req.body.email || '').trim().toLowerCase().slice(0, 254);
  if (!correio.configurado()) return fail(res, 503, 'email_off', 'O envio de e-mail não está configurado neste servidor. Use um código de recuperação.');
  if (auth.recoverBlocked(ip, alvo)) return fail(res, 429, 'too_many_attempts', 'Muitos pedidos. Aguarde e tente novamente mais tarde.');
  auth.recoverFailed(ip, alvo);
  const resposta = { ok: true, mensagem: 'Se o e-mail estiver cadastrado, o link para criar uma senha nova chega em alguns minutos. Confira também o spam.' };
  const user = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(alvo) ? db.prepare('SELECT id, email FROM users WHERE lower(email) = ? AND ativo = 1').get(alvo) : null;
  if (!user) return res.json(resposta);
  const r = gerarCodigoRecuperacao(db, user.email);
  if (r.erro) return res.json(resposta);
  try {
    await correio.enviarEmail({
      para: user.email,
      assunto: 'Criar senha nova — CRM Fortaleza Move',
      texto: `Alguém pediu para criar uma senha nova no CRM Fortaleza Move.\n\nPara criar a senha nova, abra este link (vale 30 minutos e uma vez só):\n${r.link}\n\nSe não foi você, ignore este e-mail: sua senha continua a mesma.\n\nPedido feito de ${auth.nomeAparelhoPublico(req)} em ${horaLocal()}.`
    });
    audit(req, 'recuperacao_email', 'users', user.id, 'Link de nova senha enviado por e-mail');
  } catch (err) {
    console.error(`[e-mail] link de recuperação não enviado: ${err.message}`);
  }
  res.json(resposta);
}));

function mascararEmail(e) {
  const [nome, dominio] = String(e || '').split('@');
  if (!dominio) return '';
  return `${nome.slice(0, 2)}${'*'.repeat(Math.max(1, nome.length - 2))}@${dominio}`;
}
const horaLocal = () => new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
function textoCodigoEmail(codigo, req, motivo) {
  return `Seu código para ${motivo}: ${codigo}\n\nVale 10 minutos. Não passe este código para ninguém: a equipe do CRM nunca pede.\n\nPedido feito de ${auth.nomeAparelhoPublico(req)} em ${horaLocal()}.\nSe não foi você, troque sua senha do CRM.`;
}

/* ---------------- sem integração automática com o aplicativo do motorista (12/11 noite) ---------------- */
// Decisão do dono: o cadastro pelo APLICATIVO continua indo para a Central (aprovação lá) e o CRM é um caminho
// INDEPENDENTE (ficha + documentos registrados pela equipe). Nenhuma rota recebe dados do aplicativo nem sincroniza nada.
// As tabelas integracao_* da migração 006 (congelada) ficam vazias e sem uso.

/* ------------------------------- autenticado ------------------------------- */
router.use(auth.requireAuth);

// Avaliador de cadastros: lista FECHADA de rotas (policy.ROTAS_AVALIADOR) + as da própria conta (/auth/...).
// Qualquer outra rota responde 403 antes de chegar ao código dela — nenhuma permissão depende de esconder botão.
router.use((req, res, next) => {
  if (!req.user || req.user.role !== 'avaliador') return next();
  if (req.path.startsWith('/auth/') || policy.avaliadorPodeRota(req.method, req.path)) return next();
  return fail(res, 403, 'forbidden', 'O perfil de avaliador só acessa a avaliação de candidatos.');
});

// Rotas administrativas: esconder a tela no navegador não é controle de segurança.
// A autorização é validada novamente no servidor em toda requisição.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return fail(res, 403, 'forbidden', 'Esta operação exige perfil de administrador.');
  }
  next();
}

router.get('/auth/me', (req, res) => {
  res.json({ user: req.user, org: { nome: getSetting('org_nome'), slogan: getSetting('slogan') } });
});

router.post('/auth/logout', (req, res) => {
  audit(req, 'logout', 'users', req.user.id, 'Sessão encerrada');
  auth.destroySession(req, res);
  res.json({ ok: true });
});

router.post('/auth/change-password', (req, res) => {
  const atual = String(req.body.senha_atual || '');
  const nova = String(req.body.senha_nova || '');
  if (auth.passwordBlocked(req.user.id)) return fail(res, 429, 'too_many_attempts', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !auth.verifyPassword(atual, user.senha_hash)) {
    auth.passwordFailed(req.user.id);
    return fail(res, 422, 'invalid_password', 'A senha atual não confere.');
  }
  auth.passwordOk(req.user.id);
  const pwdError = auth.passwordProblem(nova);
  if (pwdError) return fail(res, 422, 'weak_password', pwdError);

  db.prepare('UPDATE users SET senha_hash = ?, updated_at = ? WHERE id = ?').run(auth.hashPassword(nova), nowISO(), user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(user.id, req.user.sid);
  audit(req, 'senha_alterada', 'users', user.id, 'Senha alterada pelo próprio usuário');
  res.json({ ok: true });
});

router.get('/auth/recovery-codes', (req, res) => {
  res.json(auth.recoveryStatus(req.user.id));
});

// Gerar (ou trocar) os códigos exige a senha atual: quem pegar uma sessão aberta não consegue criar códigos para si.
router.post('/auth/recovery-codes', (req, res) => {
  if (auth.passwordBlocked(req.user.id)) return fail(res, 429, 'too_many_attempts', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !auth.verifyPassword(String(req.body.senha_atual || ''), user.senha_hash)) {
    auth.passwordFailed(req.user.id);
    return fail(res, 422, 'invalid_password', 'A senha atual não confere.');
  }
  auth.passwordOk(req.user.id);
  const codigos = auth.generateRecoveryCodes(user.id);
  audit(req, 'codigos_recuperacao', 'users', user.id, 'Códigos de recuperação gerados (os anteriores deixaram de valer)');
  res.json({ codigos, ...auth.recoveryStatus(user.id) });
});

/* ------------------- verificação em duas etapas (configurar) ------------------- */
router.get('/auth/2fa', (req, res) => {
  const u = db.prepare('SELECT totp_ativo, email_2fa, email FROM users WHERE id = ?').get(req.user.id);
  res.json({
    ativo: !!(u && u.totp_ativo),
    email_ativo: !!(u && u.email_2fa),
    email_configurado: correio.configurado(),
    email: u ? mascararEmail(u.email) : '',
    aparelhos: auth.listarAparelhos(req.user.id),
    obrigatoria_admin: req.user.role === 'admin'
  });
});

// Verificação por e-mail em aparelho novo. Ativar exige a senha e um código que chega no e-mail (prova que o e-mail
// recebe; sem isso a pessoa poderia se trancar para fora). O aparelho atual já fica confirmado.
const ativacoesEmail = new Map();
router.post('/auth/2fa/email/iniciar', seguro(async (req, res) => {
  if (auth.passwordBlocked(req.user.id)) return fail(res, 429, 'too_many_attempts', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  if (!correio.configurado()) return fail(res, 503, 'email_off', 'O envio de e-mail ainda não está configurado no servidor.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !auth.verifyPassword(String(req.body.senha_atual || ''), user.senha_hash)) {
    auth.passwordFailed(req.user.id);
    return fail(res, 422, 'invalid_password', 'A senha atual não confere.');
  }
  auth.passwordOk(req.user.id);
  if (auth.envioEmailBloqueado(user.id)) return fail(res, 429, 'too_many_attempts', 'Muitos códigos enviados. Aguarde 30 minutos e tente de novo.');
  const codigo = auth.novoCodigoEmail();
  try {
    auth.envioEmailContar(user.id);
    await correio.enviarEmail({ para: user.email, assunto: `Código para ativar a verificação: ${codigo}`, texto: textoCodigoEmail(codigo, req, 'ativar a verificação por e-mail no CRM') });
  } catch (err) {
    console.error(`[e-mail] código de ativação não enviado: ${err.message}`);
    return fail(res, 503, 'email_failed', 'Não foi possível enviar o e-mail agora. Nada foi alterado; tente de novo mais tarde.');
  }
  ativacoesEmail.set(user.id, { hash: auth.hashCodigoEmail(user.id, codigo), expira: Date.now() + 10 * 60000, tentativas: 0 });
  res.json({ ok: true, email: mascararEmail(user.email) });
}));

router.post('/auth/2fa/email/confirmar', (req, res) => {
  const p = ativacoesEmail.get(req.user.id);
  if (!p || p.expira < Date.now() || p.tentativas >= 5) { ativacoesEmail.delete(req.user.id); return fail(res, 409, 'no_pending', 'Peça um código novo.'); }
  if (!auth.codigoEmailConfere(req.user.id, req.body.codigo, p.hash)) { p.tentativas += 1; return fail(res, 422, 'invalid_code', 'Código inválido.'); }
  ativacoesEmail.delete(req.user.id);
  db.prepare('UPDATE users SET email_2fa = 1, updated_at = ? WHERE id = ?').run(nowISO(), req.user.id);
  if (!auth.aparelhoConfiavel(req, req.user.id)) auth.lembrarAparelho(req.user.id, req, res);
  audit(req, '2fa_email_ativada', 'users', req.user.id, 'Verificação por e-mail em aparelho novo ativada');
  res.json({ ok: true });
});

router.post('/auth/2fa/email/desativar', (req, res) => {
  if (auth.passwordBlocked(req.user.id)) return fail(res, 429, 'too_many_attempts', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !auth.verifyPassword(String(req.body.senha_atual || ''), user.senha_hash)) {
    auth.passwordFailed(req.user.id);
    return fail(res, 422, 'invalid_password', 'A senha atual não confere.');
  }
  auth.passwordOk(req.user.id);
  db.prepare('UPDATE users SET email_2fa = 0, updated_at = ? WHERE id = ?').run(nowISO(), user.id);
  audit(req, '2fa_email_desativada', 'users', user.id, 'Verificação por e-mail desativada');
  res.json({ ok: true });
});

/* ------------------------------ notificações ------------------------------ */
// Cada usuário inscreve os próprios aparelhos e escolhe os tipos. O feed serve aos avisos com o CRM aberto.
router.get('/notificacoes', (req, res) => res.json(notificacoes.feed(req.query.desde)));
router.get('/push/config', (req, res) => res.json({ chave_publica: notificacoes.chavePublica(), aparelhos: notificacoes.minhas(req.user.id) }));
router.post('/push/inscrever', (req, res) => {
  const r = notificacoes.inscrever(req.user.id, {
    subscription: req.body.subscription, tipos: req.body.tipos, aparelho: auth.nomeAparelhoPublico(req),
    renovar: req.body.renovar === true, anterior: typeof req.body.anterior === 'string' ? req.body.anterior : null
  });
  if (r.erro) {
    console.warn(`[notificações] inscrição recusada: ${r.erro}`);
    return fail(res, 422, 'invalid', r.erro);
  }
  if (req.body.renovar !== true) console.log('[notificações] aparelho inscrito para receber push');
  res.json({ ok: true, aparelhos: notificacoes.minhas(req.user.id) });
});
router.post('/push/cancelar', (req, res) => {
  notificacoes.cancelar(req.user.id, req.body.endpoint);
  res.json({ ok: true, aparelhos: notificacoes.minhas(req.user.id) });
});
router.post('/push/teste', seguro(async (req, res) => {
  const n = await notificacoes.teste(req.user.id);
  if (!n) return fail(res, 409, 'sem_aparelho', 'Nenhum aparelho seu recebeu. Ative as notificações neste aparelho primeiro.');
  res.json({ ok: true, enviados: n });
}));

// Esquecer os outros aparelhos confirmados (celular perdido, computador emprestado). O atual continua confirmado.
router.post('/auth/aparelhos/esquecer', (req, res) => {
  const n = auth.esquecerAparelhos(req.user.id, req);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(req.user.id, req.user.sid);
  audit(req, 'aparelhos_esquecidos', 'users', req.user.id, `${n} aparelho(s) esquecido(s)`);
  res.json({ ok: true, removidos: n });
});

// 1º passo: gera a chave (exige a senha atual). A chave só passa a valer depois de confirmar um código.
router.post('/auth/2fa/iniciar', (req, res) => {
  if (auth.passwordBlocked(req.user.id)) return fail(res, 429, 'too_many_attempts', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !auth.verifyPassword(String(req.body.senha_atual || ''), user.senha_hash)) {
    auth.passwordFailed(req.user.id);
    return fail(res, 422, 'invalid_password', 'A senha atual não confere.');
  }
  auth.passwordOk(req.user.id);
  const segredo = auth.novoSegredoTotp();
  db.prepare('UPDATE users SET totp_pendente = ? WHERE id = ?').run(segredo, user.id);
  const emissor = encodeURIComponent('CRM Fortaleza Move');
  res.json({ chave: segredo.replace(/(.{4})/g, '$1 ').trim(), uri: `otpauth://totp/${emissor}:${encodeURIComponent(user.email)}?secret=${segredo}&issuer=${emissor}&digits=6&period=30` });
});

router.post('/auth/2fa/confirmar', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !user.totp_pendente) return fail(res, 409, 'no_pending', 'Gere a chave primeiro.');
  const passo = auth.verificarTotp(user.totp_pendente, req.body.codigo, 0);
  if (!passo) return fail(res, 422, 'invalid_code', 'Código inválido. Confira a hora do celular e tente o código atual.');
  db.prepare('UPDATE users SET totp_segredo = totp_pendente, totp_pendente = NULL, totp_ativo = 1, totp_ultimo_passo = ? WHERE id = ?').run(passo, user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(user.id, req.user.sid);
  audit(req, '2fa_ativada', 'users', user.id, 'Verificação em duas etapas ativada');
  res.json({ ok: true });
});

router.post('/auth/2fa/desativar', (req, res) => {
  if (auth.passwordBlocked(req.user.id)) return fail(res, 429, 'too_many_attempts', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const senhaOk = user && auth.verifyPassword(String(req.body.senha_atual || ''), user.senha_hash);
  const passo = senhaOk && user.totp_ativo ? auth.verificarTotp(user.totp_segredo, req.body.codigo, user.totp_ultimo_passo || 0) : null;
  if (!senhaOk || !passo) {
    auth.passwordFailed(req.user.id);
    return fail(res, 422, 'invalid_password', 'Senha ou código inválido.');
  }
  db.prepare('UPDATE users SET totp_ativo = 0, totp_segredo = NULL, totp_pendente = NULL WHERE id = ?').run(user.id);
  audit(req, '2fa_desativada', 'users', user.id, 'Verificação em duas etapas desativada');
  res.json({ ok: true });
});

router.get('/auth/sessions', (req, res) => {
  const rows = db.prepare('SELECT id, ip, user_agent, created_at, last_seen_at, expires_at FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC').all(req.user.id);
  res.json({ items: rows.map((r) => ({ ...r, atual: r.id === req.user.sid })) });
});

router.delete('/auth/sessions/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!row) return fail(res, 404, 'not_found', 'Sessão não encontrada.');
  if (id === req.user.sid) return fail(res, 400, 'current_session', 'A sessão atual deve ser encerrada pelo botão Sair.');
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  res.json({ ok: true });
});

/* ---------------------------------- meta ---------------------------------- */
router.get('/meta', (req, res) => {
  // Avaliador: só o necessário para a tela de candidatos (sem contagens nem definições de outros módulos).
  if (req.user.role === 'avaliador') {
    const pick = ['motoristas', 'entregadores'].filter((k) => hasOwn(ENTITIES, k));
    return res.json({
      user: req.user, org: { nome: getSetting('org_nome'), slogan: getSetting('slogan') }, settings: { org_nome: getSetting('org_nome') },
      entities: Object.fromEntries(pick.map((k) => [k, { key: k, label: ENTITIES[k].label, singular: ENTITIES[k].singular, icon: ENTITIES[k].icon, fields: ENTITIES[k].fields.filter((f) => ['nome', 'cidade', 'veiculo', 'placa', 'cnh_categoria', 'modalidade', 'origem', 'data_primeiro_contato', 'situacao', 'documentos'].includes(f.key)) }])),
      pendentes: { candidaturas: candidaturas.ativo() ? db.prepare(`SELECT COUNT(*) c FROM candidaturas WHERE etapa NOT IN ('aprovado','recusado') AND funcao IN (${candidaturas.escopoAvaliador().map(() => '?').join(',') || "''"})`).get(...candidaturas.escopoAvaliador()).c : 0 },
      can: policy.permissionsFor('avaliador', []), etapa2: null, documentos: docs.ativo(), candidaturas: candidaturas.ativo(), hoje: todayISO()
    });
  }
  const defs = {};
  for (const [key, def] of Object.entries(ENTITIES)) {
    defs[key] = {
      key,
      label: def.label,
      singular: def.singular,
      icon: def.icon,
      dateField: def.dateField,
      dateFieldLabel: def.dateFieldLabel,
      statusField: def.statusField,
      statuses: def.statuses,
      interactions: !!def.interactions,
      confirmStatus: def.confirmStatus || null,
      fechados: def.fechados || [],
      perdidos: def.perdidos || [],
      columns: def.columns,
      views: def.views || ['lista'],
      fields: def.fields
    };
  }

  const pendentes = {
    atendimentos: db.prepare("SELECT COUNT(*) c FROM atendimentos WHERE situacao IN ('Aberto','Em andamento','Aguardando retorno')").get().c,
    tarefas: db.prepare("SELECT COUNT(*) c FROM tarefas WHERE situacao IN ('Pendente','Em andamento')").get().c,
    motoristas: db.prepare("SELECT COUNT(*) c FROM motoristas WHERE situacao NOT IN ('Aprovado','Contratado','Não prosseguiu')").get().c,
    passageiros: db.prepare("SELECT COUNT(*) c FROM passageiros WHERE situacao NOT IN ('Usuário cadastrado','Não prosseguiu')").get().c,
    parceiros: db.prepare("SELECT COUNT(*) c FROM parceiros WHERE situacao NOT IN ('Parceria confirmada','Não concretizada')").get().c,
    wa: wa.store.contarNaoLidas()
  };
  if (hasOwn(ENTITIES, 'comercios')) pendentes.comercios = db.prepare("SELECT COUNT(*) c FROM comercios WHERE situacao NOT IN ('Ativo na plataforma','Não concretizado')").get().c;
  if (candidaturas.ativo()) pendentes.candidaturas = db.prepare("SELECT COUNT(*) c FROM candidaturas WHERE etapa NOT IN ('aprovado','recusado')").get().c;
  if (hasOwn(ENTITIES, 'entregadores')) pendentes.entregadores = db.prepare("SELECT COUNT(*) c FROM entregadores WHERE situacao NOT IN ('Aprovado','Contratado','Não prosseguiu')").get().c;
  if (recebidos && docs.ativo() && policy.docsAnexar(req.user.role, docs.politica())) pendentes.anexos_wa = recebidos.contarPendentes();

  res.json({
    user: req.user,
    org: { nome: getSetting('org_nome'), slogan: getSetting('slogan') },
    settings: {
      org_nome: getSetting('org_nome'),
      slogan: getSetting('slogan'),
      alerta_dias: Number(getSetting('alerta_dias', '7')),
      comissao_padrao: Number(getSetting('comissao_padrao', '10'))
    },
    entities: defs,
    pendentes,
    can: (() => {
      const c = policy.permissionsFor(req.user.role, Object.keys(ENTITIES));
      if (docs.ativo() && req.user.role === 'admin') c.exportar_pdf.push('documentos');
      return c;
    })(),
    etapa2: pessoas.ativa() ? { funcoes: pessoas.catalogo() } : null,
    documentos: docs.ativo(),
    candidaturas: candidaturas.ativo(),
    hoje: todayISO()
  });
});

router.get('/relations', (req, res) => {
  const type = String(req.query.type || '');
  const def = Object.prototype.hasOwnProperty.call(ENTITIES, type) ? ENTITIES[type] : null;
  if (!def) return res.json({ items: [] });
  const labelField = { motoristas: 'nome', passageiros: 'nome', parceiros: 'nome_estabelecimento', comercios: 'nome_estabelecimento', campanhas: 'titulo', atendimentos: 'assunto' }[type] || 'nome';
  const q = String(req.query.q || '').trim();
  const rows = q
    ? db.prepare(`SELECT id, ${labelField} AS label FROM ${def.table} WHERE ${labelField} LIKE ? ESCAPE '\\' ORDER BY id DESC LIMIT 50`).all(`%${entities.likeEscape(q)}%`)
    : db.prepare(`SELECT id, ${labelField} AS label FROM ${def.table} ORDER BY id DESC LIMIT 50`).all();
  // O registro já vinculado sempre aparece na lista, mesmo que não esteja entre os 50 mais recentes.
  // Sem isso, editar uma tarefa antiga desfazia o vínculo sem avisar.
  const include = Number(req.query.include);
  if (Number.isInteger(include) && include > 0 && !rows.some((r) => r.id === include)) {
    const extra = db.prepare(`SELECT id, ${labelField} AS label FROM ${def.table} WHERE id = ?`).get(include);
    if (extra) rows.unshift(extra);
  }
  res.json({ items: rows });
});

/* -------------------------------- dashboard ------------------------------- */
router.get('/dashboard', (req, res) => {
  const hoje = todayISO();
  const alertaDias = Number(getSetting('alerta_dias', '7')) || 7;
  const limite = addDaysISO(hoje, alertaDias);
  const n = (sql, ...p) => db.prepare(sql).get(...p).c;

  const kpis = {
    // Cada motorista conta em UMA etapa: interessado (novo) → em processo → aprovado → contratado. Documentos são outra
    // coisa: um contratado pode ter documento a conferir, e isso não muda a etapa dele.
    motoristas_total: n('SELECT COUNT(*) c FROM motoristas'),
    motoristas_interessados: n("SELECT COUNT(*) c FROM motoristas WHERE situacao = 'Novo interessado'"),
    motoristas_em_processo: n("SELECT COUNT(*) c FROM motoristas WHERE situacao IN ('Primeiro contato realizado','Aguardando retorno','Cadastro em andamento','Cadastro em análise')"),
    motoristas_aprovados: n("SELECT COUNT(*) c FROM motoristas WHERE situacao = 'Aprovado'"),
    motoristas_contratados: n("SELECT COUNT(*) c FROM motoristas WHERE situacao = 'Contratado'"),
    motoristas_nao_prosseguiram: n("SELECT COUNT(*) c FROM motoristas WHERE situacao = 'Não prosseguiu'"),
    motoristas_docs_a_conferir: n("SELECT COUNT(*) c FROM motoristas WHERE situacao IN ('Aprovado','Contratado') AND COALESCE(documentos,'') <> 'Conferidos'"),
    passageiros_interessados: n('SELECT COUNT(*) c FROM passageiros'),
    passageiros_cadastrados: n("SELECT COUNT(*) c FROM passageiros WHERE situacao = 'Usuário cadastrado'"),
    parceiros_negociacao: n("SELECT COUNT(*) c FROM parceiros WHERE situacao IN ('Identificado','Primeiro contato','Aguardando resposta','Em negociação','Proposta apresentada')"),
    parcerias_confirmadas: n("SELECT COUNT(*) c FROM parceiros WHERE situacao = 'Parceria confirmada'"),
    atendimentos_pendentes: n("SELECT COUNT(*) c FROM atendimentos WHERE situacao IN ('Aberto','Em andamento','Aguardando retorno')"),
    campanhas_andamento: n("SELECT COUNT(*) c FROM campanhas WHERE situacao IN ('Em produção','Em andamento','Publicada')"),
    tarefas_proximas: n(
      "SELECT COUNT(*) c FROM tarefas WHERE situacao IN ('Pendente','Em andamento') AND data_vencimento BETWEEN ? AND ?",
      hoje, limite
    ),
    tarefas_atrasadas: n("SELECT COUNT(*) c FROM tarefas WHERE situacao IN ('Pendente','Em andamento') AND data_vencimento < ?", hoje)
  };
  // Etapa 2 (M2): entregadores e motociclistas, no mesmo critério do motorista (cada um conta em UMA etapa).
  if (hasOwn(ENTITIES, 'entregadores')) {
    kpis.entregadores_total = n('SELECT COUNT(*) c FROM entregadores');
    kpis.entregadores_interessados = n("SELECT COUNT(*) c FROM entregadores WHERE situacao = 'Novo interessado'");
    kpis.entregadores_em_processo = n("SELECT COUNT(*) c FROM entregadores WHERE situacao IN ('Primeiro contato realizado','Aguardando retorno','Cadastro em andamento','Cadastro em análise')");
    kpis.entregadores_aprovados = n("SELECT COUNT(*) c FROM entregadores WHERE situacao = 'Aprovado'");
    kpis.entregadores_contratados = n("SELECT COUNT(*) c FROM entregadores WHERE situacao = 'Contratado'");
    kpis.entregadores_docs_a_conferir = n("SELECT COUNT(*) c FROM entregadores WHERE situacao IN ('Aprovado','Contratado') AND COALESCE(documentos,'') <> 'Conferidos'");
  }

  // Etapa 2 (M3): comércios parceiros (entregas). A empresa que também é Parceiro do Clube conta em cada função, separadamente.
  if (hasOwn(ENTITIES, 'comercios')) {
    kpis.comercios_total = n('SELECT COUNT(*) c FROM comercios');
    kpis.comercios_novos = n("SELECT COUNT(*) c FROM comercios WHERE situacao IN ('Identificado','Primeiro contato','Aguardando resposta')");
    kpis.comercios_negociacao = n("SELECT COUNT(*) c FROM comercios WHERE situacao IN ('Em negociação','Proposta apresentada','Cadastro em andamento')");
    kpis.comercios_ativos = n("SELECT COUNT(*) c FROM comercios WHERE situacao = 'Ativo na plataforma'");
  }

  // Etapa 2 (M4): documentos aguardando conferência e documentos com pendência (rejeitado / necessita atualização).
  if (docs.ativo()) {
    const c = docs.contagens();
    kpis.documentos_pendentes = c.pendentes;
    kpis.documentos_atencao = c.atencao;
  }

  const months = [];
  const base = new Date(`${hoje}T12:00:00Z`);
  base.setUTCDate(1);
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(base);
    d.setUTCMonth(base.getUTCMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  const inicio = `${months[0]}-01`;

  const group = (table, field) => {
    const rows = db.prepare(`SELECT substr(${field},1,7) AS m, COUNT(*) AS c FROM ${table} WHERE ${field} >= ? GROUP BY m`).all(inicio);
    const map = Object.fromEntries(rows.map((r) => [r.m, r.c]));
    return months.map((m) => map[m] || 0);
  };

  // confirmado_em é gravado em UTC; o mês exibido precisa ser o de Fortaleza (UTC-3, sem horário de verão).
  const groupLocal = (table, field) => {
    const rows = db.prepare(`SELECT substr(date(${field}, '-3 hours'),1,7) AS m, COUNT(*) AS c FROM ${table} WHERE date(${field}, '-3 hours') >= ? GROUP BY m`).all(inicio);
    const map = Object.fromEntries(rows.map((r) => [r.m, r.c]));
    return months.map((m) => map[m] || 0);
  };

  const serie = {
    meses: months,
    motoristas: group('motoristas', 'data_primeiro_contato'),
    passageiros: group('passageiros', 'data_primeiro_contato'),
    parceiros: groupLocal('parceiros', 'confirmado_em'),
    atendimentos: group('atendimentos', 'data')
  };

  const funnel = (table, statuses) => {
    const rows = db.prepare(`SELECT situacao, COUNT(*) c FROM ${table} GROUP BY situacao`).all();
    const map = Object.fromEntries(rows.map((r) => [r.situacao, r.c]));
    return statuses.map((s) => ({ status: s, total: map[s] || 0 }));
  };

  const proximas = [
    ...db.prepare("SELECT id, nome AS titulo, 'Motorista' AS modulo, data_acompanhamento AS data, situacao, proxima_acao AS acao FROM motoristas WHERE data_acompanhamento IS NOT NULL AND data_acompanhamento <= ? AND situacao NOT IN ('Aprovado','Contratado','Não prosseguiu')").all(limite),
    ...(hasOwn(ENTITIES, 'entregadores') ? db.prepare("SELECT id, nome AS titulo, 'Entregador' AS modulo, data_acompanhamento AS data, situacao, proxima_acao AS acao FROM entregadores WHERE data_acompanhamento IS NOT NULL AND data_acompanhamento <= ? AND situacao NOT IN ('Aprovado','Contratado','Não prosseguiu')").all(limite) : []),
    ...db.prepare("SELECT id, nome AS titulo, 'Passageiro' AS modulo, data_acompanhamento AS data, situacao, proxima_acao AS acao FROM passageiros WHERE data_acompanhamento IS NOT NULL AND data_acompanhamento <= ? AND situacao NOT IN ('Usuário cadastrado','Não prosseguiu')").all(limite),
    ...(hasOwn(ENTITIES, 'comercios') ? db.prepare("SELECT id, nome_estabelecimento AS titulo, 'Comércio' AS modulo, data_acompanhamento AS data, situacao, proxima_acao AS acao FROM comercios WHERE data_acompanhamento IS NOT NULL AND data_acompanhamento <= ? AND situacao NOT IN ('Ativo na plataforma','Não concretizado')").all(limite) : []),
    ...db.prepare("SELECT id, nome_estabelecimento AS titulo, 'Parceiro' AS modulo, data_acompanhamento AS data, situacao, proxima_acao AS acao FROM parceiros WHERE data_acompanhamento IS NOT NULL AND data_acompanhamento <= ? AND situacao NOT IN ('Parceria confirmada','Não concretizada')").all(limite),
    ...db.prepare("SELECT id, titulo, 'Tarefa' AS modulo, data_vencimento AS data, situacao, descricao AS acao FROM tarefas WHERE data_vencimento <= ? AND situacao NOT IN ('Concluída','Cancelada')").all(limite)
  ]
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))
    .slice(0, 8)
    .map((r) => ({ ...r, atrasado: r.data < hoje }));


  const atividade = req.user.role === 'admin'
    ? db.prepare('SELECT user_nome, action, entity, detail, created_at FROM audit_log ORDER BY id DESC LIMIT 8').all()
    : [];

  res.json({
    hoje,
    alerta_dias: alertaDias,
    kpis,
    serie,
    funil_motoristas: funnel('motoristas', ENTITIES.motoristas.statuses),
    funil_parceiros: funnel('parceiros', ENTITIES.parceiros.statuses),
    proximas_acoes: proximas,
    ultimos_atendimentos: db.prepare('SELECT id, assunto, tipo, prioridade, situacao, data FROM atendimentos ORDER BY data DESC, id DESC LIMIT 5').all(),
    ultimos_cadastros: db.prepare("SELECT id, nome, cidade, created_at FROM motoristas ORDER BY id DESC LIMIT 5").all(),
    atividade
  });
});

/* -------------------------------- relatórios ------------------------------- */
function reportSummary(de, ate) {
  const defs = ENTITIES;
  const porSituacao = (table, field) => countBy(`SELECT ${field} AS chave, COUNT(*) AS total FROM ${table} WHERE ${defs[table].dateField} BETWEEN ? AND ? GROUP BY ${field} ORDER BY total DESC`, [de, ate]);
  const porCampo = (table, field, where, params) => countBy(`SELECT ${field} AS chave, COUNT(*) AS total FROM ${table} WHERE ${defs[table].dateField} BETWEEN ? AND ? ${where || ''} GROUP BY ${field} ORDER BY total DESC`, [de, ate, ...(params || [])]);

  const camp = db.prepare(`SELECT COUNT(*) total, COALESCE(SUM(investimento),0) investimento, COALESCE(SUM(alcance),0) alcance, COALESCE(SUM(engajamento),0) engajamento FROM campanhas WHERE COALESCE(data_publicacao, data_planejada) BETWEEN ? AND ?`).get(de, ate);
  const tarefas = db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN situacao = 'Concluída' THEN 1 ELSE 0 END) concluidas, SUM(CASE WHEN situacao IN ('Pendente','Em andamento') AND data_vencimento < ? THEN 1 ELSE 0 END) atrasadas FROM tarefas WHERE data_vencimento BETWEEN ? AND ?`).get(todayISO(), de, ate);
  const sims = db.prepare("SELECT * FROM simulacoes WHERE date(created_at, '-3 hours') BETWEEN ? AND ? ORDER BY id DESC").all(de, ate);

  const simItems = sims.map((s) => {
    let r = {};
    try { r = JSON.parse(s.resultados); } catch (err) { r = {}; }
    return {
      id: s.id,
      cenario: s.cenario_nome,
      created_at: s.created_at,
      autor: s.created_by_nome,
      receita: r.receita_plataforma || 0,
      resultado: r.resultado_operacional || 0,
      corridas: r.corridas_mes || 0
    };
  });

  return {
    periodo: { de, ate },
    motoristas: {
      total: db.prepare(`SELECT COUNT(*) c FROM motoristas WHERE data_primeiro_contato BETWEEN ? AND ?`).get(de, ate).c,
      por_situacao: porSituacao('motoristas', 'situacao'),
      por_origem: porCampo('motoristas', 'origem')
    },
    ...(hasOwn(defs, 'entregadores') ? {
      entregadores: {
        total: db.prepare(`SELECT COUNT(*) c FROM entregadores WHERE data_primeiro_contato BETWEEN ? AND ?`).get(de, ate).c,
        contratados: db.prepare(`SELECT COUNT(*) c FROM entregadores WHERE data_primeiro_contato BETWEEN ? AND ? AND situacao = 'Contratado'`).get(de, ate).c,
        por_situacao: porSituacao('entregadores', 'situacao'),
        por_modalidade: porCampo('entregadores', 'modalidade'),
        por_origem: porCampo('entregadores', 'origem')
      }
    } : {}),
    ...(hasOwn(defs, 'comercios') ? {
      comercios: {
        total: db.prepare(`SELECT COUNT(*) c FROM comercios WHERE data_primeiro_contato BETWEEN ? AND ?`).get(de, ate).c,
        ativos: db.prepare(`SELECT COUNT(*) c FROM comercios WHERE data_primeiro_contato BETWEEN ? AND ? AND situacao = 'Ativo na plataforma'`).get(de, ate).c,
        por_situacao: porSituacao('comercios', 'situacao'),
        por_categoria: porCampo('comercios', 'categoria'),
        por_origem: porCampo('comercios', 'origem')
      }
    } : {}),
    ...(docs.ativo() ? { documentos: docs.resumoPeriodo(de, ate) } : {}),
    passageiros: {
      total: db.prepare(`SELECT COUNT(*) c FROM passageiros WHERE data_primeiro_contato BETWEEN ? AND ?`).get(de, ate).c,
      por_situacao: porSituacao('passageiros', 'situacao'),
      por_origem: porCampo('passageiros', 'origem')
    },
    parceiros: {
      total: db.prepare(`SELECT COUNT(*) c FROM parceiros WHERE data_contato BETWEEN ? AND ?`).get(de, ate).c,
      confirmados: db.prepare(`SELECT COUNT(*) c FROM parceiros WHERE date(confirmado_em, '-3 hours') BETWEEN ? AND ?`).get(de, ate).c,
      por_situacao: porSituacao('parceiros', 'situacao'),
      por_categoria: porCampo('parceiros', 'categoria')
    },
    campanhas: {
      total: camp.total,
      investimento: camp.investimento,
      alcance: camp.alcance,
      engajamento: camp.engajamento,
      por_canal: countBy(`SELECT canal AS chave, COUNT(*) total FROM campanhas WHERE COALESCE(data_publicacao, data_planejada) BETWEEN ? AND ? GROUP BY canal ORDER BY total DESC`, [de, ate]),
      por_situacao: countBy(`SELECT situacao AS chave, COUNT(*) total FROM campanhas WHERE COALESCE(data_publicacao, data_planejada) BETWEEN ? AND ? GROUP BY situacao ORDER BY total DESC`, [de, ate])
    },
    atendimentos: {
      total: db.prepare(`SELECT COUNT(*) c FROM atendimentos WHERE data BETWEEN ? AND ?`).get(de, ate).c,
      pendentes: db.prepare(`SELECT COUNT(*) c FROM atendimentos WHERE data BETWEEN ? AND ? AND situacao IN ('Aberto','Em andamento','Aguardando retorno')`).get(de, ate).c,
      por_tipo: porSituacao('atendimentos', 'tipo'),
      por_prioridade: porSituacao('atendimentos', 'prioridade'),
      por_situacao: porSituacao('atendimentos', 'situacao')
    },
    tarefas: {
      total: tarefas.total || 0,
      concluidas: tarefas.concluidas || 0,
      atrasadas: tarefas.atrasadas || 0,
      por_situacao: countBy(`SELECT situacao AS chave, COUNT(*) total FROM tarefas WHERE data_vencimento BETWEEN ? AND ? GROUP BY situacao`, [de, ate])
    },
    simulacoes: {
      total: sims.length,
      receita_total: Math.round(simItems.reduce((s, i) => s + i.receita, 0) * 100) / 100,
      items: simItems
    }
  };
}

router.get('/reports/summary', (req, res) => {
  const { de, ate } = period(req.query);
  res.json(reportSummary(de, ate));
});

/* ------------------------- relatórios em PDF (todos os setores) ------------------------- */
// PDF é o formato principal de exportação; o CSV abaixo continua como opção complementar.
const { criarRelatoriosPdf, ErroRelatorio } = require('./relatorios-pdf');
const relatoriosPdf = criarRelatoriosPdf({ db, ENTITIES, entities, getSetting, todayISO, localDate, reportSummary, cenarioCompleto, computeCenario,
  // `docs` é criado mais abaixo (depois de pessoas): o relatório acessa por função, só quando é chamado.
  docs: { ativo: () => docs.ativo(), consultar: (...a) => docs.consultar(...a), get SITUACOES() { return docs.SITUACOES; } } });

router.get('/reports/pdf', (req, res) => {
  const tipo = String(req.query.type || '');
  // Quem decide é o servidor: gestor só exporta setores sem lista de pessoas (policy.canExportPdf). Tudo é auditado.
  if (!relatoriosPdf.tiposValidos().includes(tipo)) return fail(res, 400, 'invalid_type', 'Tipo de relatório inválido.');
  if (!policy.canExportPdf(req.user.role, tipo)) return fail(res, 403, 'forbidden', 'Somente administradores exportam listas com dados pessoais.');
  try {
    const r = relatoriosPdf.gerar(tipo, req.query, req.user);
    audit(req, 'exportar', tipo, null, `Exportação PDF: ${r.resumo}`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${r.arquivo}"`);
    if (r.linhas !== null && r.linhas !== undefined) res.setHeader('X-Linhas', String(r.linhas));
    res.send(r.buffer);
  } catch (err) {
    if (err instanceof ErroRelatorio) return fail(res, err.status, 'report', err.message);
    throw err;
  }
});

router.get('/reports/export', requireAdmin, (req, res) => {
  const type = String(req.query.type || 'motoristas');
  const { de, ate } = period(req.query);
  const stamp = `${de}_a_${ate}`;
  const safeJson = (text) => { try { return JSON.parse(text || '{}'); } catch (err) { return {}; } };

  if (type === 'simulacoes') {
    const rows = db.prepare("SELECT * FROM simulacoes WHERE date(created_at, '-3 hours') BETWEEN ? AND ? ORDER BY id").all(de, ate);
    // Cabeçalhos dizem "estimado": são simulações, não receita realizada.
    const header = ['ID', 'Data', 'Cenário', 'Corridas/mês', 'Faturamento bruto estimado', 'Receita estimada (plataforma)', 'Repasse estimado aos motoristas', 'Custos mensais', 'Resultado estimado', 'Observação', 'Responsável'];
    // Valores numéricos seguem como número (inclusive negativos): sendCsv cuida do formato com vírgula.
    const body = rows.map((s) => {
      const r = safeJson(s.resultados);
      return [s.id, localDate(s.created_at), s.cenario_nome, r.corridas_mes, r.faturamento_bruto, r.receita_plataforma, r.repasse_motoristas, r.custos_total, r.resultado_operacional, s.observacao || '', s.created_by_nome || ''];
    });
    audit(req, 'exportar', 'simulacoes', null, `Exportação CSV de simulações (${de} a ${ate}, ${rows.length} linhas)`);
    return sendCsv(res, `financeiro_${stamp}.csv`, header, body);
  }

  if (type === 'documentos' && docs.ativo()) {
    // Só metadados e situação da conferência (nada de CPF/CNPJ nem arquivo). Administrador (a rota já exige).
    // Mesmo critério do PDF e do cartão da tela: período pela data de inclusão (só quando de/ate vêm na consulta).
    const lista = docs.consultar(req, { situacao: String(req.query.situacao || ''), funcao: String(req.query.funcao || ''), categoria: String(req.query.categoria || ''), q: req.query.q, de: req.query.de, ate: req.query.ate, tudo: true }).items;
    const header = ['ID', 'Função', 'Cadastro', 'Documento', 'Situação', 'Versões', 'Enviado em', 'Conferido por', 'Conferido em'];
    const body = lista.map((i) => [i.id, i.funcao_rotulo, i.registro_titulo || '', i.titulo || i.categoria_rotulo, i.situacao_rotulo, i.total_versoes, i.versao_atual ? localDate(i.versao_atual.data_envio) || i.versao_atual.data_envio : '', i.conferido_por_nome || '', i.conferido_em ? localDate(i.conferido_em) : '']);
    audit(req, 'exportar', 'documentos', null, `Exportação CSV de documentos (${lista.length} linhas)`);
    return sendCsv(res, req.query.de || req.query.ate ? `documentos_${stamp}.csv` : 'documentos.csv', header, body);
  }

  const def = Object.prototype.hasOwnProperty.call(ENTITIES, type) ? ENTITIES[type] : null;
  if (!def) return fail(res, 400, 'invalid_type', 'Tipo de relatório inválido.');

  // Mesmo critério de data do resumo: campanhas sem data planejada usam a data de publicação.
  const dateExpr = def.table === 'campanhas' ? 'COALESCE(data_publicacao, data_planejada)' : def.dateField;
  // modo=lista (botão CSV das telas de lista): os MESMOS filtros da lista (busca, situação, etapa…) e, sem período, todo o histórico.
  const lista = req.query.modo === 'lista';
  const filtro = lista ? entities.montarFiltro(def, req.query) : null;
  const rows = lista
    ? db.prepare(`SELECT * FROM ${def.table} WHERE ${filtro.where.join(' AND ')} ORDER BY ${dateExpr} DESC, id DESC`).all(...filtro.params)
    : db.prepare(`SELECT * FROM ${def.table} WHERE ${dateExpr} BETWEEN ? AND ? ORDER BY ${dateExpr} DESC, id DESC`).all(de, ate);
  const header = ['ID', ...def.fields.map((f) => f.label), 'Criado em'];
  const body = rows.map((r) => [
    r.id,
    ...def.fields.map((f) => {
      const v = r[f.key];
      return v === null || v === undefined ? '' : v;
    }),
    r.created_at ? localDate(r.created_at) : ''
  ]);
  audit(req, 'exportar', def.table, null, `Exportação CSV de ${def.label} (${lista ? 'lista com filtros' : `${de} a ${ate}`}, ${rows.length} linhas)`);
  sendCsv(res, lista ? `${type}_lista.csv` : `${type}_${stamp}.csv`, header, body);
});

/* -------------------------------- financeiro ------------------------------- */
const MAX_FIN = 1e9; // teto para premissas e custos: evita overflow e totais absurdos

router.get('/finance/cenarios', (req, res) => {
  const rows = db.prepare('SELECT * FROM cenarios ORDER BY id').all();
  res.json({ items: rows.map(cenarioCompleto), comissao_padrao: Number(getSetting('comissao_padrao', '10')) });
});

router.post('/finance/cenarios', (req, res) => {
  const nome = String(req.body.nome || '').trim();
  if (!nome) return fail(res, 422, 'invalid_name', 'Informe o nome do cenário.');
  if (nome.length > 80) return fail(res, 422, 'invalid_name', 'Nome do cenário muito longo (máximo 80 caracteres).');
  const descricao = String(req.body.descricao || '').trim();
  if (descricao.length > 500) return fail(res, 422, 'invalid', 'Descrição muito longa (máximo 500 caracteres).');
  const comissao = req.body.comissao_pct === undefined || req.body.comissao_pct === '' || req.body.comissao_pct === null
    ? Number(getSetting('comissao_padrao', '10'))
    : Number(req.body.comissao_pct);
  if (!Number.isFinite(comissao) || comissao < 0 || comissao > 100) return fail(res, 422, 'invalid_value', 'A comissão deve estar entre 0 e 100%.');
  const now = nowISO();
  const info = db.prepare(
    `INSERT INTO cenarios (nome, descricao, motoristas_ativos, corridas_motorista_dia, dias_operacao, valor_medio_corrida, comissao_pct, created_at, updated_at)
     VALUES (?, ?, 0, 0, 0, 0, ?, ?, ?)`
  ).run(nome, descricao, comissao, now, now);
  audit(req, 'criar', 'cenarios', info.lastInsertRowid, 'Cenário financeiro criado');
  res.status(201).json({ item: cenarioCompleto(db.prepare('SELECT * FROM cenarios WHERE id = ?').get(info.lastInsertRowid)) });
});

router.patch('/finance/cenarios/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM cenarios WHERE id = ?').get(id);
  if (!row) return fail(res, 404, 'not_found', 'Cenário não encontrado.');

  const numeric = ['motoristas_ativos', 'corridas_motorista_dia', 'dias_operacao', 'valor_medio_corrida', 'comissao_pct'];
  const values = {};
  for (const key of numeric) {
    if (req.body[key] === undefined) continue;
    const v = Number(req.body[key]);
    if (!Number.isFinite(v) || v < 0 || v > MAX_FIN) return fail(res, 422, 'invalid_value', `Valor inválido em ${key}.`);
    values[key] = key === 'motoristas_ativos' || key === 'dias_operacao' ? Math.round(v) : v;
  }
  if (values.comissao_pct !== undefined && values.comissao_pct > 100) return fail(res, 422, 'invalid_value', 'A comissão não pode exceder 100%.');
  if (req.body.nome !== undefined) {
    const nome = String(req.body.nome).trim();
    if (!nome) return fail(res, 422, 'invalid_name', 'Informe o nome do cenário.');
    if (nome.length > 80) return fail(res, 422, 'invalid_name', 'Nome do cenário muito longo (máximo 80 caracteres).');
    values.nome = nome;
  }
  if (req.body.descricao !== undefined) {
    values.descricao = String(req.body.descricao).trim();
    if (values.descricao.length > 500) return fail(res, 422, 'invalid', 'Descrição muito longa (máximo 500 caracteres).');
  }

  const keys = Object.keys(values);
  if (!keys.length) return fail(res, 400, 'empty', 'Nenhuma premissa informada.');
  db.prepare(`UPDATE cenarios SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
    .run(...keys.map((k) => values[k]), nowISO(), id);

  audit(req, 'editar', 'cenarios', id, 'Premissas do cenário atualizadas');
  res.json({ item: cenarioCompleto(db.prepare('SELECT * FROM cenarios WHERE id = ?').get(id)) });
});

router.delete('/finance/cenarios/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const total = db.prepare('SELECT COUNT(*) c FROM cenarios').get().c;
  if (total <= 1) return fail(res, 400, 'last_scenario', 'Mantenha ao menos um cenário.');
  const row = db.prepare('SELECT * FROM cenarios WHERE id = ?').get(id);
  if (!row) return fail(res, 404, 'not_found', 'Cenário não encontrado.');
  db.prepare('DELETE FROM cenarios WHERE id = ?').run(id);
  audit(req, 'excluir', 'cenarios', id, 'Cenário excluído');
  res.json({ ok: true });
});

router.post('/finance/cenarios/:id/custos', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM cenarios WHERE id = ?').get(id);
  if (!row) return fail(res, 404, 'not_found', 'Cenário não encontrado.');
  const descricao = String(req.body.descricao || '').trim();
  const valor = Number(req.body.valor);
  if (!descricao) return fail(res, 422, 'invalid', 'Informe a descrição do custo.');
  if (!Number.isFinite(valor) || valor < 0 || valor > MAX_FIN) return fail(res, 422, 'invalid', 'Valor do custo inválido.');
  if (descricao.length > 120) return fail(res, 422, 'invalid', 'Descrição do custo muito longa (máximo 120 caracteres).');

  const info = db.prepare('INSERT INTO cenario_custos (cenario_id, descricao, valor, created_at) VALUES (?, ?, ?, ?)')
    .run(id, descricao, valor, nowISO());
  audit(req, 'criar', 'cenario_custos', info.lastInsertRowid, 'Custo mensal adicionado');
  res.status(201).json({ item: cenarioCompleto(db.prepare('SELECT * FROM cenarios WHERE id = ?').get(id)) });
});

router.patch('/finance/custos/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM cenario_custos WHERE id = ?').get(id);
  if (!row) return fail(res, 404, 'not_found', 'Custo não encontrado.');
  const descricao = req.body.descricao !== undefined ? String(req.body.descricao).trim() : row.descricao;
  const valor = req.body.valor !== undefined ? Number(req.body.valor) : row.valor;
  if (!descricao) return fail(res, 422, 'invalid', 'Informe a descrição do custo.');
  if (!Number.isFinite(valor) || valor < 0 || valor > MAX_FIN) return fail(res, 422, 'invalid', 'Valor do custo inválido.');
  if (descricao.length > 120) return fail(res, 422, 'invalid', 'Descrição do custo muito longa (máximo 120 caracteres).');
  db.prepare('UPDATE cenario_custos SET descricao = ?, valor = ? WHERE id = ?').run(descricao, valor, id);
  audit(req, 'editar', 'cenario_custos', id, 'Custo mensal atualizado');
  res.json({ item: cenarioCompleto(db.prepare('SELECT * FROM cenarios WHERE id = ?').get(row.cenario_id)) });
});

router.delete('/finance/custos/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM cenario_custos WHERE id = ?').get(id);
  if (!row) return fail(res, 404, 'not_found', 'Custo não encontrado.');
  db.prepare('DELETE FROM cenario_custos WHERE id = ?').run(id);
  audit(req, 'excluir', 'cenario_custos', id, 'Custo mensal removido');
  res.json({ item: cenarioCompleto(db.prepare('SELECT * FROM cenarios WHERE id = ?').get(row.cenario_id)) });
});

const parseJson = (text) => { try { return JSON.parse(text || '{}'); } catch (err) { return {}; } };

router.get('/finance/simulacoes', (req, res) => {
  const rows = db.prepare('SELECT * FROM simulacoes ORDER BY id DESC LIMIT 100').all();
  res.json({
    items: rows.map((s) => ({
      id: s.id,
      cenario_id: s.cenario_id,
      cenario: s.cenario_nome,
      created_at: s.created_at,
      autor: s.created_by_nome,
      observacao: s.observacao,
      premissas: parseJson(s.premissas),
      resultados: parseJson(s.resultados)
    }))
  });
});

router.post('/finance/simulacoes', (req, res) => {
  const cenario = db.prepare('SELECT * FROM cenarios WHERE id = ?').get(Number(req.body.cenario_id));
  if (!cenario) return fail(res, 404, 'not_found', 'Cenário não encontrado.');
  const custos = db.prepare('SELECT * FROM cenario_custos WHERE cenario_id = ?').all(cenario.id);
  const resultado = computeCenario(cenario, custos);

  const info = db.prepare(
    `INSERT INTO simulacoes (cenario_id, cenario_nome, premissas, resultados, custos_detalhe, observacao, created_by, created_by_nome, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    cenario.id,
    cenario.nome,
    JSON.stringify({
      motoristas_ativos: cenario.motoristas_ativos,
      corridas_motorista_dia: cenario.corridas_motorista_dia,
      dias_operacao: cenario.dias_operacao,
      valor_medio_corrida: cenario.valor_medio_corrida,
      comissao_pct: cenario.comissao_pct
    }),
    JSON.stringify(resultado),
    JSON.stringify(custos.map((c) => ({ descricao: c.descricao, valor: c.valor }))),
    String(req.body.observacao || '').slice(0, 500),
    req.user.id,
    req.user.nome,
    nowISO()
  );

  audit(req, 'simulacao', 'cenarios', cenario.id, `Simulação registrada — ${cenario.nome}`);
  res.status(201).json({ id: Number(info.lastInsertRowid), resultado });
});

router.delete('/finance/simulacoes/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM simulacoes WHERE id = ?').get(id);
  if (!row) return fail(res, 404, 'not_found', 'Simulação não encontrada.');
  db.prepare('DELETE FROM simulacoes WHERE id = ?').run(id);
  audit(req, 'excluir', 'simulacoes', id, 'Simulação excluída');
  res.json({ ok: true });
});

/* -------------------------------- configurações ---------------------------- */
router.get('/settings', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, nome, email, role, ativo, totp_ativo, email_2fa, last_login_at, created_at FROM users ORDER BY id').all();
  res.json({
    settings: {
      org_nome: getSetting('org_nome'),
      slogan: getSetting('slogan'),
      alerta_dias: Number(getSetting('alerta_dias', '7')),
      comissao_padrao: Number(getSetting('comissao_padrao', '10'))
    },
    users
  });
});

router.patch('/settings', requireAdmin, (req, res) => {
  if (req.body.org_nome !== undefined) {
    const nome = String(req.body.org_nome).trim();
    if (nome.length < 2 || nome.length > 80) return fail(res, 422, 'invalid', 'Nome da organização inválido (2 a 80 caracteres).');
    setSetting('org_nome', nome);
  }
  if (req.body.slogan !== undefined) setSetting('slogan', String(req.body.slogan).trim().slice(0, 160));
  if (req.body.alerta_dias !== undefined) {
    const v = Number(req.body.alerta_dias);
    if (!Number.isInteger(v) || v < 0 || v > 90) return fail(res, 422, 'invalid', 'Janela de alerta deve estar entre 0 e 90 dias.');
    setSetting('alerta_dias', v);
  }
  if (req.body.comissao_padrao !== undefined) {
    const v = Number(req.body.comissao_padrao);
    if (!Number.isFinite(v) || v < 0 || v > 100) return fail(res, 422, 'invalid', 'Comissão padrão inválida.');
    setSetting('comissao_padrao', v);
  }
  audit(req, 'editar', 'settings', null, 'Configurações atualizadas');
  res.json({ ok: true });
});

router.post('/users', requireAdmin, (req, res) => {
  const nome = String(req.body.nome || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const senha = String(req.body.senha || '');
  const parsedRole = policy.parseRole(req.body.role);
  if (parsedRole.error) return fail(res, 422, 'invalid_role', parsedRole.error);
  const role = parsedRole.role;
  if (nome.length < 3) return fail(res, 422, 'invalid_name', 'Informe o nome.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail(res, 422, 'invalid_email', 'E-mail inválido.');
  const pwdError = auth.passwordProblem(senha);
  if (pwdError) return fail(res, 422, 'weak_password', pwdError);
  if (db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email)) return fail(res, 409, 'duplicated', 'Já existe usuário com este e-mail.');

  const now = nowISO();
  const info = db.prepare('INSERT INTO users (nome, email, senha_hash, role, ativo, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .run(nome, email, auth.hashPassword(senha), role, now, now);
  audit(req, 'criar', 'users', info.lastInsertRowid, `Usuário ${email} criado`);
  res.status(201).json({ ok: true });
});

router.patch('/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return fail(res, 404, 'not_found', 'Usuário não encontrado.');

  if (req.body.ativo !== undefined && ![true, false, 0, 1].includes(req.body.ativo)) {
    return fail(res, 422, 'invalid_active', 'Estado de ativação inválido.');
  }
  const adminsAtivos = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND ativo = 1").get().c;
  const removendoAdmin = user.role === 'admin' && user.ativo &&
    ((req.body.ativo === false || req.body.ativo === 0) || req.body.role === 'gestor');
  if (removendoAdmin && adminsAtivos <= 1) {
    return fail(res, 400, 'last_admin', 'Mantenha ao menos um administrador ativo.');
  }

  // Valida TUDO antes de gravar: antes, um perfil inválido era recusado depois de a ativação já ter sido salva.
  if (req.body.ativo !== undefined && id === req.user.id && !req.body.ativo) return fail(res, 400, 'self', 'Não é possível desativar o próprio usuário.');
  if (req.body.role !== undefined && !policy.ROLES.includes(req.body.role)) return fail(res, 422, 'invalid', 'Perfil inválido.');
  if (req.body.senha !== undefined) {
    const pwdError = auth.passwordProblem(String(req.body.senha));
    if (pwdError) return fail(res, 422, 'weak_password', pwdError);
  }
  let novoEmail = null;
  if (req.body.email !== undefined) {
    novoEmail = String(req.body.email || '').trim().toLowerCase();
    if (novoEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(novoEmail)) return fail(res, 422, 'invalid_email', 'Informe um e-mail válido.');
    const dono = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(novoEmail);
    if (dono && dono.id !== id) return fail(res, 409, 'email_taken', 'Este e-mail já é usado por outro usuário.');
    if (novoEmail === String(user.email).toLowerCase()) novoEmail = null;
  }

  db.transaction(() => {
    if (req.body.ativo !== undefined) {
      db.prepare('UPDATE users SET ativo = ?, updated_at = ? WHERE id = ?').run(req.body.ativo ? 1 : 0, nowISO(), id);
      if (!req.body.ativo) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
    if (req.body.role !== undefined) {
      db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(req.body.role, nowISO(), id);
    }
    if (novoEmail) {
      // E-mail de acesso: as sessões de OUTRO usuário caem (ele entra de novo com o e-mail novo); a do próprio admin continua.
      db.prepare('UPDATE users SET email = ?, updated_at = ? WHERE id = ?').run(novoEmail, nowISO(), id);
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(id, req.user.sid);
    }
    if (req.body.senha !== undefined) {
      db.prepare('UPDATE users SET senha_hash = ?, updated_at = ? WHERE id = ?').run(auth.hashPassword(String(req.body.senha)), nowISO(), id);
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(id, req.user.sid);
    }
    // Celular perdido: o administrador desliga a verificação em duas etapas de OUTRO usuário (a própria só com o código).
    if (req.body.desativar_2fa === true && id !== req.user.id) {
      db.prepare('UPDATE users SET totp_ativo = 0, totp_segredo = NULL, totp_pendente = NULL, email_2fa = 0, updated_at = ? WHERE id = ?').run(nowISO(), id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      auth.esquecerAparelhos(id);
    }
  })();
  audit(req, 'editar', 'users', id, novoEmail ? 'Usuário atualizado (e-mail de acesso alterado)' : 'Usuário atualizado');
  res.json({ ok: true });
});

router.delete('/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return fail(res, 400, 'self', 'Não é possível excluir o próprio usuário.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return fail(res, 404, 'not_found', 'Usuário não encontrado.');
  const admins = db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND ativo = 1").get().c;
  if (user.role === 'admin' && user.ativo && admins <= 1) return fail(res, 400, 'last_admin', 'Mantenha ao menos um administrador ativo.');
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  audit(req, 'excluir', 'users', id, `Usuário ${user.email} excluído`);
  res.json({ ok: true });
});

/* ------------------------ Etapa 2: ficha central de pessoas ------------------------ */
// Só existe com FM_ETAPA2=1 e as migrações aplicadas (pessoas.ativa()). Gestor consulta, cria e adiciona função;
// juntar duplicados é só do administrador (confirmação explícita + auditoria).
const { createPessoas, ErroPessoa } = require('./pessoas');
const pessoas = createPessoas({ db, entities, ENTITIES, audit });

// Documentos (M4): arquivo digital por função, cifrado, em armazenamento privado (src/documentos/). Só com FM_ETAPA2=1 e a migração 005.
const { createDocumentos, ErroDoc } = require('./documentos/service');
const { criarDoAmbiente } = require('./documentos/armazenamento');
const docs = createDocumentos({
  db, armazenamento: criarDoAmbiente({ dataDir: DATA_DIR }), ENTITIES, entities, audit, getSetting, setSetting, todayISO, isDateISO, localDate
});
function docsAtivo(req, res, next) {
  if (!docs.ativo()) return fail(res, 404, 'not_found', 'Recurso não encontrado.');
  next();
}
const { createCandidaturas, ErroCand } = require('./candidaturas');
const candidaturas = createCandidaturas({ db, audit, docs, getSetting });
recebidos = createRecebidos({ db, docs, candidaturas, audit });
ia.definirRecebidos(recebidos);
// Ficha ligada à conversa depois (pela equipe ou pela IA): os arquivos que esperavam vão para ela.
wa.store.ouvir((evt) => {
  if (evt && evt.tipo === 'vinculo' && evt.vinculoTipo === 'motoristas') recebidos.processar(evt.conversaId).catch((err) => console.error(`[documentos] conversa ${evt.conversaId}: ${err.message}`));
});
docs.definirEscopoAvaliador((funcao, registroId) => candidaturas.noEscopoAvaliador(funcao, registroId));
// Erro de regra de documentos vira resposta com o código e a mensagem certos; o resto cai no tratador geral.
const comDoc = (fn) => seguro(async (req, res) => {
  try { await fn(req, res); } catch (err) {
    if (err instanceof ErroDoc) return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    throw err;
  }
});
function etapa2(req, res, next) {
  if (!pessoas.ativa()) return fail(res, 404, 'not_found', 'Recurso não encontrado.');
  next();
}
function respostaPessoa(res, fn) {
  try { return fn(); } catch (err) {
    if (err instanceof ErroPessoa) {
      if (err.message === 'validacao' && err.resultado) {
        const r = err.resultado;
        if (r.errors) return res.status(r.status).json({ error: { code: 'validation', message: 'Verifique os campos destacados.', fields: r.errors } });
        return fail(res, r.status, 'error', r.error);
      }
      return res.status(err.status).json({ error: { code: 'pessoa', message: err.message, ...(err.conflitos ? { conflitos: err.conflitos, opcoes: err.opcoes } : {}), ...(err.registro_id ? { registro_id: err.registro_id } : {}) } });
    }
    throw err;
  }
}
router.get('/pessoas', etapa2, (req, res) => res.json(pessoas.listar({ q: req.query.q, page: req.query.page })));
router.get('/pessoas/duplicados', etapa2, requireAdmin, (req, res) => {
  const r = pessoas.duplicados();
  audit(req, 'consultar', 'duplicados', null, `Possíveis duplicados de pessoas (${r.total_grupos} grupo(s))`);
  res.json(r);
});
router.post('/pessoas/verificar-telefone', etapa2, (req, res) => {
  const exceto = Number.isInteger(req.body.exceto) ? req.body.exceto : null;
  res.json({ possiveis: pessoas.verificarTelefone(String(req.body.telefone || '').slice(0, 30), { exceto }) });
});
router.post('/pessoas/juntar', etapa2, requireAdmin, (req, res) => respostaPessoa(res, () => {
  const b = req.body || {};
  const principais = b.principais && typeof b.principais === 'object' ? b.principais : {};
  res.json(pessoas.juntar({ manterId: Number(b.manter_id), juntarId: Number(b.juntar_id), principais, confirmo: b.confirmo }, req));
}));
// Ficha central + resumo dos documentos de cada função (só situação) + CPF/CNPJ mascarado (só administrador).
function fichaCentral(req, tipo) {
  const admin = req.user.role === 'admin';
  const f = pessoas.fichaTitular(tipo, Number(req.params.id), { admin });
  if (f.mesclada) return f;
  if (docs.ativo()) f.documentos = docs.resumoDasFuncoes([...f.funcoes, ...f.funcoes_encerradas]);
  if (admin) f.protegido = { ...pessoas.infoProtegido(tipo, Number(req.params.id)), coleta: docs.ativo() ? docs.politica().cpf_cnpj[tipo === 'pessoa' ? 'cpf' : 'cnpj'] : 'desligado' };
  return f;
}
router.get('/pessoas/:id', etapa2, (req, res) => respostaPessoa(res, () => res.json(fichaCentral(req, 'pessoa'))));
router.post('/pessoas/:id/funcoes', etapa2, (req, res) => respostaPessoa(res, () => {
  const r = pessoas.adicionarFuncao(Number(req.params.id), String(req.body.funcao || ''), req.body.dados, req);
  res.status(201).json({ item: r.item, titular: r.titular });
}));

// Ficha central da EMPRESA (parceiro do Clube de Vantagens e comércio): mesma lógica e mesmas permissões das pessoas.
router.get('/empresas', etapa2, (req, res) => res.json(pessoas.listarTitulares('empresa', { q: req.query.q, page: req.query.page })));
router.get('/empresas/duplicados', etapa2, requireAdmin, (req, res) => {
  const r = pessoas.duplicadosTitulares('empresa');
  audit(req, 'consultar', 'duplicados', null, `Possíveis duplicados de empresas (${r.total_grupos} grupo(s))`);
  res.json(r);
});
router.post('/empresas/verificar-telefone', etapa2, (req, res) => {
  const exceto = Number.isInteger(req.body.exceto) ? req.body.exceto : null;
  res.json({ possiveis: pessoas.verificarTelefoneTitular('empresa', String(req.body.telefone || '').slice(0, 30), { exceto }) });
});
router.post('/empresas/juntar', etapa2, requireAdmin, (req, res) => respostaPessoa(res, () => {
  const b = req.body || {};
  const principais = b.principais && typeof b.principais === 'object' ? b.principais : {};
  res.json(pessoas.juntarTitulares('empresa', { manterId: Number(b.manter_id), juntarId: Number(b.juntar_id), principais, confirmo: b.confirmo }, req));
}));
router.get('/empresas/:id', etapa2, (req, res) => respostaPessoa(res, () => res.json(fichaCentral(req, 'empresa'))));
router.post('/empresas/:id/funcoes', etapa2, (req, res) => respostaPessoa(res, () => {
  const r = pessoas.adicionarFuncaoTitular('empresa', Number(req.params.id), String(req.body.funcao || ''), req.body.dados, req);
  res.status(201).json({ item: r.item, titular: r.titular });
}));


// CPF (pessoa) e CNPJ (empresa): só administrador; só cifrados; coleta só se a política estiver "opcional" (decisão pendente do dono).
for (const [tipo, caminho, campo] of [['pessoa', 'pessoas', 'cpf'], ['empresa', 'empresas', 'cnpj']]) {
  router.put(`/${caminho}/:id/${campo}`, etapa2, requireAdmin, (req, res) => respostaPessoa(res, () => {
    if (!docs.ativo() || docs.politica().cpf_cnpj[campo] !== 'opcional') {
      return fail(res, 409, 'coleta_desligada', `A coleta de ${campo.toUpperCase()} está desligada: a política de dados ainda não foi definida pelo dono.`);
    }
    res.json({ protegido: pessoas.definirProtegido(tipo, Number(req.params.id), req.body && req.body[campo], req.body && req.body.finalidade, req) });
  }));
  router.post(`/${caminho}/:id/${campo}/remover`, etapa2, requireAdmin, (req, res) => respostaPessoa(res, () => {
    if (!req.body || req.body.confirmo !== true) return fail(res, 422, 'confirm_required', 'É necessário confirmar a ação de forma explícita.');
    res.json({ protegido: pessoas.removerProtegido(tipo, Number(req.params.id), req) });
  }));
  router.post(`/${caminho}/:id/${campo}/revelar`, etapa2, requireAdmin, (req, res) => respostaPessoa(res, () => res.json(pessoas.revelarProtegido(tipo, Number(req.params.id), req))));
}

/* ----------------------- Etapa 2: consultas só de leitura ----------------------- */
// Relatório de possíveis duplicados (mostra só nome, módulo, situação e 4 últimos dígitos do telefone) e estado das
// migrações. Nenhuma das duas altera dados.
router.get('/admin/duplicados', requireAdmin, (req, res) => {
  const r = require('./duplicados').relatorioDuplicados(db);
  audit(req, 'consultar', 'duplicados', null, `Relatório de possíveis duplicados (${r.total_grupos} grupo(s))`);
  res.json(r);
});
router.get('/admin/migracoes', requireAdmin, (req, res) => {
  const m = require('./migracoes');
  res.json({ etapa2_ligada: process.env.FM_ETAPA2 === '1', ...m.estado(db), integridade: m.verificarIntegridade(db) });
});

// Verificação de saúde depois de publicar (só administrador): versão no ar, banco, migrações, documentos (gravação e
// leitura reais de um arquivo de prova, cifrado e apagado em seguida), WhatsApp, IA e cópia de segurança. Nenhum segredo sai.
router.get('/admin/saude', requireAdmin, seguro(async (req, res) => {
  const m = require('./migracoes');
  const pkg = require('../package.json');
  let cache = null;
  try { cache = (/const CACHE = '([^']+)'/.exec(fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8')) || [])[1] || null; } catch (_) { /* sem sw */ }
  let commit = process.env.RENDER_GIT_COMMIT || null;
  try { if (!commit) commit = fs.readFileSync(path.join(__dirname, '..', 'VERSAO'), 'utf8').trim().slice(0, 40) || null; } catch (_) { /* sem arquivo */ }
  const banco = db.prepare('PRAGMA quick_check').get();
  const documentos = { ativo: docs.ativo(), ...docs.estadoArmazenamento(), prova: null };
  if (docs.ativo() && documentos.pronto) {
    const prova = Buffer.from(`prova-${crypto.randomUUID()}`);
    try {
      const g = await docs.guardarRecebido(prova);
      const lido = await docs.lerRecebido(g);
      await docs.descartarGuardado(g.chave);
      documentos.prova = lido.equals(prova) ? 'ok' : 'conteúdo diferente';
    } catch (err) { documentos.prova = `falhou: ${String(err.message).slice(0, 120)}`; }
  }
  const est = wa.estado();
  const cfgIa = ia.config();
  audit(req, 'saude_ver', 'sistema', null, 'verificação de saúde');
  res.json({
    versao: pkg.version, commit, cache, node: process.version, etapa2: process.env.FM_ETAPA2 === '1',
    banco: { quick_check: banco ? Object.values(banco)[0] : null },
    migracoes: { ...m.estado(db) },
    documentos,
    anexos_whatsapp: recebidos && recebidos.ativo() ? { ativo: true, pendentes: recebidos.contarPendentes() } : { ativo: false },
    whatsapp: { ativo: est.ativo, estado: est.canal.state, fila: est.fila },
    ia: { ativa: cfgIa.ativo, modo: cfgIa.modo, responde_sozinha: cfgIa.responder, provedor: cfgIa.provedor, chave_configurada: cfgIa.chaveConfigurada },
    cofre: { configurado: !!process.env.SNAPSHOT_URL, modo: process.env.SNAPSHOT_MODO || 'render' }
  });
}));

router.get('/audit', requireAdmin, (req, res) => {
  const limit = Math.min(300, Math.max(1, parseInt(req.query.limit, 10) || 100));
  res.json({ items: db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit) });
});

/* ----------------------------- parceiros: confirmar ------------------------ */
router.post('/parceiros/:id/confirmar', (req, res) => {
  const id = Number(req.params.id);
  const def = ENTITIES.parceiros;
  const row = db.prepare('SELECT * FROM parceiros WHERE id = ?').get(id);
  if (!row) return fail(res, 404, 'not_found', 'Parceiro não encontrado.');
  if (row.situacao === def.confirmStatus) return fail(res, 409, 'already', 'Esta parceria já está confirmada.');
  if (req.body.confirmo !== true) return fail(res, 422, 'confirm_required', 'É necessário confirmar a ação de forma explícita.');

  const now = nowISO();
  db.prepare("UPDATE parceiros SET situacao = ?, confirmado_em = ?, confirmado_por = ?, updated_at = ? WHERE id = ?")
    .run(def.confirmStatus, now, req.user.id, now, id);
  entities.logInteraction('parceiros', id, req, `Parceria confirmada manualmente por ${req.user.nome}`, row.situacao, def.confirmStatus, 'Confirmação');
  audit(req, 'confirmar', 'parceiros', id, 'Parceria comercial confirmada');
  res.json({ item: db.prepare('SELECT * FROM parceiros WHERE id = ?').get(id) });
});

// Motorista contratado (já trabalhando): marcação manual e datada, como a confirmação de parceria. Fica verde na lista.
// Entregador (Etapa 2, M2) segue a mesma regra: marcação manual, datada, com confirmação explícita.
function contratar(tabela, rotulo) {
  return (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id);
    if (!row) return fail(res, 404, 'not_found', `${rotulo} não encontrado.`);
    if (row.situacao === 'Contratado') return fail(res, 409, 'already', `Este ${rotulo.toLowerCase()} já está como contratado.`);
    if (req.body.confirmo !== true) return fail(res, 422, 'confirm_required', 'É necessário confirmar a ação de forma explícita.');
    const now = nowISO();
    db.prepare(`UPDATE ${tabela} SET situacao = ?, contratado_em = ?, updated_at = ? WHERE id = ?`).run('Contratado', todayISO(), now, id);
    entities.logInteraction(tabela, id, req, `${rotulo} contratado (marcado por ${req.user.nome})`, row.situacao, 'Contratado', 'Confirmação');
    audit(req, 'contratar', tabela, id, `${rotulo} marcado como contratado`);
    res.json({ item: db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id) });
  };
}
router.post('/motoristas/:id/contratar', contratar('motoristas', 'Motorista'));
if (hasOwn(ENTITIES, 'entregadores')) router.post('/entregadores/:id/contratar', contratar('entregadores', 'Entregador'));

// Comércio parceiro (Etapa 2, M3): marcar como "Ativo na plataforma" (já pedindo entregas) é manual, datado e com confirmação.
// Não mexe em NENHUM outro cadastro da mesma empresa (o Parceiro do Clube, por exemplo, tem situação própria).
if (hasOwn(ENTITIES, 'comercios')) {
  router.post('/comercios/:id/ativar', (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM comercios WHERE id = ?').get(id);
    if (!row) return fail(res, 404, 'not_found', 'Comércio não encontrado.');
    if (row.situacao === 'Ativo na plataforma') return fail(res, 409, 'already', 'Este comércio já está ativo na plataforma.');
    if (req.body.confirmo !== true) return fail(res, 422, 'confirm_required', 'É necessário confirmar a ação de forma explícita.');
    db.prepare('UPDATE comercios SET situacao = ?, ativado_em = ?, updated_at = ? WHERE id = ?').run('Ativo na plataforma', todayISO(), nowISO(), id);
    entities.logInteraction('comercios', id, req, `Comércio ativado na plataforma (marcado por ${req.user.nome})`, row.situacao, 'Ativo na plataforma', 'Confirmação');
    audit(req, 'ativar', 'comercios', id, 'Comércio marcado como ativo na plataforma');
    res.json({ item: db.prepare('SELECT * FROM comercios WHERE id = ?').get(id) });
  });
}



/* ------------------------- Avaliação de candidatos (Etapa 2) ------------------------- */
// Equipe (admin e gestor) acompanha e muda etapas; avaliador consulta e registra pareceres; DECISÃO FINAL só o
// administrador (o proprietário). Tudo decidido em src/candidaturas.js (servidor) e auditado.
function comCand(fn) {
  return async (req, res) => {
    try { return res.json(await fn(req)); } catch (err) {
      if (err instanceof ErroCand || err instanceof ErroDoc) return fail(res, err.status, err.code, err.message);
      console.error(`[candidaturas] ${err.message}`);
      return fail(res, 500, 'erro', 'Erro ao processar a avaliação.');
    }
  };
}
const candidaturasAtivas = (req, res, next) => (candidaturas.ativo() ? next() : fail(res, 404, 'not_found', 'Recurso não encontrado.'));
router.get('/candidaturas', candidaturasAtivas, comCand((req) => candidaturas.listar(req, {
  etapa: req.query.etapa ? String(req.query.etapa) : '', funcao: req.query.funcao ? String(req.query.funcao) : '', q: req.query.q, pendentes: req.query.pendentes, page: req.query.page
})));
router.post('/candidaturas', candidaturasAtivas, comCand((req) => {
  const r = candidaturas.abrir(req, String(req.body.funcao || ''), req.body.registro_id);
  return { criada: r.criada, ...candidaturas.detalhe(req, r.candidatura.id) };
}));
router.get('/candidaturas/:id', candidaturasAtivas, comCand((req) => candidaturas.detalhe(req, req.params.id)));
router.post('/candidaturas/:id/etapa', candidaturasAtivas, comCand((req) => candidaturas.mudarEtapa(req, req.params.id, { etapa: String(req.body.etapa || ''), observacao: req.body.observacao })));
router.post('/candidaturas/:id/decisao', candidaturasAtivas, requireAdmin, comCand((req) => candidaturas.decidir(req, req.params.id, { decisao: req.body.decisao, motivo: req.body.motivo, confirmo: req.body.confirmo })));
router.post('/candidaturas/:id/reabrir', candidaturasAtivas, requireAdmin, comCand((req) => candidaturas.reabrir(req, req.params.id, { motivo: req.body.motivo, confirmo: req.body.confirmo, etapa: req.body.etapa || undefined })));
router.post('/candidaturas/:id/pareceres', candidaturasAtivas, comCand((req) => candidaturas.registrarParecer(req, req.params.id, req.body || {})));

/* ------------------------------- Documentos (M4) ------------------------------- */
// Todas as rotas exigem login e FM_ETAPA2=1. A permissão (admin/gestor, categoria liberada) é decidida no servidor em service.js.
// Nenhum arquivo tem URL pública: o conteúdo só sai por GET /documentos/:id/arquivo, que confere permissão e registra o acesso.
const { maxBytes } = require('./documentos/validacao');
const lerArquivo = (req, res, next) => express.raw({ type: () => true, limit: maxBytes() + 1048576 })(req, res, (err) => {
  if (err) return fail(res, err.status === 413 ? 413 : 400, 'arquivo_invalido', err.status === 413 ? 'Arquivo maior que o limite permitido.' : 'Não foi possível ler o arquivo enviado.');
  next();
});
// Metadados do envio vão em cabeçalhos (não na URL): X-Documento = JSON codificado; X-Nome-Arquivo = nome codificado.
function metaDoEnvio(req) {
  const dec = (v) => { try { return decodeURIComponent(String(v || '')); } catch (e) { return ''; } };
  let meta = {};
  const bruto = dec(req.get('x-documento'));
  if (bruto.length > 3000) throw new ErroDoc(422, 'invalido', 'Dados do envio grandes demais.');
  try { meta = bruto ? JSON.parse(bruto) : {}; } catch (e) { throw new ErroDoc(422, 'invalido', 'Dados do envio inválidos.'); }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) meta = {};
  return { ...meta, nome: dec(req.get('x-nome-arquivo')).slice(0, 200), conteudo: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0) };
}

router.get('/documentos/meta', docsAtivo, (req, res) => res.json({
  funcoes: Object.fromEntries(docs.funcoesDisponiveis().map((f) => [f, { rotulo: require('./titulares').FUNCOES[f].rotulo, categorias: docs.CATEGORIAS[f].map(([chave, rotulo]) => ({ chave, rotulo })) }])),
  situacoes: docs.SITUACOES, geral: docs.GERAL, armazenamento: docs.estadoArmazenamento(),
  pode: { politica: req.user.role === 'admin', anexar: policy.docsAnexar(req.user.role, docs.politica()) }
}));
/* ------------------ arquivos recebidos pelo WhatsApp (fotos/PDFs → arquivo digital da ficha) ------------------ */
// Lista e ações: quem pode anexar documentos (admin; gestor se a política deixar). Ver o arquivo da área de espera (ainda
// sem classificação): só o administrador, auditado. Nada é apagado: "não é documento" e "ciente" só registram a decisão.
function podeAnexarDocs(req, res, next) {
  if (!policy.docsAnexar(req.user.role, docs.politica())) return fail(res, 403, 'forbidden', 'Seu perfil não pode cuidar de documentos.');
  next();
}
const comAnexo = (fn) => comDoc(async (req, res) => {
  try { await fn(req, res); } catch (err) {
    if (err && err.status && err.codigo) return res.status(err.status).json({ error: { code: err.codigo, message: err.message } });
    throw err;
  }
});
router.get('/wa/anexos', docsAtivo, podeAnexarDocs, (req, res) => {
  res.json({ itens: recebidos.listar({ pendentes: req.query.todos !== '1' }), pendentes: recebidos.contarPendentes() });
});
router.get('/wa/anexos/:id/arquivo', docsAtivo, requireAdmin, comAnexo(async (req, res) => {
  const a = await recebidos.arquivoDaEspera(req, req.params.id);
  res.set('Content-Type', a.mime || 'application/octet-stream');
  res.set('Content-Disposition', `inline; filename="arquivo-whatsapp.${String(a.nome || '').split('.').pop().replace(/[^a-z0-9]/gi, '') || 'bin'}"`);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Content-Security-Policy', "default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'; sandbox");
  res.send(a.conteudo);
}));
router.post('/wa/anexos/:id/classificar', docsAtivo, podeAnexarDocs, comAnexo(async (req, res) => {
  const b = req.body || {};
  const r = await recebidos.classificar(req, req.params.id, { categoria: String(b.categoria || ''), registro_id: b.registro_id, titulo: b.titulo });
  res.json({ anexo: recebidos.publico(r) });
}));
router.post('/wa/anexos/:id/resolver', docsAtivo, podeAnexarDocs, comAnexo(async (req, res) => {
  res.json({ anexo: recebidos.publico(recebidos.resolver(req, req.params.id, { acao: String((req.body || {}).acao || '') })) });
}));

router.get('/documentos/politica', docsAtivo, requireAdmin, (req, res) => {
  const pol = docs.politica();
  res.json({ politica: pol, decisoes_pendentes: docs.decisoesPendentes(pol), armazenamento: docs.estadoArmazenamento(), categorias: Object.fromEntries(docs.funcoesDisponiveis().map((f) => [f, docs.CATEGORIAS[f].map(([chave, rotulo]) => ({ chave, rotulo }))])), fixos: docs.OBRIGATORIOS_FIXOS });
});
router.put('/documentos/politica', docsAtivo, requireAdmin, comDoc((req, res) => {
  const pol = docs.salvarPolitica(req, req.body);
  res.json({ politica: pol, decisoes_pendentes: docs.decisoesPendentes(pol) });
}));
router.get('/documentos/lista', docsAtivo, comDoc((req, res) => res.json(docs.consultar(req, {
  situacao: String(req.query.situacao || ''), funcao: String(req.query.funcao || ''), categoria: String(req.query.categoria || ''), q: req.query.q, page: req.query.page
}))));
router.get('/documentos', docsAtivo, comDoc((req, res) => res.json(docs.listar(req, String(req.query.funcao || ''), req.query.registro_id))));
// Documento novo ou versão nova: a avaliação do candidato (se houver) só se move entre as etapas iniciais — nunca decide.
const avisarAvaliacao = (r) => { try { if (r && r.documento) candidaturas.atualizarPelosDocumentos(r.documento.funcao, r.documento.registro_id, null); } catch (e) { console.error(`[candidaturas] ${e.message}`); } return r; };
router.post('/documentos', docsAtivo, lerArquivo, comDoc(async (req, res) => {
  res.status(201).json(avisarAvaliacao(await docs.anexar(req, metaDoEnvio(req))));
}));
router.get('/documentos/:id', docsAtivo, comDoc((req, res) => res.json(docs.historico(req, req.params.id))));
router.post('/documentos/:id/versoes', docsAtivo, lerArquivo, comDoc(async (req, res) => {
  res.status(201).json(avisarAvaliacao(await docs.anexar(req, { ...metaDoEnvio(req), documento_id: req.params.id })));
}));
router.get('/documentos/:id/arquivo', docsAtivo, comDoc(async (req, res) => {
  const r = await docs.obterArquivo(req, req.params.id, { versao: req.query.versao, acao: req.query.modo === 'ver' ? 'ver' : 'baixar' });
  res.setHeader('Content-Type', r.mime);
  res.setHeader('Content-Disposition', `${req.query.modo === 'ver' ? 'inline' : 'attachment'}; filename="${r.nomeDownload}"`);
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Content-Length', String(r.conteudo.length));
  res.end(r.conteudo);
}));
router.post('/documentos/:id/conferir', docsAtivo, comDoc((req, res) => res.json({ documento: docs.conferir(req, req.params.id, req.body || {}) })));
router.patch('/documentos/:id', docsAtivo, comDoc((req, res) => res.json({ documento: docs.observar(req, req.params.id, req.body || {}) })));
router.post('/documentos/:id/excluir-definitivo', docsAtivo, comDoc(async (req, res) => res.json(await docs.excluirDefinitivo(req, req.params.id, req.body || {}))));

/* -------------------------------- WhatsApp -------------------------------- */
// Antes do CRUD genérico: "/wa/..." não pode ser tratado como um módulo chamado "wa".
whatsappRoutes.registrar(router, { service: wa, fail, audit, requireAdmin, ENTITIES, entities, db, central: ia.central });
iaRoutes.registrar(router, { ia, cofre: cofreIA, fail, audit, requireAdmin });

/* ------------------------------ CRUD genérico ----------------------------- */
function entityDef(req, res) {
  const def = Object.prototype.hasOwnProperty.call(ENTITIES, req.params.entity) ? ENTITIES[req.params.entity] : null;
  if (!def) { fail(res, 404, 'invalid_entity', 'Módulo inexistente.'); return null; }
  return def;
}

router.get('/:entity', (req, res) => {
  const def = entityDef(req, res);
  if (!def) return;
  res.json(entities.listEntity(def, req.query));
});

// 13/11 (pedido do dono): com o arquivo digital ligado, a situação de cada documento do motorista/entregador vem SÓ do
// arquivo guardado (anexar, conferir e rejeitar no painel de documentos). Ninguém marca "recebido" ou "conferido" à mão.
const CAMPOS_DOC_FICHA = new Set(['doc_cnh', 'doc_crlv', 'doc_endereco', 'doc_antecedentes', 'doc_foto_frente', 'doc_foto_lado', 'doc_foto_traseira', 'documentos']);
function docsDaFichaBloqueados(def, body, atual) {
  if (!docs.ativo() || !['motoristas', 'entregadores'].includes(def.table) || !body || typeof body !== 'object') return false;
  return Object.keys(body).some((k) => CAMPOS_DOC_FICHA.has(k) && String(body[k] == null ? '' : body[k]) !== String((atual && atual[k]) == null ? '' : atual[k]));
}
const MSG_DOCS_FICHA = 'A situação dos documentos é atualizada pelo arquivo digital: anexe, confira ou rejeite o arquivo no painel "Documentos" da ficha.';

router.post('/:entity', (req, res) => {
  const def = entityDef(req, res);
  if (!def) return;
  if (docsDaFichaBloqueados(def, req.body, {})) return fail(res, 422, 'documentos_pelo_arquivo', MSG_DOCS_FICHA);
  if (pessoas.ativa() && Object.prototype.hasOwnProperty.call(pessoas.FUNCAO_DA_TABELA, def.table)) {
    // O usuário pode escolher o titular já existente (pessoa_id para pessoa, empresa_id para empresa); sem escolha = novo.
    const ehEmpresa = pessoas.FUNCAO_DA_TABELA[def.table] === 'parceiro_clube' || pessoas.FUNCAO_DA_TABELA[def.table] === 'comercio';
    const pid = Number(ehEmpresa ? req.body.empresa_id : req.body.pessoa_id);
    return respostaPessoa(res, () => {
      const r = pessoas.criarRegistro(def.table, req.body, req, { titularId: Number.isInteger(pid) && pid > 0 ? pid : null });
      res.status(201).json({ item: r.item, titular: r.titular });
    });
  }
  const result = entities.createEntity(def, req.body, req);
  if (result.errors) return res.status(result.status).json({ error: { code: 'validation', message: 'Verifique os campos destacados.', fields: result.errors } });
  if (result.error) return fail(res, result.status, 'error', result.error);
  res.status(result.status).json({ item: result.item });
});

// Ficha: conversa do WhatsApp vinculada, documentos recebidos (motorista) e o último resumo da IA.
function fichaDoCadastro(tipo, id) {
  if (!['motoristas', 'passageiros', 'parceiros', 'entregadores', 'comercios'].includes(tipo)) return null;
  const conv = db.prepare(`SELECT c.id, c.atendimento, c.atend_motivo, c.ultima_em FROM wa_conversas c JOIN wa_contatos k ON k.id = c.contato_id
    WHERE k.vinculo_tipo = ? AND k.vinculo_id = ? ORDER BY c.ultima_em DESC LIMIT 1`).get(tipo, id);
  const ficha = { conversa: conv || null, documentos: null, resumo_ia: null,
    avaliacao: tipo === 'motoristas' ? candidaturas.daFicha('motorista', id) : (tipo === 'entregadores' ? candidaturas.daFicha('entregador', id) : null) };
  if (conv) {
    const a = db.prepare('SELECT resultado, criado_em FROM ia_analises WHERE conversa_id = ? ORDER BY id DESC LIMIT 1').get(conv.id);
    if (a) { try { ficha.resumo_ia = { texto: JSON.parse(a.resultado).resumo || '', em: a.criado_em }; } catch (err) { /* análise antiga */ } }
  }
  if (tipo === 'motoristas' || tipo === 'entregadores') {
    const rec = conv ? documentosRecebidos(wa.store.listarMensagens(conv.id, { limite: 500 })) : documentosRecebidos([]);
    ficha.documentos = rec;
  }
  return ficha;
}

router.get('/:entity/:id', (req, res) => {
  const def = entityDef(req, res);
  if (!def) return;
  const id = Number(req.params.id);
  const item = db.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).get(id);
  if (!item) return fail(res, 404, 'not_found', 'Registro não encontrado.');
  let interacoes = [];
  if (def.interactions) {
    interacoes = db.prepare('SELECT * FROM interacoes WHERE entity = ? AND entity_id = ? ORDER BY id DESC').all(def.table, id);
  }
  let titular = null;
  if (pessoas.ativa()) {
    const v = db.prepare('SELECT titular_tipo AS tipo, titular_id AS id FROM vinculos WHERE registro_tabela = ? AND registro_id = ? AND ativo = 1').get(def.table, id);
    titular = v || null;
  }
  res.json({ item, interacoes, ficha: fichaDoCadastro(req.params.entity, id), titular });
});

router.patch('/:entity/:id', (req, res) => {
  const def = entityDef(req, res);
  if (!def) return;
  if (docsDaFichaBloqueados(def, req.body, db.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).get(Number(req.params.id)))) return fail(res, 422, 'documentos_pelo_arquivo', MSG_DOCS_FICHA);
  const result = entities.updateEntity(def, Number(req.params.id), req.body, req);
  if (result.errors) return res.status(result.status).json({ error: { code: 'validation', message: 'Verifique os campos destacados.', fields: result.errors } });
  if (result.error) return fail(res, result.status, 'error', result.error);
  res.json({ item: result.item });
});

router.delete('/:entity/:id', (req, res) => {
  const def = entityDef(req, res);
  if (!def) return;
  if (!policy.canDelete(req.user.role, req.params.entity)) {
    return fail(res, 403, 'forbidden', 'Somente administradores podem excluir registros deste módulo.');
  }
  const result = entities.deleteEntity(def, Number(req.params.id), req);
  if (result.error) return fail(res, result.status, 'error', result.error);
  if (pessoas.ativa()) pessoas.aoExcluirRegistro(def.table, Number(req.params.id), req);
  res.json({ ok: true });
});

router.get('/:entity/:id/interacoes', (req, res) => {
  const def = entityDef(req, res);
  if (!def) return;
  if (!def.interactions) return res.json({ items: [] });
  res.json({ items: db.prepare('SELECT * FROM interacoes WHERE entity = ? AND entity_id = ? ORDER BY id DESC').all(def.table, Number(req.params.id)) });
});

router.post('/:entity/:id/interacoes', (req, res) => {
  const def = entityDef(req, res);
  if (!def) return;
  if (!def.interactions) return fail(res, 400, 'unsupported', 'Este módulo não possui histórico de acompanhamento.');
  const id = Number(req.params.id);
  const item = db.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).get(id);
  if (!item) return fail(res, 404, 'not_found', 'Registro não encontrado.');

  const resumo = String(req.body.resumo || '').trim();
  if (resumo.length < 3) return fail(res, 422, 'invalid', 'Descreva o acompanhamento realizado.');
  if (resumo.length > 2000) return fail(res, 422, 'invalid', 'Descrição muito longa (máximo 2000 caracteres).');
  const canal = String(req.body.canal || 'Interno').trim().slice(0, 40);
  let nova = item[def.statusField];

  if (req.body.situacao_nova) {
    const allowed = ENTITIES[req.params.entity].statuses;
    if (!allowed.includes(req.body.situacao_nova)) return fail(res, 422, 'invalid', 'Situação inválida.');
    if (def.confirmStatus && req.body.situacao_nova === def.confirmStatus && item[def.statusField] !== def.confirmStatus) {
      return fail(res, 422, 'confirm_required', 'Use a ação “Confirmar parceria” para marcar a parceria como confirmada.');
    }
    nova = req.body.situacao_nova;
  }

  db.transaction(() => {
    entities.logInteraction(def.table, id, req, resumo, item[def.statusField], nova, canal);
    if (nova !== item[def.statusField]) {
      db.prepare(`UPDATE ${def.table} SET ${def.statusField} = ?, updated_at = ? WHERE id = ?`).run(nova, nowISO(), id);
      if (def.confirmStatus && item[def.statusField] === def.confirmStatus) entities.clearConfirmation(def, id);
    }
  })();
  audit(req, 'acompanhamento', def.table, id, 'Acompanhamento registrado');
  res.status(201).json({ item: db.prepare(`SELECT * FROM ${def.table} WHERE id = ?`).get(id) });
});

module.exports = { buildRouter: () => router, computeCenario, wa, ia, docs, recebidos: () => recebidos };

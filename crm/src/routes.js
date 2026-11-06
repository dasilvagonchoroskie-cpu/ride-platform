'use strict';

const express = require('express');
const crypto = require('crypto');
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
const { criarTranscritor } = require('./ia/transcricao');
const iaRoutes = require('./ia/routes');

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

// Transcrição das mensagens de voz (Gemini com a chave da IA; Groq como alternativa grátis). Liga junto com a IA.
const LIMITE_TRANSCRICOES_DIA = Number(process.env.IA_LIMITE_TRANSCRICOES) || 300;
const transcritor = criarTranscritor({
  cofre: cofreIA,
  obterModeloGemini: async () => {
    const salvo = ia.obterModelo('gemini');
    if (salvo) return salvo;
    return descobrirModelo({ urlBase: PROVEDORES.gemini.urlBase, chave: cofreIA.ler('gemini'), fetchImpl: globalThis.fetch, timeoutMs: 30000 });
  }
});
wa.definirTranscritor(async ({ mensagemId, midia }) => {
  const cfg = ia.config();
  if (!cfg.ativo || !cfg.transcrever || !midia || typeof midia.baixar !== 'function') return false;
  if (cfg.transcricoesHoje >= LIMITE_TRANSCRICOES_DIA) return false;
  if (!transcritor.disponiveis().length) return false;
  const registrar = (ok, provedor, erro) => db.prepare(
    'INSERT INTO ia_transcricoes (mensagem_id, provedor, segundos, ok, erro, criado_em) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(mensagemId, provedor || null, Math.round(midia.segundos || 0), ok ? 1 : 0, erro ? String(erro).slice(0, 200) : null, nowISO());
  try {
    const audio = await midia.baixar();
    const r = await transcritor.transcrever({ audio: Buffer.from(audio), mime: midia.mime, segundos: midia.segundos });
    const atual = db.prepare('SELECT texto FROM wa_mensagens WHERE id = ?').get(mensagemId);
    const rotulo = atual && atual.texto ? atual.texto : '[mensagem de voz]';
    const novo = r.texto === '[sem fala]' ? `${rotulo} (sem fala)` : `${rotulo} 🎤 ${r.texto}`;
    wa.store.definirTranscricao(mensagemId, novo);
    registrar(true, r.provedor);
    return true;
  } catch (err) {
    registrar(false, null, err.message);
    console.error(`[ia] transcrição da mensagem ${mensagemId}: ${err.message}`);
    return false;
  }
});

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
router.get('/health', (req, res) => {
  res.json({ ok: true, app: 'CRM Fortaleza Move', db: 'sqlite', time: new Date().toISOString() });
});

router.get('/auth/status', (req, res) => {
  const needsSetup = auth.countUsers() === 0;
  const session = auth.currentSession(req);
  res.json({
    needsSetup,
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

router.post('/auth/login', (req, res) => {
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

  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?').run(nowISO(), user.id);
  auth.loginSucceeded(ip, email);
  auth.createSession(user.id, req, res);
  req.user = { id: user.id, nome: user.nome };
  audit(req, 'login', 'users', user.id, 'Acesso ao sistema');
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
  const st = auth.recoveryStatus(user.id);
  audit(req, 'senha_recuperada', 'users', user.id, `Senha redefinida com código de recuperação (restam ${st.restantes})`);
  res.json({ ok: true, restantes: st.restantes });
});

/* ------------------------------- autenticado ------------------------------- */
router.use(auth.requireAuth);

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
      columns: def.columns,
      views: def.views || ['lista'],
      fields: def.fields
    };
  }

  const pendentes = {
    atendimentos: db.prepare("SELECT COUNT(*) c FROM atendimentos WHERE situacao IN ('Aberto','Em andamento','Aguardando retorno')").get().c,
    tarefas: db.prepare("SELECT COUNT(*) c FROM tarefas WHERE situacao IN ('Pendente','Em andamento')").get().c,
    motoristas: db.prepare("SELECT COUNT(*) c FROM motoristas WHERE situacao NOT IN ('Aprovado','Não prosseguiu')").get().c,
    passageiros: db.prepare("SELECT COUNT(*) c FROM passageiros WHERE situacao NOT IN ('Usuário cadastrado','Não prosseguiu')").get().c,
    parceiros: db.prepare("SELECT COUNT(*) c FROM parceiros WHERE situacao NOT IN ('Parceria confirmada','Não concretizada')").get().c,
    wa: wa.store.contarNaoLidas()
  };

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
    can: policy.permissionsFor(req.user.role, Object.keys(ENTITIES)),
    hoje: todayISO()
  });
});

router.get('/relations', (req, res) => {
  const type = String(req.query.type || '');
  const def = Object.prototype.hasOwnProperty.call(ENTITIES, type) ? ENTITIES[type] : null;
  if (!def) return res.json({ items: [] });
  const labelField = { motoristas: 'nome', passageiros: 'nome', parceiros: 'nome_estabelecimento', campanhas: 'titulo', atendimentos: 'assunto' }[type] || 'nome';
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
    motoristas_interessados: n('SELECT COUNT(*) c FROM motoristas'),
    motoristas_em_processo: n("SELECT COUNT(*) c FROM motoristas WHERE situacao IN ('Primeiro contato realizado','Aguardando retorno','Cadastro em andamento','Cadastro em análise')"),
    motoristas_aprovados: n("SELECT COUNT(*) c FROM motoristas WHERE situacao = 'Aprovado'"),
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
    ...db.prepare("SELECT id, nome AS titulo, 'Motorista' AS modulo, data_acompanhamento AS data, situacao, proxima_acao AS acao FROM motoristas WHERE data_acompanhamento IS NOT NULL AND data_acompanhamento <= ? AND situacao NOT IN ('Aprovado','Não prosseguiu')").all(limite),
    ...db.prepare("SELECT id, nome AS titulo, 'Passageiro' AS modulo, data_acompanhamento AS data, situacao, proxima_acao AS acao FROM passageiros WHERE data_acompanhamento IS NOT NULL AND data_acompanhamento <= ? AND situacao NOT IN ('Usuário cadastrado','Não prosseguiu')").all(limite),
    ...db.prepare("SELECT id, nome_estabelecimento AS titulo, 'Parceiro' AS modulo, data_acompanhamento AS data, situacao, proxima_acao AS acao FROM parceiros WHERE data_acompanhamento IS NOT NULL AND data_acompanhamento <= ? AND situacao NOT IN ('Parceria confirmada','Não concretizada')").all(limite),
    ...db.prepare("SELECT id, titulo, 'Tarefa' AS modulo, data_vencimento AS data, situacao, descricao AS acao FROM tarefas WHERE data_vencimento <= ? AND situacao NOT IN ('Concluída','Cancelada')").all(limite)
  ]
    .sort((a, b) => String(a.data).localeCompare(String(b.data)))
    .slice(0, 8)
    .map((r) => ({ ...r, atrasado: r.data < hoje }));

  const cenarioRow = db.prepare("SELECT * FROM cenarios WHERE nome = 'Intermediário'").get() || db.prepare('SELECT * FROM cenarios ORDER BY id LIMIT 1').get();
  const financeiro = cenarioRow ? { cenario: cenarioRow.nome, ...computeCenario(cenarioRow, db.prepare('SELECT * FROM cenario_custos WHERE cenario_id = ?').all(cenarioRow.id)) } : null;

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
    financeiro,
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

router.get('/reports/export', requireAdmin, (req, res) => {
  const type = String(req.query.type || 'motoristas');
  const { de, ate } = period(req.query);
  const stamp = `${de}_a_${ate}`;
  const safeJson = (text) => { try { return JSON.parse(text || '{}'); } catch (err) { return {}; } };

  if (type === 'simulacoes') {
    const rows = db.prepare("SELECT * FROM simulacoes WHERE date(created_at, '-3 hours') BETWEEN ? AND ? ORDER BY id").all(de, ate);
    const header = ['ID', 'Data', 'Cenário', 'Corridas/mês', 'Faturamento bruto', 'Receita plataforma', 'Repasse motoristas', 'Custos', 'Resultado', 'Observação', 'Responsável'];
    // Valores numéricos seguem como número (inclusive negativos): sendCsv cuida do formato com vírgula.
    const body = rows.map((s) => {
      const r = safeJson(s.resultados);
      return [s.id, localDate(s.created_at), s.cenario_nome, r.corridas_mes, r.faturamento_bruto, r.receita_plataforma, r.repasse_motoristas, r.custos_total, r.resultado_operacional, s.observacao || '', s.created_by_nome || ''];
    });
    audit(req, 'exportar', 'simulacoes', null, `Exportação CSV de simulações (${de} a ${ate}, ${rows.length} linhas)`);
    return sendCsv(res, `financeiro_${stamp}.csv`, header, body);
  }

  const def = Object.prototype.hasOwnProperty.call(ENTITIES, type) ? ENTITIES[type] : null;
  if (!def) return fail(res, 400, 'invalid_type', 'Tipo de relatório inválido.');

  // Mesmo critério de data do resumo: campanhas sem data planejada usam a data de publicação.
  const dateExpr = def.table === 'campanhas' ? 'COALESCE(data_publicacao, data_planejada)' : def.dateField;
  const rows = db.prepare(`SELECT * FROM ${def.table} WHERE ${dateExpr} BETWEEN ? AND ? ORDER BY ${dateExpr} DESC, id DESC`).all(de, ate);
  const header = ['ID', ...def.fields.map((f) => f.label), 'Criado em'];
  const body = rows.map((r) => [
    r.id,
    ...def.fields.map((f) => {
      const v = r[f.key];
      return v === null || v === undefined ? '' : v;
    }),
    r.created_at ? localDate(r.created_at) : ''
  ]);
  audit(req, 'exportar', def.table, null, `Exportação CSV de ${def.label} (${de} a ${ate}, ${rows.length} linhas)`);
  sendCsv(res, `${type}_${stamp}.csv`, header, body);
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
  const users = db.prepare('SELECT id, nome, email, role, ativo, last_login_at, created_at FROM users ORDER BY id').all();
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

  db.transaction(() => {
    if (req.body.ativo !== undefined) {
      db.prepare('UPDATE users SET ativo = ?, updated_at = ? WHERE id = ?').run(req.body.ativo ? 1 : 0, nowISO(), id);
      if (!req.body.ativo) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    }
    if (req.body.role !== undefined) {
      db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(req.body.role, nowISO(), id);
    }
    if (req.body.senha !== undefined) {
      db.prepare('UPDATE users SET senha_hash = ?, updated_at = ? WHERE id = ?').run(auth.hashPassword(String(req.body.senha)), nowISO(), id);
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(id, req.user.sid);
    }
  })();
  audit(req, 'editar', 'users', id, 'Usuário atualizado');
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

/* -------------------------------- WhatsApp -------------------------------- */
// Antes do CRUD genérico: "/wa/..." não pode ser tratado como um módulo chamado "wa".
whatsappRoutes.registrar(router, { service: wa, fail, audit, requireAdmin, ENTITIES, entities, db });
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

router.post('/:entity', (req, res) => {
  const def = entityDef(req, res);
  if (!def) return;
  const result = entities.createEntity(def, req.body, req);
  if (result.errors) return res.status(result.status).json({ error: { code: 'validation', message: 'Verifique os campos destacados.', fields: result.errors } });
  if (result.error) return fail(res, result.status, 'error', result.error);
  res.status(result.status).json({ item: result.item });
});

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
  res.json({ item, interacoes });
});

router.patch('/:entity/:id', (req, res) => {
  const def = entityDef(req, res);
  if (!def) return;
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

module.exports = { buildRouter: () => router, computeCenario, wa, ia };

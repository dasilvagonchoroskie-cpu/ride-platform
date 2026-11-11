'use strict';
// Notificações do atendimento: mensagem nova, IA respondeu e IA transferiu para a equipe.
// Cada evento vira (1) um item no feed do CRM (sons/avisos com o app aberto) e (2) uma notificação push (Web Push,
// cifrada de ponta a ponta até o aparelho; o serviço de push do navegador não lê o conteúdo).
// Chaves VAPID em data/vapid.json (0600), geradas na primeira vez. Inscrições por aparelho em push_inscricoes.

const fs = require('fs');
const path = require('path');

const TIPOS = ['mensagem', 'ia', 'transferencia'];
const RETENCAO_DIAS = 7;
const INTERVALO_MESMA_CONVERSA_MS = 60 * 1000; // mensagem/IA: no máximo 1 push por conversa por minuto
const MAX_FALHAS = 8; // falhas seguidas (sem ser 404/410) para descartar uma inscrição
const MAX_CORPO = 140;

// Só serviços de push conhecidos (o servidor faz POST no endereço da inscrição: lista fechada evita SSRF).
const HOSTS_PUSH = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/,
  /^web\.push\.apple\.com$/, /^[a-z0-9.-]+\.push\.apple\.com$/, /^push\.services\.mozilla\.com$/];

function endpointValido(u) {
  try {
    const url = new URL(String(u || ''));
    return url.protocol === 'https:' && !url.port && HOSTS_PUSH.some((re) => re.test(url.hostname)) && String(u).length <= 1000;
  } catch (err) { return false; }
}
const b64url = (v, min, max) => typeof v === 'string' && /^[A-Za-z0-9_-]+={0,2}$/.test(v) && v.length >= min && v.length <= max;

function createNotificacoes({ db, dataDir, waStore, publicUrl, webpush, log = console }) {
  const agora = () => new Date().toISOString();
  let chaves = null;

  function vapid() {
    if (chaves) return chaves;
    const arq = path.join(dataDir, 'vapid.json');
    try { chaves = JSON.parse(fs.readFileSync(arq, 'utf8')); } catch (err) { chaves = null; }
    if (!chaves || !chaves.publicKey || !chaves.privateKey) {
      chaves = webpush.generateVAPIDKeys();
      fs.writeFileSync(arq, JSON.stringify(chaves), { mode: 0o600 });
    }
    return chaves;
  }

  const ultimoPush = new Map(); // `${tipo}:${conversaId}` -> ms

  function nomeConversa(conversaId) {
    const c = waStore.obterConversa(conversaId);
    if (!c) return { c: null, nome: 'Contato' };
    const nome = c.vinculo_nome || c.nome || c.telefone_exibicao || (c.telefone ? `+${c.telefone}` : 'Contato');
    return { c, nome: String(nome).slice(0, 60) };
  }
  const resumo = (t) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > MAX_CORPO ? `${s.slice(0, MAX_CORPO - 1)}…` : s; };

  // Monta a notificação a partir do evento do WhatsApp (ou null se não for avisado).
  function montar(evt) {
    if (evt.tipo === 'mensagem') {
      const { c, nome } = nomeConversa(evt.conversaId);
      if (!c || c.ignorado) return null;
      const m = db.prepare('SELECT texto FROM wa_mensagens WHERE id = ?').get(evt.mensagemId);
      const espera = c.atendimento === 'aguardando' ? ' (aguardando você)' : c.atendimento === 'humano' ? ' (com a equipe)' : '';
      return { tipo: 'mensagem', conversaId: c.id, titulo: `💬 ${nome}${espera}`, corpo: resumo(m && m.texto) || 'Nova mensagem' };
    }
    if (evt.tipo === 'ia') {
      const { c, nome } = nomeConversa(evt.conversaId);
      if (!c) return null;
      const m = db.prepare('SELECT texto FROM wa_mensagens WHERE id = ?').get(evt.mensagemId);
      return { tipo: 'ia', conversaId: c.id, titulo: `🤖 IA respondeu ${nome}`, corpo: resumo(m && m.texto) };
    }
    if (evt.tipo === 'atendimento' && evt.para === 'aguardando') {
      const { c, nome } = nomeConversa(evt.conversaId);
      if (!c) return null;
      return { tipo: 'transferencia', conversaId: c.id, titulo: `🚨 Precisa de você: ${nome}`, corpo: `A IA passou o atendimento para a equipe. ${evt.motivo ? `Motivo: ${evt.motivo}.` : ''}`.trim() };
    }
    return null;
  }

  function registrar(n) {
    const t = agora();
    const id = Number(db.prepare('INSERT INTO notificacoes (tipo, conversa_id, titulo, corpo, criado_em) VALUES (?, ?, ?, ?, ?)')
      .run(n.tipo, n.conversaId || null, n.titulo, n.corpo || '', t).lastInsertRowid);
    return { ...n, id, criado_em: t };
  }

  function payload(n) {
    const base = (publicUrl || '').replace(/\/+$/, '');
    return JSON.stringify({
      id: n.id, tipo: n.tipo, titulo: n.titulo, corpo: n.corpo,
      url: `${base}/#/conversas${n.conversaId ? `?c=${n.conversaId}` : ''}`,
      tag: n.tipo === 'transferencia' ? `transf-${n.conversaId}` : `conv-${n.conversaId}-${n.tipo}`
    });
  }

  async function enviarPush(n, { somenteUsuario } = {}) {
    let lista = db.prepare('SELECT * FROM push_inscricoes').all();
    if (somenteUsuario) lista = lista.filter((s) => s.user_id === somenteUsuario);
    const coluna = { mensagem: 'avisar_mensagem', ia: 'avisar_ia', transferencia: 'avisar_transferencia', teste: null }[n.tipo];
    const ativos = db.prepare('SELECT id FROM users WHERE ativo = 1').all().map((u) => u.id);
    lista = lista.filter((s) => ativos.includes(s.user_id) && (!coluna || s[coluna]));
    if (!lista.length) return 0;
    const k = vapid();
    // Prioridade ALTA para todos os tipos: no Android, "normal"/"low" ficam retidos pelo Firebase enquanto o celular
    // está parado com a tela bloqueada e só chegam quando ele "acorda" (era o atraso visto pelo dono em 11/11).
    // Cada push sempre mostra uma notificação visível, então a prioridade alta é permitida pelo Android.
    const opcoes = {
      TTL: n.tipo === 'transferencia' ? 24 * 3600 : 6 * 3600,
      urgency: 'high',
      vapidDetails: { subject: publicUrl && /^https:/.test(publicUrl) ? publicUrl : 'mailto:crm@fortalezamove.invalid', publicKey: k.publicKey, privateKey: k.privateKey },
      timeout: 15000
    };
    const corpo = payload(n);
    let ok = 0;
    let falhas = 0;
    let removidas = 0;
    await Promise.all(lista.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, corpo, opcoes);
        ok += 1;
        db.prepare('UPDATE push_inscricoes SET ultimo_envio_em = ?, falhas = 0 WHERE id = ?').run(agora(), s.id);
      } catch (err) {
        const status = err && err.statusCode;
        if (status === 404 || status === 410 || (s.falhas || 0) + 1 >= MAX_FALHAS) {
          // Desinscrito/expirado (404/410) ou falhando sempre: sai da lista. O app se inscreve de novo ao abrir.
          db.prepare('DELETE FROM push_inscricoes WHERE id = ?').run(s.id);
          removidas += 1;
        } else {
          db.prepare('UPDATE push_inscricoes SET falhas = falhas + 1 WHERE id = ?').run(s.id);
          falhas += 1;
          log.error(`[notificações] push falhou (${status || err.message})`);
        }
      }
    }));
    // Registro para diagnóstico: só o tipo e as contagens (nada da mensagem nem do aparelho).
    if (log.log) log.log(`[notificações] push ${n.tipo}: ${ok} entregue(s) ao serviço de push, ${falhas} falha(s), ${removidas} inscrição(ões) removida(s)`);
    return ok;
  }

  async function processar(evt) {
    const n = montar(evt);
    if (!n) return null;
    const reg = registrar(n);
    // Mensagem/IA: não repete push da mesma conversa em menos de 1 min (o feed recebe todas).
    if (n.tipo !== 'transferencia') {
      const chave = `${n.tipo}:${n.conversaId}`;
      const antes = ultimoPush.get(chave) || 0;
      if (Date.now() - antes < INTERVALO_MESMA_CONVERSA_MS) return reg;
      ultimoPush.set(chave, Date.now());
    }
    await enviarPush(reg).catch((err) => log.error('[notificações]', err.message));
    return reg;
  }

  try {
    const t = db.prepare('SELECT COUNT(*) c FROM push_inscricoes').get().c;
    if (log.log) log.log(`[notificações] ${t} aparelho(s) inscrito(s) para receber push`);
  } catch (e) { /* tabela ainda não existe */ }

  waStore.ouvir((evt) => { processar(evt).catch((err) => log.error('[notificações]', err.message)); });

  /* ------------------------------ inscrições ------------------------------ */
  function inscrever(userId, { subscription, tipos, aparelho, renovar, anterior } = {}) {
    const s = subscription && typeof subscription === 'object' ? subscription : {};
    const keys = s.keys && typeof s.keys === 'object' ? s.keys : {};
    if (!endpointValido(s.endpoint)) return { erro: 'Endereço de notificação não aceito.' };
    if (!b64url(keys.p256dh, 80, 100) || !b64url(keys.auth, 16, 30)) return { erro: 'Chaves de notificação inválidas.' };
    // Renovação (ao abrir o app ou troca feita pelo serviço de push): mantém as escolhas já salvas do aparelho.
    let t = tipos && typeof tipos === 'object' ? tipos : {};
    if (renovar === true) {
      const velho = db.prepare('SELECT avisar_mensagem, avisar_ia, avisar_transferencia FROM push_inscricoes WHERE endpoint = ? OR (user_id = ? AND endpoint = ?) ORDER BY endpoint = ? DESC LIMIT 1')
        .get(s.endpoint, userId, String(anterior || ''), s.endpoint);
      if (velho) t = { mensagem: !!velho.avisar_mensagem, ia: !!velho.avisar_ia, transferencia: !!velho.avisar_transferencia };
      if (anterior && anterior !== s.endpoint) db.prepare('DELETE FROM push_inscricoes WHERE user_id = ? AND endpoint = ?').run(userId, String(anterior));
    }
    const flag = (k) => (t[k] === false ? 0 : 1);
    const nome = String(aparelho || '').slice(0, 80);
    db.prepare(`INSERT INTO push_inscricoes (user_id, endpoint, p256dh, auth, aparelho, avisar_mensagem, avisar_ia, avisar_transferencia, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, aparelho = excluded.aparelho,
        avisar_mensagem = excluded.avisar_mensagem, avisar_ia = excluded.avisar_ia, avisar_transferencia = excluded.avisar_transferencia, falhas = 0`)
      .run(userId, s.endpoint, keys.p256dh, keys.auth, nome, flag('mensagem'), flag('ia'), flag('transferencia'), agora());
    return { ok: true };
  }
  const cancelar = (userId, endpoint) => db.prepare('DELETE FROM push_inscricoes WHERE user_id = ? AND endpoint = ?').run(userId, String(endpoint || '')).changes;
  const minhas = (userId) => db.prepare('SELECT endpoint, aparelho, avisar_mensagem, avisar_ia, avisar_transferencia, criado_em, ultimo_envio_em FROM push_inscricoes WHERE user_id = ? ORDER BY id').all(userId);

  function feed(desde) {
    const d = Number(desde);
    if (!Number.isInteger(d) || d < 0) {
      const ult = db.prepare('SELECT MAX(id) m FROM notificacoes').get().m || 0;
      return { ultimo: ult, itens: [] };
    }
    const itens = db.prepare('SELECT id, tipo, conversa_id, titulo, corpo, criado_em FROM notificacoes WHERE id > ? ORDER BY id LIMIT 30').all(d);
    return { ultimo: itens.length ? itens[itens.length - 1].id : d, itens };
  }

  function limpar() {
    const limite = new Date(Date.now() - RETENCAO_DIAS * 86400000).toISOString();
    return db.prepare('DELETE FROM notificacoes WHERE criado_em < ?').run(limite).changes;
  }

  const teste = (userId) => enviarPush({ id: 0, tipo: 'teste', conversaId: null, titulo: '🔔 Notificações do CRM ligadas', corpo: 'Este aparelho vai receber os avisos do atendimento.' }, { somenteUsuario: userId });

  return { TIPOS, chavePublica: () => vapid().publicKey, inscrever, cancelar, minhas, feed, limpar, teste, processar, montar, endpointValido };
}

module.exports = { createNotificacoes, endpointValido, TIPOS };

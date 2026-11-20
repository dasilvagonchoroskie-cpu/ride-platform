'use strict';
// Respostas aprendidas (19/11/2026, pedido do dono): quando a IA não sabe algo e transfere por "sem_informacao",
// guardamos a pergunta do cliente. A equipe responde; o dono revê a dupla (pergunta → resposta), ajusta e aprova.
// As aprovadas entram no prompt da IA, que passa a responder sozinha perguntas semelhantes, em vez de transferir.
// Nada entra sem a aprovação do dono — a IA não "aprende" sozinha.

const MAX_PERGUNTA = 500;
const MAX_RESPOSTA = 2000;
const LIMITE_PROMPT = 60; // quantas respostas ativas vão para o prompt (as mais recentes), para não pesar o pedido

const semRotulo = (t) => String(t || '').replace(/^\[[^\]]{1,40}\]\s*/, '').replace(/^[\u{1F3A4}\u{1F4CE}]\s*/u, '').trim();

function criarAprendizado(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ia_aprendizado (
    id INTEGER PRIMARY KEY,
    conversa_id INTEGER,
    contato_id INTEGER,
    pergunta TEXT NOT NULL,
    resposta TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pendente',
    criado_em TEXT NOT NULL,
    decidido_em TEXT,
    decidido_por INTEGER,
    atualizado_em TEXT NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_aprendizado_status ON ia_aprendizado (status)');

  const agora = () => new Date().toISOString();
  const limpar = (t, max) => String(t || '').replace(/\r\n/g, '\n').trim().slice(0, max);

  // A IA não soube: guarda a pergunta (sem duplicar uma pendente igual na mesma conversa).
  function registrarLacuna({ conversaId, contatoId, pergunta }) {
    const p = limpar(pergunta, MAX_PERGUNTA);
    if (!p) return null;
    const existe = db.prepare("SELECT 1 FROM ia_aprendizado WHERE conversa_id = ? AND status = 'pendente' AND pergunta = ? LIMIT 1").get(conversaId, p);
    if (existe) return null;
    const t = agora();
    const info = db.prepare(
      "INSERT INTO ia_aprendizado (conversa_id, contato_id, pergunta, resposta, status, criado_em, atualizado_em) VALUES (?, ?, ?, '', 'pendente', ?, ?)"
    ).run(conversaId, contatoId || null, p, t, t);
    return info.lastInsertRowid;
  }

  // Sugestão: o que a equipe respondeu (texto digitado ou áudio transcrito) DEPOIS que a lacuna foi registrada.
  function sugestao(row) {
    if (!row.conversa_id) return '';
    const msgs = db.prepare(
      "SELECT texto FROM wa_mensagens WHERE conversa_id = ? AND direcao = 'out' AND origem = 'crm' AND tipo = 'text' AND created_at > ? ORDER BY created_at LIMIT 5"
    ).all(row.conversa_id, row.criado_em);
    return msgs.map((m) => semRotulo(m.texto)).filter(Boolean).join('\n').slice(0, MAX_RESPOSTA);
  }

  function listar() {
    const pendentes = db.prepare("SELECT * FROM ia_aprendizado WHERE status = 'pendente' ORDER BY criado_em DESC LIMIT 100").all()
      .map((r) => ({ id: r.id, pergunta: r.pergunta, resposta: r.resposta || sugestao(r), criado_em: r.criado_em }));
    const ativas = db.prepare("SELECT * FROM ia_aprendizado WHERE status = 'ativa' ORDER BY decidido_em DESC LIMIT 200").all()
      .map((r) => ({ id: r.id, pergunta: r.pergunta, resposta: r.resposta, decidido_em: r.decidido_em }));
    return { pendentes, ativas };
  }

  // Para o prompt da IA: as respostas ativas mais recentes.
  function ativas() {
    return db.prepare("SELECT pergunta, resposta FROM ia_aprendizado WHERE status = 'ativa' AND resposta <> '' ORDER BY decidido_em DESC LIMIT ?").all(LIMITE_PROMPT);
  }

  const contarPendentes = () => db.prepare("SELECT COUNT(*) n FROM ia_aprendizado WHERE status = 'pendente'").get().n;

  // Decide uma lacuna: aprovar (vira ativa), descartar, desativar (ativa volta a não valer).
  function decidir(id, { acao, pergunta, resposta, usuarioId }) {
    const row = db.prepare('SELECT * FROM ia_aprendizado WHERE id = ?').get(Number(id));
    if (!row) return { erro: 'Resposta aprendida não encontrada.', status: 404 };
    const t = agora();
    if (acao === 'descartar' || acao === 'desativar') {
      db.prepare('UPDATE ia_aprendizado SET status = ?, decidido_em = ?, decidido_por = ?, atualizado_em = ? WHERE id = ?')
        .run('descartada', t, usuarioId || null, t, row.id);
      return { ok: true };
    }
    if (acao === 'aprovar') {
      const p = limpar(pergunta !== undefined ? pergunta : row.pergunta, MAX_PERGUNTA);
      const r = limpar(resposta !== undefined ? resposta : row.resposta, MAX_RESPOSTA);
      if (!p) return { erro: 'A pergunta não pode ficar vazia.', status: 422 };
      if (!r) return { erro: 'Escreva a resposta que a IA deve dar.', status: 422 };
      db.prepare('UPDATE ia_aprendizado SET pergunta = ?, resposta = ?, status = ?, decidido_em = ?, decidido_por = ?, atualizado_em = ? WHERE id = ?')
        .run(p, r, 'ativa', t, usuarioId || null, t, row.id);
      return { ok: true };
    }
    return { erro: 'Ação inválida.', status: 422 };
  }

  return { registrarLacuna, listar, ativas, contarPendentes, decidir };
}

module.exports = { criarAprendizado };

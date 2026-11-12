'use strict';
// Armazenamento das conversas do WhatsApp. Recebe o banco por parâmetro (sem importar ../db),
// para ser testável com qualquer SQLite. Nada aqui fala com a rede.
const { waKey, crmKey, onlyDigits } = require('./phone');

// Grupos, status/transmissão e canais não entram no CRM (privacidade e foco no atendimento 1:1).
const JID_IGNORADO = /(@g\.us|@broadcast|@newsletter)$/;

// Cadastros em que o telefone do contato é procurado (ordem = prioridade quando o mesmo número aparece em mais de um).
const VINCULOS = {
  motoristas: { table: 'motoristas', nome: 'nome', tel: 'telefone' },
  parceiros: { table: 'parceiros', nome: 'nome_estabelecimento', tel: 'telefone' },
  passageiros: { table: 'passageiros', nome: 'nome', tel: 'telefone' }
};
// Etapa 2 (M2): conversa também pode ser ligada a um entregador (só com a Etapa 2 ligada; a tabela vem da migração 003).
if (process.env.FM_ETAPA2 === '1') {
  VINCULOS.entregadores = { table: 'entregadores', nome: 'nome', tel: 'telefone' };
  // Etapa 2 (M3): ... e a um comércio parceiro (tabela da migração 004).
  VINCULOS.comercios = { table: 'comercios', nome: 'nome_estabelecimento', tel: 'telefone' };
}

// Só avança: uma entrega não volta para "enviada". "falhou" não é sobrescrito por recibo.
const ORDEM_STATUS = { pendente: 0, enviando: 0, enviada: 1, entregue: 2, lida: 3 };

const MAX_TEXTO = 4000;
const MAX_TENTATIVAS = 3;
const ESPERA_TENTATIVA_MS = [30 * 1000, 2 * 60 * 1000]; // depois da 1ª e da 2ª falha

const likeEscape = (text) => String(text).replace(/[\\%_]/g, (c) => `\\${c}`);

function createStore(db, opts = {}) {
  const agora = opts.now || (() => new Date().toISOString());

  /* ----------------------------- vínculo por telefone ---------------------------- */
  function acharCadastroPorTelefone(telefone) {
    const digits = onlyDigits(telefone);
    if (digits.length < 8) return null;
    const chave = waKey(digits);
    const final = digits.slice(-4);
    for (const [tipo, cfg] of Object.entries(VINCULOS)) {
      const linhas = db.prepare(`SELECT id, ${cfg.tel} AS tel FROM ${cfg.table} WHERE ${cfg.tel} LIKE ?`).all(`%${final}%`);
      const achado = linhas.find((l) => crmKey(l.tel) === chave);
      if (achado) return { tipo, id: achado.id };
    }
    return null;
  }

  function existeCadastro(tipo, id) {
    if (!Object.prototype.hasOwnProperty.call(VINCULOS, tipo)) return false;
    return !!db.prepare(`SELECT 1 FROM ${VINCULOS[tipo].table} WHERE id = ?`).get(id);
  }

  /* --------------------------------- contatos ------------------------------------ */
  function obterOuCriarContato({ jid, telefone, nome }) {
    const t = agora();
    const tel = telefone ? onlyDigits(telefone) : null;
    let contato = db.prepare('SELECT * FROM wa_contatos WHERE jid = ?').get(jid);
    if (!contato) {
      const achado = tel ? acharCadastroPorTelefone(tel) : null;
      const info = db.prepare(
        `INSERT INTO wa_contatos (jid, telefone, nome, vinculo_tipo, vinculo_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(jid, tel || null, nome || null, achado ? achado.tipo : '', achado ? achado.id : null, t, t);
      return db.prepare('SELECT * FROM wa_contatos WHERE id = ?').get(info.lastInsertRowid);
    }
    // Completa o que faltava (nunca apaga um dado existente com um vazio).
    const novoTel = contato.telefone || tel || null;
    const novoNome = nome || contato.nome || null;
    let tipo = contato.vinculo_tipo;
    let vid = contato.vinculo_id;
    if (!tipo && novoTel) {
      const achado = acharCadastroPorTelefone(novoTel);
      if (achado) { tipo = achado.tipo; vid = achado.id; }
    }
    if (novoTel !== contato.telefone || novoNome !== contato.nome || tipo !== contato.vinculo_tipo) {
      db.prepare('UPDATE wa_contatos SET telefone = ?, nome = ?, vinculo_tipo = ?, vinculo_id = ?, updated_at = ? WHERE id = ?')
        .run(novoTel, novoNome, tipo, vid, t, contato.id);
      contato = db.prepare('SELECT * FROM wa_contatos WHERE id = ?').get(contato.id);
    }
    return contato;
  }

  function obterOuCriarConversa(contatoId) {
    const existente = db.prepare('SELECT * FROM wa_conversas WHERE contato_id = ?').get(contatoId);
    if (existente) return existente;
    const t = agora();
    const info = db.prepare('INSERT INTO wa_conversas (contato_id, created_at, updated_at) VALUES (?, ?, ?)').run(contatoId, t, t);
    return db.prepare('SELECT * FROM wa_conversas WHERE id = ?').get(info.lastInsertRowid);
  }

  function atualizarResumo(conversa, { texto, quando, direcao }) {
    // Mensagem atrasada não pode "voltar no tempo" o resumo da conversa.
    if (conversa.ultima_em && quando < conversa.ultima_em) return;
    db.prepare('UPDATE wa_conversas SET ultima_mensagem = ?, ultima_em = ?, ultima_direcao = ?, updated_at = ? WHERE id = ?')
      .run(String(texto || '').slice(0, 200), quando, direcao, agora(), conversa.id);
  }

  /* ------------------------------ recebimento (entrada) -------------------------- */
  // evt: { jid, telefone, nome, externoId, texto, tipo, quando, deMim }
  // Ouvintes de eventos (notificações). Disparados depois da transação, fora do caminho de gravação.
  const ouvintes = [];
  const ouvir = (fn) => { ouvintes.push(fn); };
  function avisar(evento) {
    if (!ouvintes.length) return;
    setImmediate(() => { for (const fn of ouvintes) { try { fn(evento); } catch (err) { /* notificação nunca derruba o WhatsApp */ } } });
  }

  function ingerir(evt) {
    if (!evt || !evt.jid || JID_IGNORADO.test(evt.jid)) return { ignorado: 'grupo_ou_canal' };
    return db.transaction(() => {
      const contato = obterOuCriarContato(evt);
      if (contato.ignorado) return { ignorado: 'contato' };
      const conversa = obterOuCriarConversa(contato.id);
      const quando = evt.quando || agora();
      const deMim = !!evt.deMim;
      const texto = String(evt.texto || '').slice(0, 10000);
      const info = db.prepare(
        `INSERT OR IGNORE INTO wa_mensagens (conversa_id, direcao, tipo, texto, externo_id, status, origem, ocorrida_em, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(conversa.id, deMim ? 'out' : 'in', evt.tipo || 'text', texto, evt.externoId || null,
        deMim ? 'enviada' : 'recebida', deMim ? 'celular' : 'contato', quando, agora());
      if (info.changes === 0) return { inserido: false, conversaId: conversa.id, contatoId: contato.id };

      atualizarResumo(conversa, { texto, quando, direcao: deMim ? 'out' : 'in' });
      if (deMim) {
        // Respondeu pelo celular: considera a conversa lida.
        db.prepare('UPDATE wa_conversas SET nao_lidas = 0 WHERE id = ?').run(conversa.id);
        // A equipe respondeu pelo celular: a conversa passa para atendimento humano (a IA para de responder).
        // Eco de mensagem que o próprio CRM/IA acabou de enviar não conta.
        const eco = db.prepare(`SELECT 1 FROM wa_mensagens WHERE conversa_id = ? AND direcao = 'out' AND origem IN ('crm', 'ia') AND id <> ? AND texto = ?
            AND (status IN ('pendente', 'enviando') OR created_at >= ?)`).get(conversa.id, Number(info.lastInsertRowid), texto, new Date(Date.now() - 120000).toISOString());
        if (!eco && (conversa.atendimento === 'ia' || conversa.atendimento === 'aguardando')) {
          mudarAtendimento(conversa.id, 'humano', { detalhe: 'Respondida pelo celular' });
        }
      } else {
        db.prepare(
          `UPDATE wa_conversas SET nao_lidas = nao_lidas + 1, situacao = 'Aberta', updated_at = ? WHERE id = ?`
        ).run(agora(), conversa.id);
        if (conversa.atendimento === 'concluido') {
          // Novo contato depois de concluído: volta para a IA. Saudação de novo só se o atendimento acabou há mais de 12 h.
          const antigo = !conversa.atend_em || conversa.atend_em < new Date(Date.now() - 12 * 3600000).toISOString();
          mudarAtendimento(conversa.id, 'ia', { detalhe: 'Cliente voltou a escrever', novoAtendimento: antigo });
        }
      }
      if (!deMim) avisar({ tipo: 'mensagem', conversaId: conversa.id, mensagemId: Number(info.lastInsertRowid) });
      return { inserido: true, conversaId: conversa.id, contatoId: contato.id, mensagemId: Number(info.lastInsertRowid) };
    }).immediate();
  }

  // Troca o texto de uma mensagem de áudio pela transcrição (e o resumo da conversa, se for a última mensagem).
  function definirTranscricao(mensagemId, texto) {
    const m = db.prepare('SELECT * FROM wa_mensagens WHERE id = ?').get(mensagemId);
    if (!m) return false;
    const novo = String(texto || '').slice(0, 10000);
    db.prepare('UPDATE wa_mensagens SET texto = ? WHERE id = ?').run(novo, mensagemId);
    const c = db.prepare('SELECT * FROM wa_conversas WHERE id = ?').get(m.conversa_id);
    if (c && c.ultima_em === m.ocorrida_em) db.prepare('UPDATE wa_conversas SET ultima_mensagem = ? WHERE id = ?').run(novo.slice(0, 200), c.id);
    return true;
  }

  /* ------------------------------ estado do atendimento -------------------------- */
  const ESTADOS_VALIDOS = ['ia', 'aguardando', 'humano', 'concluido'];
  const TIPO_EVENTO = { ia: 'devolvida', aguardando: 'transferida', humano: 'assumida', concluido: 'concluida' };

  // Muda o estado da conversa e registra no histórico. Retorna false se o estado já era esse (sem evento repetido).
  function mudarAtendimento(conversaId, estado, { motivo, assunto, usuarioId, detalhe, novoAtendimento } = {}) {
    if (!ESTADOS_VALIDOS.includes(estado)) return false;
    const c = db.prepare('SELECT * FROM wa_conversas WHERE id = ?').get(conversaId);
    if (!c) return false;
    const t = agora();
    const sets = ['atendimento = ?', 'atend_em = ?', 'updated_at = ?'];
    const params = [estado, t, t];
    if (estado === 'aguardando') { sets.push('atend_motivo = ?', 'espera_em = NULL'); params.push(motivo || null); }
    if (estado === 'ia') { sets.push('atend_motivo = NULL', 'atend_por = NULL', 'espera_em = NULL'); }
    if (estado === 'humano') { sets.push('atend_por = ?'); params.push(usuarioId || null); if (usuarioId) { sets.push('responsavel_id = ?'); params.push(usuarioId); } }
    if (estado === 'concluido') sets.push("situacao = 'Resolvida'");
    else sets.push("situacao = 'Aberta'");
    if (novoAtendimento) sets.push('saudado_em = NULL', 'atend_assunto = NULL');
    if (assunto !== undefined) { sets.push('atend_assunto = ?'); params.push(assunto); }
    if (c.atendimento === estado && !assunto && !motivo) return false;
    db.prepare(`UPDATE wa_conversas SET ${sets.join(', ')} WHERE id = ?`).run(...params, conversaId);
    if (c.atendimento !== estado) {
      avisar({ tipo: 'atendimento', conversaId, de: c.atendimento, para: estado, motivo: motivo || null, usuarioId: usuarioId || null });
      db.prepare('INSERT INTO wa_eventos (conversa_id, tipo, detalhe, usuario_id, criado_em) VALUES (?, ?, ?, ?, ?)')
        .run(conversaId, c.atendimento === 'concluido' && estado === 'ia' ? 'reaberta' : TIPO_EVENTO[estado], String(detalhe || motivo || '').slice(0, 200) || null, usuarioId || null, t);
    }
    return true;
  }

  // Marca a saudação como enviada. Só um chamador consegue (evita saudação duplicada).
  const marcarSaudado = (conversaId) => db.prepare('UPDATE wa_conversas SET saudado_em = ? WHERE id = ? AND saudado_em IS NULL').run(agora(), conversaId).changes === 1;
  // Aviso de espera: no máximo um por período de espera.
  const marcarEspera = (conversaId) => db.prepare("UPDATE wa_conversas SET espera_em = ? WHERE id = ? AND espera_em IS NULL AND atendimento = 'aguardando'").run(agora(), conversaId).changes === 1;
  const definirAssunto = (conversaId, assunto) => db.prepare('UPDATE wa_conversas SET atend_assunto = ? WHERE id = ?').run(assunto, conversaId);
  const listarEventos = (conversaId) => db.prepare(
    `SELECT e.id, e.tipo, e.detalhe, e.criado_em, u.nome AS usuario_nome FROM wa_eventos e LEFT JOIN users u ON u.id = e.usuario_id
      WHERE e.conversa_id = ? ORDER BY e.id DESC LIMIT 30`).all(conversaId);
  const contarPorAtendimento = () => {
    const r = { ia: 0, aguardando: 0, humano: 0, concluido: 0 };
    for (const l of db.prepare('SELECT atendimento, COUNT(*) n FROM wa_conversas GROUP BY atendimento').all()) if (r[l.atendimento] !== undefined) r[l.atendimento] = l.n;
    return r;
  };

  /* --------------------------------- envio (saída) ------------------------------- */
  function enfileirar({ conversaId, texto, usuarioId, origem = 'crm' }) {
    if (!['crm', 'ia'].includes(origem)) origem = 'crm';
    const limpo = String(texto || '').trim();
    if (!limpo) return { erro: 'Digite a mensagem.' };
    if (limpo.length > MAX_TEXTO) return { erro: `Mensagem muito longa (máximo ${MAX_TEXTO} caracteres).` };
    const conversa = db.prepare('SELECT * FROM wa_conversas WHERE id = ?').get(conversaId);
    if (!conversa) return { erro: 'Conversa não encontrada.', status: 404 };
    const t = agora();
    const info = db.prepare(
      `INSERT INTO wa_mensagens (conversa_id, direcao, tipo, texto, status, proxima_tentativa_em, enviada_por, origem, ocorrida_em, created_at)
       VALUES (?, 'out', 'text', ?, 'pendente', ?, ?, ?, ?, ?)`
    ).run(conversaId, limpo, t, usuarioId || null, origem, t, t);
    atualizarResumo(conversa, { texto: limpo, quando: t, direcao: 'out' });
    db.prepare(`UPDATE wa_conversas SET nao_lidas = 0, updated_at = ? WHERE id = ?`).run(t, conversaId);
    if (origem === 'ia') avisar({ tipo: 'ia', conversaId, mensagemId: Number(info.lastInsertRowid) });
    return { mensagem: db.prepare('SELECT * FROM wa_mensagens WHERE id = ?').get(info.lastInsertRowid) };
  }

  // Mensagens que ficaram "enviando" por queda do processo voltam para a fila.
  function recolocarEnviando() {
    return db.prepare(`UPDATE wa_mensagens SET status = 'pendente' WHERE status = 'enviando'`).run().changes;
  }

  // Reserva (marca como "enviando") as mensagens vencidas, na ordem de criação.
  function reservarPendentes(limite = 5) {
    const t = agora();
    const candidatas = db.prepare(
      `SELECT m.id, m.texto, k.jid, k.ignorado FROM wa_mensagens m
         JOIN wa_conversas c ON c.id = m.conversa_id JOIN wa_contatos k ON k.id = c.contato_id
        WHERE m.direcao = 'out' AND m.status = 'pendente' AND (m.proxima_tentativa_em IS NULL OR m.proxima_tentativa_em <= ?)
        ORDER BY m.id LIMIT ?`
    ).all(t, limite);
    const reservadas = [];
    for (const c of candidatas) {
      const r = db.prepare(`UPDATE wa_mensagens SET status = 'enviando' WHERE id = ? AND status = 'pendente'`).run(c.id);
      if (r.changes === 1) reservadas.push(c);
    }
    return reservadas;
  }

  // Concluir o envio. O WhatsApp devolve a própria mensagem pelo canal ("eco"); se o eco chegar antes
  // de gravarmos o id, a linha do eco é fundida com a nossa (preserva quem enviou).
  function concluirEnvio(mensagemId, externoId) {
    db.transaction(() => {
      const msg = db.prepare('SELECT * FROM wa_mensagens WHERE id = ?').get(mensagemId);
      if (!msg) return;
      const eco = externoId
        ? db.prepare('SELECT id, status FROM wa_mensagens WHERE conversa_id = ? AND externo_id = ? AND id <> ?').get(msg.conversa_id, externoId, mensagemId)
        : null;
      if (eco) {
        db.prepare('UPDATE wa_mensagens SET enviada_por = ?, origem = ? WHERE id = ?').run(msg.enviada_por, msg.origem === 'ia' ? 'ia' : 'crm', eco.id);
        db.prepare('DELETE FROM wa_mensagens WHERE id = ?').run(mensagemId);
        return;
      }
      db.prepare(`UPDATE wa_mensagens SET status = 'enviada', externo_id = ?, erro = NULL, proxima_tentativa_em = NULL WHERE id = ?`)
        .run(externoId || null, mensagemId);
    }).immediate();
  }

  function falharEnvio(mensagemId, erro) {
    const msg = db.prepare('SELECT tentativas FROM wa_mensagens WHERE id = ?').get(mensagemId);
    if (!msg) return;
    const tentativas = msg.tentativas + 1;
    const texto = String(erro || 'Falha ao enviar').slice(0, 300);
    if (tentativas >= MAX_TENTATIVAS) {
      db.prepare(`UPDATE wa_mensagens SET status = 'falhou', tentativas = ?, erro = ?, proxima_tentativa_em = NULL WHERE id = ?`)
        .run(tentativas, texto, mensagemId);
      return;
    }
    const espera = ESPERA_TENTATIVA_MS[tentativas - 1] || ESPERA_TENTATIVA_MS[ESPERA_TENTATIVA_MS.length - 1];
    const proxima = new Date(Date.parse(agora()) + espera).toISOString();
    db.prepare(`UPDATE wa_mensagens SET status = 'pendente', tentativas = ?, erro = ?, proxima_tentativa_em = ? WHERE id = ?`)
      .run(tentativas, texto, proxima, mensagemId);
  }

  function reenviar(mensagemId) {
    const msg = db.prepare('SELECT * FROM wa_mensagens WHERE id = ?').get(mensagemId);
    if (!msg || msg.direcao !== 'out') return { erro: 'Mensagem não encontrada.', status: 404 };
    if (msg.status !== 'falhou') return { erro: 'Só mensagens que falharam podem ser reenviadas.' };
    db.prepare(`UPDATE wa_mensagens SET status = 'pendente', tentativas = 0, erro = NULL, proxima_tentativa_em = ? WHERE id = ?`)
      .run(agora(), mensagemId);
    return { ok: true };
  }

  // Recibo de entrega/leitura vindo do canal.
  function registrarStatus(externoId, status) {
    if (!externoId || !Object.prototype.hasOwnProperty.call(ORDEM_STATUS, status)) return false;
    const msg = db.prepare(`SELECT id, status FROM wa_mensagens WHERE externo_id = ? AND direcao = 'out'`).get(externoId);
    if (!msg || !Object.prototype.hasOwnProperty.call(ORDEM_STATUS, msg.status)) return false;
    if (ORDEM_STATUS[status] <= ORDEM_STATUS[msg.status]) return false;
    db.prepare('UPDATE wa_mensagens SET status = ? WHERE id = ?').run(status, msg.id);
    return true;
  }

  /* ---------------------------------- consultas ---------------------------------- */
  const temEntregadores = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'entregadores'").get();
  const temComercios = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'comercios'").get();
  const SELECT_CONVERSA = `
    SELECT c.id, c.situacao, c.responsavel_id, c.nao_lidas, c.ultima_mensagem, c.ultima_em, c.ultima_direcao,
           c.atendimento, c.atend_assunto, c.atend_motivo, c.atend_em, c.saudado_em, c.espera_em,
           c.ia_estado, c.ia_estado_em, c.ia_erro, c.ia_tentativas, c.ia_proxima,
           k.id AS contato_id, k.jid, k.telefone, k.nome, k.vinculo_tipo, k.vinculo_id, k.ignorado,
           CASE k.vinculo_tipo WHEN 'motoristas' THEN m.nome WHEN 'passageiros' THEN p.nome
                               WHEN 'parceiros' THEN r.nome_estabelecimento${temEntregadores ? ' WHEN \'entregadores\' THEN e.nome' : ''}${temComercios ? ' WHEN \'comercios\' THEN cm.nome_estabelecimento' : ''} END AS vinculo_nome,
           u.nome AS responsavel_nome
      FROM wa_conversas c
      JOIN wa_contatos k ON k.id = c.contato_id
      LEFT JOIN motoristas m ON k.vinculo_tipo = 'motoristas' AND m.id = k.vinculo_id
      LEFT JOIN passageiros p ON k.vinculo_tipo = 'passageiros' AND p.id = k.vinculo_id
      LEFT JOIN parceiros r ON k.vinculo_tipo = 'parceiros' AND r.id = k.vinculo_id
      ${temEntregadores ? "LEFT JOIN entregadores e ON k.vinculo_tipo = 'entregadores' AND e.id = k.vinculo_id" : ''}
      ${temComercios ? "LEFT JOIN comercios cm ON k.vinculo_tipo = 'comercios' AND cm.id = k.vinculo_id" : ''}
      LEFT JOIN users u ON u.id = c.responsavel_id`;

  function listarConversas({ situacao, atendimento, naoLidas, q, responsavelId, page = 1, size = 30 } = {}) {
    const where = [];
    const params = [];
    if (situacao === 'Aberta' || situacao === 'Resolvida') { where.push('c.situacao = ?'); params.push(situacao); }
    if (ESTADOS_VALIDOS.includes(atendimento)) { where.push('c.atendimento = ?'); params.push(atendimento); }
    if (naoLidas) where.push('c.nao_lidas > 0');
    if (responsavelId) { where.push('c.responsavel_id = ?'); params.push(Number(responsavelId)); }
    const busca = String(q || '').trim().slice(0, 80);
    if (busca) {
      const like = `%${likeEscape(busca)}%`;
      where.push(`(k.nome LIKE ? ESCAPE '\\' OR k.telefone LIKE ? ESCAPE '\\' OR c.ultima_mensagem LIKE ? ESCAPE '\\'
                   OR m.nome LIKE ? ESCAPE '\\' OR p.nome LIKE ? ESCAPE '\\' OR r.nome_estabelecimento LIKE ? ESCAPE '\\')`);
      params.push(like, like, like, like, like, like);
    }
    const clausula = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const total = db.prepare(`SELECT COUNT(*) c FROM (${SELECT_CONVERSA}${clausula})`).get(...params).c;
    const tam = Math.min(100, Math.max(1, Number(size) || 30));
    const pages = Math.max(1, Math.ceil(total / tam));
    const pag = Math.min(pages, Math.max(1, Number(page) || 1));
    const items = db.prepare(`${SELECT_CONVERSA}${clausula} ORDER BY (c.atendimento = 'aguardando') DESC, c.ultima_em DESC, c.id DESC LIMIT ? OFFSET ?`)
      .all(...params, tam, (pag - 1) * tam);
    return { items, total, page: pag, pages };
  }

  function obterConversa(id) {
    return db.prepare(`${SELECT_CONVERSA} WHERE c.id = ?`).get(id) || null;
  }

  // "depois": só mensagens com id maior (consulta leve para atualizar a conversa aberta).
  function listarMensagens(conversaId, { depois = 0, limite = 100 } = {}) {
    const lim = Math.min(300, Math.max(1, Number(limite) || 100));
    if (Number(depois) > 0) {
      return db.prepare('SELECT * FROM wa_mensagens WHERE conversa_id = ? AND id > ? ORDER BY id LIMIT ?').all(conversaId, Number(depois), lim);
    }
    // Sem "depois": as mais recentes, em ordem cronológica.
    return db.prepare('SELECT * FROM (SELECT * FROM wa_mensagens WHERE conversa_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id').all(conversaId, lim);
  }

  function marcarLida(conversaId) {
    return db.prepare('UPDATE wa_conversas SET nao_lidas = 0 WHERE id = ? AND nao_lidas > 0').run(conversaId).changes;
  }

  function atualizarConversa(conversaId, { situacao, responsavelId }) {
    const sets = [];
    const params = [];
    if (situacao !== undefined) {
      if (situacao !== 'Aberta' && situacao !== 'Resolvida') return { erro: 'Situação inválida.' };
      sets.push('situacao = ?'); params.push(situacao);
      if (situacao === 'Resolvida') mudarAtendimento(conversaId, 'concluido', {});
    }
    if (responsavelId !== undefined) {
      if (responsavelId !== null && !db.prepare('SELECT 1 FROM users WHERE id = ? AND ativo = 1').get(Number(responsavelId))) {
        return { erro: 'Responsável inválido.' };
      }
      sets.push('responsavel_id = ?'); params.push(responsavelId === null ? null : Number(responsavelId));
    }
    if (!sets.length) return { erro: 'Nada para atualizar.' };
    const r = db.prepare(`UPDATE wa_conversas SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...params, agora(), conversaId);
    return r.changes ? { ok: true } : { erro: 'Conversa não encontrada.', status: 404 };
  }

  function definirVinculo(contatoId, tipo, id) {
    if (!tipo) {
      db.prepare(`UPDATE wa_contatos SET vinculo_tipo = '', vinculo_id = NULL, updated_at = ? WHERE id = ?`).run(agora(), contatoId);
      return { ok: true };
    }
    if (!existeCadastro(tipo, Number(id))) return { erro: 'Cadastro não encontrado.' };
    db.prepare('UPDATE wa_contatos SET vinculo_tipo = ?, vinculo_id = ?, updated_at = ? WHERE id = ?').run(tipo, Number(id), agora(), contatoId);
    return { ok: true };
  }

  // Privacidade: apaga a conversa e passa a descartar tudo que vier desse contato.
  function ignorarContato(contatoId) {
    return db.transaction(() => {
      const r = db.prepare('UPDATE wa_contatos SET ignorado = 1, updated_at = ? WHERE id = ?').run(agora(), contatoId);
      if (!r.changes) return false;
      db.prepare('DELETE FROM wa_conversas WHERE contato_id = ?').run(contatoId);
      return true;
    })();
  }

  function excluirConversa(conversaId) {
    return db.prepare('DELETE FROM wa_conversas WHERE id = ?').run(conversaId).changes > 0;
  }

  function contarNaoLidas() {
    return db.prepare(`SELECT COUNT(*) c FROM wa_conversas WHERE nao_lidas > 0 AND situacao = 'Aberta'`).get().c;
  }

  function resumoFila() {
    return {
      pendentes: db.prepare(`SELECT COUNT(*) c FROM wa_mensagens WHERE direcao = 'out' AND status IN ('pendente','enviando')`).get().c,
      falhas: db.prepare(`SELECT COUNT(*) c FROM wa_mensagens WHERE direcao = 'out' AND status = 'falhou'`).get().c
    };
  }

  return {
    acharCadastroPorTelefone, existeCadastro, obterOuCriarContato, ingerir, enfileirar, recolocarEnviando,
    reservarPendentes, concluirEnvio, falharEnvio, reenviar, registrarStatus, listarConversas, obterConversa,
    listarMensagens, marcarLida, atualizarConversa, definirVinculo, ignorarContato, excluirConversa,
    contarNaoLidas, resumoFila, definirTranscricao,
    ouvir, mudarAtendimento, marcarSaudado, marcarEspera, definirAssunto, listarEventos, contarPorAtendimento
  };
}

module.exports = { createStore, VINCULOS, MAX_TEXTO, MAX_TENTATIVAS, JID_IGNORADO };

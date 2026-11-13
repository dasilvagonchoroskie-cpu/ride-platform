'use strict';
// Etapa 2 — avaliação de candidatos (motoristas e entregadores) e entrada assinada do aplicativo do motorista.
// Só CRIA tabelas novas; não toca em nenhuma tabela existente. A avaliação é INDEPENDENTE da situação de contratação da
// ficha (motoristas.situacao continua igual) e do simples envio de documentos.
//  - candidaturas: uma por ficha funcional; etapa da avaliação + DECISÃO FINAL (só o administrador/proprietário).
//  - candidatura_pareceres: pareceres do avaliador (append-only: corrigir = novo parecer que substitui o anterior).
//  - candidatura_eventos: histórico (append-only) de etapas, decisões, pareceres e acessos relevantes.
//  - integracao_vinculos: id externo do aplicativo → ficha do CRM (não duplica cadastro).
//  - integracao_nonces: proteção contra repetição de eventos assinados (cada nonce vale uma vez).

module.exports = {
  versao: 6,
  nome: 'candidaturas',
  up(db) {
    db.exec(`
      CREATE TABLE candidaturas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        funcao TEXT NOT NULL CHECK (funcao IN ('motorista', 'entregador')),
        registro_id INTEGER NOT NULL,
        etapa TEXT NOT NULL DEFAULT 'cadastro_recebido' CHECK (etapa IN ('cadastro_recebido', 'documentacao_pendente', 'documentacao_recebida',
          'documentacao_em_analise', 'complementacao_necessaria', 'avaliacao_presencial_pendente', 'avaliacao_presencial_realizada', 'aprovado', 'recusado')),
        etapa_em TEXT NOT NULL,
        etapa_por_nome TEXT,
        origem TEXT NOT NULL DEFAULT 'crm' CHECK (origem IN ('crm', 'aplicativo')),
        decisao TEXT CHECK (decisao IN ('aprovado', 'recusado')),
        decisao_motivo TEXT,
        decidido_por INTEGER,
        decidido_por_nome TEXT,
        decidido_em TEXT,
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        -- Decisão final e etapa final andam juntas (nunca "aprovado" sem decisão registrada, nem o contrário).
        CHECK ((decisao IS NULL AND etapa NOT IN ('aprovado', 'recusado')) OR (decisao IS NOT NULL AND etapa = decisao AND decidido_em IS NOT NULL AND decidido_por_nome IS NOT NULL)),
        UNIQUE (funcao, registro_id)
      );
      CREATE INDEX candidaturas_etapa ON candidaturas (etapa, atualizado_em);

      CREATE TABLE candidatura_pareceres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidatura_id INTEGER NOT NULL REFERENCES candidaturas(id),
        autor_id INTEGER,
        autor_nome TEXT NOT NULL,
        autor_perfil TEXT NOT NULL,
        situacao TEXT NOT NULL CHECK (situacao IN ('favoravel', 'favoravel_com_ressalvas', 'desfavoravel', 'pendente_informacao')),
        verificacao TEXT NOT NULL DEFAULT 'nao_realizada' CHECK (verificacao IN ('nao_realizada', 'sem_restricao', 'com_restricao', 'inconclusiva')),
        verificacao_fonte TEXT,
        parecer TEXT NOT NULL,
        pendencias TEXT,
        observacoes TEXT,
        substitui_id INTEGER REFERENCES candidatura_pareceres(id),
        criado_em TEXT NOT NULL
      );
      CREATE INDEX candidatura_pareceres_cand ON candidatura_pareceres (candidatura_id, id);

      CREATE TABLE candidatura_eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidatura_id INTEGER NOT NULL REFERENCES candidaturas(id),
        tipo TEXT NOT NULL,
        de TEXT,
        para TEXT,
        detalhe TEXT,
        usuario_id INTEGER,
        usuario_nome TEXT,
        criado_em TEXT NOT NULL
      );
      CREATE INDEX candidatura_eventos_cand ON candidatura_eventos (candidatura_id, id);

      CREATE TABLE integracao_vinculos (
        origem TEXT NOT NULL,
        externo_id TEXT NOT NULL,
        funcao TEXT NOT NULL,
        registro_id INTEGER NOT NULL,
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        PRIMARY KEY (origem, externo_id)
      );
      CREATE TABLE integracao_documentos (
        origem TEXT NOT NULL,
        externo_id TEXT NOT NULL,
        documento_id INTEGER NOT NULL,
        versao INTEGER NOT NULL,
        recebido_em TEXT NOT NULL,
        PRIMARY KEY (origem, externo_id)
      );
      CREATE TABLE integracao_nonces (
        nonce TEXT PRIMARY KEY,
        recebido_em TEXT NOT NULL
      );

      -- Histórico e pareceres não se apagam nem se reescrevem.
      CREATE TRIGGER candidatura_pareceres_imutaveis BEFORE UPDATE ON candidatura_pareceres
        BEGIN SELECT RAISE(ABORT, 'parecer registrado não pode ser alterado (registre um novo parecer)'); END;
      CREATE TRIGGER candidatura_pareceres_sem_apagar BEFORE DELETE ON candidatura_pareceres
        BEGIN SELECT RAISE(ABORT, 'pareceres não podem ser apagados'); END;
      CREATE TRIGGER candidatura_eventos_imutaveis BEFORE UPDATE ON candidatura_eventos
        BEGIN SELECT RAISE(ABORT, 'histórico da candidatura não pode ser alterado'); END;
      CREATE TRIGGER candidatura_eventos_sem_apagar BEFORE DELETE ON candidatura_eventos
        BEGIN SELECT RAISE(ABORT, 'histórico da candidatura não pode ser apagado'); END;
      CREATE TRIGGER candidaturas_sem_apagar BEFORE DELETE ON candidaturas
        BEGIN SELECT RAISE(ABORT, 'candidaturas não podem ser apagadas (o histórico é permanente)'); END;
    `);
    return { tabelas: ['candidaturas', 'candidatura_pareceres', 'candidatura_eventos', 'integracao_vinculos', 'integracao_documentos', 'integracao_nonces'] };
  },
  verificar(db) {
    const problemas = [];
    for (const t of ['candidaturas', 'candidatura_pareceres', 'candidatura_eventos', 'integracao_vinculos', 'integracao_documentos', 'integracao_nonces']) {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t)) problemas.push(`tabela ${t} não foi criada`);
    }
    for (const g of ['candidatura_pareceres_imutaveis', 'candidatura_pareceres_sem_apagar', 'candidatura_eventos_imutaveis', 'candidatura_eventos_sem_apagar', 'candidaturas_sem_apagar']) {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = ?").get(g)) problemas.push(`gatilho ${g} não foi criado`);
    }
    if (db.prepare('SELECT COUNT(*) n FROM candidaturas').get().n !== 0) problemas.push('tabela candidaturas deveria nascer vazia');
    return problemas;
  }
};

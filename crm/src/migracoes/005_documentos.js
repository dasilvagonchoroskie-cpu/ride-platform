'use strict';
// Etapa 2 (M4) — arquivo digital de documentos por função (motorista, entregador, parceiro do Clube, comércio).
// Só CRIA tabelas, índices e gatilhos novos e acrescenta duas colunas de máscara (CPF/CNPJ só mascarado) em pessoas/empresas.
// Não toca em nenhum registro existente.
//
// - documentos: um "espaço" por documento de uma função (função + número da ficha da função + categoria). Pertence à FICHA DA
//   FUNÇÃO (não à pessoa): a mesma pessoa/empresa com várias funções tem os documentos de cada uma separados. Como a ficha
//   da função é a mesma que o vínculo da pessoa/empresa usa, o documento acompanha a função em junções e encerramentos.
//   Sem chave estrangeira para a ficha: apagar/encerrar a ficha nunca apaga o documento nem o histórico.
// - documento_versoes: cada arquivo enviado é uma VERSÃO imutável (a substituição cria outra, a anterior continua). O arquivo
//   em si NUNCA fica no banco: fica no armazenamento privado, cifrado; aqui só ficam o nome interno (aleatório), o hash
//   SHA-256 do conteúdo original e a chave do arquivo embrulhada com a chave mestra (que fica fora do banco).
// - documento_eventos: histórico de tudo (enviado, substituído, visto, baixado, conferido, acesso negado, exclusão definitiva).
//   Só acrescenta: gatilhos impedem alterar ou apagar.
// - Sem política de retenção aplicada: nada é apagado sozinho. Exclusão definitiva é uma operação à parte, do administrador,
//   desligada até a política ser aprovada.

module.exports = {
  versao: 5,
  nome: 'documentos',
  up(db) {
    db.exec(`
      CREATE TABLE documentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL UNIQUE,
        funcao TEXT NOT NULL CHECK (funcao IN ('motorista', 'entregador', 'parceiro_clube', 'comercio')),
        registro_id INTEGER NOT NULL,
        categoria TEXT NOT NULL,
        titulo TEXT,
        situacao TEXT NOT NULL DEFAULT 'nao_enviado' CHECK (situacao IN ('nao_enviado', 'pendente', 'conferido', 'rejeitado', 'necessita_atualizacao')),
        versao_atual_id INTEGER,
        conferido_por INTEGER,
        conferido_por_nome TEXT,
        conferido_em TEXT,
        observacoes TEXT,
        excluido_em TEXT,
        excluido_por_nome TEXT,
        excluido_motivo TEXT,
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        criado_por INTEGER,
        criado_por_nome TEXT
      );
      -- Um documento por categoria em cada função/ficha (exceto "outros", que pode ter vários). Excluídos liberam o espaço.
      CREATE UNIQUE INDEX ux_documentos_slot ON documentos (funcao, registro_id, categoria) WHERE categoria <> 'outros' AND excluido_em IS NULL;
      CREATE INDEX ix_documentos_registro ON documentos (funcao, registro_id);
      CREATE INDEX ix_documentos_situacao ON documentos (situacao) WHERE excluido_em IS NULL;

      CREATE TABLE documento_versoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        documento_id INTEGER NOT NULL REFERENCES documentos(id),
        numero INTEGER NOT NULL,
        armazenamento TEXT NOT NULL,
        chave_armazenamento TEXT NOT NULL UNIQUE,
        nome_original TEXT,
        tipo_mime TEXT NOT NULL,
        extensao TEXT NOT NULL,
        tamanho INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        chave_embrulhada TEXT NOT NULL,
        data_envio TEXT NOT NULL,
        incluido_em TEXT NOT NULL,
        incluido_por INTEGER,
        incluido_por_nome TEXT,
        observacao_envio TEXT,
        arquivo_removido_em TEXT,
        arquivo_removido_por_nome TEXT,
        UNIQUE (documento_id, numero)
      );

      CREATE TABLE documento_eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        documento_id INTEGER NOT NULL REFERENCES documentos(id),
        versao_id INTEGER,
        tipo TEXT NOT NULL,
        detalhe TEXT,
        usuario_id INTEGER,
        usuario_nome TEXT,
        criado_em TEXT NOT NULL
      );
      CREATE INDEX ix_documento_eventos ON documento_eventos (documento_id, id);

      CREATE TRIGGER documento_eventos_sem_alterar BEFORE UPDATE ON documento_eventos
        BEGIN SELECT RAISE(ABORT, 'o histórico de documentos não pode ser alterado'); END;
      CREATE TRIGGER documento_eventos_sem_apagar BEFORE DELETE ON documento_eventos
        BEGIN SELECT RAISE(ABORT, 'o histórico de documentos não pode ser apagado'); END;
      CREATE TRIGGER documento_versoes_sem_apagar BEFORE DELETE ON documento_versoes
        BEGIN SELECT RAISE(ABORT, 'versões de documentos não podem ser apagadas'); END;
      CREATE TRIGGER documento_versoes_imutaveis BEFORE UPDATE OF documento_id, numero, armazenamento, chave_armazenamento,
        nome_original, tipo_mime, extensao, tamanho, sha256, chave_embrulhada, data_envio, incluido_em, incluido_por, incluido_por_nome, observacao_envio
        ON documento_versoes
        BEGIN SELECT RAISE(ABORT, 'uma versão enviada não pode ser alterada (envie uma nova versão)'); END;
      CREATE TRIGGER documentos_sem_apagar BEFORE DELETE ON documentos
        BEGIN SELECT RAISE(ABORT, 'documentos não podem ser apagados do banco'); END;

      -- CPF/CNPJ continuam só cifrados (migração 001); a máscara (***.***.*89-01) é guardada para exibir sem abrir o dado.
      ALTER TABLE pessoas ADD COLUMN cpf_mascara TEXT;
      ALTER TABLE empresas ADD COLUMN cnpj_mascara TEXT;
    `);
    return { tabelas: ['documentos', 'documento_versoes', 'documento_eventos'] };
  },
  verificar(db) {
    const problemas = [];
    for (const t of ['documentos', 'documento_versoes', 'documento_eventos']) {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t)) problemas.push(`tabela ${t} não foi criada`);
    }
    for (const g of ['documento_eventos_sem_alterar', 'documento_eventos_sem_apagar', 'documento_versoes_sem_apagar', 'documento_versoes_imutaveis', 'documentos_sem_apagar']) {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = ?").get(g)) problemas.push(`gatilho ${g} não foi criado`);
    }
    if (db.prepare('SELECT COUNT(*) n FROM documentos').get().n !== 0) problemas.push('tabela documentos deveria nascer vazia');
    const col = (t, c) => db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c);
    if (!col('pessoas', 'cpf_mascara')) problemas.push('coluna pessoas.cpf_mascara ausente');
    if (!col('empresas', 'cnpj_mascara')) problemas.push('coluna empresas.cnpj_mascara ausente');
    return problemas;
  }
};

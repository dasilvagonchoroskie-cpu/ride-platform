'use strict';
// Etapa 2 (M2) — entregadores e motociclistas. Só CRIA a tabela `entregadores` (e índices): não toca em nenhuma
// tabela existente. Cada entregador é um registro funcional próprio (situação, documentos e histórico próprios) e
// se liga à pessoa pelo vínculo (função `entregador`, já prevista na migração 001).

module.exports = {
  versao: 3,
  nome: 'entregadores',
  up(db) {
    db.exec(`
      CREATE TABLE entregadores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        telefone TEXT NOT NULL,
        cidade TEXT NOT NULL,
        data_primeiro_contato TEXT NOT NULL,
        origem TEXT NOT NULL,
        situacao TEXT NOT NULL,
        modalidade TEXT,
        veiculo TEXT,
        placa TEXT,
        cnh_categoria TEXT,
        documentos TEXT,
        doc_cnh TEXT,
        doc_crlv TEXT,
        doc_endereco TEXT,
        endereco TEXT,
        contratado_em TEXT,
        proxima_acao TEXT,
        data_acompanhamento TEXT,
        observacoes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by INTEGER
      );
      CREATE INDEX ix_entregadores_situacao ON entregadores (situacao);
      CREATE INDEX ix_entregadores_data ON entregadores (data_primeiro_contato);
      CREATE INDEX ix_entregadores_acomp ON entregadores (data_acompanhamento);
    `);
    return { tabela_criada: 'entregadores' };
  },
  verificar(db) {
    const colunas = new Set(db.prepare('PRAGMA table_info(entregadores)').all().map((c) => c.name));
    for (const c of ['nome', 'telefone', 'situacao', 'modalidade', 'documentos', 'doc_cnh', 'doc_crlv', 'doc_endereco', 'contratado_em']) {
      if (!colunas.has(c)) throw new Error(`Coluna ${c} ausente em entregadores.`);
    }
    if (db.prepare('SELECT COUNT(*) c FROM entregadores').get().c !== 0) throw new Error('A tabela entregadores deveria nascer vazia.');
  }
};

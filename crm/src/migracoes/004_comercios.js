'use strict';
// Etapa 2 (M3) — comércios parceiros (lojas que usam a plataforma para pedir entregas). Só CRIA a tabela `comercios`
// (e índices): não toca em nenhuma tabela existente. É um cadastro DIFERENTE do "Parceiro do Clube de Vantagens"
// (estabelecimento que dá desconto aos motoristas); a mesma empresa pode ter as duas funções. O titular é a empresa
// (vínculo função `comercio`, já prevista na migração 001).

module.exports = {
  versao: 4,
  nome: 'comercios',
  up(db) {
    db.exec(`
      CREATE TABLE comercios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome_estabelecimento TEXT NOT NULL,
        razao_social TEXT,
        categoria TEXT NOT NULL,
        responsavel TEXT,
        telefone TEXT,
        cidade TEXT,
        endereco TEXT,
        data_primeiro_contato TEXT NOT NULL,
        origem TEXT NOT NULL,
        situacao TEXT NOT NULL,
        volume_entregas TEXT,
        horario_funcionamento TEXT,
        condicoes TEXT,
        ativado_em TEXT,
        proxima_acao TEXT,
        data_acompanhamento TEXT,
        observacoes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by INTEGER
      );
      CREATE INDEX ix_comercios_situacao ON comercios (situacao);
      CREATE INDEX ix_comercios_data ON comercios (data_primeiro_contato);
      CREATE INDEX ix_comercios_acomp ON comercios (data_acompanhamento);
    `);
    return { tabela_criada: 'comercios' };
  },
  verificar(db) {
    const colunas = new Set(db.prepare('PRAGMA table_info(comercios)').all().map((c) => c.name));
    for (const c of ['nome_estabelecimento', 'razao_social', 'categoria', 'telefone', 'situacao', 'volume_entregas', 'ativado_em']) {
      if (!colunas.has(c)) throw new Error(`Coluna ${c} ausente em comercios.`);
    }
    if (db.prepare('SELECT COUNT(*) c FROM comercios').get().c !== 0) throw new Error('A tabela comercios deveria nascer vazia.');
  }
};

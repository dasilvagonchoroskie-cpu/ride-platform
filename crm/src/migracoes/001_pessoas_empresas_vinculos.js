'use strict';
// Etapa 2 — estrutura central: pessoas, empresas e vínculos (funções).
// Só CRIA tabelas e índices novos. Não toca em nenhuma tabela existente.
//
// - pessoas / empresas: identificador interno (id) + identificador permanente (uid, aleatório, nunca muda, nem em fusão).
//   O telefone vira `telefone_chave` (DDD + 8 últimos dígitos) só para LOCALIZAR possíveis duplicados; não é chave única.
// - CPF/CNPJ: só em forma protegida (cifrado + índice HMAC para achar repetido), com a finalidade registrada.
//   Nenhuma tela coleta esses campos nesta fase.
// - vinculos: liga a pessoa/empresa a cada função (motorista, entregador, passageiro, parceiro do Clube, comércio) e ao
//   registro funcional (a ficha da função, com situação e histórico próprios). Um titular não pode ter dois vínculos
//   ATIVOS da mesma função, e um registro funcional pertence a um titular só.

module.exports = {
  versao: 1,
  nome: 'pessoas_empresas_vinculos',
  up(db) {
    db.exec(`
      CREATE TABLE pessoas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL UNIQUE,
        nome TEXT NOT NULL,
        telefone TEXT,
        telefone_chave TEXT,
        email TEXT,
        cidade TEXT,
        cpf_cifrado TEXT,
        cpf_indice TEXT,
        cpf_finalidade TEXT,
        situacao TEXT NOT NULL DEFAULT 'ativa' CHECK (situacao IN ('ativa', 'mesclada', 'anonimizada')),
        mesclada_em_id INTEGER REFERENCES pessoas(id),
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        CHECK ((cpf_cifrado IS NULL AND cpf_indice IS NULL) OR (cpf_cifrado IS NOT NULL AND cpf_indice IS NOT NULL AND cpf_finalidade IS NOT NULL))
      );
      CREATE INDEX ix_pessoas_tel ON pessoas (telefone_chave);
      CREATE UNIQUE INDEX ux_pessoas_cpf ON pessoas (cpf_indice) WHERE cpf_indice IS NOT NULL AND situacao = 'ativa';

      CREATE TABLE empresas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL UNIQUE,
        nome_fantasia TEXT NOT NULL,
        razao_social TEXT,
        telefone TEXT,
        telefone_chave TEXT,
        email TEXT,
        cidade TEXT,
        endereco TEXT,
        cnpj_cifrado TEXT,
        cnpj_indice TEXT,
        cnpj_finalidade TEXT,
        responsavel_pessoa_id INTEGER REFERENCES pessoas(id) ON DELETE SET NULL,
        situacao TEXT NOT NULL DEFAULT 'ativa' CHECK (situacao IN ('ativa', 'mesclada', 'encerrada')),
        mesclada_em_id INTEGER REFERENCES empresas(id),
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        CHECK ((cnpj_cifrado IS NULL AND cnpj_indice IS NULL) OR (cnpj_cifrado IS NOT NULL AND cnpj_indice IS NOT NULL AND cnpj_finalidade IS NOT NULL))
      );
      CREATE INDEX ix_empresas_tel ON empresas (telefone_chave);
      CREATE UNIQUE INDEX ux_empresas_cnpj ON empresas (cnpj_indice) WHERE cnpj_indice IS NOT NULL AND situacao = 'ativa';

      CREATE TABLE vinculos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titular_tipo TEXT NOT NULL CHECK (titular_tipo IN ('pessoa', 'empresa')),
        titular_id INTEGER NOT NULL,
        funcao TEXT NOT NULL,
        registro_tabela TEXT NOT NULL,
        registro_id INTEGER NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
        criado_em TEXT NOT NULL,
        encerrado_em TEXT,
        motivo_encerramento TEXT,
        CHECK (
          (titular_tipo = 'pessoa' AND funcao = 'motorista' AND registro_tabela = 'motoristas') OR
          (titular_tipo = 'pessoa' AND funcao = 'entregador' AND registro_tabela = 'entregadores') OR
          (titular_tipo = 'pessoa' AND funcao = 'passageiro' AND registro_tabela = 'passageiros') OR
          (titular_tipo = 'empresa' AND funcao = 'parceiro_clube' AND registro_tabela = 'parceiros') OR
          (titular_tipo = 'empresa' AND funcao = 'comercio' AND registro_tabela = 'comercios')
        ),
        CHECK ((ativo = 1 AND encerrado_em IS NULL) OR (ativo = 0 AND encerrado_em IS NOT NULL))
      );
      CREATE UNIQUE INDEX ux_vinculo_funcao_ativa ON vinculos (titular_tipo, titular_id, funcao) WHERE ativo = 1;
      CREATE UNIQUE INDEX ux_vinculo_registro_ativo ON vinculos (registro_tabela, registro_id) WHERE ativo = 1;
      CREATE INDEX ix_vinculos_titular ON vinculos (titular_tipo, titular_id);

      -- Histórico do titular (fusão de duplicados, correção de dados, pedidos LGPD). Guarda o QUE mudou, nunca os valores.
      CREATE TABLE titulares_eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titular_tipo TEXT NOT NULL CHECK (titular_tipo IN ('pessoa', 'empresa')),
        titular_id INTEGER NOT NULL,
        evento TEXT NOT NULL,
        detalhe TEXT,
        usuario_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        criado_em TEXT NOT NULL
      );
      CREATE INDEX ix_titulares_eventos ON titulares_eventos (titular_tipo, titular_id);
    `);
    return { tabelas: ['pessoas', 'empresas', 'vinculos', 'titulares_eventos'] };
  },
  verificar(db) {
    const faltando = ['pessoas', 'empresas', 'vinculos', 'titulares_eventos']
      .filter((t) => !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t));
    return faltando.map((t) => `tabela ${t} não foi criada`);
  }
};

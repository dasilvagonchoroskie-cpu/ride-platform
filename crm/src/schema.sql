PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  ativo INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_nome TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS motoristas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  cidade TEXT NOT NULL,
  data_primeiro_contato TEXT NOT NULL,
  origem TEXT NOT NULL,
  situacao TEXT NOT NULL,
  proxima_acao TEXT,
  data_acompanhamento TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by INTEGER
);

CREATE TABLE IF NOT EXISTS passageiros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  cidade TEXT NOT NULL,
  origem TEXT NOT NULL,
  data_primeiro_contato TEXT NOT NULL,
  situacao TEXT NOT NULL,
  proxima_acao TEXT,
  data_acompanhamento TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by INTEGER
);

CREATE TABLE IF NOT EXISTS parceiros (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome_estabelecimento TEXT NOT NULL,
  categoria TEXT NOT NULL,
  responsavel TEXT,
  telefone TEXT,
  cidade TEXT,
  data_contato TEXT NOT NULL,
  beneficio TEXT,
  condicoes TEXT,
  situacao TEXT NOT NULL,
  proxima_acao TEXT,
  data_acompanhamento TEXT,
  observacoes TEXT,
  confirmado_em TEXT,
  confirmado_por INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by INTEGER
);

CREATE TABLE IF NOT EXISTS atendimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  tipo TEXT NOT NULL,
  assunto TEXT NOT NULL,
  descricao TEXT NOT NULL,
  pessoa TEXT,
  prioridade TEXT NOT NULL,
  situacao TEXT NOT NULL,
  responsavel TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by INTEGER
);

CREATE TABLE IF NOT EXISTS campanhas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  canal TEXT NOT NULL,
  objetivo TEXT,
  publico_alvo TEXT,
  data_planejada TEXT,
  data_publicacao TEXT,
  situacao TEXT NOT NULL,
  investimento REAL NOT NULL DEFAULT 0,
  alcance INTEGER NOT NULL DEFAULT 0,
  engajamento INTEGER NOT NULL DEFAULT 0,
  resultados TEXT,
  observacoes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by INTEGER
);

CREATE TABLE IF NOT EXISTS tarefas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  descricao TEXT,
  responsavel TEXT,
  prioridade TEXT NOT NULL,
  data_vencimento TEXT NOT NULL,
  situacao TEXT NOT NULL,
  entidade_tipo TEXT,
  entidade_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by INTEGER
);

CREATE TABLE IF NOT EXISTS interacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  canal TEXT,
  resumo TEXT NOT NULL,
  situacao_anterior TEXT,
  situacao_nova TEXT,
  created_by INTEGER,
  created_by_nome TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_interacoes_entity ON interacoes(entity, entity_id);

CREATE TABLE IF NOT EXISTS cenarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  descricao TEXT,
  motoristas_ativos INTEGER NOT NULL DEFAULT 0,
  corridas_motorista_dia REAL NOT NULL DEFAULT 0,
  dias_operacao INTEGER NOT NULL DEFAULT 0,
  valor_medio_corrida REAL NOT NULL DEFAULT 0,
  comissao_pct REAL NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cenario_custos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cenario_id INTEGER NOT NULL REFERENCES cenarios(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  valor REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS simulacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cenario_id INTEGER,
  cenario_nome TEXT NOT NULL,
  premissas TEXT NOT NULL,
  resultados TEXT NOT NULL,
  custos_detalhe TEXT,
  observacao TEXT,
  created_by INTEGER,
  created_by_nome TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_simulacoes_data ON simulacoes(created_at);
CREATE INDEX IF NOT EXISTS idx_motoristas_situacao ON motoristas(situacao);
CREATE INDEX IF NOT EXISTS idx_passageiros_situacao ON passageiros(situacao);
CREATE INDEX IF NOT EXISTS idx_parceiros_situacao ON parceiros(situacao);
CREATE INDEX IF NOT EXISTS idx_atendimentos_situacao ON atendimentos(situacao);
CREATE INDEX IF NOT EXISTS idx_tarefas_vencimento ON tarefas(data_vencimento);

/* ------------------------------- WhatsApp -------------------------------- */
-- Contato do WhatsApp (uma linha por número/identificador). "jid" é o identificador do canal.
CREATE TABLE IF NOT EXISTS wa_contatos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jid TEXT NOT NULL UNIQUE,
  telefone TEXT,                              -- só dígitos com DDI (ex.: 5585999990000); pode ser NULL
  nome TEXT,                                  -- nome exibido pelo contato no WhatsApp
  vinculo_tipo TEXT NOT NULL DEFAULT '',      -- motoristas | passageiros | parceiros | ''
  vinculo_id INTEGER,
  ignorado INTEGER NOT NULL DEFAULT 0,        -- 1 = mensagens desse contato são descartadas
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wa_conversas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contato_id INTEGER NOT NULL UNIQUE REFERENCES wa_contatos(id) ON DELETE CASCADE,
  situacao TEXT NOT NULL DEFAULT 'Aberta',    -- Aberta | Resolvida
  responsavel_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  nao_lidas INTEGER NOT NULL DEFAULT 0,
  ultima_mensagem TEXT,
  ultima_em TEXT,
  ultima_direcao TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wa_mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversa_id INTEGER NOT NULL REFERENCES wa_conversas(id) ON DELETE CASCADE,
  direcao TEXT NOT NULL CHECK (direcao IN ('in', 'out')),
  tipo TEXT NOT NULL DEFAULT 'text',
  texto TEXT,
  externo_id TEXT,                            -- id da mensagem no WhatsApp (garante que não duplica)
  status TEXT NOT NULL DEFAULT 'recebida',    -- recebida | pendente | enviando | enviada | entregue | lida | falhou
  erro TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  proxima_tentativa_em TEXT,
  enviada_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
  origem TEXT NOT NULL DEFAULT 'crm',         -- crm | celular | contato
  ocorrida_em TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_wa_msg_externo ON wa_mensagens (conversa_id, externo_id) WHERE externo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_wa_msg_conversa ON wa_mensagens (conversa_id, id);
CREATE INDEX IF NOT EXISTS ix_wa_msg_fila ON wa_mensagens (status, proxima_tentativa_em);
CREATE INDEX IF NOT EXISTS ix_wa_conv_ultima ON wa_conversas (ultima_em);
CREATE INDEX IF NOT EXISTS ix_wa_contato_tel ON wa_contatos (telefone);

/* ------------------------------ Inteligência (IA) ------------------------------ */
-- Cada análise de conversa feita pela IA (histórico, auditoria e controle de custo).
CREATE TABLE IF NOT EXISTS ia_analises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversa_id INTEGER NOT NULL REFERENCES wa_conversas(id) ON DELETE CASCADE,
  mensagem_ate_id INTEGER NOT NULL,           -- última mensagem considerada (evita reanalisar sem novidade)
  origem TEXT NOT NULL DEFAULT 'manual',      -- manual | automatica
  resultado TEXT NOT NULL,                    -- JSON já validado
  modelo TEXT,
  tokens_entrada INTEGER NOT NULL DEFAULT 0,
  tokens_saida INTEGER NOT NULL DEFAULT 0,
  aplicado_em TEXT,                           -- quando os dados foram aplicados ao cadastro
  aplicado_resumo TEXT,
  criado_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ia_conversa ON ia_analises (conversa_id, id);
CREATE INDEX IF NOT EXISTS ix_ia_data ON ia_analises (criado_em);

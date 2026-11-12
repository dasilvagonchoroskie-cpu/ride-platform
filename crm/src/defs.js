'use strict';

const ORIGENS = ['WhatsApp', 'Instagram', 'Facebook', 'TikTok', 'Indicação', 'Divulgação presencial', 'Site', 'Outro'];

const STATUS_MOTORISTA = [
  'Novo interessado',
  'Primeiro contato realizado',
  'Aguardando retorno',
  'Cadastro em andamento',
  'Cadastro em análise',
  'Aprovado',
  'Contratado',
  'Não prosseguiu'
];

// Situação de cada documento do motorista (o servidor marca "Recebido — conferir" quando o documento chega pelo WhatsApp).
const STATUS_DOC = ['Não enviado', 'Recebido — conferir', 'Conferido'];

const STATUS_PASSAGEIRO = [
  'Novo interessado',
  'Contato realizado',
  'Aguardando retorno',
  'Interessado na plataforma',
  'Usuário cadastrado',
  'Não prosseguiu'
];

const CATEGORIAS_PARCEIRO = ['Auto Center', 'Posto de combustível', 'Farmácia', 'Supermercado', 'Outros estabelecimentos'];

const STATUS_PARCEIRO = [
  'Identificado',
  'Primeiro contato',
  'Aguardando resposta',
  'Em negociação',
  'Proposta apresentada',
  'Parceria confirmada',
  'Não concretizada'
];

const STATUS_ATENDIMENTO = ['Aberto', 'Em andamento', 'Aguardando retorno', 'Resolvido', 'Cancelado'];

const STATUS_CAMPANHA = ['Ideia', 'Planejada', 'Em produção', 'Em andamento', 'Publicada', 'Concluída', 'Cancelada'];

const STATUS_TAREFA = ['Pendente', 'Em andamento', 'Concluída', 'Cancelada'];

const PRIORIDADES = ['Baixa', 'Média', 'Alta', 'Urgente'];
const CANAIS = ['Instagram', 'Facebook', 'TikTok', 'WhatsApp', 'Divulgação presencial'];

const ENTITIES = {
  motoristas: {
    table: 'motoristas',
    label: 'Motoristas',
    singular: 'Motorista',
    icon: 'steering',
    dateField: 'data_primeiro_contato',
    dateFieldLabel: 'primeiro contato',
    orderField: 'data_acompanhamento',
    orderDir: 'asc', // follow-up: o mais urgente primeiro (sem data vai para o fim)
    searchFields: ['nome', 'telefone', 'cidade', 'origem', 'placa', 'veiculo', 'proxima_acao', 'observacoes'],
    statusField: 'situacao',
    statuses: STATUS_MOTORISTA,
    // Fechado (verde): motorista contratado, já trabalhando. Perdido: não segue.
    fechados: ['Contratado'],
    perdidos: ['Não prosseguiu'],
    interactions: true,
    columns: ['nome', 'cidade', 'situacao', 'documentos', 'data_acompanhamento'],
    fields: [
      { key: 'nome', label: 'Nome completo', type: 'text', required: true, max: 120, full: true },
      { key: 'telefone', label: 'Telefone', type: 'tel', required: true, max: 25 },
      { key: 'cidade', label: 'Cidade', type: 'text', required: true, max: 80 },
      { key: 'data_primeiro_contato', label: 'Data do primeiro contato', type: 'date', required: true },
      { key: 'origem', label: 'Origem do contato', type: 'select', required: true, options: ORIGENS },
      { key: 'situacao', label: 'Situação', type: 'select', required: true, options: STATUS_MOTORISTA },
      { key: 'veiculo', label: 'Veículo (modelo, cor, ano)', type: 'text', max: 120 },
      { key: 'placa', label: 'Placa', type: 'text', max: 10 },
      { key: 'cnh_categoria', label: 'Categoria da CNH', type: 'select', options: ['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'] },
      { key: 'documentos', label: 'Documentos', type: 'select', options: ['Não enviados', 'Incompletos', 'Recebidos — conferir', 'Conferidos'] },
      { key: 'doc_cnh', label: 'CNH', type: 'select', options: STATUS_DOC },
      { key: 'doc_crlv', label: 'Documento do veículo (CRLV)', type: 'select', options: STATUS_DOC },
      { key: 'doc_endereco', label: 'Comprovante de endereço', type: 'select', options: STATUS_DOC },
      { key: 'endereco', label: 'Endereço', type: 'text', max: 200, full: true },
      { key: 'contratado_em', label: 'Contratado em', type: 'date' },
      { key: 'proxima_acao', label: 'Próxima ação', type: 'text', max: 160 },
      { key: 'data_acompanhamento', label: 'Data do acompanhamento', type: 'date' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', max: 2000, full: true }
    ]
  },

  passageiros: {
    table: 'passageiros',
    label: 'Passageiros',
    singular: 'Passageiro',
    icon: 'users',
    dateField: 'data_primeiro_contato',
    dateFieldLabel: 'primeiro contato',
    orderField: 'data_acompanhamento',
    orderDir: 'asc', // follow-up: o mais urgente primeiro (sem data vai para o fim)
    searchFields: ['nome', 'telefone', 'cidade', 'origem', 'proxima_acao', 'observacoes'],
    statusField: 'situacao',
    statuses: STATUS_PASSAGEIRO,
    fechados: ['Usuário cadastrado'],
    perdidos: ['Não prosseguiu'],
    interactions: true,
    columns: ['nome', 'telefone', 'cidade', 'situacao', 'data_primeiro_contato'],
    fields: [
      { key: 'nome', label: 'Nome', type: 'text', required: true, max: 120, full: true },
      { key: 'telefone', label: 'Telefone', type: 'tel', required: true, max: 25 },
      { key: 'cidade', label: 'Cidade', type: 'text', required: true, max: 80 },
      { key: 'origem', label: 'Origem do contato', type: 'select', required: true, options: ORIGENS },
      { key: 'data_primeiro_contato', label: 'Data do primeiro contato', type: 'date', required: true },
      { key: 'situacao', label: 'Situação', type: 'select', required: true, options: STATUS_PASSAGEIRO },
      { key: 'proxima_acao', label: 'Próxima ação', type: 'text', max: 160 },
      { key: 'data_acompanhamento', label: 'Data do acompanhamento', type: 'date' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', max: 2000, full: true }
    ]
  },

  parceiros: {
    table: 'parceiros',
    label: 'Parceiros',
    singular: 'Parceiro',
    icon: 'store',
    dateField: 'data_contato',
    dateFieldLabel: 'contato',
    orderField: 'data_acompanhamento',
    orderDir: 'asc', // follow-up: o mais urgente primeiro (sem data vai para o fim)
    searchFields: ['nome_estabelecimento', 'responsavel', 'telefone', 'cidade', 'beneficio', 'condicoes', 'observacoes'],
    statusField: 'situacao',
    statuses: STATUS_PARCEIRO,
    fechados: ['Parceria confirmada'],
    perdidos: ['Não concretizada'],
    interactions: true,
    confirmStatus: 'Parceria confirmada',
    columns: ['nome_estabelecimento', 'categoria', 'cidade', 'situacao', 'data_contato'],
    fields: [
      { key: 'nome_estabelecimento', label: 'Nome do estabelecimento', type: 'text', required: true, max: 140, full: true },
      { key: 'categoria', label: 'Categoria', type: 'select', required: true, options: CATEGORIAS_PARCEIRO },
      { key: 'responsavel', label: 'Responsável', type: 'text', max: 120 },
      { key: 'telefone', label: 'Telefone', type: 'tel', max: 25 },
      { key: 'cidade', label: 'Cidade', type: 'text', max: 80 },
      { key: 'data_contato', label: 'Data do contato', type: 'date', required: true },
      { key: 'beneficio', label: 'Benefício negociado', type: 'text', max: 200 },
      { key: 'situacao', label: 'Situação', type: 'select', required: true, options: STATUS_PARCEIRO },
      { key: 'condicoes', label: 'Condições propostas', type: 'textarea', max: 2000, full: true },
      { key: 'proxima_acao', label: 'Próxima ação', type: 'text', max: 160 },
      { key: 'data_acompanhamento', label: 'Data do acompanhamento', type: 'date' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', max: 2000, full: true }
    ]
  },

  atendimentos: {
    table: 'atendimentos',
    label: 'Atendimento',
    singular: 'Atendimento',
    icon: 'headset',
    dateField: 'data',
    dateFieldLabel: 'atendimento',
    orderField: 'data',
    searchFields: ['assunto', 'descricao', 'pessoa', 'responsavel'],
    statusField: 'situacao',
    statuses: STATUS_ATENDIMENTO,
    interactions: true,
    columns: ['assunto', 'pessoa', 'tipo', 'prioridade', 'situacao', 'data'],
    fields: [
      { key: 'data', label: 'Data', type: 'date', required: true },
      { key: 'tipo', label: 'Tipo', type: 'select', required: true, options: ['Dúvida', 'Solicitação', 'Reclamação', 'Sugestão', 'Pendência', 'Acompanhamento'] },
      { key: 'assunto', label: 'Assunto', type: 'text', required: true, max: 160, full: true },
      { key: 'pessoa', label: 'Pessoa relacionada', type: 'text', max: 120 },
      { key: 'prioridade', label: 'Prioridade', type: 'select', required: true, options: PRIORIDADES },
      { key: 'situacao', label: 'Situação', type: 'select', required: true, options: STATUS_ATENDIMENTO },
      { key: 'responsavel', label: 'Responsável pelo atendimento', type: 'text', max: 120 },
      { key: 'descricao', label: 'Descrição', type: 'textarea', required: true, max: 4000, full: true }
    ]
  },

  campanhas: {
    table: 'campanhas',
    label: 'Marketing',
    singular: 'Campanha',
    icon: 'megaphone',
    dateField: 'data_planejada',
    dateFieldLabel: 'data planejada',
    orderField: 'data_planejada',
    searchFields: ['titulo', 'objetivo', 'publico_alvo', 'resultados', 'observacoes'],
    statusField: 'situacao',
    statuses: STATUS_CAMPANHA,
    interactions: false,
    columns: ['titulo', 'tipo', 'canal', 'situacao', 'data_planejada'],
    fields: [
      { key: 'titulo', label: 'Título', type: 'text', required: true, max: 160, full: true },
      { key: 'tipo', label: 'Tipo', type: 'select', required: true, options: ['Campanha', 'Publicação', 'Ideia de conteúdo'] },
      { key: 'canal', label: 'Canal', type: 'select', required: true, options: CANAIS },
      { key: 'objetivo', label: 'Objetivo', type: 'text', max: 200 },
      { key: 'publico_alvo', label: 'Público-alvo', type: 'text', max: 200 },
      { key: 'data_planejada', label: 'Data planejada', type: 'date' },
      { key: 'data_publicacao', label: 'Data de publicação', type: 'date' },
      { key: 'situacao', label: 'Situação', type: 'select', required: true, options: STATUS_CAMPANHA },
      { key: 'investimento', label: 'Investimento (R$)', type: 'number', min: 0, step: 0.01 },
      { key: 'alcance', label: 'Alcance', type: 'number', min: 0, step: 1 },
      { key: 'engajamento', label: 'Engajamento', type: 'number', min: 0, step: 1 },
      { key: 'resultados', label: 'Resultado', type: 'textarea', max: 2000, full: true },
      { key: 'observacoes', label: 'Observações', type: 'textarea', max: 2000, full: true }
    ]
  },

  tarefas: {
    table: 'tarefas',
    label: 'Tarefas',
    singular: 'Tarefa',
    icon: 'check',
    dateField: 'data_vencimento',
    dateFieldLabel: 'vencimento',
    orderField: 'data_vencimento',
    orderDir: 'asc',
    searchFields: ['titulo', 'descricao', 'responsavel'],
    statusField: 'situacao',
    statuses: STATUS_TAREFA,
    interactions: false,
    views: ['lista', 'kanban', 'calendario'],
    columns: ['titulo', 'responsavel', 'prioridade', 'situacao', 'data_vencimento'],
    fields: [
      { key: 'titulo', label: 'Título', type: 'text', required: true, max: 160, full: true },
      { key: 'descricao', label: 'Descrição', type: 'textarea', max: 2000, full: true },
      { key: 'responsavel', label: 'Responsável', type: 'text', max: 120 },
      { key: 'prioridade', label: 'Prioridade', type: 'select', required: true, options: PRIORIDADES },
      { key: 'data_vencimento', label: 'Data de vencimento', type: 'date', required: true },
      { key: 'situacao', label: 'Situação', type: 'select', required: true, options: STATUS_TAREFA },
      { key: 'entidade_tipo', label: 'Registro relacionado — módulo', type: 'select', options: ['motoristas', 'passageiros', 'parceiros', 'atendimentos', 'campanhas'] },
      { key: 'entidade_id', label: 'Registro relacionado', type: 'relation', dependsOn: 'entidade_tipo' }
    ]
  }
};

// Etapa 2 (M2): entregadores e motociclistas. Só existe com a Etapa 2 ligada (a tabela vem da migração 003).
// Mesmo fluxo do motorista (interessado → cadastro → análise → aprovado → contratado), com a modalidade de atuação.
const MODALIDADES_ENTREGA = ['Entregador de moto', 'Motociclista (mototáxi)', 'Entregador de bicicleta', 'Entregador de carro', 'Outra'];
const STATUS_ENTREGADOR = STATUS_MOTORISTA;
if (process.env.FM_ETAPA2 === '1') {
  ENTITIES.entregadores = {
    table: 'entregadores',
    label: 'Entregadores',
    singular: 'Entregador',
    icon: 'send',
    dateField: 'data_primeiro_contato',
    dateFieldLabel: 'primeiro contato',
    orderField: 'data_acompanhamento',
    orderDir: 'asc',
    searchFields: ['nome', 'telefone', 'cidade', 'origem', 'placa', 'veiculo', 'modalidade', 'proxima_acao', 'observacoes'],
    statusField: 'situacao',
    statuses: STATUS_ENTREGADOR,
    fechados: ['Contratado'],
    perdidos: ['Não prosseguiu'],
    interactions: true,
    columns: ['nome', 'modalidade', 'cidade', 'situacao', 'documentos', 'data_acompanhamento'],
    fields: [
      { key: 'nome', label: 'Nome completo', type: 'text', required: true, max: 120, full: true },
      { key: 'telefone', label: 'Telefone', type: 'tel', required: true, max: 25 },
      { key: 'cidade', label: 'Cidade', type: 'text', required: true, max: 80 },
      { key: 'data_primeiro_contato', label: 'Data do primeiro contato', type: 'date', required: true },
      { key: 'origem', label: 'Origem do contato', type: 'select', required: true, options: ORIGENS },
      { key: 'situacao', label: 'Situação', type: 'select', required: true, options: STATUS_ENTREGADOR },
      { key: 'modalidade', label: 'Modalidade de atuação', type: 'select', options: MODALIDADES_ENTREGA },
      { key: 'veiculo', label: 'Veículo (modelo, cor, ano)', type: 'text', max: 120 },
      { key: 'placa', label: 'Placa', type: 'text', max: 10 },
      { key: 'cnh_categoria', label: 'Categoria da CNH', type: 'select', options: ['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'] },
      { key: 'documentos', label: 'Documentos', type: 'select', options: ['Não enviados', 'Incompletos', 'Recebidos — conferir', 'Conferidos'] },
      { key: 'doc_cnh', label: 'CNH', type: 'select', options: STATUS_DOC },
      { key: 'doc_crlv', label: 'Documento do veículo (CRLV)', type: 'select', options: STATUS_DOC },
      { key: 'doc_endereco', label: 'Comprovante de endereço', type: 'select', options: STATUS_DOC },
      { key: 'endereco', label: 'Endereço', type: 'text', max: 200, full: true },
      { key: 'contratado_em', label: 'Contratado em', type: 'date' },
      { key: 'proxima_acao', label: 'Próxima ação', type: 'text', max: 160 },
      { key: 'data_acompanhamento', label: 'Data do acompanhamento', type: 'date' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', max: 2000, full: true }
    ]
  };
  // Tarefas podem apontar para um entregador.
  ENTITIES.tarefas.fields.find((f) => f.key === 'entidade_tipo').options.push('entregadores');
}

// Etapa 2 (M3): comércios parceiros — lojas que usam a plataforma para pedir entregas (diferente do Parceiro do Clube,
// que dá desconto aos motoristas). Só existe com a Etapa 2 ligada (a tabela vem da migração 004).
const CATEGORIAS_COMERCIO = ['Restaurante / lanchonete', 'Pizzaria', 'Padaria / confeitaria', 'Farmácia', 'Supermercado / mercadinho', 'Gás e água', 'Loja de roupas / variedades', 'Pet shop', 'Outros'];
const VOLUMES_ENTREGA = ['Até 10 por dia', '10 a 30 por dia', 'Mais de 30 por dia', 'Ainda não sabe'];
const STATUS_COMERCIO = ['Identificado', 'Primeiro contato', 'Aguardando resposta', 'Em negociação', 'Proposta apresentada', 'Cadastro em andamento', 'Ativo na plataforma', 'Não concretizado'];
if (process.env.FM_ETAPA2 === '1') {
  ENTITIES.comercios = {
    table: 'comercios',
    label: 'Comércios',
    singular: 'Comércio',
    icon: 'building',
    dateField: 'data_primeiro_contato',
    dateFieldLabel: 'primeiro contato',
    orderField: 'data_acompanhamento',
    orderDir: 'asc',
    searchFields: ['nome_estabelecimento', 'razao_social', 'responsavel', 'telefone', 'cidade', 'endereco', 'condicoes', 'proxima_acao', 'observacoes'],
    statusField: 'situacao',
    statuses: STATUS_COMERCIO,
    fechados: ['Ativo na plataforma'],
    perdidos: ['Não concretizado'],
    interactions: true,
    columns: ['nome_estabelecimento', 'categoria', 'cidade', 'situacao', 'data_acompanhamento'],
    fields: [
      { key: 'nome_estabelecimento', label: 'Nome fantasia do comércio', type: 'text', required: true, max: 140, full: true },
      { key: 'razao_social', label: 'Razão social (se houver)', type: 'text', max: 160, full: true },
      { key: 'categoria', label: 'Categoria', type: 'select', required: true, options: CATEGORIAS_COMERCIO },
      { key: 'responsavel', label: 'Responsável pelo estabelecimento', type: 'text', max: 120 },
      { key: 'telefone', label: 'Telefone / WhatsApp', type: 'tel', max: 25 },
      { key: 'cidade', label: 'Cidade', type: 'text', max: 80 },
      { key: 'endereco', label: 'Endereço completo', type: 'text', max: 200, full: true },
      { key: 'data_primeiro_contato', label: 'Data do cadastro / primeiro contato', type: 'date', required: true },
      { key: 'origem', label: 'Origem do contato', type: 'select', required: true, options: ORIGENS },
      { key: 'situacao', label: 'Situação', type: 'select', required: true, options: STATUS_COMERCIO },
      { key: 'volume_entregas', label: 'Volume estimado de entregas', type: 'select', options: VOLUMES_ENTREGA },
      { key: 'horario_funcionamento', label: 'Horário de funcionamento', type: 'text', max: 120 },
      { key: 'condicoes', label: 'Condições combinadas (taxas, regras)', type: 'textarea', max: 2000, full: true },
      { key: 'ativado_em', label: 'Ativo na plataforma desde', type: 'date' },
      { key: 'proxima_acao', label: 'Próxima ação', type: 'text', max: 160 },
      { key: 'data_acompanhamento', label: 'Data do acompanhamento', type: 'date' },
      { key: 'observacoes', label: 'Observações', type: 'textarea', max: 2000, full: true }
    ]
  };
  ENTITIES.tarefas.fields.find((f) => f.key === 'entidade_tipo').options.push('comercios');
}

module.exports = {
  ENTITIES,
  CATEGORIAS_COMERCIO,
  MODALIDADES_ENTREGA,
  ORIGENS,
  CANAIS,
  PRIORIDADES,
  CATEGORIAS_PARCEIRO,
  STATUS_MOTORISTA,
  STATUS_PASSAGEIRO,
  STATUS_PARCEIRO,
  STATUS_ATENDIMENTO,
  STATUS_CAMPANHA,
  STATUS_TAREFA
};

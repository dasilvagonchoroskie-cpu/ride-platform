'use strict';

// Regras de perfil. Perfil ausente ou inválido NUNCA pode resultar em administrador.
// `avaliador` (12/11/2026): avaliador de cadastros (ex.: o doutor Jean). Só consulta candidatos das funções liberadas,
// abre os documentos liberados deles e registra pareceres. Não decide, não exclui, não exporta, não vê outros módulos.
// As rotas dele passam por uma lista fechada no servidor (`ROTAS_AVALIADOR`); qualquer outra responde 403.
const ROLES = ['admin', 'gestor', 'avaliador'];
const DEFAULT_ROLE = 'gestor';

// Retorna { role } quando válido (ou omitido → perfil de menor privilégio) e { error } caso contrário.
function parseRole(value) {
  if (value === undefined || value === null || value === '') return { role: DEFAULT_ROLE };
  if (typeof value === 'string' && ROLES.includes(value)) return { role: value };
  return { error: 'Perfil inválido. Use "admin", "gestor" ou "avaliador".' };
}

// Interpreta a variável TRUST_PROXY: número de proxies, true/false, ou lista/sub-rede do Express.
// Padrão "loopback": só confia em X-Forwarded-* quando o proxy está na mesma máquina.
function parseTrustProxy(value) {
  const v = String(value === undefined || value === null || value === '' ? 'loopback' : value).trim();
  if (/^\d+$/.test(v)) return Number(v);
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

// Perfil "gestor": lê, cria e edita. Exclusão e exportação em massa de dados pessoais são do administrador.
// Tarefas não guardam dados pessoais de terceiros, então o gestor pode excluí-las.
const GESTOR_DELETABLE = new Set(['tarefas']);

function canDelete(role, entityKey) {
  return role === 'admin' || (role === 'gestor' && GESTOR_DELETABLE.has(entityKey));
}

// Exportação em PDF/CSV. Listas de PESSOAS (motoristas, entregadores, passageiros, parceiros, atendimentos) trazem dado
// pessoal: só o administrador. Os demais setores (tarefas, marketing, financeiro, resumo do período) não listam dados
// pessoais de terceiros e o gestor também pode exportar em PDF. O CSV continua só do administrador, em todos.
const EXPORTA_GESTOR_PDF = new Set(['tarefas', 'campanhas', 'resumo', 'financeiro', 'cenario']);

function canExportPdf(role, tipo) {
  return role === 'admin' || (role === 'gestor' && EXPORTA_GESTOR_PDF.has(tipo));
}


// Documentos (M4). Privilégio mínimo: o administrador faz tudo; o gestor, por padrão, só ANEXA e consulta a situação
// (metadados). Ver/baixar o ARQUIVO e conferir dependem de a categoria ter sido liberada ao gestor pelo administrador
// (política `docs_politica`, decisão pendente do dono). Exclusão definitiva é só do administrador.
const DOCS_POLITICA_PADRAO = {
  obrigatorios: { motorista: ['cnh', 'crlv', 'comprovante_endereco'], entregador: ['cnh', 'crlv', 'comprovante_endereco'], parceiro_clube: [], comercio: [] },
  gestor: { anexar: true, conferir: false, categorias_visiveis: [] },
  exclusao_definitiva: false,
  cpf_cnpj: { cpf: 'desligado', cnpj: 'desligado' },
  // Avaliador de cadastros: só candidatos (com avaliação aberta) destas funções e só estas categorias de arquivo.
  avaliador: { funcoes: ['motorista'], categorias_visiveis: ['cnh', 'crlv', 'comprovante_endereco', 'outros'] },
  confirmada_em: null
};
const docsVerArquivo = (role, categoria, pol) => role === 'admin' || (role === 'gestor' && !!pol && !!pol.gestor && (pol.gestor.categorias_visiveis || []).includes(categoria));
// Avaliador: função e categoria liberadas na política E ficha com candidatura aberta (conferido pelo serviço de documentos).
const docsAvaliadorVer = (funcao, categoria, pol) => !!pol && !!pol.avaliador && (pol.avaliador.funcoes || []).includes(funcao) && (pol.avaliador.categorias_visiveis || []).includes(categoria);

// Rotas que o avaliador alcança (lista fechada: o resto é 403 antes de chegar à rota). Método + caminho.
const ROTAS_AVALIADOR = [
  ['GET', /^\/meta$/],
  ['GET', /^\/candidaturas$/],
  ['GET', /^\/candidaturas\/\d+$/],
  ['POST', /^\/candidaturas\/\d+\/pareceres$/],
  ['GET', /^\/documentos\/\d+$/],
  ['GET', /^\/documentos\/\d+\/arquivo$/]
];
const avaliadorPodeRota = (metodo, caminho) => ROTAS_AVALIADOR.some(([m, re]) => m === metodo && re.test(caminho));
const docsAnexar = (role, pol) => role === 'admin' || (role === 'gestor' && !!pol && !!pol.gestor && pol.gestor.anexar === true);
// Conferir exige poder ver o arquivo: ninguém confere o que não pode abrir.
const docsConferir = (role, categoria, pol) => role === 'admin' || (role === 'gestor' && !!pol && !!pol.gestor && pol.gestor.conferir === true && docsVerArquivo(role, categoria, pol));
const docsExcluirDefinitivo = (role) => role === 'admin';

function permissionsFor(role, entityKeys) {
  if (role !== 'admin' && role !== 'gestor') return { exportar: false, exportar_pdf: [], excluir_financeiro: false, ver_atividade: false, excluir: [] };
  return {
    exportar: role === 'admin',
    exportar_pdf: [...EXPORTA_GESTOR_PDF, ...entityKeys].filter((t, i, a) => a.indexOf(t) === i && canExportPdf(role, t)),
    excluir_financeiro: role === 'admin',
    ver_atividade: role === 'admin',
    excluir: entityKeys.filter((k) => canDelete(role, k))
  };
}

module.exports = {
  canDelete, canExportPdf, DOCS_POLITICA_PADRAO, docsVerArquivo, docsAnexar, docsConferir, docsExcluirDefinitivo, docsAvaliadorVer,
  ROTAS_AVALIADOR, avaliadorPodeRota,
  permissionsFor, ROLES, DEFAULT_ROLE, parseRole, parseTrustProxy };

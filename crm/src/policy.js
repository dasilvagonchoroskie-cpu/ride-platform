'use strict';

// Regras de perfil. Perfil ausente ou inválido NUNCA pode resultar em administrador.
const ROLES = ['admin', 'gestor'];
const DEFAULT_ROLE = 'gestor';

// Retorna { role } quando válido (ou omitido → perfil de menor privilégio) e { error } caso contrário.
function parseRole(value) {
  if (value === undefined || value === null || value === '') return { role: DEFAULT_ROLE };
  if (typeof value === 'string' && ROLES.includes(value)) return { role: value };
  return { error: 'Perfil inválido. Use "admin" ou "gestor".' };
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
  return role === 'admin' || GESTOR_DELETABLE.has(entityKey);
}

function permissionsFor(role, entityKeys) {
  return {
    exportar: role === 'admin',
    excluir_financeiro: role === 'admin',
    ver_atividade: role === 'admin',
    excluir: entityKeys.filter((k) => canDelete(role, k))
  };
}

module.exports = {
  canDelete,
  permissionsFor, ROLES, DEFAULT_ROLE, parseRole, parseTrustProxy };

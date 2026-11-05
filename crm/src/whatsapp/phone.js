'use strict';

const onlyDigits = (value) => String(value === null || value === undefined ? '' : value).replace(/\D/g, '');

// Número "de WhatsApp" a partir do que o usuário digitou: só dígitos com DDI.
// Com 10 ou 11 dígitos (sem DDI) assume Brasil (55). Use apenas para números digitados por pessoas.
function toWaPhone(value) {
  let d = onlyDigits(value).replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d;
}

// Chave para comparar números do Brasil mesmo com ou sem o "9" extra: DDD + últimos 8 dígitos.
function keyFromFull(full) {
  const d = onlyDigits(full);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d.slice(2, 4) + d.slice(-8);
  return d;
}

// Número que veio do WhatsApp (já tem DDI): não se acrescenta nada.
const waKey = (digits) => keyFromFull(digits);

// Número digitado no CRM (pode estar sem DDI, com máscara etc.).
const crmKey = (value) => keyFromFull(toWaPhone(value));

function isValidWaPhone(value) {
  const d = toWaPhone(value);
  return d.length >= 11 && d.length <= 15;
}

function displayPhone(digits) {
  const d = onlyDigits(digits);
  if (!d) return '';
  if (d.startsWith('55') && d.length === 13) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.startsWith('55') && d.length === 12) return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
  return `+${d}`;
}

module.exports = { onlyDigits, toWaPhone, keyFromFull, waKey, crmKey, isValidWaPhone, displayPhone };

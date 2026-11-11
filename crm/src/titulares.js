'use strict';
// Utilitários de pessoas/empresas (Etapa 2): chave de telefone para localizar duplicados e nome normalizado.
// O telefone NUNCA é identificador: serve só para encontrar possíveis repetições.
const { toWaPhone, keyFromFull } = require('./whatsapp/phone');

/** DDD + 8 últimos dígitos (igual com ou sem o 9 extra e com ou sem o 55). null se o número for curto demais. */
function chaveTelefone(v) {
  const k = keyFromFull(toWaPhone(v));
  return k && k.length >= 10 ? k : null;
}

/** Nome para comparar: sem acento, minúsculo, sem pontuação e espaços repetidos. */
const nomeNormal = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Só os 4 últimos dígitos (relatórios mostram o mínimo do dado pessoal). */
const finalTelefone = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 4 ? `…${d.slice(-4)}` : ''; };

const FUNCOES = {
  motorista: { tabela: 'motoristas', titular: 'pessoa', rotulo: 'Motorista' },
  entregador: { tabela: 'entregadores', titular: 'pessoa', rotulo: 'Entregador / motoqueiro' },
  passageiro: { tabela: 'passageiros', titular: 'pessoa', rotulo: 'Passageiro' },
  parceiro_clube: { tabela: 'parceiros', titular: 'empresa', rotulo: 'Parceiro do Clube de Vantagens' },
  comercio: { tabela: 'comercios', titular: 'empresa', rotulo: 'Comércio parceiro' }
};

module.exports = { chaveTelefone, nomeNormal, finalTelefone, FUNCOES };

'use strict';
// Relatório de POSSÍVEIS cadastros duplicados — somente leitura (só SELECT; nunca altera nada).
// Funciona antes e depois das migrações da Etapa 2. Mostra o mínimo de dado pessoal: nome, módulo, situação e só os
// 4 últimos dígitos do telefone.
const { chaveTelefone, nomeNormal, finalTelefone } = require('./titulares');

const FONTES = [
  { modulo: 'motoristas', rotulo: 'Motorista', sql: 'SELECT id, nome, telefone, situacao FROM motoristas' },
  { modulo: 'passageiros', rotulo: 'Passageiro', sql: 'SELECT id, nome, telefone, situacao FROM passageiros' },
  { modulo: 'parceiros', rotulo: 'Parceiro do Clube', sql: 'SELECT id, nome_estabelecimento AS nome, telefone, situacao FROM parceiros' },
  { modulo: 'entregadores', rotulo: 'Entregador', sql: 'SELECT id, nome, telefone, situacao FROM entregadores' },
  { modulo: 'comercios', rotulo: 'Comércio', sql: 'SELECT id, nome_estabelecimento AS nome, telefone, situacao FROM comercios' }
];

function relatorioDuplicados(db) {
  const existe = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
  const registros = [];
  for (const f of FONTES) {
    if (!existe(f.modulo)) continue;
    for (const r of db.prepare(f.sql).all()) {
      registros.push({ modulo: f.modulo, rotulo: f.rotulo, id: r.id, nome: r.nome || '', situacao: r.situacao || '', chave: chaveTelefone(r.telefone), nn: nomeNormal(r.nome), tel: r.telefone });
    }
  }
  const grupos = [];
  const porTel = new Map();
  for (const r of registros) if (r.chave) { if (!porTel.has(r.chave)) porTel.set(r.chave, []); porTel.get(r.chave).push(r); }
  for (const lista of porTel.values()) {
    if (lista.length < 2) continue;
    const nomes = new Set(lista.map((r) => r.nn));
    const modulos = lista.map((r) => r.modulo);
    grupos.push({
      motivo: 'mesmo_telefone',
      telefone_final: finalTelefone(lista[0].tel),
      mesmo_nome: nomes.size === 1,
      mesma_funcao: new Set(modulos).size < modulos.length,
      // O que a migração faria: une só mesmo telefone + mesmo nome em funções diferentes; o resto fica para decisão manual.
      unido_automaticamente: nomes.size === 1 && new Set(modulos).size === modulos.length && !modulos.includes('parceiros') && !modulos.includes('comercios'),
      registros: lista.map((r) => ({ modulo: r.modulo, rotulo: r.rotulo, id: r.id, nome: r.nome, situacao: r.situacao }))
    });
  }
  // Mesmo nome com telefones diferentes (ou sem telefone) dentro da mesma função: pode ser o mesmo cadastro digitado duas vezes.
  const porNome = new Map();
  for (const r of registros) if (r.nn && r.nn.length >= 5) { const k = `${r.modulo}|${r.nn}`; if (!porNome.has(k)) porNome.set(k, []); porNome.get(k).push(r); }
  for (const lista of porNome.values()) {
    if (lista.length < 2 || new Set(lista.map((r) => r.chave)).size === 1) continue;
    grupos.push({ motivo: 'mesmo_nome', telefone_final: '', mesmo_nome: true, mesma_funcao: true, unido_automaticamente: false,
      registros: lista.map((r) => ({ modulo: r.modulo, rotulo: r.rotulo, id: r.id, nome: r.nome, situacao: r.situacao })) });
  }
  return { gerado_em: new Date().toISOString(), total_registros: registros.length, total_grupos: grupos.length, grupos };
}

module.exports = { relatorioDuplicados };

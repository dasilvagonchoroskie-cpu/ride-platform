'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRole, parseTrustProxy, canDelete, permissionsFor, canExportPdf } = require('../src/policy');

test('perfil ausente vira gestor, nunca admin', () => {
  assert.deepEqual(parseRole(undefined), { role: 'gestor' });
  assert.deepEqual(parseRole(''), { role: 'gestor' });
  assert.deepEqual(parseRole(null), { role: 'gestor' });
});

test('perfis válidos são aceitos e inválidos são rejeitados', () => {
  assert.deepEqual(parseRole('admin'), { role: 'admin' });
  assert.deepEqual(parseRole('gestor'), { role: 'gestor' });
  for (const bad of ['Admin', 'gerente', 'root', 1, true, {}, ['admin']]) {
    assert.ok(parseRole(bad).error, `deveria rejeitar ${JSON.stringify(bad)}`);
    assert.equal(parseRole(bad).role, undefined);
  }
});

test('parseTrustProxy: padrão loopback, números, booleanos e sub-redes', () => {
  assert.equal(parseTrustProxy(undefined), 'loopback');
  assert.equal(parseTrustProxy(''), 'loopback');
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy('false'), false);
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy('10.0.0.0/8'), '10.0.0.0/8');
});

test('gestor só exclui tarefas; admin exclui tudo', () => {
  assert.equal(canDelete('admin', 'motoristas'), true);
  assert.equal(canDelete('gestor', 'motoristas'), false);
  assert.equal(canDelete('gestor', 'passageiros'), false);
  assert.equal(canDelete('gestor', 'tarefas'), true);
  assert.equal(canDelete('qualquer', 'motoristas'), false);
});

test('permissionsFor reflete o perfil', () => {
  const keys = ['motoristas', 'tarefas'];
  const a = permissionsFor('admin', keys);
  assert.deepEqual({ ...a, exportar_pdf: [...a.exportar_pdf].sort() }, { exportar: true, excluir_financeiro: true, ver_atividade: true, excluir: keys, exportar_pdf: ['campanhas', 'cenario', 'financeiro', 'motoristas', 'resumo', 'tarefas'] });
  // Gestor: PDF só dos setores sem lista de pessoas (tarefas, marketing, financeiro, resumo); CSV continua só do admin.
  const g = permissionsFor('gestor', keys);
  assert.deepEqual({ ...g, exportar_pdf: [...g.exportar_pdf].sort() }, { exportar: false, excluir_financeiro: false, ver_atividade: false, excluir: ['tarefas'], exportar_pdf: ['campanhas', 'cenario', 'financeiro', 'resumo', 'tarefas'] });
  assert.equal(canExportPdf('gestor', 'motoristas'), false);
  assert.equal(canExportPdf('gestor', 'atendimentos'), false);
  assert.equal(canExportPdf('admin', 'motoristas'), true);
});

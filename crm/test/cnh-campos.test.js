'use strict';
// Ficha do motorista: 1ª habilitação e validade da CNH lidas do documento (13/11/2026, pedido do dono). Dados fictícios.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const D = require('../src/ia/documentos');

const CNH = 'Tipo: CNH digital\nNome: FULANO DE TESTE\nCPF: 123.456.789-09\nData de nascimento: 05-10-1985\nCategoria da CNH: AB\n'
  + 'Validade: 12/03/2030\nPrimeira habilitação: 20.06.2004\nNúmero do registro: 12345678901\nCidade/UF: Fortaleza/CE';
const msg = (t) => ({ direcao: 'in', texto: `[documento] 📎 ${t}` });

test('máscara de números não destrói datas, mas continua mascarando CPF e registro', () => {
  const m = D.mascararNumeros(CNH);
  assert.match(m, /Validade: 12\/03\/2030/);
  assert.match(m, /Data de nascimento: 05-10-1985/);
  assert.match(m, /Primeira habilitação: 20\.06\.2004/);
  assert.match(m, /CPF: \*\*\*\.\*\*\*\.\*\*\*-09/);
  assert.ok(!m.includes('12345678901'), 'registro da CNH não pode ficar aberto no texto guardado');
  assert.ok(!m.includes('123.456.789'), 'CPF não pode ficar aberto');
  // data colada em número longo: a data sobrevive e o número é mascarado
  const colado = D.mascararNumeros('Validade: 05-10-2030 registro 12345678901');
  assert.match(colado, /05-10-2030/);
  assert.ok(!colado.includes('12345678901'));
});

test('extrai categoria, 1ª habilitação e validade da CNH lida (datas viram AAAA-MM-DD)', () => {
  const r = D.extrairDadosDocumentos([msg(D.mascararNumeros(CNH))]);
  assert.equal(r.cnh_categoria, 'AB');
  assert.equal(r.cnh_primeira_habilitacao, '2004-06-20');
  assert.equal(r.cnh_validade, '2030-03-12');
  assert.equal(r.cnh_registro, undefined, 'o número do registro não vai para o cadastro');
  const alt = D.extrairDadosDocumentos([msg('Tipo: CNH\nCat. Hab.: B\nValidade da CNH: 01/01/2031')]);
  assert.equal(alt.cnh_categoria, 'B');
  assert.equal(alt.cnh_validade, '2031-01-01');
});

test('validade de outro documento (não CNH) não entra; data impossível é descartada', () => {
  const crlv = D.extrairDadosDocumentos([msg('Tipo: CRLV\nPlaca: ABC1D23\nValidade: 01/01/2031')]);
  assert.equal(crlv.cnh_validade, undefined);
  const ruim = D.extrairDadosDocumentos([msg('Tipo: CNH\nValidade: 31/02/2030\nPrimeira habilitação: 99/99/9999')]);
  assert.equal(ruim.cnh_validade, undefined);
  assert.equal(ruim.cnh_primeira_habilitacao, undefined);
  assert.equal(D.dataISO('31/02/2030'), null);
  assert.equal(D.dataISO('2030-03-12'), '2030-03-12');
});

test('motorista e entregador têm os campos novos e a IA pode preenchê-los', () => {
  process.env.FM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-cnh-'));
  process.env.FM_ETAPA2 = '1';
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}`)) delete require.cache[k];
  const { db } = require('../src/db');
  const { ENTITIES, validate } = require('../src/entities');
  const P = require('../src/ia/prompt');
  for (const tipo of ['motoristas', 'entregadores']) {
    const def = ENTITIES[tipo];
    const chaves = def.fields.map((f) => f.key);
    assert.ok(chaves.includes('cnh_primeira_habilitacao') && chaves.includes('cnh_validade'), tipo);
    assert.ok(P.CAMPOS_IA[tipo].includes('cnh_validade') && P.CAMPOS_IA[tipo].includes('cnh_primeira_habilitacao'), tipo);
    const colunas = db.prepare(`PRAGMA table_info(${def.table})`).all().map((c) => c.name);
    assert.ok(colunas.includes('cnh_validade') && colunas.includes('cnh_primeira_habilitacao'), `coluna criada em ${tipo}`);
  }
  const def = ENTITIES.motoristas;
  const ok = validate(def, { nome: 'Fictício', telefone: '85999990000', cidade: 'Fortaleza', data_primeiro_contato: '2026-11-13', origem: 'WhatsApp', situacao: 'Novo interessado', cnh_validade: '2030-03-12' }, {});
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.values.cnh_validade, '2030-03-12');
  const ruim = validate(def, { nome: 'Fictício', telefone: '85999990000', cidade: 'Fortaleza', data_primeiro_contato: '2026-11-13', origem: 'WhatsApp', situacao: 'Novo interessado', cnh_validade: 'ontem' }, {});
  assert.ok(ruim.errors.cnh_validade);
});

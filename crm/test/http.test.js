'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { sendCsv, clientIp, isSecure } = require('../src/http');

function csv(header, rows, filename = 'x.csv') {
  const headers = {};
  const res = { setHeader(k, v) { headers[k] = v; }, send(body) { this.body = body; } };
  sendCsv(res, filename, header, rows);
  return { headers, body: res.body.replace(/^\uFEFF/, '') };
}

test('CSV neutraliza fórmulas e preserva escape de aspas e separadores', () => {
  const { headers, body } = csv(['Nome', 'Observação'], [['=1+1', 'texto; com "aspas"']], 'teste;inseguro.csv');
  assert.equal(headers['Content-Disposition'], 'attachment; filename="teste_inseguro.csv"');
  assert.match(body, /'=1\+1/);
  assert.match(body, /"texto; com ""aspas"""/);
});

test('CSV neutraliza @, TAB, CR e fórmulas precedidas de espaço', () => {
  const { body } = csv(['a'], [['@SOMA(A1)'], ['\t=cmd'], ['  =1+1'], ['-2+3+cmd|calc']]);
  const lines = body.trim().split('\r\n').slice(1);
  assert.equal(lines[0], "'@SOMA(A1)");
  assert.ok(lines[1].startsWith("'"));
  assert.equal(lines[2], "'  =1+1");
  assert.equal(lines[3], "'-2+3+cmd|calc");
});

test('CSV: números negativos continuam números (prejuízo não vira texto)', () => {
  const { body } = csv(['Resultado', 'Receita'], [[-1500.5, 2300.25], [0, -3]]);
  const lines = body.trim().split('\r\n');
  assert.equal(lines[1], '-1500,5;2300,25');
  assert.equal(lines[2], '0;-3');
  assert.ok(!body.includes("'-"));
});

test('CSV: telefone internacional não ganha apóstrofo, mas texto com letras sim', () => {
  const { body } = csv(['Telefone'], [['+55 (85) 99999-9999'], ['+cmd|x'], ['=+55']]);
  const lines = body.trim().split('\r\n');
  assert.equal(lines[1], '+55 (85) 99999-9999');
  assert.equal(lines[2], "'+cmd|x");
  assert.equal(lines[3], "'=+55");
});

test('CSV: valores nulos, indefinidos e números inválidos saem vazios', () => {
  const { body } = csv(['a', 'b', 'c'], [[null, undefined, NaN]]);
  assert.equal(body.trim().split('\r\n')[1], ';;');
});

test('clientIp usa req.ip e ignora X-Forwarded-For forjado', () => {
  const req = { ip: '203.0.113.9', headers: { 'x-forwarded-for': '1.2.3.4' }, socket: { remoteAddress: '10.0.0.1' } };
  assert.equal(clientIp(req), '203.0.113.9');
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '10.0.0.1' } }), '10.0.0.1');
});

test('isSecure não confia no cabeçalho X-Forwarded-Proto diretamente', () => {
  delete process.env.COOKIE_SECURE;
  assert.equal(isSecure({ secure: false, headers: { 'x-forwarded-proto': 'https' } }), false);
  assert.equal(isSecure({ secure: true, headers: {} }), true);
  process.env.COOKIE_SECURE = 'true';
  assert.equal(isSecure({ secure: false, headers: {} }), true);
  delete process.env.COOKIE_SECURE;
});

test('localDate converte UTC para o dia de Fortaleza (UTC-3)', () => {
  const { localDate } = require('../src/http');
  assert.equal(localDate('2026-11-04T01:30:00.000Z'), '2026-11-03'); // 22h30 do dia 03 em Fortaleza
  assert.equal(localDate('2026-11-03T12:00:00.000Z'), '2026-11-03');
  assert.equal(localDate('2026-12-01T02:59:59.000Z'), '2026-11-30');
  assert.equal(localDate('2026-12-01T03:00:00.000Z'), '2026-12-01');
  assert.equal(localDate('lixo'), '');
});

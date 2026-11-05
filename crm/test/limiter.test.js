'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createLimiter } = require('../src/limiter');

test('bloqueia após o máximo de falhas e libera quando a janela expira', () => {
  let t = 1000;
  const l = createLimiter({ max: 3, windowMs: 60000, now: () => t });
  assert.equal(l.isBlocked('a'), false);
  l.fail('a'); l.fail('a');
  assert.equal(l.isBlocked('a'), false);
  l.fail('a');
  assert.equal(l.isBlocked('a'), true);
  assert.equal(l.isBlocked('b'), false, 'chaves são independentes');
  t += 60001;
  assert.equal(l.isBlocked('a'), false);
});

test('clear remove o bloqueio', () => {
  const l = createLimiter({ max: 1, windowMs: 60000 });
  l.fail('x');
  assert.equal(l.isBlocked('x'), true);
  l.clear('x');
  assert.equal(l.isBlocked('x'), false);
});

test('não cresce além de maxKeys', () => {
  const l = createLimiter({ max: 5, windowMs: 60000, maxKeys: 50 });
  for (let i = 0; i < 500; i += 1) l.fail(`k${i}`);
  assert.ok(l.size() <= 51, `tamanho ${l.size()}`);
});

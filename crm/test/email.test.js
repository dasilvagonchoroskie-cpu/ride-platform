'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');

// Roda num processo separado para controlar as variáveis de ambiente e o fetch.
function rodar(env, codigo) {
  const out = execFileSync(process.execPath, ['-e', `
    const pedidos = [];
    global.fetch = async (url, o) => { pedidos.push({ url, headers: o.headers, corpo: JSON.parse(o.body) }); return { ok: true, text: async () => '' }; };
    const email = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'email'))});
    (async () => { ${codigo} })().then((r) => console.log(JSON.stringify({ r, pedidos })), (e) => console.log(JSON.stringify({ erro: e.code, pedidos })));
  `], { env: { PATH: process.env.PATH, ...env } }).toString();
  return JSON.parse(out.trim());
}

test('sem chave: envio recusado com sem_email; arquivo de teste não vale em produção', () => {
  assert.equal(rodar({}, 'return email.enviarEmail({ para: "a@x.com", assunto: "a", texto: "b" });').erro, 'sem_email');
  assert.equal(rodar({ NODE_ENV: 'production', EMAIL_TESTE_ARQUIVO: '/tmp/x.jsonl' }, 'return email.configurado();').r, false);
});

test('Resend: Bearer no cabeçalho, remetente padrão, assunto sem quebra de linha', () => {
  const { pedidos } = rodar({ RESEND_API_KEY: 're_teste' }, 'return email.enviarEmail({ para: "dono@x.com", assunto: "Linha1\\nBcc: x@y.com", texto: "oi" });');
  assert.equal(pedidos[0].url, 'https://api.resend.com/emails');
  assert.equal(pedidos[0].headers.authorization, 'Bearer re_teste');
  assert.deepEqual(pedidos[0].corpo.to, ['dono@x.com']);
  assert.equal(pedidos[0].corpo.subject, 'Linha1 Bcc: x@y.com');
  assert.match(pedidos[0].corpo.from, /onboarding@resend\.dev/);
});

test('Brevo: api-key no cabeçalho e remetente separado em nome/e-mail', () => {
  const { pedidos } = rodar({ BREVO_API_KEY: 'xkeysib', EMAIL_FROM: 'CRM <crm@x.com>' }, 'return email.enviarEmail({ para: "dono@x.com", assunto: "a", texto: "b" });');
  assert.equal(pedidos[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(pedidos[0].headers['api-key'], 'xkeysib');
  assert.deepEqual(pedidos[0].corpo.sender, { name: 'CRM', email: 'crm@x.com' });
  assert.deepEqual(pedidos[0].corpo.to, [{ email: 'dono@x.com' }]);
});

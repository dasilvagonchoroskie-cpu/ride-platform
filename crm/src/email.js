'use strict';
// Envio de e-mail por API HTTPS (o Render grátis bloqueia as portas SMTP 25/465/587).
// Provedores com plano grátis sem cartão:
//   - Resend (RESEND_API_KEY): sem domínio próprio, só entrega no e-mail da conta Resend (suficiente para uso pessoal).
//   - Brevo  (BREVO_API_KEY + EMAIL_FROM com remetente verificado): entrega para qualquer endereço.
// A chave nunca vai para log, banco ou resposta. Sem chave configurada, o envio falha com code 'sem_email'.

const TIMEOUT_MS = 15000;
let envioTeste = null; // testes injetam um envio falso

// Só em testes (nunca em produção): grava as mensagens num arquivo em vez de enviar.
const arquivoTeste = () => (process.env.NODE_ENV !== 'production' && process.env.EMAIL_TESTE_ARQUIVO) || '';

function provedor() {
  if (envioTeste) return 'teste';
  if (arquivoTeste()) return 'arquivo';
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.BREVO_API_KEY) return 'brevo';
  return null;
}

const configurado = () => !!provedor();

function remetente() {
  const from = String(process.env.EMAIL_FROM || '').trim();
  if (from) return from;
  return 'CRM Fortaleza Move <onboarding@resend.dev>';
}

function separarRemetente(from) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1] || 'CRM Fortaleza Move', email: m[2] } : { name: 'CRM Fortaleza Move', email: from };
}

async function postar(url, headers, corpo) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(corpo), signal: ctrl.signal });
    if (!r.ok) {
      const txt = (await r.text().catch(() => '')).slice(0, 300);
      throw Object.assign(new Error(`envio recusado (${r.status}) ${txt}`), { code: 'envio_falhou', status: r.status });
    }
    return true;
  } catch (err) {
    if (err.code) throw err;
    throw Object.assign(new Error(`falha de conexão: ${err.name === 'AbortError' ? 'tempo esgotado' : err.message}`), { code: 'envio_falhou' });
  } finally { clearTimeout(t); }
}

async function enviarEmail({ para, assunto, texto }) {
  const p = provedor();
  if (!p) throw Object.assign(new Error('envio de e-mail não configurado'), { code: 'sem_email' });
  const destino = String(para || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(destino)) throw Object.assign(new Error('destinatário inválido'), { code: 'envio_falhou' });
  const assuntoLimpo = String(assunto || '').replace(/[\r\n]+/g, ' ').slice(0, 150);
  const corpo = String(texto || '');
  if (p === 'teste') return envioTeste({ para: destino, assunto: assuntoLimpo, texto: corpo });
  if (p === 'arquivo') { require('fs').appendFileSync(arquivoTeste(), JSON.stringify({ para: destino, assunto: assuntoLimpo, texto: corpo }) + '\n'); return true; }
  if (p === 'resend') {
    return postar('https://api.resend.com/emails', { authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      { from: remetente(), to: [destino], subject: assuntoLimpo, text: corpo });
  }
  return postar('https://api.brevo.com/v3/smtp/email', { 'api-key': process.env.BREVO_API_KEY, accept: 'application/json' },
    { sender: separarRemetente(remetente()), to: [{ email: destino }], subject: assuntoLimpo, textContent: corpo });
}

function _definirEnvioTeste(fn) { envioTeste = fn; }

module.exports = { enviarEmail, configurado, provedor, _definirEnvioTeste };

'use strict';

const express = require('express');
const path = require('path');
const { db } = require('./src/db');
const { buildRouter, wa } = require('./src/routes');
const auth = require('./src/auth');
const { parseTrustProxy } = require('./src/policy');

const app = express();
app.disable('x-powered-by');
// Só confia em X-Forwarded-* de proxy confiável. Padrão "loopback" (proxy na mesma máquina).
// Atrás de proxy em outro host/container, defina TRUST_PROXY (ex.: 1, ou o IP/sub-rede do proxy).
// Sem proxy nenhum, use TRUST_PROXY=false.
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
app.locals.db = db;

// Corpo bruto guardado SÓ para a integração assinada (a assinatura HMAC é conferida sobre os bytes exatos recebidos).
app.use(express.json({ limit: '1mb' }));
// Bloqueia chamadas de escrita originadas em outros sites (proteção CSRF adicional).
app.use('/api', (req, res, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite === 'cross-site') {
    return res.status(403).json({ error: { code: 'cross_site_blocked', message: 'Requisição externa bloqueada.' } });
  }
  if (origin) {
    try {
      const parsed = new URL(origin);
      const expectedProtocol = req.protocol; // respeita "trust proxy"
      if (parsed.host !== req.get('host') || parsed.protocol !== `${expectedProtocol}:`) {
        return res.status(403).json({ error: { code: 'origin_blocked', message: 'Origem da requisição não autorizada.' } });
      }
    } catch {
      return res.status(403).json({ error: { code: 'origin_invalid', message: 'Origem da requisição inválida.' } });
    }
  }
  next();
});
app.use((req, res, next) => {
  // Respostas da API trazem dados pessoais: nunca devem ficar em cache de navegador ou proxy.
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // CSP: só scripts do próprio site (sem handlers inline). Estilos inline continuam permitidos porque a interface os usa.
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:",
    "font-src 'self' data:", "connect-src 'self'", "manifest-src 'self'", "worker-src 'self'",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"
  ].join('; '));
  // HSTS só faz sentido (e só é aceito pelo navegador) em conexão HTTPS.
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

const PUBLIC_DIR = path.join(__dirname, 'public');
// Digital Asset Links: prova que o app Android (Trusted Web Activity) é do próprio CRM. Sem isso o Chrome mostra a barra
// de endereço e não entrega as notificações ao app. Pacote e impressão digital da assinatura (públicos) por variável.
const TWA_PACOTE = process.env.TWA_PACOTE || 'br.com.fortalezamove.crm_fortaleza_move';
const TWA_SHA256 = (process.env.TWA_SHA256 || '3B:61:62:6A:0C:29:50:A1:E1:BA:DF:A5:7A:8F:72:BB:8F:16:DC:30:BC:4C:DD:66:FC:36:84:B0:ED:94:1C:99')
  .split(',').map((x) => x.trim()).filter(Boolean);
app.get('/.well-known/assetlinks.json', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: TWA_PACOTE, sha256_cert_fingerprints: TWA_SHA256 }
  }]);
});

app.use(express.static(PUBLIC_DIR, {
  extensions: ['html'],
  setHeaders(res, filePath) {
    if (/sw\.js$|index\.html$|manifest\.webmanifest$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (/\.(js|css|html)$/.test(filePath) || /[\\/]icons[\\/]|favicon\.ico$/.test(filePath)) {
      // Ícones também revalidam (ETag): quando a identidade visual muda, o ícone antigo não fica um dia inteiro no cache.
      // Revalida a cada uso (ETag): uma nova versão chega aos usuários sem esperar o cache expirar.
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    }
  }
}));

app.use('/api', buildRouter());
app.use('/api', (req, res) => res.status(404).json({ error: { code: 'not_found', message: 'Recurso não encontrado.' } }));

app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.use((err, req, res, next) => {
  console.error('[erro]', err && err.stack ? err.stack : err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  const message = status === 400 && err.type === 'entity.parse.failed'
    ? 'Corpo da requisição inválido.'
    : 'Erro interno ao processar a solicitação.';
  res.status(status).json({ error: { code: 'server_error', message } });
});

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Erro inesperado numa tarefa em segundo plano (ex.: conector do WhatsApp) não pode derrubar o CRM inteiro.
process.on('unhandledRejection', (reason) => {
  console.error('[erro não tratado]', reason && reason.stack ? reason.stack : reason);
});

const server = app.listen(PORT, HOST, () => {
  console.log(`CRM Fortaleza Move — http://${HOST}:${PORT}`);
  if (auth.countUsers() === 0) {
    console.log('Primeiro acesso: nenhum administrador cadastrado.');
    console.log(`Chave de instalação: ${auth.installationKey()}`);
    console.log(`Arquivo da chave: ${auth.KEY_PATH}`);
  }
  wa.iniciar().catch((err) => console.error('[whatsapp]', err.message));
});

// Tarefas a cumprir antes de sair (ex.: enviar o último retrato ao cofre). Cada uma tem até 20 s.
const tarefasSaida = [];
function aoEncerrar(fn) { tarefasSaida.push(fn); }

let encerrando = false;
async function shutdown(signal) {
  if (encerrando) return;
  encerrando = true;
  console.log(`Encerrando (${signal})...`);
  await wa.desligar().catch(() => {});
  server.close();
  for (const fn of tarefasSaida) {
    await Promise.race([Promise.resolve().then(fn).catch((e) => console.error('[saída]', e.message)), new Promise((r) => setTimeout(r, 20000))]);
  }
  try { db.close(); } catch (err) { /* ignore */ }
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server, aoEncerrar };

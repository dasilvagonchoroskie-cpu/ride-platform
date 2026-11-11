import { api, ApiError } from './api.js';
import * as ui from './ui.js';
import { renderDashboard } from './views/dashboard.js';
import { renderEntity } from './views/entity.js';
import { renderFinance } from './views/finance.js';
import { renderReports } from './views/reports.js';
import { renderSettings } from './views/settings.js';
import { renderConversas } from './views/whatsapp.js';
import { renderPessoas, renderEmpresas } from './views/pessoas.js';
import { iniciarAvisos, pararAvisos, sincronizarPush } from './notificacoes.js';

const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', title: 'Dashboard', sub: 'Visão geral da operação e do relacionamento' },
  { key: 'motoristas', label: 'Motoristas', icon: 'steering', entity: 'motoristas', title: 'Motoristas', sub: 'Interessados, cadastros e aprovações' },
  { key: 'passageiros', label: 'Passageiros', icon: 'users', entity: 'passageiros', title: 'Passageiros', sub: 'Base de interessados e usuários' },
  { key: 'parceiros', label: 'Parceiros', icon: 'store', entity: 'parceiros', title: 'Parceiros comerciais', sub: 'Clube de Vantagens Fortaleza Move' },
  { key: 'atendimento', label: 'Atendimento', icon: 'headset', entity: 'atendimentos', title: 'Atendimento e relacionamento', sub: 'Dúvidas, solicitações, reclamações e pendências' },
  { key: 'conversas', label: 'Conversas', icon: 'chat', badge: 'wa', title: 'Conversas de WhatsApp', sub: 'Atendimento pelo WhatsApp de suporte' },
  { key: 'marketing', label: 'Marketing', icon: 'megaphone', entity: 'campanhas', title: 'Marketing e divulgação', sub: 'Campanhas, publicações e calendário editorial' },
  { key: 'tarefas', label: 'Tarefas', icon: 'check', entity: 'tarefas', title: 'Tarefas e calendário', sub: 'Central de tarefas da equipe' },
  { key: 'financeiro', label: 'Planejamento financeiro', icon: 'chart', title: 'Planejamento financeiro', sub: 'Simulações de receita e resultado da plataforma' },
  { key: 'relatorios', label: 'Relatórios', icon: 'file', title: 'Relatórios', sub: 'Histórico, filtros por período e exportação' },
  { key: 'configuracoes', label: 'Configurações', icon: 'settings', title: 'Configurações', sub: 'Organização, usuários, segurança e auditoria' },
  // Etapa 2 (só aparece com a Etapa 2 ligada no servidor): ficha central de cada pessoa e as suas funções.
  { key: 'pessoas', label: 'Pessoas', icon: 'users', title: 'Pessoas', sub: 'Ficha central: cada pessoa e as suas funções na Fortaleza Move', etapa2: true },
  { key: 'empresas', label: 'Empresas', icon: 'building', title: 'Empresas', sub: 'Ficha central: cada empresa e as suas funções (Clube de Vantagens, comércio)', etapa2: true }
];

const state = {
  meta: null,
  user: null,
  installEvent: null,
  refreshMeta: async () => {
    try {
      state.meta = await api.get('/meta');
      paintBadges();
    } catch (err) { /* silencioso */ }
  }
};

const app = document.getElementById('app');

/* ------------------------------- sessão -------------------------------- */
async function boot() {
  const params = new URLSearchParams(location.search);
  if (location.pathname.replace(/\/$/, '') === '/reset') {
    renderReset(params.get('token') || '');
    return;
  }
  try {
    const status = await api.get('/auth/status');
    if (status.needsSetup) return renderSetup(status.org);
    if (!status.user) return renderLogin(status.org);
    state.user = status.user;
    await enterApp();
  } catch (err) {
    renderFatal(err);
  }
}

function authShell({ title, subtitle, body, foot = '', sideTitle = 'Gestão completa da sua operação de transporte' }) {
  app.innerHTML = `
    <div class="auth-wrap">
      <section class="auth-side">
        <div class="auth-brand">
          <div class="brand-mark"><img src="/icons/logo.png" alt="Fortaleza Move"></div>
          <div>
            <strong style="display:block;color:#fff;font-size:16px">Fortaleza Move</strong>
            <span style="color:#a9c1dc;font-size:12px">Seu caminho, sua viagem, sua segurança.</span>
          </div>
        </div>
        <div>
          <div class="eyebrow" style="color:#f2b705">CRM Fortaleza Move</div>
          <h2>${ui.esc(sideTitle.split('|')[0])}<br><span>${ui.esc(sideTitle.split('|')[1] || '')}</span></h2>
          <p class="lead">Motoristas, passageiros, parceiros do Clube de Vantagens, atendimento, marketing, tarefas e planejamento financeiro em um só lugar.</p>
          <div class="auth-points">
            <div>${ui.icon('check', 17)}<span>Acompanhe cada etapa do cadastro de motoristas e passageiros.</span></div>
            <div>${ui.icon('store', 17)}<span>Controle negociações de parcerias com confirmação manual.</span></div>
            <div>${ui.icon('chart', 17)}<span>Simule receita da plataforma com três cenários editáveis.</span></div>
          </div>
        </div>
        <footer>Acesso restrito à administração. Dados armazenados no servidor da aplicação.</footer>
      </section>
      <section class="auth-card-wrap">
        <div class="auth-card">
          <h1>${ui.esc(title)}</h1>
          <p class="sub">${ui.esc(subtitle)}</p>
          ${body}
          ${foot}
        </div>
      </section>
    </div>`;
}

function renderLogin(org) {
  authShell({
    title: 'Entrar na conta',
    subtitle: 'Use as credenciais do administrador para acessar o CRM.',
    sideTitle: 'Gestão completa da sua operação|com segurança e organização',
    body: `<form id="login-form" novalidate>
        <div class="form-errors" id="login-error" hidden></div>
        <div class="field">
          <label for="login-email">E-mail</label>
          <input id="login-email" type="email" autocomplete="username" required placeholder="seu@email.com">
        </div>
        <div class="field">
          <label for="login-senha">Senha</label>
          <input id="login-senha" type="password" autocomplete="current-password" required placeholder="Sua senha">
        </div>
        <button class="btn btn-primary" type="submit" id="login-submit">Entrar</button>
        <button class="btn btn-ghost" type="button" id="forgot-link" style="width:100%;margin-top:10px">Esqueci minha senha</button>
      </form>`,
    foot: `
           <div class="auth-note">Nenhum administrador ainda? A tela de configuração inicial aparece automaticamente quando o sistema não possui usuários.</div>`
  });

  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    const button = document.getElementById('login-submit');
    button.disabled = true;
    button.textContent = 'Entrando…';
    try {
      const data = await api.post('/auth/login', {
        email: document.getElementById('login-email').value,
        senha: document.getElementById('login-senha').value
      });
      if (data.precisa_codigo) { renderCodigo(data.desafio, data); return; }
      state.user = data.user;
      await enterApp();
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err.message;
      button.disabled = false;
      button.textContent = 'Entrar';
    }
  });

  document.getElementById('forgot-link').addEventListener('click', (e) => {
    e.preventDefault();
    renderEsqueci(document.getElementById('login-email').value);
  });
}

// "Esqueci minha senha": link de senha nova enviado para o e-mail cadastrado.
function renderEsqueci(emailInicial) {
  authShell({
    title: 'Esqueci minha senha',
    subtitle: 'Enviamos um link para o seu e-mail para você criar uma senha nova.',
    sideTitle: 'Recuperação de acesso|pelo seu e-mail',
    body: `<form id="esq-form" novalidate>
        <div class="form-errors" id="esq-error" hidden></div>
        <div class="field">
          <label for="esq-email">E-mail cadastrado no CRM</label>
          <input id="esq-email" type="email" autocomplete="username" required>
        </div>
        <button class="btn btn-primary" type="submit" id="esq-submit">Enviar link</button>
        <div class="auth-note" id="esq-ok" hidden></div>
      </form>`,
    foot: `<div class="auth-foot"><a href="#" id="esq-codigo">Tenho um código de recuperação</a></div>
           <div class="auth-foot"><a href="/" id="esq-voltar">Voltar para o login</a></div>`
  });
  document.getElementById('esq-email').value = emailInicial || '';
  // Sem envio de e-mail ligado no servidor: explica os outros caminhos em vez de deixar a pessoa sem saída.
  api.get('/auth/status').then((st) => {
    if (st.recuperacao_email) return;
    const ok = document.getElementById('esq-ok');
    ok.hidden = false;
    ok.innerHTML = `<b>O envio de e-mail ainda não está ligado neste CRM.</b> Enquanto isso:<br>
      • tem um código de recuperação? Toque em “Tenho um código de recuperação”, logo abaixo;<br>
      • é gestor? Peça ao administrador para criar uma senha nova para você (Configurações → Usuários → cadeado);<br>
      • é o administrador? Peça ao suporte técnico do CRM o código de recuperação pelo painel do servidor.`;
  }).catch(() => {});
  document.getElementById('esq-voltar').addEventListener('click', (e) => { e.preventDefault(); renderLogin(); });
  document.getElementById('esq-codigo').addEventListener('click', (e) => { e.preventDefault(); renderRecover(document.getElementById('esq-email').value); });
  document.getElementById('esq-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('esq-error');
    const okBox = document.getElementById('esq-ok');
    errorBox.hidden = true;
    const button = document.getElementById('esq-submit');
    button.disabled = true;
    try {
      const r = await api.post('/auth/recover/email', { email: document.getElementById('esq-email').value });
      okBox.hidden = false;
      okBox.textContent = r.mensagem;
      button.textContent = 'Enviado';
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err.message;
      button.disabled = false;
    }
  });
}

// Segunda etapa do login (só em aparelho novo): código do e-mail, do autenticador ou um código de recuperação.
function renderCodigo(desafio, info = {}) {
  const porEmail = info.via === 'email';
  authShell({
    title: porEmail ? 'Confirme que é você' : 'Verificação em duas etapas',
    subtitle: porEmail ? `Este aparelho é novo. Enviamos um código de 6 números para ${info.email || 'o seu e-mail'}.` : 'Digite o código de 6 números do seu aplicativo autenticador.',
    sideTitle: 'Acesso protegido|verificação em duas etapas',
    body: `<form id="codigo-form" novalidate>
        <div class="form-errors" id="codigo-error" hidden></div>
        <div class="field">
          <label for="codigo-2fa">Código</label>
          <input id="codigo-2fa" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="20" required>
          <div class="form-hint">${porEmail ? 'Não chegou? Confira o spam. O código vale 10 minutos.' : 'Sem o celular? Use um dos seus códigos de recuperação (XXXX-XXXX-XXXX).'}</div>
        </div>
        <label class="check-line" style="display:flex;gap:8px;align-items:center;margin:4px 0 12px"><input type="checkbox" id="codigo-lembrar" checked> Lembrar este aparelho (não pedir código de novo nele)</label>
        <button class="btn btn-primary" type="submit" id="codigo-submit">Confirmar</button>
      </form>`,
    foot: '<div class="auth-foot"><a href="/" id="codigo-voltar">Voltar para o login</a></div>'
  });
  document.getElementById('codigo-2fa').focus();
  document.getElementById('codigo-voltar').addEventListener('click', (e) => { e.preventDefault(); renderLogin(); });
  document.getElementById('codigo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('codigo-error');
    errorBox.hidden = true;
    const button = document.getElementById('codigo-submit');
    button.disabled = true;
    try {
      const data = await api.post('/auth/login/codigo', { desafio, codigo: document.getElementById('codigo-2fa').value, lembrar: document.getElementById('codigo-lembrar').checked });
      state.user = data.user;
      await enterApp();
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err.message;
      button.disabled = false;
      if (/acabou/.test(err.message)) setTimeout(renderLogin, 1500);
    }
  });
}

// Recuperação pelo próprio usuário: e-mail + um dos códigos de recuperação gerados em Configurações.
function renderRecover(emailInicial) {
  authShell({
    title: 'Recuperar acesso',
    subtitle: 'Use um dos seus códigos de recuperação.',
    sideTitle: 'Recuperação de acesso|defina uma nova senha',
    body: `<form id="recover-form" novalidate>
        <div class="form-errors" id="recover-error" hidden></div>
        <div class="field">
          <label for="rec-email">E-mail</label>
          <input id="rec-email" type="email" autocomplete="username" required>
        </div>
        <div class="field">
          <label for="rec-codigo">Código de recuperação</label>
          <input id="rec-codigo" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX" required>
          <div class="form-hint">Um dos códigos que você gerou e guardou em Configurações &gt; Códigos de recuperação. Cada código vale uma vez.</div>
        </div>
        <div class="field">
          <label for="rec-senha">Nova senha</label>
          <input id="rec-senha" type="password" autocomplete="new-password" required>
          <div class="form-hint">Mínimo de 10 caracteres, com letras e números.</div>
        </div>
        <div class="field">
          <label for="rec-senha2">Confirmar nova senha</label>
          <input id="rec-senha2" type="password" autocomplete="new-password" required>
        </div>
        <button class="btn btn-primary" type="submit" id="rec-submit">Redefinir senha</button>
      </form>`,
    foot: `<div class="auth-note">Sem código? Um <b>gestor</b> pode pedir ao administrador para definir uma senha nova (Configurações &gt; Usuários).
             O administrador sem código pode pedir ao responsável pelo servidor um código temporário: <a href="#" id="rec-servidor">tenho um código do servidor</a>.</div>
           <div class="auth-foot"><a href="/" id="rec-voltar">Voltar para o login</a></div>`
  });
  document.getElementById('rec-email').value = emailInicial || '';
  document.getElementById('rec-voltar').addEventListener('click', (e) => { e.preventDefault(); renderLogin(); });
  document.getElementById('rec-servidor').addEventListener('click', (e) => {
    e.preventDefault();
    history.replaceState(null, '', '/reset');
    renderReset('');
  });
  document.getElementById('recover-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('recover-error');
    errorBox.hidden = true;
    const senha = document.getElementById('rec-senha').value;
    if (senha !== document.getElementById('rec-senha2').value) {
      errorBox.hidden = false;
      errorBox.textContent = 'As senhas não coincidem.';
      return;
    }
    const button = document.getElementById('rec-submit');
    button.disabled = true;
    try {
      const r = await api.post('/auth/recover', {
        email: document.getElementById('rec-email').value,
        codigo: document.getElementById('rec-codigo').value,
        senha
      });
      ui.toast(`Senha redefinida. Entre com a nova senha. Restam ${r.restantes} código(s) de recuperação.`, 'success');
      renderLogin();
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err.message;
      button.disabled = false;
    }
  });
}

function renderSetup(org) {
  authShell({
    title: 'Configuração inicial',
    subtitle: 'Crie o primeiro administrador. Esta tela existe apenas enquanto não houver usuários.',
    sideTitle: 'Primeiro acesso|configure o administrador',
    body: `<form id="setup-form" novalidate>
        <div class="form-errors" id="setup-error" hidden></div>
        <div class="field">
          <label for="setup-key">Chave de instalação<span class="req">*</span></label>
          <input id="setup-key" type="text" placeholder="FM-XXXX-XXXX" autocomplete="off" required>
          <div class="form-hint">Exibida no console do servidor e no arquivo <code>data/installation-key.txt</code>.</div>
        </div>
        <div class="field">
          <label for="setup-nome">Nome do administrador<span class="req">*</span></label>
          <input id="setup-nome" type="text" autocomplete="name" required>
        </div>
        <div class="field">
          <label for="setup-email">E-mail<span class="req">*</span></label>
          <input id="setup-email" type="email" autocomplete="username" required>
        </div>
        <div class="field">
          <label for="setup-senha">Senha<span class="req">*</span></label>
          <input id="setup-senha" type="password" autocomplete="new-password" required>
          <div class="form-hint">Mínimo de 10 caracteres, combinando letras e números.</div>
        </div>
        <div class="field">
          <label for="setup-senha2">Confirmar senha<span class="req">*</span></label>
          <input id="setup-senha2" type="password" autocomplete="new-password" required>
        </div>
        <button class="btn btn-gold" type="submit" id="setup-submit">Criar administrador</button>
      </form>`,
    foot: '<div class="auth-note">As credenciais são definidas por você neste momento. O sistema não possui senha padrão.</div>'
  });

  const form = document.getElementById('setup-form');
  const errorBox = document.getElementById('setup-error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    const senha = document.getElementById('setup-senha').value;
    if (senha !== document.getElementById('setup-senha2').value) {
      errorBox.hidden = false;
      errorBox.textContent = 'As senhas não coincidem.';
      return;
    }
    const button = document.getElementById('setup-submit');
    button.disabled = true;
    try {
      const data = await api.post('/auth/setup', {
        chave: document.getElementById('setup-key').value,
        nome: document.getElementById('setup-nome').value,
        email: document.getElementById('setup-email').value,
        senha
      });
      state.user = data.user;
      await enterApp();
      ui.toast('Administrador criado. Bem-vindo ao CRM Fortaleza Move.', 'success');
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err.message;
      button.disabled = false;
    }
  });
}

function renderReset(initialToken) {
  // O código não deve ficar na barra de endereço/histórico: depois de lido, a URL volta para /reset.
  const token = initialToken || '';
  if (token) history.replaceState(null, '', '/reset');
  authShell({
    title: 'Definir nova senha',
    subtitle: token ? 'Crie sua senha nova.' : 'Código de recuperação de uso único.',
    sideTitle: 'Recuperação de acesso|defina uma nova senha',
    body: `<form id="reset-form" novalidate>
        <div class="form-errors" id="reset-error" hidden></div>
        ${token ? '' : `<div class="field">
          <label for="reset-codigo">Código de recuperação</label>
          <input id="reset-codigo" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" required>
          <div class="form-hint">Código temporário gerado no servidor (comando <code>npm run reset</code> ou variável <code>FM_RESET_EMAIL</code>).</div>
        </div>`}
        <div class="field">
          <label for="reset-senha">Nova senha</label>
          <input id="reset-senha" type="password" autocomplete="new-password" required>
          <div class="form-hint">Mínimo de 10 caracteres, com letras e números.</div>
        </div>
        <div class="field">
          <label for="reset-senha2">Confirmar nova senha</label>
          <input id="reset-senha2" type="password" autocomplete="new-password" required>
        </div>
        <button class="btn btn-primary" type="submit">Redefinir senha</button>
      </form>`,
    foot: '<div class="auth-foot"><a href="/">Voltar para o login</a></div>'
  });

  document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorBox = document.getElementById('reset-error');
    errorBox.hidden = true;
    const senha = document.getElementById('reset-senha').value;
    if (senha !== document.getElementById('reset-senha2').value) {
      errorBox.hidden = false;
      errorBox.textContent = 'As senhas não coincidem.';
      return;
    }
    const codigo = token || (document.getElementById('reset-codigo')?.value || '').trim();
    if (!codigo) {
      errorBox.hidden = false;
      errorBox.textContent = 'Informe o código de recuperação.';
      return;
    }
    try {
      await api.post('/auth/reset', { token: codigo, senha });
      ui.toast('Senha redefinida. Entre com a nova senha.', 'success');
      history.replaceState(null, '', '/');
      renderLogin();
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err.message;
    }
  });
}

/* -------------------------------- shell -------------------------------- */
function navItem(item, pendentes) {
  const chave = item.badge || item.entity;
  const count = chave ? pendentes[chave] : 0;
  return `<button class="nav-item" data-route="${item.key}">
      ${ui.icon(item.icon, 18)}<span>${ui.esc(item.label)}</span>
      ${count ? `<span class="nav-badge">${count}</span>` : ''}
    </button>`;
}

async function enterApp() {
  state.meta = await api.get('/meta');
  state.user = state.meta.user;

  app.innerHTML = `
    <div class="shell" id="shell">
      <aside class="sidebar" id="sidebar">
        <div class="brand">
          <div class="brand-mark"><img src="/icons/logo.png" alt="Fortaleza Move"></div>
          <div class="brand-text">
            <strong>CRM Fortaleza Move</strong>
            <span>${ui.esc(state.meta.org.slogan)}</span>
          </div>
        </div>
        <nav class="nav" id="nav">
          <div class="nav-label">Gestão</div>
          ${NAV.slice(0, 1).map((i) => navItem(i, state.meta.pendentes)).join('')}
          ${state.meta.etapa2 ? ['pessoas', 'empresas'].map((k) => navItem(NAV.find((n) => n.key === k), state.meta.pendentes)).join('') : ''}
          ${NAV.slice(1, 8).map((i) => navItem(i, state.meta.pendentes)).join('')}
          <div class="nav-label">Análise</div>
          ${NAV.slice(8, 10).map((i) => navItem(i, state.meta.pendentes)).join('')}
          <div class="nav-label">Sistema</div>
          ${NAV.slice(10, 11).map((i) => navItem(i, state.meta.pendentes)).join('')}
        </nav>
        <div class="side-foot">
          <button class="btn btn-ghost btn-sm hidden" id="install-btn">${ui.icon('install', 16)} Instalar aplicativo</button>
          <div class="user-chip">
            <div class="avatar">${ui.esc(initials(state.user.nome))}</div>
            <div style="min-width:0">
              <strong>${ui.esc(state.user.nome)}</strong>
              <span>${ui.esc(state.user.email)}</span>
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" data-action="logout">${ui.icon('logout', 16)} Sair da conta</button>
        </div>
      </aside>
      <div class="overlay" data-action="close-menu"></div>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn only-mobile" data-action="toggle-menu" aria-label="Abrir menu">${ui.icon('menu', 18)}</button>
          <div class="page-titles">
            <h1 id="page-title">Dashboard</h1>
            <p id="page-sub"></p>
          </div>
          <div class="top-actions">
            <span class="pill-date">${ui.fmtDate(state.meta.hoje)}</span>
            <div class="avatar" title="${ui.esc(state.user.nome)}">${ui.esc(initials(state.user.nome))}</div>
          </div>
        </header>
        <main class="view" id="view"></main>
        <nav class="bottom-nav" id="bottom-nav">
          ${['dashboard', 'conversas', 'motoristas', 'tarefas', 'configuracoes'].map((key) => {
            const item = NAV.find((n) => n.key === key);
            return `<button class="bn-item" data-route="${key}">${ui.icon(item.icon, 20)}<span>${ui.esc(item.label.split(' ')[0])}</span></button>`;
          }).join('')}
        </nav>
      </div>
    </div>`;

  document.querySelectorAll('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      location.hash = `#/${btn.dataset.route}`;
      document.getElementById('shell').classList.remove('menu-open');
    });
  });
  document.querySelectorAll('[data-action="toggle-menu"]').forEach((b) => b.addEventListener('click', () => document.getElementById('shell').classList.toggle('menu-open')));
  document.querySelectorAll('[data-action="close-menu"]').forEach((b) => b.addEventListener('click', () => document.getElementById('shell').classList.remove('menu-open')));
  document.querySelector('[data-action="logout"]').addEventListener('click', logout);
  document.getElementById('install-btn').addEventListener('click', installApp);

  if (state.installEvent) document.getElementById('install-btn').classList.remove('hidden');

  window.removeEventListener('hashchange', route);
  window.addEventListener('hashchange', route);
  await route();
  iniciarAvisos();
  sincronizarPush();
  // Lembrete só quando dá para ativar a verificação por e-mail (envio configurado) e ela ainda está desligada.
  if (state.user && state.user.role === 'admin') {
    api.get('/auth/2fa').then((st) => {
      if (st.email_configurado && !st.email_ativo && !st.ativo) ui.toast('Dica: ative a verificação por e-mail em Configurações (código só em aparelho novo).', 'info');
    }).catch(() => {});
  }
}

function initials(name) {
  return String(name || 'FM').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

function paintBadges() {
  if (!state.meta) return;
  const pendentes = state.meta.pendentes;
  document.querySelectorAll('.nav-item[data-route]').forEach((btn) => {
    const item = NAV.find((n) => n.key === btn.dataset.route);
    const count = item && item.entity ? pendentes[item.entity] : 0;
    const existing = btn.querySelector('.nav-badge');
    if (existing) existing.remove();
    if (count) btn.insertAdjacentHTML('beforeend', `<span class="nav-badge">${count}</span>`);
  });
}

async function logout() {
  try { await api.post('/auth/logout'); } catch (err) { /* ignore */ }
  pararAvisos();
  state.user = null;
  state.meta = null;
  history.replaceState(null, '', '/');
  renderLogin({ nome: 'Fortaleza Move' });
}

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const key = (path || 'dashboard').split('/')[0];
  const found = NAV.find((n) => n.key === key);
  return { key: found ? found.key : 'dashboard', params: new URLSearchParams(qs || '') };
}

async function route() {
  if (!state.meta) return;
  const { key, params } = parseRoute();
  const item = NAV.find((n) => n.key === key);
  document.getElementById('page-title').textContent = item.title;
  document.getElementById('page-sub').textContent = item.sub;
  document.querySelectorAll('[data-route]').forEach((b) => b.classList.toggle('active', b.dataset.route === key));

  // Cada navegação ganha o seu próprio container: uma resposta lenta de uma tela anterior
  // escreve num container já descartado e não sobrescreve a tela atual.
  const host = document.getElementById('view');
  const view = document.createElement('div');
  host.replaceChildren(view);
  view.innerHTML = '<div class="card" style="padding:40px;text-align:center;color:#8494ab">Carregando…</div>';
  try {
    if (key === 'dashboard') await renderDashboard(view, state);
    else if (key === 'financeiro') await renderFinance(view, state);
    else if (key === 'relatorios') await renderReports(view, state);
    else if (key === 'conversas') await renderConversas(view, state);
    else if (key === 'configuracoes') await renderSettings(view, state);
    else if (key === 'pessoas' && state.meta.etapa2) await renderPessoas(view, state, params);
    else if (key === 'empresas' && state.meta.etapa2) await renderEmpresas(view, state, params);
    else if (key === 'pessoas' || key === 'empresas') location.hash = '#/dashboard';
    else if (item.entity) await renderEntity(view, state, item.entity, params);
    state.refreshMeta();
  } catch (err) {
    if (host.firstChild !== view) return; // o usuário já navegou para outra tela
    if (err instanceof ApiError && err.status === 401) {
      state.user = null;
      renderLogin({ nome: 'Fortaleza Move' });
      return;
    }
    view.innerHTML = `<div class="card"><div class="empty"><div class="empty-icon">${ui.icon('alert', 22)}</div><h4>Não foi possível carregar</h4><p>${ui.esc(err.message)}</p><button class="btn btn-primary" data-reload>Recarregar</button></div></div>`;
    view.querySelector('[data-reload]').addEventListener('click', () => location.reload());
  }
}

function renderFatal(err) {
  app.innerHTML = `<div class="boot"><div class="boot-mark">FM</div><p>Falha ao iniciar: ${ui.esc(err.message)}</p><button class="btn btn-gold" data-reload>Tentar novamente</button></div>`;
  app.querySelector('[data-reload]').addEventListener('click', () => location.reload());
}

/* ------------------------------- instalação ----------------------------- */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  state.installEvent = e;
  const btn = document.getElementById('install-btn');
  if (btn) btn.classList.remove('hidden');
});

async function installApp() {
  if (!state.installEvent) {
    ui.toast('Use o menu do navegador → “Adicionar à tela inicial” para instalar.', 'info');
    return;
  }
  state.installEvent.prompt();
  const choice = await state.installEvent.userChoice;
  if (choice.outcome === 'accepted') ui.toast('Aplicativo instalado na tela inicial.', 'success');
  state.installEvent = null;
  const btn = document.getElementById('install-btn');
  if (btn) btn.classList.add('hidden');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* PWA opcional */ });
  });
}

boot();

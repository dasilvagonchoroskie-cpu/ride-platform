import { api } from '../api.js';
import * as ui from '../ui.js';
import * as notif from '../notificacoes.js';

export async function renderSettings(view, state) {
  const isAdmin = state.user.role === 'admin';
  // /settings, /usuários e /audit são exclusivos de administradores (403 para gestor). Pedir tudo de uma vez
  // fazia a tela inteira falhar para o gestor, que então nem conseguia trocar a própria senha.
  const [cfg, sessions, audit] = await Promise.all([
    isAdmin ? api.get('/settings') : Promise.resolve(null),
    api.get('/auth/sessions'),
    isAdmin ? api.get('/audit?limit=60') : Promise.resolve(null)
  ]);

  view.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">Configurações</div>
        <h2>Sistema e segurança</h2>
        <p class="sub">${isAdmin ? 'Organização, usuários, senha, sessões e trilha de auditoria' : 'Sua senha e as sessões da sua conta'}</p>
      </div>
    </div>

    <div class="settings-grid">
      ${isAdmin ? `<div class="stack">
        <div class="card">
          <div class="card-head"><div><h3>Dados da organização</h3><p class="sub">Aplicados ao cabeçalho e aos relatórios</p></div></div>
          <div class="card-body">
            <div class="form-grid">
              <div class="field"><label for="cfg-nome">Nome da organização</label><input id="cfg-nome" type="text" value="${ui.esc(cfg.settings.org_nome)}" maxlength="80"></div>
              <div class="field"><label for="cfg-alerta">Janela de alerta de tarefas (dias)</label><input id="cfg-alerta" type="number" min="0" max="90" value="${cfg.settings.alerta_dias}"></div>
              <div class="field full"><label for="cfg-slogan">Slogan</label><input id="cfg-slogan" type="text" value="${ui.esc(cfg.settings.slogan)}" maxlength="160"></div>
              <div class="field"><label for="cfg-comissao">Comissão padrão (%)</label><input id="cfg-comissao" type="number" min="0" max="100" step="0.5" value="${cfg.settings.comissao_padrao}"></div>
            </div>
            <div class="row" style="justify-content:flex-end;margin-top:14px">
              <button class="btn btn-primary" id="cfg-save">${ui.icon('save', 15)} Salvar configurações</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div><h3>Usuários com acesso</h3><p class="sub">Administradores gerenciam usuários; gestores operam os módulos</p></div>
            <button class="btn btn-sm btn-soft" id="user-new">${ui.icon('plus', 14)} Novo usuário</button>
          </div>
          <div class="card-body" style="padding-top:10px">
            ${ui.tableHtml({
              columns: [
                { label: 'Usuário', render: (u) => `<b>${ui.esc(u.nome)}</b><span class="sub">${ui.esc(u.email)}</span>` },
                { label: 'Perfil', render: (u) => ui.badge(u.role === 'admin' ? 'Administrador' : (u.role === 'avaliador' ? 'Avaliador de cadastros' : 'Gestor'), u.role === 'admin' ? 'info' : 'neutral') },
                { label: 'Situação', render: (u) => ui.badge(u.ativo ? 'Ativo' : 'Inativo', u.ativo ? 'success' : 'danger') },
                { label: 'Último acesso', render: (u) => u.last_login_at ? ui.fmtDateTime(u.last_login_at) : '<span class="muted">Nunca</span>' },
                {
                  label: 'Ações', cls: 'right row-actions-cell', render: (u) => `<div class="row-actions">
                    <button class="btn btn-sm btn-ghost" data-user-email="${u.id}" data-email-atual="${ui.esc(u.email)}" title="Alterar e-mail de acesso">${ui.icon('edit', 14)}</button>
                    <button class="btn btn-sm btn-ghost" data-user-pass="${u.id}" title="Redefinir senha">${ui.icon('lock', 14)}</button>
                    <button class="btn btn-sm btn-ghost" data-user-toggle="${u.id}" data-ativo="${u.ativo}" title="${u.ativo ? 'Desativar' : 'Ativar'}">${ui.icon(u.ativo ? 'x' : 'check', 14)}</button>
                    <button class="btn btn-sm btn-ghost" data-user-del="${u.id}" title="Excluir">${ui.icon('trash', 14)}</button>
                    ${(u.totp_ativo || u.email_2fa) && u.id !== state.user.id ? `<button class="btn btn-sm btn-ghost" data-user-2fa="${u.id}" title="Desligar verificação em duas etapas (perdeu o acesso ao e-mail ou ao celular)">2 etapas ✕</button>` : ''}
                  </div>`
                }
              ],
              rows: cfg.users
            })}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div><h3>Trilha de auditoria</h3><p class="sub">Últimas 60 operações registradas no sistema</p></div></div>
          <div class="card-body" style="padding-top:8px;max-height:420px;overflow:auto">
            ${audit.items.length ? `<div class="timeline">${audit.items.map((a) => `<div class="tl-item"><div class="tl-dot"></div><div>
              <p>${ui.esc(a.detail || a.action)}</p>
              <div class="tl-meta">${ui.esc(a.user_nome || 'Sistema')} · ${ui.esc(a.action)} ${a.entity ? `· ${ui.esc(a.entity)}` : ''} · ${ui.fmtDateTime(a.created_at)}</div>
            </div></div>`).join('')}</div>` : '<p class="small muted">Nenhuma operação registrada.</p>'}
          </div>
        </div>
        <div class="card" id="wa-card">
          <div class="card-head"><div><h3>WhatsApp de suporte</h3><p class="sub">Conectar o número ao CRM por "Dispositivos conectados"</p></div></div>
          <div class="card-body">
            <div class="wa-state" id="wa-state">Carregando…</div>
            <div class="wa-risk">Este é um método <b>não oficial</b>: o WhatsApp pode limitar ou bloquear o número. O CRM não importa o histórico antigo nem grupos, e a sessão fica guardada só neste servidor.</div>
            <div id="wa-pair-box">
              <div class="field"><label for="wa-phone">Número do WhatsApp (com DDD)</label><input id="wa-phone" type="tel" placeholder="85 99999-0000" maxlength="20" autocomplete="off"></div>
              <button class="btn btn-primary" id="wa-pair" type="button">Gerar código de pareamento</button>
            </div>
            <div class="wa-code hidden" id="wa-code-box">
              <div class="wa-code-num" id="wa-code"></div>
              <ol class="wa-steps">
                <li>No celular, abra o WhatsApp (ou WhatsApp Business).</li>
                <li>Vá em <b>Configurações &gt; Dispositivos conectados &gt; Conectar dispositivo</b>.</li>
                <li>Escolha <b>Conectar com número de telefone</b> e digite o código acima. Ele vale poucos minutos.</li>
              </ol>
            </div>
            <div class="wa-actions-row hidden" id="wa-conn-box">
              <button class="btn btn-danger" id="wa-disconnect" type="button">Desconectar e apagar a sessão</button>
            </div>
          </div>
        </div>
        <div class="card" id="ia-card">
          <div class="card-head"><div><h3>Inteligência (IA)</h3><p class="sub">Resumo, classificação e preenchimento de cadastro a partir das conversas</p></div></div>
          <div class="card-body">
            <div class="wa-state" id="ia-state">Carregando…</div>
            <div class="wa-risk">As mensagens analisadas são enviadas à API do provedor escolhido (<b id="ia-prov-nome">…</b>), que pode processar os dados fora do Brasil (informe isso no aviso de privacidade). A IA só envia mensagens sozinha se você ligar "responde sozinha" abaixo; fora isso, ela sugere a resposta e você revisa. As chaves ficam só neste servidor, uma para cada provedor.</div>
            <div class="field"><label for="ia-provedor">Provedor de IA</label><select id="ia-provedor"></select>
              <div class="form-hint" id="ia-prov-info"></div></div>
            <div class="field hidden" id="ia-url-box"><label for="ia-url">Endereço da API (formato OpenAI)</label>
              <input id="ia-url" type="url" maxlength="200" autocomplete="off" placeholder="https://api.exemplo.com/v1"><div class="form-hint">Precisa começar com https://. O CRM acrescenta /chat/completions.</div></div>
            <div class="field"><label for="ia-chave">Chave da API deste provedor</label>
              <input id="ia-chave" type="password" autocomplete="off" placeholder="Cole a chave aqui (deixe vazio para manter a atual)" maxlength="300"><div class="form-hint" id="ia-chave-info"></div></div>
            <div class="field"><label for="ia-modo">Modo</label>
              <select id="ia-modo"><option value="sugerir">Sugerir: a IA só analisa quando o atendente pedir</option>
                <option value="automatico">Automático: analisa cada conversa nova e preenche campos vazios do cadastro</option></select></div>
            <label class="check"><input type="checkbox" id="ia-criar"> No modo automático, criar cadastro novo quando a IA identificar motorista, passageiro ou parceiro e houver dados suficientes</label>
            <label class="check"><input type="checkbox" id="ia-responder"> No modo automático, a IA <b>responde sozinha</b> ao cliente pelo WhatsApp como Central de Atendimento (saudação, menu, fluxos por assunto e transferência para a equipe, com os textos de "Modelos de Comunicação da IA"). Ela para quando alguém da equipe assume ou responde e volta sozinha depois do tempo configurado abaixo sem resposta da equipe (ou pelo botão "Devolver à IA"). Limites de segurança: no máximo 40 respostas por atendimento, 80 por conversa em 24 h e 300 por dia no total. Mais mensagens automáticas aumentam o risco de bloqueio do número.</label>
            <label class="check"><input type="checkbox" id="ia-transcrever"> Ler as mídias que chegam: áudio vira texto; fotos, PDFs e vídeos são lidos pelo Gemini (inclusive documentos como CNH e CRLV); Word, Excel e PowerPoint são lidos aqui no servidor. Assim a IA consegue usar tudo para preencher o cadastro.</label>
            <div class="field"><label for="ia-pausa">Voltar para a IA depois de quantos minutos sem resposta da equipe</label><input id="ia-pausa" type="number" min="0" max="1440" step="5">
              <div class="form-hint">Quando você responde (pelo CRM ou pelo celular) a IA para. Passado esse tempo sem nova resposta sua, ela volta a atender sozinha. 0 = só volta pelo botão "Devolver à IA".</div></div>
            <div class="field"><label for="ia-novo">Novo atendimento depois de quantas horas sem conversa</label><input id="ia-novo" type="number" min="0" max="168" step="1">
              <div class="form-hint">Conversa parada por esse tempo (com a IA ou com a equipe) é encerrada sozinha, e a próxima mensagem do cliente começa um atendimento novo: saudação de retorno e menu. Conversas transferidas aguardando a equipe não são encerradas. 0 = desligado.</div></div>
            <div class="field"><label for="ia-limite">Limite de análises por dia</label><input id="ia-limite" type="number" min="1" max="2000" step="1"></div>
            <div class="field"><label for="ia-modelo">Modelo (opcional)</label><input id="ia-modelo" type="text" maxlength="100" autocomplete="off"></div>
            <div class="field"><label for="ia-reserva">Provedor reserva (opcional)</label><select id="ia-reserva"></select>
              <div class="form-hint">Usado só quando o principal estiver sem cota ou fora do ar. Precisa ter a própria chave salva (escolha o provedor acima, cole a chave e salve).</div></div>
            <label class="check"><input type="checkbox" id="ia-ativo"> IA ativada</label>
            <div class="wa-actions-row">
              <button class="btn btn-primary" id="ia-salvar" type="button">Salvar</button>
              <button class="btn btn-ghost" id="ia-testar" type="button">Testar conexão</button>
              <button class="btn btn-danger" id="ia-remover" type="button">Remover chave</button>
            </div>
          </div>
        </div>
        <div class="card" id="modelos-card">
          <div class="card-head"><div><h3>Modelos de Comunicação da IA</h3><p class="sub">Textos fixos da Central de Atendimento e informações oficiais que a IA pode usar</p></div></div>
          <div class="card-body" id="modelos-corpo">Carregando…</div>
        </div>
      </div>` : ''}

      <div class="stack">
        <div class="card">
          <div class="card-head"><div><h3>Alterar minha senha</h3><p class="sub">Sessões em outros dispositivos são encerradas</p></div></div>
          <div class="card-body">
            <div class="form-errors" id="pwd-error" hidden></div>
            <div class="stack" style="gap:12px">
              <div class="field"><label for="pwd-atual">Senha atual</label><input id="pwd-atual" type="password" autocomplete="current-password"></div>
              <div class="field"><label for="pwd-nova">Nova senha</label><input id="pwd-nova" type="password" autocomplete="new-password"><div class="form-hint">Mínimo 10 caracteres, com letras e números.</div></div>
              <div class="field"><label for="pwd-nova2">Confirmar nova senha</label><input id="pwd-nova2" type="password" autocomplete="new-password"></div>
              <button class="btn btn-primary" id="pwd-save">${ui.icon('lock', 15)} Alterar senha</button>
            </div>
          </div>
        </div>

        <div class="card" id="notif-card">
          <div class="card-head"><div><h3>Notificações</h3><p class="sub">Avisos do atendimento neste aparelho: mensagem nova, IA trabalhando e IA passando para você</p></div></div>
          <div class="card-body" id="notif-corpo">Carregando…</div>
        </div>

        <div class="card" id="mfa-card">
          <div class="card-head"><div><h3>Verificação em duas etapas</h3><p class="sub">Código no seu e-mail só quando entrar por um aparelho novo</p></div></div>
          <div class="card-body"><div id="mfa-corpo" class="muted">Carregando…</div><div class="form-errors" id="mfa-error" hidden></div></div>
        </div>

        <div class="card" id="rec-card">
          <div class="card-head"><div><h3>Códigos de recuperação</h3><p class="sub">Para redefinir a senha sozinho, se esquecer</p></div></div>
          <div class="card-body">
            <div id="rec-estado" class="muted">Carregando…</div>
            <div class="form-errors" id="rec-error" hidden></div>
            <div class="stack" style="gap:12px;margin-top:10px">
              <div class="field"><label for="rec-senha-atual">Senha atual (para gerar)</label><input id="rec-senha-atual" type="password" autocomplete="current-password"></div>
              <button class="btn btn-primary" id="rec-gerar" type="button">${ui.icon('lock', 15)} Gerar códigos novos</button>
            </div>
            <div id="rec-lista" hidden style="margin-top:12px"></div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div><h3>Sessões ativas</h3><p class="sub">Dispositivos conectados à sua conta</p></div></div>
          <div class="card-body">
            ${sessions.items.map((s) => `<div class="spread" style="padding:8px 0;border-bottom:1px dashed #eef2f9">
              <div><div class="small" style="font-weight:600">${s.atual ? 'Este dispositivo' : 'Outro dispositivo'}</div>
              <div class="small muted">${ui.esc((s.user_agent || 'Navegador').slice(0, 46))} · ${ui.fmtDateTime(s.last_seen_at)}</div></div>
              ${s.atual ? '<span class="badge success">Atual</span>' : `<button class="btn btn-sm btn-ghost" data-session="${s.id}">Encerrar</button>`}
            </div>`).join('')}
          </div>
        </div>

        ${isAdmin ? `<div class="card">
          <div class="card-head"><div><h3>Sobre o sistema</h3><p class="sub">Informações técnicas e limites do ambiente</p></div></div>
          <div class="card-body">
            <div class="about-list">
              <div><span>Versão</span><b>CRM Fortaleza Move 1.0</b></div>
              <div><span>Armazenamento</span><b>SQLite (arquivo no servidor)</b></div>
              <div><span>Banco de dados</span><b>data/crm.db</b></div>
              <div><span>Sessão</span><b>Cookie httpOnly · 12 horas</b></div>
              <div><span>Senhas</span><b>scrypt com salt individual</b></div>
              <div><span>PWA</span><b id="pwa-status">Verificando…</b></div>
              <div><span>Serviço de e-mail</span><b>Não conectado</b></div>
              <div><span>Integrações externas</span><b>Nenhuma</b></div>
            </div>
            <div class="notice warn" style="margin-top:12px">Este sistema não envia mensagens automáticas, não processa pagamentos e não se conecta aos aplicativos operacionais da Fortaleza Move. Relatórios em PDF são gerados pela impressão do navegador.</div>
          </div>
        </div>` : ''}
      </div>
    </div>`;

  if (isAdmin) setupWhatsapp(view);
  if (isAdmin) setupIA(view);
  if (isAdmin) setupModelos(view);
  if (isAdmin) view.querySelector('#cfg-save').addEventListener('click', async () => {
    try {
      await api.patch('/settings', {
        org_nome: view.querySelector('#cfg-nome').value,
        slogan: view.querySelector('#cfg-slogan').value,
        alerta_dias: Number(view.querySelector('#cfg-alerta').value),
        comissao_padrao: Number(view.querySelector('#cfg-comissao').value)
      });
      ui.toast('Configurações salvas.', 'success');
      state.refreshMeta();
    } catch (err) { ui.toast(err.message, 'error'); }
  });

  view.querySelector('#pwd-save').addEventListener('click', async () => {
    const errorBox = view.querySelector('#pwd-error');
    errorBox.hidden = true;
    const nova = view.querySelector('#pwd-nova').value;
    if (nova !== view.querySelector('#pwd-nova2').value) {
      errorBox.hidden = false;
      errorBox.textContent = 'As senhas novas não coincidem.';
      return;
    }
    try {
      await api.post('/auth/change-password', { senha_atual: view.querySelector('#pwd-atual').value, senha_nova: nova });
      ui.toast('Senha alterada.', 'success');
      view.querySelector('#pwd-atual').value = '';
      view.querySelector('#pwd-nova').value = '';
      view.querySelector('#pwd-nova2').value = '';
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err.message;
    }
  });

  setupRecuperacao(view);
  setupDuasEtapas(view);
  setupNotificacoes(view);

  view.querySelectorAll('[data-session]').forEach((b) => b.addEventListener('click', async () => {
    try {
      await api.del(`/auth/sessions/${b.dataset.session}`);
      ui.toast('Sessão encerrada.', 'success');
      renderSettings(view, state);
    } catch (err) { ui.toast(err.message, 'error'); }
  }));

  const pwaEl = view.querySelector('#pwa-status');
  if (pwaEl) pwaEl.textContent = 'serviceWorker' in navigator ? 'Service worker registrado' : 'Não suportado neste navegador';

  if (isAdmin) {
    view.querySelector('#user-new').addEventListener('click', () => {
      const body = document.createElement('div');
      body.innerHTML = `<div class="form-errors" id="usr-error" hidden></div>
        <div class="form-grid">
          <div class="field full"><label for="usr-nome">Nome</label><input id="usr-nome" type="text" maxlength="120"></div>
          <div class="field full"><label for="usr-email">E-mail</label><input id="usr-email" type="email"></div>
          <div class="field"><label for="usr-senha">Senha inicial</label><input id="usr-senha" type="password"><div class="form-hint">Mínimo 10 caracteres com letras e números.</div></div>
          <div class="field"><label for="usr-role">Perfil</label><select id="usr-role"><option value="gestor">Gestor</option><option value="avaliador">Avaliador de cadastros (só candidatos)</option><option value="admin">Administrador</option></select></div>
        </div>`;
      const m = ui.modal({
        title: 'Novo usuário',
        body,
        footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Criar usuário</button>'
      });
      m.dialog.querySelector('[data-cancel]').addEventListener('click', () => m.close());
      m.dialog.querySelector('[data-save]').addEventListener('click', async () => {
        const errorBox = m.body.querySelector('#usr-error');
        errorBox.hidden = true;
        try {
          await api.post('/users', {
            nome: m.body.querySelector('#usr-nome').value,
            email: m.body.querySelector('#usr-email').value,
            senha: m.body.querySelector('#usr-senha').value,
            role: m.body.querySelector('#usr-role').value
          });
          ui.toast('Usuário criado.', 'success');
          m.close();
          renderSettings(view, state);
        } catch (err) {
          errorBox.hidden = false;
          errorBox.textContent = err.message;
        }
      });
    });

    view.querySelectorAll('[data-user-2fa]').forEach((b) => b.addEventListener('click', async () => {
      const ok = await ui.confirmDialog({ title: 'Desligar verificação em duas etapas', message: 'O usuário vai entrar só com a senha até ativar de novo. Use quando ele perder o celular.', confirmLabel: 'Desligar', danger: true });
      if (!ok) return;
      try { await api.patch(`/users/${b.dataset.user2fa}`, { desativar_2fa: true }); ui.toast('Verificação em duas etapas desligada para o usuário.', 'success'); renderSettings(view, state); } catch (err) { ui.toast(err.message, 'error'); }
    }));

    view.querySelectorAll('[data-user-toggle]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api.patch(`/users/${b.dataset.userToggle}`, { ativo: b.dataset.ativo !== '1' });
        ui.toast('Situação do usuário atualizada.', 'success');
        renderSettings(view, state);
      } catch (err) { ui.toast(err.message, 'error'); }
    }));

    view.querySelectorAll('[data-user-del]').forEach((b) => b.addEventListener('click', async () => {
      const ok = await ui.confirmDialog({ title: 'Excluir usuário', message: 'O usuário perderá o acesso imediatamente. Deseja continuar?', confirmLabel: 'Excluir', danger: true });
      if (!ok) return;
      try {
        await api.del(`/users/${b.dataset.userDel}`);
        ui.toast('Usuário excluído.', 'success');
        renderSettings(view, state);
      } catch (err) { ui.toast(err.message, 'error'); }
    }));

    view.querySelectorAll('[data-user-email]').forEach((b) => b.addEventListener('click', () => {
      const body = document.createElement('div');
      body.innerHTML = `<div class="form-errors" id="re-error" hidden></div>
        <div class="field"><label for="re-email">E-mail de acesso</label><input id="re-email" type="email" autocomplete="off" maxlength="254">
        <div class="form-hint">É o e-mail usado para entrar e para receber o link de senha nova. A senha continua a mesma.</div></div>`;
      body.querySelector('#re-email').value = b.dataset.emailAtual || '';
      const m = ui.modal({ title: 'Alterar e-mail de acesso', body, size: 'small',
        footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Salvar</button>' });
      m.dialog.querySelector('[data-cancel]').addEventListener('click', () => m.close());
      m.dialog.querySelector('[data-save]').addEventListener('click', async () => {
        const errorBox = m.body.querySelector('#re-error');
        errorBox.hidden = true;
        try {
          await api.patch(`/users/${b.dataset.userEmail}`, { email: m.body.querySelector('#re-email').value });
          ui.toast('E-mail de acesso alterado.', 'success');
          m.close();
          renderSettings(view, state);
        } catch (err) { errorBox.hidden = false; errorBox.textContent = err.message; }
      });
    }));

    view.querySelectorAll('[data-user-pass]').forEach((b) => b.addEventListener('click', () => {
      const body = document.createElement('div');
      body.innerHTML = `<div class="form-errors" id="rp-error" hidden></div>
        <div class="field"><label for="rp-senha">Nova senha</label><input id="rp-senha" type="password"><div class="form-hint">Mínimo 10 caracteres com letras e números. As sessões do usuário serão encerradas.</div></div>`;
      const m = ui.modal({
        title: 'Redefinir senha do usuário',
        body,
        size: 'small',
        footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Redefinir</button>'
      });
      m.dialog.querySelector('[data-cancel]').addEventListener('click', () => m.close());
      m.dialog.querySelector('[data-save]').addEventListener('click', async () => {
        const errorBox = m.body.querySelector('#rp-error');
        errorBox.hidden = true;
        try {
          await api.patch(`/users/${b.dataset.userPass}`, { senha: m.body.querySelector('#rp-senha').value });
          ui.toast('Senha redefinida.', 'success');
          m.close();
        } catch (err) {
          errorBox.hidden = false;
          errorBox.textContent = err.message;
        }
      });
    }));
  }
}


// Cartão de pareamento do WhatsApp (somente administrador). Atualiza o estado sozinho enquanto a tela estiver aberta.
function setupWhatsapp(view) {
  const $ = (sel) => view.querySelector(sel);
  const rotulos = {
    desativado: ['Desativado', 'neutral'], desconectado: ['Desconectado', 'danger'], conectando: ['Conectando…', 'warn'],
    aguardando_pareamento: ['Aguardando você digitar o código no celular', 'warn'], conectado: ['Conectado', 'success'], erro: ['Erro', 'danger']
  };

  async function atualizar() {
    let st;
    try { st = await api.get('/wa/status'); } catch (err) { return; }
    const box = $('#wa-state');
    if (!box) return;
    const [texto, tom] = rotulos[st.state] || [st.state, 'neutral'];
    box.innerHTML = `${ui.badge(texto, tom)} ${st.phone_exibicao ? `<span class="muted">${ui.esc(st.phone_exibicao)}</span>` : ''}
      ${st.detail ? `<div class="muted" style="margin-top:6px">${ui.esc(st.detail)}</div>` : ''}
      ${st.fila && (st.fila.pendentes || st.fila.falhas) ? `<div class="muted" style="margin-top:6px">Fila de envio: ${st.fila.pendentes} pendente(s), ${st.fila.falhas} com falha.</div>` : ''}`;
    const conectado = st.state === 'conectado';
    $('#wa-pair-box').classList.toggle('hidden', conectado);
    $('#wa-conn-box').classList.toggle('hidden', !(conectado || st.state === 'aguardando_pareamento' || st.state === 'conectando'));
    if (st.state !== 'aguardando_pareamento') $('#wa-code-box').classList.add('hidden');
  }

  $('#wa-pair').addEventListener('click', async () => {
    const botao = $('#wa-pair');
    botao.disabled = true;
    try {
      const r = await api.post('/wa/parear', { telefone: $('#wa-phone').value });
      $('#wa-code').textContent = r.code;
      $('#wa-code-box').classList.remove('hidden');
      ui.toast('Código gerado. Digite no WhatsApp do celular.', 'success');
    } catch (err) {
      ui.toast(err.message, 'error');
    } finally {
      botao.disabled = false;
      atualizar();
    }
  });

  $('#wa-disconnect').addEventListener('click', async () => {
    const ok = await ui.confirmDialog({
      title: 'Desconectar o WhatsApp?', danger: true, confirmLabel: 'Desconectar',
      message: 'A sessão guardada no servidor será apagada e o CRM deixa de receber e enviar mensagens. As conversas já salvas continuam. Para voltar, gere um novo código.'
    });
    if (!ok) return;
    try { await api.post('/wa/desconectar', {}); ui.toast('WhatsApp desconectado.', 'success'); } catch (err) { ui.toast(err.message, 'error'); }
    atualizar();
  });

  atualizar();
  const timer = setInterval(() => { if (!view.isConnected) { clearInterval(timer); return; } atualizar(); }, 3000);
}

// Cartão da IA (somente administrador). A chave nunca é exibida: só os 4 últimos caracteres.
function setupIA(view) {
  const $ = (sel) => view.querySelector(sel);
  let provedores = [];

  // Mostra o que depende do provedor escolhido: nome, campo de endereço (só "Outro") e o modelo guardado para ele.
  function mostrarProvedor(id, { modelo } = {}) {
    const p = provedores.find((x) => x.id === id) || {};
    $('#ia-prov-nome').textContent = p.nome || '';
    $('#ia-url-box').classList.toggle('hidden', id !== 'personalizado');
    $('#ia-modelo').value = modelo !== undefined ? modelo : (p.modelo || '');
    $('#ia-modelo').placeholder = p.modelo ? '' : 'Opcional: deixe vazio e o CRM escolhe sozinho';
    $('#ia-chave').value = '';
    const info = [];
    if (p.gratis) info.push('<b>Plano grátis</b> (sem cartão, com limite de uso por minuto e por dia).');
    if (p.onde_chave) info.push(`Crie a chave em <a href="${ui.esc(p.onde_chave)}" target="_blank" rel="noopener noreferrer">${ui.esc(p.onde_chave.replace(/^https:\/\//, ''))}</a>.`);
    if (p.aviso) info.push(`<span class="muted">${ui.esc(p.aviso)}</span>`);
    $('#ia-prov-info').innerHTML = info.join(' ');
    $('#ia-chave-info').textContent = p.chave_configurada
      ? `Chave terminada em ${p.chave_final4} (${p.chave_origem === 'ambiente' ? 'variável de ambiente' : 'arquivo no servidor'}).` : 'Nenhuma chave guardada para este provedor.';
  }

  async function carregar() {
    let st;
    try { st = await api.get('/ia/status'); } catch (err) { return; }
    if (!$('#ia-state')) return;
    provedores = st.provedores || [];
    $('#ia-state').innerHTML = `${ui.badge(st.pronta ? 'Pronta' : (st.ativo ? 'Sem chave' : 'Desativada'), st.pronta ? 'success' : (st.ativo ? 'warn' : 'neutral'))}
      <span class="muted">${ui.esc(st.provedor_nome)}${st.chave_configurada ? ` · chave terminada em ${ui.esc(st.chave_final4)} (${st.chave_origem === 'ambiente' ? 'variável de ambiente' : 'arquivo no servidor'})` : ' · nenhuma chave configurada'}</span>
      <div class="muted" style="margin-top:6px">Hoje: ${ui.fmtInt(st.uso.analises)} análise(s), ${ui.fmtInt(st.uso.tokens)} tokens, ${ui.fmtInt(st.transcricoes_hoje || 0)} mídia(s) lida(s).</div>`;
    $('#ia-provedor').innerHTML = provedores.map((p) => `<option value="${ui.esc(p.id)}">${ui.esc(p.nome)}</option>`).join('');
    $('#ia-provedor').value = st.provedor;
    $('#ia-reserva').innerHTML = '<option value="">Nenhum</option>' + provedores.map((p) => `<option value="${ui.esc(p.id)}">${ui.esc(p.nome)}${p.chave_configurada ? '' : ' (sem chave)'}</option>`).join('');
    $('#ia-reserva').value = st.reserva || '';
    $('#ia-url').value = st.provedor === 'personalizado' ? (st.url_base || '') : '';
    mostrarProvedor(st.provedor, { modelo: st.modelo });
    $('#ia-modo').value = st.modo;
    $('#ia-criar').checked = !!st.criar_cadastro;
    $('#ia-responder').checked = !!st.responder;
    $('#ia-transcrever').checked = st.transcrever !== false;
    $('#ia-limite').value = st.limite_dia;
    $('#ia-pausa').value = st.humano_pausa === undefined ? 30 : st.humano_pausa;
    $('#ia-novo').value = st.novo_atendimento_h === undefined ? 12 : st.novo_atendimento_h;
    $('#ia-ativo').checked = !!st.ativo;
  }

  $('#ia-provedor').addEventListener('change', () => mostrarProvedor($('#ia-provedor').value));

  async function salvar(extra = {}) {
    const corpo = {
      ativo: $('#ia-ativo').checked, modo: $('#ia-modo').value, criar_cadastro: $('#ia-criar').checked, responder: $('#ia-responder').checked, transcrever: $('#ia-transcrever').checked,
      limite_dia: Number($('#ia-limite').value), humano_pausa: Number($('#ia-pausa').value), novo_atendimento_h: Number($('#ia-novo').value), provedor: $('#ia-provedor').value, reserva: $('#ia-reserva').value, ...extra
    };
    const modelo = $('#ia-modelo').value.trim();
    corpo.modelo = modelo; // vazio = o CRM descobre o modelo sozinho
    if (corpo.provedor === 'personalizado') corpo.url_base = $('#ia-url').value.trim();
    const chave = $('#ia-chave').value.trim();
    if (chave) corpo.chave = chave;
    await api.post('/ia/config', corpo);
    $('#ia-chave').value = '';
  }

  $('#ia-salvar').addEventListener('click', async () => {
    try { await salvar(); ui.toast('Configuração da IA salva.', 'success'); } catch (err) { ui.toast(err.message, 'error'); }
    carregar();
  });

  $('#ia-testar').addEventListener('click', async () => {
    const botao = $('#ia-testar');
    botao.disabled = true;
    try {
      await salvar();
      const r = await api.post('/ia/testar', {});
      ui.toast(r.ok ? `Conexão com a IA funcionando (${r.modelo}${r.reserva ? ', pelo provedor reserva' : ''}).` : 'A IA respondeu, mas de forma inesperada.', r.ok ? 'success' : 'error');
    } catch (err) { ui.toast(err.message, 'error'); } finally { botao.disabled = false; carregar(); }
  });

  $('#ia-remover').addEventListener('click', async () => {
    const ok = await ui.confirmDialog({ title: 'Remover a chave deste provedor?', danger: true, confirmLabel: 'Remover', message: 'A IA para de funcionar com este provedor até uma nova chave ser informada. As análises já feitas continuam salvas.' });
    if (!ok) return;
    try { await api.post('/ia/config', { remover_chave: true, provedor: $('#ia-provedor').value }); ui.toast('Chave removida.', 'success'); } catch (err) { ui.toast(err.message, 'error'); }
    carregar();
  });

  carregar();
}

// Códigos de recuperação: mostrados UMA vez, na hora de gerar. Gerar de novo invalida os anteriores.
// Modelos de Comunicação da IA: textos editáveis (ativar/desativar), site oficial e base de conhecimento por assunto.
const INFO_ASSUNTOS = [
  ['geral', 'Informações gerais da empresa', 'Ex.: o que é a Fortaleza Move, cidades atendidas, horário de atendimento, como baixar o aplicativo.'],
  ['cadastro', 'Cadastro de motoristas', 'Ex.: requisitos (idade, categoria da CNH, ano do veículo), documentos aceitos, avaliação presencial.'],
  ['entregadores', 'Cadastro de entregadores', 'Ex.: quem pode ser entregador, modalidades (moto, bicicleta), documentos, como funciona a avaliação.'],
  ['encomendas', 'Encomendas e entregas', 'Ex.: o que pode ser enviado, regiões atendidas, como pedir uma entrega.'],
  ['clube', 'Clube de Vantagens', 'Ex.: benefícios, parceiros, carteirinha digital, quem pode participar.'],
  ['comerciantes', 'Comerciantes', 'Ex.: como um comércio passa a pedir entregas pela plataforma, o que precisa enviar, quem procurar.'],
  ['passageiro', 'Passageiros', 'Ex.: como pedir corrida, formas de pagamento, o que fazer se esquecer um objeto.'],
  ['outros', 'Outros assuntos de atendimento', 'Ex.: imprensa, trabalhe conosco, reclamações.']
];
function setupModelos(view) {
  const corpo = view.querySelector('#modelos-corpo');
  async function desenhar() {
    let d;
    try { d = await api.get('/ia/modelos'); } catch (e) { corpo.textContent = e.message; return; }
    corpo.innerHTML = `
      <div class="form-errors" id="mod-error" hidden></div>
      <p class="muted small">Estes textos são enviados exatamente como estão (a IA não muda). Desativado = não é enviado. Use <b>{site}</b> para o endereço do site e, no encerramento, <b>{site_oficial}</b> para o bloco "Divulgação do site oficial" (só aparece quando o site estiver configurado).</p>
      <div class="field"><label for="mod-site">Endereço do site oficial</label><input id="mod-site" type="url" maxlength="200" placeholder="https://… (deixe vazio enquanto o site não estiver no ar)" value="${ui.esc(d.site_url)}"></div>
      ${d.modelos.map((m) => `<div class="field mod-item" data-mod="${ui.esc(m.id)}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
            <label for="mod-t-${ui.esc(m.id)}" style="margin:0">${ui.esc(m.nome)}</label>
            <span style="display:flex;gap:10px;align-items:center"><label class="check" style="margin:0"><input type="checkbox" class="mod-ativo" ${m.ativo ? 'checked' : ''}> Ativo</label>
            <button class="btn btn-sm btn-ghost mod-padrao" type="button">Restaurar padrão</button></span>
          </div>
          <textarea id="mod-t-${ui.esc(m.id)}" class="mod-texto" rows="${Math.min(9, Math.max(3, m.texto.split('\n').length + 1))}" maxlength="1500">${ui.esc(m.texto)}</textarea>
        </div>`).join('')}
      <h4 style="margin:18px 0 4px">Informações oficiais por assunto</h4>
      <p class="muted small">A IA só afirma o que estiver aqui. Sem informação, ela diz que precisa confirmar com a equipe e encaminha o atendimento — nunca inventa. Não coloque dados pessoais.</p>
      ${(() => { const falta = (d.informacoes_situacao || []).filter((x) => !x.preenchida); return falta.length ? `<p class="small" style="color:#92400e">Faltam ${falta.length} de ${(d.informacoes_situacao || []).length} assuntos: ${falta.map((x) => ui.esc(x.nome)).join(', ')}.</p>` : '<p class="small" style="color:#15803d">Todos os assuntos têm informação oficial.</p>'; })()}
      ${INFO_ASSUNTOS.map(([id, nome, dica]) => `<div class="field"><label for="mod-i-${id}">${ui.esc(nome)} ${String(d.informacoes[id] || '').trim() ? '<span class="badge success">Preenchido</span>' : '<span class="badge neutral">Falta preencher</span>'}</label>
        <textarea id="mod-i-${id}" class="mod-info" data-info="${id}" rows="3" maxlength="4000" placeholder="${ui.esc(dica)}">${ui.esc(d.informacoes[id] || '')}</textarea></div>`).join('')}
      <div class="wa-actions-row"><button class="btn btn-primary" id="mod-salvar" type="button">Salvar modelos</button></div>`;
    const padroes = Object.fromEntries(d.modelos.map((m) => [m.id, m.padrao]));
    corpo.querySelectorAll('.mod-padrao').forEach((b) => b.addEventListener('click', () => {
      const item = b.closest('[data-mod]');
      item.querySelector('.mod-texto').value = padroes[item.dataset.mod];
    }));
    corpo.querySelector('#mod-salvar').addEventListener('click', async () => {
      const erro = corpo.querySelector('#mod-error');
      erro.hidden = true;
      const modelos = [...corpo.querySelectorAll('[data-mod]')].map((el) => ({ id: el.dataset.mod, texto: el.querySelector('.mod-texto').value, ativo: el.querySelector('.mod-ativo').checked }));
      const informacoes = Object.fromEntries([...corpo.querySelectorAll('.mod-info')].map((el) => [el.dataset.info, el.value]));
      try {
        await api.put('/ia/modelos', { modelos, site_url: corpo.querySelector('#mod-site').value.trim(), informacoes });
        ui.toast('Modelos salvos.', 'success');
      } catch (e) { erro.hidden = false; erro.textContent = e.message; }
    });
  }
  desenhar();
}

function setupRecuperacao(view) {
  const $ = (sel) => view.querySelector(sel);
  let emailConta = '';
  api.get('/auth/me').then((r) => { emailConta = (r.user && r.user.email) || ''; }).catch(() => {});
  async function estado() {
    try {
      const st = await api.get('/auth/recovery-codes');
      $('#rec-estado').innerHTML = st.restantes
        ? `${ui.badge(`${st.restantes} código(s) disponível(is)`, 'success')} <span class="muted">gerados em ${ui.esc(ui.fmtDateTime(st.gerados_em))}</span>`
        : `${ui.badge('Nenhum código', 'warn')} <span class="muted">Gere agora: sem código, só o administrador ou o servidor conseguem trocar sua senha.</span>`;
    } catch (err) { $('#rec-estado').textContent = ''; }
  }
  $('#rec-gerar').addEventListener('click', async () => {
    const errorBox = $('#rec-error');
    errorBox.hidden = true;
    try {
      const r = await api.post('/auth/recovery-codes', { senha_atual: $('#rec-senha-atual').value });
      $('#rec-senha-atual').value = '';
      const texto = `CRM Fortaleza Move - códigos de recuperação\nConta: ${emailConta}\nGerados em: ${new Date().toLocaleString('pt-BR')}\nCada código vale uma vez. Guarde fora do celular/computador do dia a dia.\n\n${r.codigos.join('\n')}\n`;
      const lista = $('#rec-lista');
      lista.hidden = false;
      lista.innerHTML = `<div class="notice warn">Guarde estes códigos agora (anote no papel ou baixe o arquivo). Eles <b>não aparecem de novo</b>. Os códigos antigos deixaram de valer.</div>
        <pre style="background:#0b2545;color:#dfe8f5;padding:12px;border-radius:10px;font-size:14px;letter-spacing:1px;margin-top:10px">${r.codigos.map(ui.esc).join('\n')}</pre>
        <div class="row" style="gap:8px;margin-top:8px"><button class="btn btn-ghost" id="rec-copiar" type="button">Copiar</button>${/FortalezaMoveCRM-App/.test(navigator.userAgent) ? '' : '<button class="btn btn-ghost" id="rec-baixar" type="button">Baixar arquivo</button>'}</div>`;
      $('#rec-copiar').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(texto); ui.toast('Códigos copiados.', 'success'); } catch (e) { ui.toast('Não consegui copiar: anote os códigos.', 'error'); }
      });
      if ($('#rec-baixar')) $('#rec-baixar').addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
        a.download = 'codigos-recuperacao-crm.txt';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      });
      estado();
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent = err.message;
    }
  });
  estado();
}

// Verificação em duas etapas: código por e-mail só em aparelho novo (padrão) + autenticador opcional.
// Notificações: push (app fechado, quando o navegador permite) e sons com o CRM aberto. Cada aparelho escolhe os tipos.
function setupNotificacoes(view) {
  const corpo = view.querySelector('#notif-corpo');
  const TIPOS = Object.entries(notif.TIPOS);
  async function desenhar() {
    let sub = null; let aparelho = null; let erroCfg = '';
    if (notif.suportaPush()) {
      try {
        sub = await notif.inscricaoAtual();
        const cfg = await api.get('/push/config');
        aparelho = sub ? (cfg.aparelhos || []).find((a) => a.endpoint === sub.endpoint) : null;
      } catch (e) { erroCfg = e.message; }
    }
    const marcado = (t) => {
      if (!aparelho) return true;
      return !!aparelho[{ mensagem: 'avisar_mensagem', ia: 'avisar_ia', transferencia: 'avisar_transferencia' }[t]];
    };
    let push;
    const amb = notif.ambiente();
    if (!notif.suportaPush() && amb === 'app_antigo') {
      push = `<div class="notice"><b>Este é o aplicativo antigo do CRM</b> (versão 1.x, com navegador embutido). Ele não consegue receber
        notificações com o app fechado. Instale o aplicativo novo (versão 2.0 ou mais nova): <b>desinstale este primeiro</b>
        (a assinatura mudou e o Android não deixa instalar por cima), depois instale o novo e entre de novo. Seus dados ficam no servidor.</div>`;
    } else if (!notif.suportaPush()) {
      push = `<p class="muted small">Este navegador não recebe notificações com a tela fechada. Use o aplicativo do CRM (versão 2.0 ou mais nova)
        ou abra <b>${ui.esc(location.origin)}</b> no <b>Chrome</b>. Com o CRM aberto, os sons abaixo funcionam em qualquer lugar.</p>`;
    } else if (Notification.permission === 'denied') {
      push = amb === 'app'
        ? '<p class="muted small">As notificações do aplicativo estão bloqueadas. No Android: Configurações → Apps → CRM Fortaleza Move → Notificações → ligar. Depois feche e abra o app.</p>'
        : '<p class="muted small">As notificações estão bloqueadas neste navegador. Libere em Configurações do navegador → Configurações do site → Notificações e recarregue.</p>';
    } else {
      push = `<p style="margin:0 0 8px">${aparelho ? ui.badge('Ativadas neste aparelho', 'success') : ui.badge('Desativadas neste aparelho', 'warn')}</p>
        <div class="stack" style="gap:6px">${TIPOS.map(([t, d]) => `<label class="check"><input type="checkbox" class="np-tipo" data-tipo="${t}" ${marcado(t) ? 'checked' : ''}><span>${d.icone} ${ui.esc(d.nome)}</span></label>`).join('')}</div>
        <div class="wa-actions-row" style="margin-top:10px">
          <button class="btn btn-primary" id="np-ativar" type="button">${aparelho ? 'Salvar escolhas' : 'Ativar notificações'}</button>
          ${aparelho ? '<button class="btn btn-ghost" id="np-teste" type="button">Enviar teste</button><button class="btn btn-ghost" id="np-off" type="button">Desativar</button>' : ''}
        </div>`;
    }
    const diag = `<p class="muted small" style="margin:8px 0 0">Diagnóstico: ${{ app: 'aplicativo novo (Chrome)', app_antigo: 'aplicativo antigo', navegador: 'navegador' }[amb]}
      · push ${notif.suportaPush() ? 'disponível' : 'indisponível'} · permissão ${'Notification' in window ? ui.esc(Notification.permission) : '—'}
      · ${sub ? 'inscrito' : 'sem inscrição'} neste aparelho</p>`;
    corpo.innerHTML = `${erroCfg ? `<div class="form-errors">${ui.esc(erroCfg)}</div>` : ''}
      <h4 style="margin:0 0 6px">Com o app fechado</h4>${push}${diag}
      <h4 style="margin:16px 0 6px">Sons com o CRM aberto</h4>
      <div class="stack" style="gap:6px">${TIPOS.map(([t, d]) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <label class="check" style="margin:0"><input type="checkbox" class="ns-tipo" data-tipo="${t}" ${notif.somLigado(t) ? 'checked' : ''}><span>${d.icone} ${ui.esc(d.nome)}</span></label>
        <button class="btn btn-sm btn-ghost ns-ouvir" data-tipo="${t}" type="button">Ouvir</button></div>`).join('')}</div>`;
    corpo.querySelectorAll('.ns-tipo').forEach((c) => c.addEventListener('change', () => notif.ligarSom(c.dataset.tipo, c.checked)));
    corpo.querySelectorAll('.ns-ouvir').forEach((b) => b.addEventListener('click', () => notif.tocar(b.dataset.tipo)));
    const tipos = () => Object.fromEntries([...corpo.querySelectorAll('.np-tipo')].map((c) => [c.dataset.tipo, c.checked]));
    corpo.querySelector('#np-ativar')?.addEventListener('click', async () => {
      try { await notif.ativarPush(tipos()); ui.toast('Notificações ativadas neste aparelho.', 'success'); desenhar(); } catch (e) { ui.toast(e.message, 'error'); }
    });
    corpo.querySelector('#np-teste')?.addEventListener('click', async () => {
      try { await api.post('/push/teste', {}); ui.toast('Teste enviado. Deve chegar em alguns segundos.', 'success'); } catch (e) { ui.toast(e.message, 'error'); }
    });
    corpo.querySelector('#np-off')?.addEventListener('click', async () => {
      try { await notif.desativarPush(); ui.toast('Notificações desativadas neste aparelho.', 'success'); desenhar(); } catch (e) { ui.toast(e.message, 'error'); }
    });
  }
  desenhar();
}

function setupDuasEtapas(view) {
  const $ = (sel) => view.querySelector(sel);
  const erro = (msg) => { const b = $('#mfa-error'); b.hidden = !msg; b.textContent = msg || ''; };
  async function desenhar() {
    erro('');
    let st;
    try { st = await api.get('/auth/2fa'); } catch (e) { return; }
    const aparelhos = (st.aparelhos || []).map((a) => `<li>${ui.esc(a.nome || 'Aparelho')} <span class="muted small">— último uso ${ui.esc(ui.fmtDateTime(a.last_used_at))}</span></li>`).join('');
    let emailHtml;
    if (!st.email_configurado) {
      emailHtml = `${ui.badge('Indisponível', 'warn')} <span class="muted">O envio de e-mail ainda não está ligado no servidor.</span>`;
    } else if (st.email_ativo) {
      emailHtml = `${ui.badge('Ativada', 'success')} <span class="muted">Aparelho novo pede um código enviado para ${ui.esc(st.email)}.</span>
        <div class="stack" style="gap:10px;margin-top:10px">
          <div class="field"><label for="mfe-senha-off">Senha atual (para desativar)</label><input id="mfe-senha-off" type="password" autocomplete="current-password"></div>
          <button class="btn btn-ghost" id="mfe-off" type="button">Desativar</button></div>`;
    } else {
      emailHtml = `${ui.badge('Desativada', 'warn')} <span class="muted">Ao ativar, entrar por um aparelho novo pede um código enviado para ${ui.esc(st.email)}. Neste aparelho não pede.</span>
        <div class="stack" style="gap:10px;margin-top:10px">
          <div class="field"><label for="mfe-senha">Senha atual</label><input id="mfe-senha" type="password" autocomplete="current-password"></div>
          <button class="btn btn-primary" id="mfe-iniciar" type="button">${ui.icon('lock', 15)} Ativar (envia um código para testar)</button></div>
        <div id="mfe-passo2" hidden></div>`;
    }
    $('#mfa-corpo').innerHTML = `<div id="mfa-email">${emailHtml}</div>
      <div style="margin-top:14px"><b>Aparelhos confirmados</b>
        ${aparelhos ? `<ul style="margin:6px 0 8px 18px">${aparelhos}</ul><button class="btn btn-sm btn-ghost" id="mfa-esquecer" type="button">Esquecer os outros aparelhos</button>` : '<p class="muted small">Nenhum ainda.</p>'}</div>
      <details style="margin-top:14px"><summary class="muted">Aplicativo autenticador (opcional)</summary><div id="mfa-totp" style="margin-top:10px"></div></details>`;
    $('#mfe-iniciar')?.addEventListener('click', async () => {
      erro('');
      try {
        const r = await api.post('/auth/2fa/email/iniciar', { senha_atual: $('#mfe-senha').value });
        const p2 = $('#mfe-passo2');
        p2.hidden = false;
        p2.innerHTML = `<div class="field" style="margin-top:12px"><label for="mfe-codigo">Código de 6 números enviado para ${ui.esc(r.email)}</label><input id="mfe-codigo" inputmode="numeric" maxlength="6" autocomplete="one-time-code"><div class="form-hint">Não chegou? Confira o spam.</div></div>
          <button class="btn btn-primary" id="mfe-confirmar" type="button">Confirmar e ativar</button>`;
        $('#mfe-confirmar').addEventListener('click', async () => {
          try { await api.post('/auth/2fa/email/confirmar', { codigo: $('#mfe-codigo').value }); ui.toast('Verificação por e-mail ativada. Este aparelho ficou confirmado.', 'success'); desenhar(); } catch (e) { erro(e.message); }
        });
      } catch (e) { erro(e.message); }
    });
    $('#mfe-off')?.addEventListener('click', async () => {
      try { await api.post('/auth/2fa/email/desativar', { senha_atual: $('#mfe-senha-off').value }); ui.toast('Verificação por e-mail desativada.', 'success'); desenhar(); } catch (e) { erro(e.message); }
    });
    $('#mfa-esquecer')?.addEventListener('click', async () => {
      const ok = await ui.confirmDialog({ title: 'Esquecer os outros aparelhos', message: 'Os outros aparelhos saem do CRM e vão pedir o código de novo no próximo acesso. Este aparelho continua.', confirmLabel: 'Esquecer' });
      if (!ok) return;
      try { const r = await api.post('/auth/aparelhos/esquecer', {}); ui.toast(`${r.removidos} aparelho(s) esquecido(s).`, 'success'); desenhar(); } catch (e) { erro(e.message); }
    });
    setupAutenticador(view, st, erro, desenhar);
  }
  desenhar();
}

// Aplicativo autenticador (opcional): Google Authenticator, Microsoft Authenticator etc.
function setupAutenticador(view, st, erro, redesenhar) {
  const $ = (sel) => view.querySelector(sel);
  const desenhar = redesenhar;
  {
    if (st.ativo) {
      $('#mfa-totp').innerHTML = `${ui.badge('Ativada', 'success')}
        <div class="stack" style="gap:10px;margin-top:10px">
          <div class="field"><label for="mfa-senha-off">Senha atual</label><input id="mfa-senha-off" type="password" autocomplete="current-password"></div>
          <div class="field"><label for="mfa-codigo-off">Código do aplicativo</label><input id="mfa-codigo-off" inputmode="numeric" maxlength="6"></div>
          <button class="btn btn-danger" id="mfa-off" type="button">Desativar</button></div>`;
      $('#mfa-off').addEventListener('click', async () => {
        try { await api.post('/auth/2fa/desativar', { senha_atual: $('#mfa-senha-off').value, codigo: $('#mfa-codigo-off').value }); ui.toast('Verificação em duas etapas desativada.', 'success'); desenhar(); } catch (e) { erro(e.message); }
      });
      return;
    }
    $('#mfa-totp').innerHTML = `${ui.badge('Desativada', 'warn')} <span class="muted">Opcional: pede o código do aplicativo em aparelho novo (no lugar do e-mail).</span>
      <div class="stack" style="gap:10px;margin-top:10px">
        <div class="field"><label for="mfa-senha">Senha atual</label><input id="mfa-senha" type="password" autocomplete="current-password"></div>
        <button class="btn btn-primary" id="mfa-iniciar" type="button">${ui.icon('lock', 15)} Ativar</button></div>
      <div id="mfa-passo2" hidden></div>`;
    $('#mfa-iniciar').addEventListener('click', async () => {
      erro('');
      try {
        const r = await api.post('/auth/2fa/iniciar', { senha_atual: $('#mfa-senha').value });
        const p2 = $('#mfa-passo2');
        p2.hidden = false;
        p2.innerHTML = `<ol class="wa-steps" style="margin-top:12px">
            <li>Instale o <b>Google Authenticator</b> (ou outro autenticador) no celular.</li>
            <li>Toque em <b>+</b> e escolha <b>"Inserir chave de configuração"</b>. Nome: CRM Fortaleza Move. Chave:</li></ol>
          <div class="wa-code-num" style="font-size:18px;letter-spacing:.06em">${ui.esc(r.chave)}</div>
          <p class="muted small">No navegador do celular, você também pode <a href="${ui.esc(r.uri)}">tocar aqui para abrir no autenticador</a>.</p>
          <div class="field"><label for="mfa-codigo">Digite o código de 6 números que aparece no aplicativo</label><input id="mfa-codigo" inputmode="numeric" maxlength="6"></div>
          <button class="btn btn-primary" id="mfa-confirmar" type="button">Confirmar e ativar</button>`;
        $('#mfa-confirmar').addEventListener('click', async () => {
          try { await api.post('/auth/2fa/confirmar', { codigo: $('#mfa-codigo').value }); ui.toast('Verificação em duas etapas ativada. Guarde também seus códigos de recuperação.', 'success'); desenhar(); } catch (e) { erro(e.message); }
        });
      } catch (e) { erro(e.message); }
    });
  }
}

import { api } from '../api.js';
import * as ui from '../ui.js';

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
                { label: 'Perfil', render: (u) => ui.badge(u.role === 'admin' ? 'Administrador' : 'Gestor', u.role === 'admin' ? 'info' : 'neutral') },
                { label: 'Situação', render: (u) => ui.badge(u.ativo ? 'Ativo' : 'Inativo', u.ativo ? 'success' : 'danger') },
                { label: 'Último acesso', render: (u) => u.last_login_at ? ui.fmtDateTime(u.last_login_at) : '<span class="muted">Nunca</span>' },
                {
                  label: 'Ações', cls: 'right row-actions-cell', render: (u) => `<div class="row-actions">
                    <button class="btn btn-sm btn-ghost" data-user-pass="${u.id}" title="Redefinir senha">${ui.icon('lock', 14)}</button>
                    <button class="btn btn-sm btn-ghost" data-user-toggle="${u.id}" data-ativo="${u.ativo}" title="${u.ativo ? 'Desativar' : 'Ativar'}">${ui.icon(u.ativo ? 'x' : 'check', 14)}</button>
                    <button class="btn btn-sm btn-ghost" data-user-del="${u.id}" title="Excluir">${ui.icon('trash', 14)}</button>
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
            <div class="wa-risk">As mensagens analisadas são enviadas à API do provedor escolhido (<b id="ia-prov-nome">…</b>), que pode processar os dados fora do Brasil (informe isso no aviso de privacidade). A IA <b>nunca envia mensagens sozinha</b>: ela sugere a resposta e você revisa. As chaves ficam só neste servidor, uma para cada provedor.</div>
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
            <label class="check"><input type="checkbox" id="ia-transcrever"> Ler as mídias que chegam: áudio vira texto; fotos, PDFs e vídeos são lidos pelo Gemini (inclusive documentos como CNH e CRLV); Word, Excel e PowerPoint são lidos aqui no servidor. Assim a IA consegue usar tudo para preencher o cadastro.</label>
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
          <div class="field"><label for="usr-role">Perfil</label><select id="usr-role"><option value="gestor">Gestor</option><option value="admin">Administrador</option></select></div>
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
    $('#ia-transcrever').checked = st.transcrever !== false;
    $('#ia-limite').value = st.limite_dia;
    $('#ia-ativo').checked = !!st.ativo;
  }

  $('#ia-provedor').addEventListener('change', () => mostrarProvedor($('#ia-provedor').value));

  async function salvar(extra = {}) {
    const corpo = {
      ativo: $('#ia-ativo').checked, modo: $('#ia-modo').value, criar_cadastro: $('#ia-criar').checked, transcrever: $('#ia-transcrever').checked,
      limite_dia: Number($('#ia-limite').value), provedor: $('#ia-provedor').value, reserva: $('#ia-reserva').value, ...extra
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

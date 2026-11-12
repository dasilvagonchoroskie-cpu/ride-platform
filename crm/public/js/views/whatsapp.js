import { api } from '../api.js';
import * as ui from '../ui.js';

// Tela "Conversas": caixa de entrada do WhatsApp dentro do CRM.
// Todo texto que vem de fora (nome, mensagem) passa por ui.esc(); não há scripts nem handlers inline (CSP).

const TIPOS = { motoristas: 'Motorista', entregadores: 'Entregador', passageiros: 'Passageiro', parceiros: 'Parceiro' };
const STATUS_MSG = {
  pendente: ['enviando…', 'pend'], enviando: ['enviando…', 'pend'], enviada: ['✓', 'ok'],
  entregue: ['✓✓', 'ok'], lida: ['✓✓', 'read'], falhou: ['não enviada', 'fail']
};

const ASSUNTO = { cadastro_motorista: 'Cadastro de motorista', duvida_corrida: 'Dúvida sobre corrida', reclamacao: 'Reclamação', parceria: 'Parceria',
  pagamento: 'Pagamento', suporte_app: 'Suporte do app', elogio: 'Elogio', outro: 'Outro' };
const URGENCIA = { baixa: ['Urgência baixa', 'neutral'], media: ['Urgência média', 'info'], alta: ['Urgência alta', 'danger'] };
const SENTIMENTO = { positivo: ['Positivo', 'success'], neutro: ['Neutro', 'neutral'], negativo: ['Negativo', 'warn'] };
const CAMPO = { nome: 'Nome', cidade: 'Cidade', proxima_acao: 'Próxima ação', observacoes: 'Observações', nome_estabelecimento: 'Estabelecimento',
  modalidade: 'Modalidade', endereco: 'Endereço', categoria: 'Categoria', responsavel: 'Responsável', beneficio: 'Benefício', veiculo: 'Veículo', placa: 'Placa', cnh_categoria: 'Categoria da CNH' };
const PERFIL_TIPO = { motorista: 'motoristas', passageiro: 'passageiros', parceiro: 'parceiros' };
// Central de Atendimento: estados da conversa e assuntos do menu.
const ESTADO = { ia: ['IA atendendo', 'info'], aguardando: ['Aguardando atendimento humano', 'danger'], humano: ['Atendimento humano', 'success'], concluido: ['Concluído', 'neutral'] };
const ESTADO_CURTO = { ia: 'IA', aguardando: 'Aguardando', humano: 'Humano', concluido: 'Concluído' };
const ASSUNTO_MENU = { cadastro: 'Cadastro de motorista', passageiro: 'Passageiro', encomendas: 'Encomendas', clube: 'Clube de Vantagens', outros: 'Outros assuntos' };
const EVENTO = { transferida: 'Transferida para a equipe', assumida: 'Assumida', devolvida: 'Devolvida para a IA', concluida: 'Concluída', reaberta: 'Reaberta' };

const nomeDe = (c) => c.vinculo_nome || c.nome || c.telefone_exibicao || 'Contato';
const iniciais = (nome) => String(nome).replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';

function quando(iso) {
  if (!iso) return '';
  const hoje = ui.fmtDate(new Date().toISOString());
  return ui.fmtDate(iso) === hoje ? ui.fmtDateTime(iso).slice(-5) : ui.fmtDate(iso).slice(0, 5);
}

export async function renderConversas(view, state) {
  const isAdmin = state.user.role === 'admin';
  const filtro = { modo: 'Aberta', q: '' };
  let eventos = [];
  let assinaturaAtual = '';
  let atual = null;      // conversa aberta
  let assinatura = '';   // identifica o estado das mensagens exibidas (evita redesenhar à toa)
  let seqLista = 0;
  let estadoWa = null;
  let iaSt = { ativo: false, pronta: false, modo: 'sugerir' };
  let analise = null;      // última análise da IA da conversa aberta
  let iaAberta = false;    // painel da IA aberto ou recolhido (recolhido deixa mais espaço para a conversa)
  let ultimoMsgId = 0;     // id da última mensagem exibida (para saber se a análise ficou velha)

  view.innerHTML = `
    <div class="wa" id="wa">
      <div id="wa-banner"></div>
      <div class="wa-grid">
        <section class="card wa-list">
          <div class="wa-list-head">
            <div class="search">${ui.icon('search', 16)}<input type="search" id="wa-q" placeholder="Buscar nome, telefone ou mensagem" maxlength="80"></div>
            <select id="wa-f" aria-label="Filtrar conversas">
              <option value="Aberta">Abertas</option>
              <option value="at:aguardando">Aguardando humano</option>
              <option value="at:humano">Em atendimento humano</option>
              <option value="at:ia">IA atendendo</option>
              <option value="naolidas">Não lidas</option>
              <option value="at:concluido">Concluídas</option><option value="todas">Todas</option>
            </select>
          </div>
          <div class="wa-items" id="wa-items"></div>
        </section>
        <section class="card wa-thread" id="wa-thread">
          <div class="wa-placeholder" id="wa-empty">
            ${ui.icon('chat', 34)}
            <h4>Selecione uma conversa</h4>
            <p>As mensagens recebidas no WhatsApp de suporte aparecem aqui. Responda sem sair do CRM.</p>
          </div>
          <div class="wa-inner hidden" id="wa-inner">
            <div class="wa-thread-head">
              <button class="btn btn-ghost btn-sm wa-back" id="wa-back" type="button">‹ Voltar</button>
              <div class="wa-who" id="wa-who"></div>
              <div class="wa-actions" id="wa-actions"></div>
            </div>
            <div class="wa-atend" id="wa-atend"></div>
            <div class="wa-ia" id="wa-ia"></div>
            <div class="wa-msgs" id="wa-msgs"></div>
            <div class="wa-composer">
              <textarea id="wa-text" rows="2" maxlength="4000" placeholder="Escreva uma mensagem… (Ctrl+Enter envia)"></textarea>
              <button class="btn btn-primary" id="wa-send" type="button">${ui.icon('send', 16)} Enviar</button>
            </div>
          </div>
        </section>
      </div>
    </div>`;

  const $ = (sel) => view.querySelector(sel);
  const wa = $('#wa');

  /* ------------------------------- banner de conexão ------------------------------- */
  async function carregarStatus() {
    try { estadoWa = await api.get('/wa/status'); } catch (err) { return; }
    const banner = $('#wa-banner');
    if (!banner) return;
    if (estadoWa.state === 'conectado') { banner.innerHTML = ''; return; }
    const texto = estadoWa.state === 'conectando' ? 'WhatsApp reconectando…' : 'WhatsApp desconectado: não é possível enviar nem receber mensagens agora.';
    banner.innerHTML = `<div class="wa-banner">${ui.icon('alert', 16)}<span>${ui.esc(texto)}</span>
      ${isAdmin ? '<button class="btn btn-sm btn-ghost" id="wa-go-settings" type="button">Abrir Configurações</button>' : '<span class="muted">Peça a um administrador para reconectar.</span>'}</div>`;
    const go = banner.querySelector('#wa-go-settings');
    if (go) go.addEventListener('click', () => { location.hash = '#/configuracoes'; });
  }

  /* ----------------------------------- lista --------------------------------------- */
  function consulta() {
    const p = new URLSearchParams({ size: '50' });
    if (filtro.modo === 'Aberta' || filtro.modo === 'Resolvida') p.set('situacao', filtro.modo);
    if (filtro.modo === 'naolidas') p.set('nao_lidas', '1');
    if (filtro.modo.startsWith('at:')) p.set('atendimento', filtro.modo.slice(3));
    if (filtro.q) p.set('q', filtro.q);
    return p.toString();
  }

  function itemHtml(c) {
    const nome = nomeDe(c);
    const prefixo = c.ultima_direcao === 'out' ? 'Você: ' : '';
    return `<button type="button" class="wa-item ${atual && atual.id === c.id ? 'sel' : ''}" data-id="${c.id}">
      <div class="wa-avatar">${ui.esc(iniciais(nome))}</div>
      <div class="wa-item-main">
        <div class="wa-item-top"><strong>${ui.esc(nome)}</strong><span class="wa-time">${ui.esc(quando(c.ultima_em))}</span></div>
        <div class="wa-item-sub"><span class="wa-preview">${ui.esc(prefixo + (c.ultima_mensagem || ''))}</span>${c.nao_lidas ? `<span class="wa-unread">${c.nao_lidas}</span>` : ''}</div>
        <div class="wa-tags">${c.atendimento && c.atendimento !== 'ia' ? `<span class="wa-tag est-${ui.esc(c.atendimento)}">${ui.esc(ESTADO_CURTO[c.atendimento] || '')}</span>` : ''}${c.vinculo_tipo ? `<span class="wa-tag">${ui.esc(TIPOS[c.vinculo_tipo] || '')}</span>` : ''}${c.atend_assunto ? `<span class="wa-tag sub">${ui.esc(ASSUNTO_MENU[c.atend_assunto] || '')}</span>` : ''}</div>
      </div>
    </button>`;
  }

  async function carregarLista() {
    const seq = ++seqLista;
    const data = await api.get(`/wa/conversas?${consulta()}`);
    if (seq !== seqLista || !view.isConnected) return;
    const box = $('#wa-items');
    // Contagem por estado no filtro (a fila "Aguardando" chama atenção).
    if (data.contagem) {
      const sel = $('#wa-f');
      for (const opt of sel.options) {
        if (!opt.value.startsWith('at:')) continue;
        const n = data.contagem[opt.value.slice(3)] || 0;
        const base = opt.textContent.replace(/ \(\d+\)$/, '');
        opt.textContent = opt.value === 'at:concluido' ? base : `${base} (${n})`;
      }
    }
    box.innerHTML = data.items.length
      ? data.items.map(itemHtml).join('') + (data.total > data.items.length ? `<p class="wa-more">Mostrando ${data.items.length} de ${data.total}. Use a busca para achar as demais.</p>` : '')
      : `<div class="wa-none">${ui.esc(filtro.q ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa aqui.')}</div>`;
  }

  /* --------------------------------- conversa aberta -------------------------------- */
  function bolha(m) {
    const st = STATUS_MSG[m.status] || ['', ''];
    const saida = m.direcao === 'out';
    const quem = saida ? (m.origem === 'celular' ? 'pelo celular' : (m.origem === 'ia' ? 'resposta da IA' : '')) : '';
    return `<div class="wa-msg ${saida ? 'out' : 'in'}${m.origem === 'ia' ? ' ia' : ''}" data-mid="${m.id}">
      <div class="wa-bubble">
        <div class="wa-text">${ui.esc(m.texto)}</div>
        <div class="wa-meta">${quem ? `<span>${quem}</span>` : ''}<span>${ui.esc(ui.fmtDateTime(m.ocorrida_em).slice(-5))}</span>
          ${saida ? `<span class="wa-tick ${st[1]}">${ui.esc(st[0])}</span>` : ''}
          ${m.status === 'falhou' ? `<button type="button" class="wa-retry" data-retry="${m.id}">Tentar de novo</button>` : ''}</div>
        ${m.status === 'falhou' && m.erro ? `<div class="wa-err">${ui.esc(m.erro)}</div>` : ''}
      </div>
    </div>`;
  }

  function desenharCabecalho() {
    const c = atual;
    $('#wa-who').innerHTML = `<strong>${ui.esc(nomeDe(c))}</strong>
      <span class="muted">${ui.esc(c.telefone_exibicao || 'sem telefone')}${c.vinculo_tipo ? ` · ${ui.esc(TIPOS[c.vinculo_tipo])}` : ' · sem cadastro'}${c.responsavel_nome ? ` · ${ui.esc(c.responsavel_nome)}` : ''}</span>`;
    // No celular, estas ações ficam no menu "⋯" (mais espaço para a conversa).
    $('#wa-actions').innerHTML = `
      <button class="btn btn-sm btn-ghost wa-mais" data-act="mais" type="button" aria-label="Mais ações">⋯</button>
      <button class="btn btn-sm btn-soft" data-act="vincular" type="button">${c.vinculo_tipo ? 'Trocar cadastro' : 'Vincular cadastro'}</button>
      <button class="btn btn-sm btn-soft" data-act="tarefa" type="button">Criar tarefa</button>
      <button class="btn btn-sm btn-ghost" data-act="historico" type="button">Histórico</button>
      ${isAdmin ? `<button class="btn btn-sm btn-danger" data-act="ignorar" type="button">Ignorar contato</button>
      <button class="btn btn-sm btn-danger" data-act="excluir" type="button">Excluir</button>` : ''}`;
  }

  // Faixa do atendimento: estado, assunto, motivo da transferência, ações e histórico.
  function desenharAtendimento() {
    const c = atual;
    const est = ESTADO[c.atendimento] || ESTADO.ia;
    const botoes = [];
    if (c.atendimento === 'ia' || c.atendimento === 'aguardando') botoes.push('<button class="btn btn-sm btn-primary" data-at="assumir" type="button">Assumir</button>');
    if (c.atendimento === 'humano' || c.atendimento === 'aguardando') botoes.push('<button class="btn btn-sm btn-soft" data-at="devolver" type="button" title="Devolver para a IA">Devolver<span class="so-desk">à IA</span></button>');
    if (c.atendimento !== 'concluido') botoes.push('<button class="btn btn-sm btn-ghost" data-at="concluir" type="button">Concluir</button>');
    else botoes.push('<button class="btn btn-sm btn-soft" data-at="assumir" type="button">Reabrir</button>');
    const curto = { ia: 'IA atendendo', aguardando: 'Aguardando', humano: 'Humano', concluido: 'Concluído' }[c.atendimento] || 'IA atendendo';
    const detalhe = c.atendimento === 'aguardando' && c.atend_motivo ? c.atend_motivo : (c.atend_assunto ? ASSUNTO_MENU[c.atend_assunto] || '' : '');
    const dica = c.atendimento === 'humano' ? 'A IA não responde enquanto a equipe atende.' : est[0];
    $('#wa-atend').innerHTML = `<div class="wa-atend-linha est-${ui.esc(c.atendimento || 'ia')}" title="${ui.esc(dica)}">
        <button class="wa-atend-est" data-at="historico" type="button" title="Ver histórico e motivo"><i class="wa-dot"></i>${ui.esc(curto)}</button>
        ${detalhe ? `<span class="wa-atend-det">${ui.esc(detalhe)}</span>` : '<span class="wa-atend-det"></span>'}
        <span class="wa-atend-acoes">${botoes.join('')}</span>
      </div>`;
  }

  function modalHistorico() {
    const hist = eventos.map((e) => `<li>${ui.esc(ui.fmtDateTime(e.criado_em))} — ${ui.esc(EVENTO[e.tipo] || e.tipo)}${e.usuario_nome ? ` por ${ui.esc(e.usuario_nome)}` : (e.tipo === 'transferida' ? ' pela IA' : '')}${e.detalhe ? `: ${ui.esc(e.detalhe)}` : ''}</li>`).join('');
    const est = ESTADO[atual.atendimento] || ESTADO.ia;
    ui.modal({
      title: 'Histórico do atendimento', subtitle: nomeDe(atual), size: 'small',
      body: `<p style="margin:0 0 8px">${ui.badge(est[0], est[1])}${atual.atend_motivo && atual.atendimento === 'aguardando' ? ` <span class="wa-motivo">Motivo: ${ui.esc(atual.atend_motivo)}</span>` : ''}</p>
        ${hist ? `<ul class="wa-hist-lista">${hist}</ul>` : '<p class="muted">Nenhuma mudança registrada ainda.</p>'}`
    });
  }

  // Menu "⋯" do celular: as ações que não cabem na tela.
  function modalMais() {
    const c = atual;
    const itens = [
      ['vincular', c.vinculo_tipo ? 'Trocar cadastro vinculado' : 'Vincular a um cadastro', 'btn-soft'],
      ['tarefa', 'Criar tarefa', 'btn-soft'],
      ['historico', 'Histórico do atendimento', 'btn-soft'],
      ...(isAdmin ? [['ignorar', 'Ignorar contato', 'btn-danger'], ['excluir', 'Excluir conversa', 'btn-danger']] : [])
    ];
    const m = ui.modal({
      title: nomeDe(c), subtitle: c.telefone_exibicao || '', size: 'small',
      body: `<div class="wa-mais-lista">${itens.map(([k, t, cls]) => `<button class="btn ${cls}" data-mais="${k}" type="button">${ui.esc(t)}</button>`).join('')}</div>`
    });
    m.body.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mais]');
      if (!b) return;
      m.close();
      acao(b.dataset.mais);
    });
  }

  async function acaoAtendimento(nome) {
    if (!atual) return;
    if (nome === 'historico') { modalHistorico(); return; }
    const id = atual.id;
    let corpo = { acao: nome };
    if (nome === 'concluir') {
      const escolha = await new Promise((resolve) => {
        const m = ui.modal({
          title: 'Concluir atendimento', size: 'small',
          body: `<p style="font-size:14px;color:#33455e">A conversa sai da fila. Se o cliente escrever de novo, a IA volta a atender.</p>
            <label class="check" style="margin-top:12px"><input type="checkbox" id="cc-msg" checked><span>Enviar a mensagem de encerramento ao cliente</span></label>`,
          footer: '<button class="btn btn-ghost" data-cancel type="button">Cancelar</button><button class="btn btn-primary" data-ok type="button">Concluir</button>'
        });
        m.dialog.querySelector('[data-ok]').addEventListener('click', () => { const v = m.dialog.querySelector('#cc-msg').checked; m.close(); resolve({ enviar: v }); });
        m.dialog.querySelector('[data-cancel]').addEventListener('click', () => { m.close(); resolve(null); });
        m.dialog.addEventListener('close', () => resolve(null), { once: true });
      });
      if (!escolha) return;
      corpo = { acao: 'concluir', enviar_encerramento: escolha.enviar };
    }
    try {
      const r = await api.post(`/wa/conversas/${id}/atendimento`, corpo);
      if (!atual || atual.id !== id) return;
      atual = r.item;
      eventos = r.eventos || [];
      assinaturaAtual = '';
      desenharCabecalho();
      desenharAtendimento();
      ui.toast({ assumir: 'Você assumiu o atendimento. A IA não responde enquanto isso.', devolver: 'Conversa devolvida para a IA.', concluir: 'Atendimento concluído.' }[nome], 'success');
      carregarMensagens(true).catch(() => {});
      carregarLista().catch(() => {});
    } catch (err) { ui.toast(err.message, 'error'); }
  }

  async function carregarMensagens(forcarRolagem = false) {
    if (!atual) return;
    const id = atual.id;
    const data = await api.get(`/wa/conversas/${id}/mensagens`);
    if (!atual || atual.id !== id || !view.isConnected) return;
    const assin = data.items.map((m) => `${m.id}:${m.status}`).join(',');
    if (assin === assinatura && !forcarRolagem) return;
    const box = $('#wa-msgs');
    const noFim = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = data.items.map(bolha).join('') || '<div class="wa-none">Sem mensagens.</div>';
    assinatura = assin;
    ultimoMsgId = data.items.length ? data.items[data.items.length - 1].id : 0;
    desenharIA();
    if (forcarRolagem || noFim) box.scrollTop = box.scrollHeight;
    // Mensagem nova chegou com a conversa aberta: já conta como lida.
    if (data.items.length && atual.nao_lidas) { atual.nao_lidas = 0; api.post(`/wa/conversas/${id}/lida`, {}).catch(() => {}); }
  }

  async function abrir(id) {
    const data = await api.get(`/wa/conversas/${id}`);
    atual = data.item;
    eventos = data.eventos || [];
    assinatura = '';
    assinaturaAtual = `${atual.atendimento}|${atual.atend_motivo}|${atual.atend_assunto}|${eventos.length}`;
    $('#wa-empty').classList.add('hidden');
    $('#wa-inner').classList.remove('hidden');
    wa.classList.add('open-thread');
    desenharCabecalho();
    desenharAtendimento();
    analise = null;
    await carregarMensagens(true);
    carregarAnalise().catch(() => {});
    api.post(`/wa/conversas/${id}/lida`, {}).catch(() => {});
    atual.nao_lidas = 0;
    carregarLista().catch(() => {});
    $('#wa-text').focus({ preventScroll: true });
  }

  /* ------------------------------ assistente de IA ------------------------------ */
  async function carregarIaStatus() {
    try { iaSt = await api.get('/ia/status'); } catch (err) { /* mantém o anterior */ }
  }

  async function carregarAnalise() {
    if (!atual) return;
    const id = atual.id;
    const data = await api.get(`/wa/conversas/${id}/analise`);
    if (!atual || atual.id !== id) return;
    const mudou = JSON.stringify(data.item && [data.item.id, data.item.aplicado_em]) !== JSON.stringify(analise && [analise.id, analise.aplicado_em]);
    analise = data.item;
    if (mudou) desenharIA();
  }

  function desenharIA() {
    const box = $('#wa-ia');
    if (!box || !atual) return;
    if (!iaSt.pronta) {
      box.innerHTML = `<div class="wa-ia-off">${ui.icon('alert', 14)}<span>Assistente de IA ${iaSt.ativo ? 'sem chave configurada' : 'desativado'}. ${isAdmin ? 'Configure em Configurações > Inteligência (IA).' : 'Peça a um administrador para ativar.'}</span></div>`;
      return;
    }
    if (!analise) {
      box.innerHTML = `<div class="wa-ia-bar"><strong>Assistente de IA</strong><span class="muted">resume, classifica e sugere a resposta</span>
        <button class="btn btn-sm btn-primary" data-ia="analisar" type="button">Analisar com IA</button></div>`;
      return;
    }
    const r = analise.resultado || {};
    const velha = analise.mensagem_ate_id < ultimoMsgId;
    const [urgTxt, urgTom] = URGENCIA[r.urgencia] || URGENCIA.media;
    const [sentTxt, sentTom] = SENTIMENTO[r.sentimento] || SENTIMENTO.neutro;
    const campos = Object.entries(r.campos || {});
    const tipoPerfil = PERFIL_TIPO[r.perfil];
    const podeCriar = !atual.vinculo_tipo && tipoPerfil && campos.length;
    const podePreencher = !!atual.vinculo_tipo && campos.length;
    if (!iaAberta) {
      // Recolhido: uma linha só, para sobrar espaço para a conversa.
      box.innerHTML = `<button type="button" class="wa-ia-mini" data-ia="abrir">
        <strong>IA</strong>${ui.badge(ASSUNTO[r.assunto] || 'Outro', 'info')}
        <span class="wa-ia-mini-txt">${ui.esc(analise.aplicado_resumo || r.resumo || r.proxima_acao || 'Ver análise')}</span>
        <span class="wa-ia-mini-ver">${velha ? 'nova msg · ' : ''}ver ▾</span></button>`;
      return;
    }
    box.innerHTML = `<div class="wa-ia-card">
      <div class="wa-ia-top"><strong>Assistente de IA</strong>
        <button class="btn btn-sm btn-ghost" data-ia="fechar" type="button">Recolher ▴</button>
        ${ui.badge(ASSUNTO[r.assunto] || 'Outro', 'info')} ${ui.badge(urgTxt, urgTom)} ${ui.badge(sentTxt, sentTom)}
        ${velha ? '<span class="wa-ia-old">há mensagens novas desde esta análise</span>' : ''}
        <button class="btn btn-sm btn-ghost wa-ia-refresh" data-ia="analisar" type="button">${velha ? 'Analisar de novo' : 'Refazer'}</button></div>
      ${r.resumo ? `<p class="wa-ia-resumo">${ui.esc(r.resumo)}</p>` : ''}
      ${r.resposta_sugerida ? `<div class="wa-ia-box"><div class="wa-ia-label">Resposta sugerida${iaSt.responder ? ' (a IA envia sozinha no modo automático)' : ' (você revisa e envia)'}</div>
        <div class="wa-ia-sug">${ui.esc(r.resposta_sugerida)}</div>
        <button class="btn btn-sm btn-soft" data-ia="usar" type="button">Usar na resposta</button></div>` : ''}
      ${campos.length ? `<div class="wa-ia-box"><div class="wa-ia-label">Dados encontrados na conversa</div>
        <ul class="wa-ia-campos">${campos.map(([k, v]) => `<li><span>${ui.esc(CAMPO[k] || k)}</span><b>${ui.esc(v)}</b></li>`).join('')}</ul>
        ${podePreencher ? '<button class="btn btn-sm btn-soft" data-ia="preencher" type="button">Preencher campos vazios do cadastro</button>' : ''}
        ${podeCriar ? `<button class="btn btn-sm btn-soft" data-ia="criar" type="button">Criar cadastro de ${ui.esc(r.perfil)}</button>` : ''}</div>` : ''}
      ${r.proxima_acao ? `<div class="wa-ia-line"><span>Próxima ação</span> ${ui.esc(r.proxima_acao)}</div>` : ''}
      ${r.tarefa ? `<div class="wa-ia-line"><span>Tarefa sugerida</span> ${ui.esc(r.tarefa.titulo)} (em ${r.tarefa.prazo_dias} dia(s))
        <button class="btn btn-sm btn-ghost" data-ia="tarefa" type="button">Criar tarefa</button></div>` : ''}
      ${analise.aplicado_resumo ? `<div class="wa-ia-line ok"><span>${analise.origem === 'automatica' ? 'Automático' : 'Aplicado'}</span> ${ui.esc(analise.aplicado_resumo)}</div>` : ''}
    </div>`;
  }

  async function acaoIA(nome) {
    if (!atual) return;
    const id = atual.id;
    try {
      if (nome === 'abrir' || nome === 'fechar') { iaAberta = nome === 'abrir'; desenharIA(); return; }
      if (nome === 'analisar') {
        const botoes = view.querySelectorAll('[data-ia="analisar"]');
        botoes.forEach((b) => { b.disabled = true; b.textContent = 'Analisando…'; });
        try { analise = (await api.post(`/wa/conversas/${id}/analisar`, { forcar: !!analise })).item; } finally { desenharIA(); }
      } else if (nome === 'usar') {
        const campo = $('#wa-text');
        campo.value = analise.resultado.resposta_sugerida;
        campo.focus();
        ui.toast('Resposta colocada na caixa. Revise antes de enviar.', 'info');
      } else if (nome === 'preencher' || nome === 'criar') {
        const r = await api.post(`/wa/conversas/${id}/aplicar`, { criar: nome === 'criar' });
        ui.toast(r.criado ? 'Cadastro criado e vinculado.' : (r.preenchidos.length ? `Preenchido: ${r.preenchidos.map((k) => CAMPO[k] || k).join(', ')}.` : 'Nada novo para preencher.'), 'success');
        await atualizarAtual();
        await carregarAnalise();
        carregarLista().catch(() => {});
      } else if (nome === 'tarefa') {
        const t = analise.resultado.tarefa;
        await api.post(`/wa/conversas/${id}/tarefa`, { titulo: t.titulo, data_vencimento: ui.addDays(ui.todayISO(), t.prazo_dias) });
        ui.toast('Tarefa criada.', 'success');
      }
    } catch (err) { ui.toast(err.message, 'error'); }
  }

  async function atualizarAtual() {
    if (!atual) return;
    const id = atual.id;
    const data = await api.get(`/wa/conversas/${id}`);
    if (!atual || atual.id !== id) return;
    atual = data.item;
    eventos = data.eventos || [];
    // Só redesenha quando o atendimento mudou (não fecha o histórico aberto à toa).
    const assin = `${atual.atendimento}|${atual.atend_motivo}|${atual.atend_assunto}|${eventos.length}`;
    if (assin === assinaturaAtual) return;
    assinaturaAtual = assin;
    desenharCabecalho();
    desenharAtendimento();
    desenharIA();
  }

  async function enviar() {
    if (!atual) return;
    const campo = $('#wa-text');
    const texto = campo.value.trim();
    if (!texto) return;
    const botao = $('#wa-send');
    botao.disabled = true;
    try {
      await api.post(`/wa/conversas/${atual.id}/mensagens`, { texto });
      campo.value = '';
      await carregarMensagens(true);
      atualizarAtual().catch(() => {});
      carregarLista().catch(() => {});
    } catch (err) {
      ui.toast(err.message, 'error');
    } finally {
      botao.disabled = false;
      campo.focus({ preventScroll: true });
    }
  }

  /* ----------------------------------- ações --------------------------------------- */
  function modalVincular() {
    const c = atual;
    const corpo = document.createElement('div');
    corpo.innerHTML = `
      <div class="field"><label for="vc-tipo">Tipo de cadastro</label>
        <select id="vc-tipo"><option value="motoristas">Motorista</option>${state.meta.entities.entregadores ? '<option value="entregadores">Entregador</option>' : ''}<option value="passageiros">Passageiro</option><option value="parceiros">Parceiro</option></select></div>
      <div class="field"><label for="vc-q">Buscar pelo nome</label><input id="vc-q" type="search" maxlength="80" autocomplete="off"></div>
      <div class="wa-results" id="vc-res"></div>`;
    const m = ui.modal({
      title: 'Vincular a um cadastro', subtitle: nomeDe(c), body: corpo,
      footer: `${c.vinculo_tipo ? '<button class="btn btn-ghost" id="vc-remove" type="button">Remover vínculo</button>' : ''}<button class="btn btn-ghost" data-modal-close type="button">Fechar</button>`
    });
    const res = corpo.querySelector('#vc-res');
    let seq = 0;
    const buscar = async () => {
      const mine = ++seq;
      const tipo = corpo.querySelector('#vc-tipo').value;
      const q = corpo.querySelector('#vc-q').value.trim();
      const data = await api.get(`/relations?type=${encodeURIComponent(tipo)}&q=${encodeURIComponent(q)}`);
      if (mine !== seq) return;
      res.innerHTML = data.items.length
        ? data.items.map((i) => `<button type="button" class="wa-result" data-id="${i.id}">#${i.id} — ${ui.esc(i.label)}</button>`).join('')
        : '<div class="wa-none">Nada encontrado.</div>';
    };
    const buscarDebounce = ui.debounce(() => buscar().catch(() => {}), 250);
    corpo.querySelector('#vc-tipo').addEventListener('change', buscar);
    corpo.querySelector('#vc-q').addEventListener('input', buscarDebounce);
    res.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-id]');
      if (!b) return;
      try {
        await api.post(`/wa/conversas/${c.id}/vincular`, { tipo: corpo.querySelector('#vc-tipo').value, id: Number(b.dataset.id) });
        m.close();
        ui.toast('Conversa vinculada.', 'success');
        await atualizarAtual();
        carregarLista().catch(() => {});
      } catch (err) { ui.toast(err.message, 'error'); }
    });
    const remover = m.dialog.querySelector('#vc-remove');
    if (remover) remover.addEventListener('click', async () => {
      try {
        await api.post(`/wa/conversas/${c.id}/vincular`, { tipo: '' });
        m.close();
        await atualizarAtual();
        carregarLista().catch(() => {});
      } catch (err) { ui.toast(err.message, 'error'); }
    });
    buscar().catch(() => {});
  }

  function modalTarefa() {
    const c = atual;
    const corpo = document.createElement('div');
    corpo.innerHTML = `
      <div class="field"><label for="tf-titulo">Título</label><input id="tf-titulo" type="text" maxlength="120"></div>
      <div class="field"><label for="tf-data">Vencimento</label><input id="tf-data" type="date"></div>
      <div class="field"><label for="tf-prio">Prioridade</label>
        <select id="tf-prio"><option>Baixa</option><option selected>Média</option><option>Alta</option><option>Urgente</option></select></div>
      <div class="form-errors" id="tf-erro" hidden></div>`;
    corpo.querySelector('#tf-titulo').value = `Retornar WhatsApp: ${nomeDe(c)}`.slice(0, 120);
    corpo.querySelector('#tf-data').value = ui.addDays(ui.todayISO(), 1);
    const m = ui.modal({
      title: 'Criar tarefa', subtitle: nomeDe(c), body: corpo,
      footer: '<button class="btn btn-ghost" data-modal-close type="button">Cancelar</button><button class="btn btn-primary" id="tf-ok" type="button">Criar tarefa</button>'
    });
    m.dialog.querySelector('#tf-ok').addEventListener('click', async () => {
      const erro = corpo.querySelector('#tf-erro');
      try {
        await api.post(`/wa/conversas/${c.id}/tarefa`, {
          titulo: corpo.querySelector('#tf-titulo').value,
          data_vencimento: corpo.querySelector('#tf-data').value,
          prioridade: corpo.querySelector('#tf-prio').value
        });
        m.close();
        ui.toast('Tarefa criada.', 'success');
      } catch (err) {
        erro.hidden = false;
        erro.textContent = err.message;
      }
    });
  }

  async function acao(nome) {
    if (!atual) return;
    const c = atual;
    try {
      if (nome === 'mais') modalMais();
      else if (nome === 'historico') modalHistorico();
      else if (nome === 'vincular') modalVincular();
      else if (nome === 'tarefa') modalTarefa();
      else if (nome === 'situacao') {
        await api.patch(`/wa/conversas/${c.id}`, { situacao: c.situacao === 'Aberta' ? 'Resolvida' : 'Aberta' });
        await atualizarAtual();
        carregarLista().catch(() => {});
      } else if (nome === 'ignorar') {
        const ok = await ui.confirmDialog({
          title: 'Ignorar este contato?', danger: true, confirmLabel: 'Ignorar e apagar',
          message: 'A conversa e as mensagens serão apagadas do CRM e as próximas mensagens desse número serão descartadas. Isso não apaga nada no WhatsApp do celular.'
        });
        if (!ok) return;
        await api.post(`/wa/contatos/${c.contato_id}/ignorar`, {});
        fecharConversa();
        ui.toast('Contato ignorado.', 'success');
      } else if (nome === 'excluir') {
        const ok = await ui.confirmDialog({
          title: 'Excluir a conversa?', danger: true, confirmLabel: 'Excluir',
          message: 'As mensagens desta conversa serão apagadas do CRM (não do WhatsApp). Se o contato escrever de novo, a conversa recomeça.'
        });
        if (!ok) return;
        await api.del(`/wa/conversas/${c.id}`);
        fecharConversa();
        ui.toast('Conversa excluída.', 'success');
      }
    } catch (err) { ui.toast(err.message, 'error'); }
  }

  function fecharConversa() {
    atual = null;
    analise = null;
    assinatura = '';
    $('#wa-inner').classList.add('hidden');
    $('#wa-empty').classList.remove('hidden');
    wa.classList.remove('open-thread');
    carregarLista().catch(() => {});
  }

  /* ----------------------------------- eventos ------------------------------------- */
  $('#wa-items').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) abrir(Number(b.dataset.id)).catch((err) => ui.toast(err.message, 'error'));
  });
  $('#wa-q').addEventListener('input', ui.debounce((e) => { filtro.q = e.target.value.trim(); carregarLista().catch(() => {}); }, 300));
  $('#wa-f').addEventListener('change', (e) => { filtro.modo = e.target.value; carregarLista().catch(() => {}); });
  $('#wa-send').addEventListener('click', enviar);
  $('#wa-text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); } });
  $('#wa-back').addEventListener('click', fecharConversa);
  $('#wa-ia').addEventListener('click', (e) => { const b = e.target.closest('[data-ia]'); if (b) acaoIA(b.dataset.ia); });
  $('#wa-actions').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) acao(b.dataset.act); });
  $('#wa-atend').addEventListener('click', (e) => { const b = e.target.closest('[data-at]'); if (b) acaoAtendimento(b.dataset.at); });
  $('#wa-msgs').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-retry]');
    if (!b) return;
    try { await api.post(`/wa/mensagens/${b.dataset.retry}/reenviar`, {}); await carregarMensagens(true); } catch (err) { ui.toast(err.message, 'error'); }
  });

  // Atualização periódica (consulta leve). Para sozinha quando a tela é trocada.
  const timer = setInterval(() => {
    if (!view.isConnected) { clearInterval(timer); return; }
    if (document.hidden) return;
    carregarLista().catch(() => {});
    carregarMensagens().catch(() => {});
    if (atual) atualizarAtual().catch(() => {});
    if (atual && iaSt.pronta && iaSt.modo === 'automatico') carregarAnalise().catch(() => {});
    carregarStatus();
  }, 4000);

  await Promise.all([carregarStatus(), carregarLista(), carregarIaStatus()]);
  // Veio de uma notificação (#/conversas?c=ID): abre a conversa direto.
  const cIni = Number(new URLSearchParams(location.hash.split('?')[1] || '').get('c'));
  if (Number.isInteger(cIni) && cIni > 0) abrir(cIni).catch(() => {});
}

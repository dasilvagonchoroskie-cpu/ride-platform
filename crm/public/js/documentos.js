// Documentos (M4): arquivo digital por função. Painel dentro de cada ficha + tela "Documentos".
// A permissão é decidida no servidor; aqui só escondemos o que o perfil não pode usar (campo `pode` de cada documento).
// Nenhum arquivo tem endereço público: ver/baixar busca o conteúdo pela API (com a sessão) e abre um blob local.
import { api, ApiError } from './api.js';
import * as ui from './ui.js';
import { abrirExportacao, podePdf } from './exportar.js';

export const FUNCAO_DA_ENTIDADE = { motoristas: 'motorista', entregadores: 'entregador', parceiros: 'parceiro_clube', comercios: 'comercio' };
const ENTIDADE_DA_FUNCAO = Object.fromEntries(Object.entries(FUNCAO_DA_ENTIDADE).map(([k, v]) => [v, k]));
const ROTULO_FUNCAO = { motorista: 'Motorista', entregador: 'Entregador', parceiro_clube: 'Parceiro do Clube', comercio: 'Comércio' };
const TOM = { nao_enviado: 'neutral', pendente: 'warn', conferido: 'success', rejeitado: 'danger', necessita_atualizacao: 'danger' };
const TOM_GERAL = { sem_exigencia: 'neutral', nao_enviados: 'neutral', incompletos: 'warn', pendentes_conferencia: 'warn', com_pendencias: 'danger', conferidos: 'success' };
const ROTULO_EVENTO = {
  enviado: 'Enviado', substituido: 'Nova versão enviada', conferido: 'Conferido', rejeitado: 'Rejeitado', necessita_atualizacao: 'Necessita atualização',
  visualizado: 'Visualizado', baixado: 'Baixado', acesso_negado: 'Acesso negado', observacao: 'Observação', integridade_falhou: 'Falha de integridade', exclusao_definitiva: 'Exclusão definitiva'
};

const tamanho = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const badge = (texto, tom) => `<span class="badge ${tom}">${ui.esc(texto)}</span>`;

/** Lê o arquivo (com a sessão) e devolve { blob, nome }. Nunca vira link público. */
async function buscarArquivo(id, { versao, modo }) {
  const q = new URLSearchParams();
  if (versao) q.set('versao', versao);
  if (modo) q.set('modo', modo);
  let res;
  try { res = await fetch(`/api/documentos/${id}/arquivo?${q}`, { credentials: 'same-origin' }); } catch (err) { throw new ApiError('Falha de conexão com o servidor.', 0, 'network'); }
  if (!res.ok) {
    let msg = 'Não foi possível abrir o documento.';
    try { const j = await res.json(); if (j && j.error) msg = j.error.message; } catch (err) { /* sem corpo */ }
    throw new ApiError(msg, res.status, 'arquivo');
  }
  const m = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '');
  return { blob: await res.blob(), nome: m ? m[1] : 'documento' };
}

async function ver(id, versao) {
  const { blob } = await buscarArquivo(id, { versao, modo: 'ver' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) ui.toast('O navegador bloqueou a nova aba. Use “Baixar”.', 'error');
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
async function baixar(id, versao) {
  const { blob, nome } = await buscarArquivo(id, { versao, modo: 'baixar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  ui.toast('Arquivo baixado.', 'success');
}

/** Envia o arquivo (corpo bruto; metadados em cabeçalhos). */
async function enviar(caminho, arquivo, meta) {
  let res;
  try {
    res = await fetch(`/api${caminho}`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Documento': encodeURIComponent(JSON.stringify(meta)), 'X-Nome-Arquivo': encodeURIComponent(arquivo.name) },
      body: arquivo
    });
  } catch (err) { throw new ApiError('Falha de conexão com o servidor.', 0, 'network'); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError((data && data.error && data.error.message) || 'Não foi possível enviar o arquivo.', res.status, 'upload');
  return data;
}

/** Janela para escolher o arquivo e confirmar o envio (nova versão ou novo documento). */
function janelaEnvio({ titulo, caminho, meta, pedirNome = false, maxMb, depois }) {
  const m = ui.modal({
    title: titulo, size: 'small',
    body: `<div class="form-grid" style="display:grid;gap:12px">
      ${pedirNome ? '<div class="field"><label for="dv-nome">Nome do documento</label><input id="dv-nome" maxlength="80" placeholder="Ex.: Foto da fachada"></div>' : ''}
      <div class="field"><label for="dv-arq">Arquivo (PDF, JPG, PNG ou WEBP, até ${ui.esc(maxMb)} MB)</label>
        <input id="dv-arq" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"></div>
      <div class="field"><label for="dv-data">Data em que o documento foi recebido</label><input id="dv-data" type="date" value="${ui.todayISO()}" max="${ui.todayISO()}"></div>
      <div class="field"><label for="dv-obs">Observação (opcional)</label><input id="dv-obs" maxlength="500"></div>
      <p class="small muted" style="margin:0">${ui.icon('lock', 13)} O arquivo é guardado cifrado, em área privada. Uma nova versão nunca apaga a anterior.</p>
      <p class="small" id="dv-erro" style="color:#b42318;margin:0" role="alert"></p>
    </div>`,
    footer: '<button class="btn btn-ghost" data-fechar type="button">Cancelar</button><button class="btn btn-primary" id="dv-ok" type="button">Enviar</button>'
  });
  m.dialog.querySelector('[data-fechar]').addEventListener('click', m.close);
  const ok = m.dialog.querySelector('#dv-ok');
  const erro = m.dialog.querySelector('#dv-erro');
  ok.addEventListener('click', async () => {
    erro.textContent = '';
    const arq = m.dialog.querySelector('#dv-arq').files[0];
    if (!arq) { erro.textContent = 'Escolha um arquivo.'; return; }
    ok.disabled = true; ok.textContent = 'Enviando…';
    try {
      const dados = { ...meta, data_envio: m.dialog.querySelector('#dv-data').value, observacoes: m.dialog.querySelector('#dv-obs').value };
      if (pedirNome) dados.titulo = m.dialog.querySelector('#dv-nome').value;
      await enviar(caminho, arq, dados);
      ui.toast('Documento enviado. Aguarda conferência.', 'success');
      m.close();
      depois();
    } catch (err) { erro.textContent = err.message; ok.disabled = false; ok.textContent = 'Enviar'; }
  });
}

function janelaConferencia(doc, depois) {
  const m = ui.modal({
    title: `Conferir: ${doc.titulo || doc.categoria_rotulo}`, size: 'small',
    body: `<div style="display:grid;gap:12px">
      <p class="small muted" style="margin:0">Versão ${doc.versao_atual ? doc.versao_atual.numero : '—'}. Conferir <b>não</b> contrata nem muda a situação da pessoa: só registra a conferência do documento.</p>
      <div class="field"><label for="cf-res">Resultado</label><select id="cf-res">
        <option value="conferido">Conferido (documento correto)</option><option value="rejeitado">Rejeitado (inválido)</option><option value="necessita_atualizacao">Necessita atualização (vencido ou ilegível)</option></select></div>
      <div class="field"><label for="cf-obs">Observação (obrigatória se não for conferido)</label><input id="cf-obs" maxlength="500"></div>
      <p class="small" id="cf-erro" style="color:#b42318;margin:0" role="alert"></p></div>`,
    footer: '<button class="btn btn-ghost" data-fechar type="button">Cancelar</button><button class="btn btn-primary" id="cf-ok" type="button">Registrar</button>'
  });
  m.dialog.querySelector('[data-fechar]').addEventListener('click', m.close);
  m.dialog.querySelector('#cf-ok').addEventListener('click', async () => {
    try {
      await api.post(`/documentos/${doc.id}/conferir`, { resultado: m.dialog.querySelector('#cf-res').value, observacoes: m.dialog.querySelector('#cf-obs').value });
      ui.toast('Conferência registrada.', 'success');
      m.close(); depois();
    } catch (err) { m.dialog.querySelector('#cf-erro').textContent = err.message; }
  });
}

async function janelaHistorico(id) {
  let h;
  try { h = await api.get(`/documentos/${id}`); } catch (err) { ui.toast(err.message, 'error'); return; }
  const d = h.documento;
  const m = ui.modal({
    title: `Histórico: ${d.titulo || d.categoria_rotulo}`, subtitle: `${d.funcao_rotulo} · ${d.registro_titulo}`, size: 'wide',
    body: `<div class="section-title">Versões (todas guardadas)</div>
      <div class="doc-lista">${h.versoes.map((v) => `<div class="doc-linha">
        <div class="doc-info"><b>Versão ${v.numero}</b>${v.atual ? ' ' + badge('atual', 'info') : ''}
          <div class="small muted">Recebido em ${ui.fmtDate(v.data_envio)} · incluído em ${ui.fmtDateTime(v.incluido_em)} por ${ui.esc(v.incluido_por_nome || '—')} · ${ui.esc(v.extensao.toUpperCase())} · ${tamanho(v.tamanho)}</div>
          ${v.observacao_envio ? `<div class="small">${ui.esc(v.observacao_envio)}</div>` : ''}
          ${v.sha256 ? `<div class="small muted" title="Impressão digital SHA-256 do arquivo original">SHA-256 ${ui.esc(v.sha256.slice(0, 16))}…</div>` : ''}
          ${v.arquivo_removido_em ? `<div class="small" style="color:#b42318">Arquivo removido em ${ui.fmtDate(v.arquivo_removido_em)}</div>` : ''}</div>
        ${v.pode_ver ? `<div class="doc-acoes"><button class="btn btn-sm btn-ghost" data-ver="${v.numero}" type="button">Ver</button><button class="btn btn-sm btn-ghost" data-baixar="${v.numero}" type="button">Baixar</button></div>` : ''}
      </div>`).join('')}</div>
      <div class="section-title">Registro de ações</div>
      <div class="timeline">${h.eventos.map((e) => `<div class="tl-item"><div class="tl-dot"></div><div>
        <p><b>${ui.esc(ROTULO_EVENTO[e.tipo] || e.tipo)}</b>${e.detalhe ? ` — ${ui.esc(e.detalhe)}` : ''}</p>
        <div class="tl-meta">${ui.fmtDateTime(e.criado_em)} · ${ui.esc(e.usuario_nome || '—')}</div></div></div>`).join('') || '<p class="muted small">Sem registros.</p>'}</div>`
  });
  m.dialog.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => ver(id, b.dataset.ver).catch((e) => ui.toast(e.message, 'error'))));
  m.dialog.querySelectorAll('[data-baixar]').forEach((b) => b.addEventListener('click', () => baixar(id, b.dataset.baixar).catch((e) => ui.toast(e.message, 'error'))));
}

function linhaDoc(it) {
  const v = it.versao_atual;
  const detalhe = it.situacao === 'nao_enviado'
    ? '<span class="muted small">Ainda não enviado</span>'
    : `<span class="small muted">v${v.numero} · recebido em ${ui.fmtDate(v.data_envio)}${it.total_versoes > 1 ? ` · ${it.total_versoes} versões` : ''}${it.conferido_por_nome ? ` · conferido por ${ui.esc(it.conferido_por_nome)} em ${ui.fmtDate(it.conferido_em)}` : ''}</span>`;
  const botoes = [];
  if (it.id && it.pode.ver) botoes.push(`<button class="btn btn-sm btn-ghost" data-ver type="button">Ver</button><button class="btn btn-sm btn-ghost" data-baixar type="button">Baixar</button>`);
  if (it.id && it.pode.conferir) botoes.push('<button class="btn btn-sm btn-gold" data-conferir type="button">Conferir</button>');
  return `<div class="doc-linha" data-doc="${it.id || ''}" data-cat="${ui.esc(it.categoria)}">
    <div class="doc-info"><div><b>${ui.esc(it.titulo || it.categoria_rotulo)}</b> ${it.obrigatorio ? '<span class="small muted">(exigido)</span>' : ''}</div>
      <div style="margin:3px 0">${badge(it.situacao_rotulo, TOM[it.situacao] || 'neutral')}</div>${detalhe}
      ${it.observacoes && it.situacao !== 'conferido' ? `<div class="small" style="margin-top:2px">${ui.esc(it.observacoes)}</div>` : ''}</div>
    <div class="doc-acoes">${botoes.join('')}
      ${it.pode_anexar ? `<button class="btn btn-sm btn-soft" data-anexar type="button">${ui.icon('plus', 13)} ${it.id ? 'Nova versão' : 'Anexar'}</button>` : ''}
      ${it.id ? '<button class="btn btn-sm btn-ghost" data-hist type="button">Histórico</button>' : ''}</div>
  </div>`;
}

/** Painel de documentos dentro de uma ficha (motorista, entregador, parceiro do Clube, comércio). */
export async function montarPainel(container, state, funcao, registroId) {
  container.innerHTML = '<div class="section-title">Documentos (arquivo digital)</div><p class="small muted">Carregando documentos…</p>';
  let d; let meta;
  try { [d, meta] = await Promise.all([api.get(`/documentos?funcao=${funcao}&registro_id=${registroId}`), api.get('/documentos/meta')]); } catch (err) {
    container.innerHTML = `<div class="section-title">Documentos (arquivo digital)</div><div class="notice warn">${ui.esc(err.message)}</div>`; return;
  }
  const pronto = d.armazenamento && d.armazenamento.pronto;
  const recarregar = () => montarPainel(container, state, funcao, registroId);
  // Tipos que não são exigidos também podem ser anexados: aparecem como "Não enviado" até o primeiro envio.
  const itens = [...d.itens, ...d.categorias.filter((c) => c.chave !== 'outros' && !d.itens.some((i) => i.categoria === c.chave)).map((c) => ({
    id: null, categoria: c.chave, categoria_rotulo: c.rotulo, titulo: null, situacao: 'nao_enviado', situacao_rotulo: meta.situacoes.nao_enviado, obrigatorio: false,
    versao_atual: null, total_versoes: 0, conferido_por_nome: null, conferido_em: null, observacoes: null, pode: { ver: false, conferir: false }
  }))];
  container.innerHTML = `<div class="section-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">Documentos (arquivo digital) ${badge(d.geral.rotulo, TOM_GERAL[d.geral.codigo] || 'neutral')}</div>
    ${d.geral.exigidos ? `<p class="small muted" style="margin:0 0 8px">${d.geral.enviados} de ${d.geral.exigidos} exigido(s) enviado(s) · ${d.geral.conferidos} conferido(s)</p>` : ''}
    ${!pronto ? `<div class="notice warn" style="margin-bottom:8px">${ui.icon('alert', 15)} <span>Envio indisponível: ${ui.esc((d.armazenamento && d.armazenamento.motivo) || 'armazenamento não configurado')}</span></div>` : ''}
    <div class="doc-lista">${itens.map((i) => linhaDoc({ ...i, pode_anexar: pronto && d.pode.anexar })).join('')}</div>
    ${pronto && d.pode.anexar ? `<div style="margin-top:8px"><button class="btn btn-sm btn-ghost" id="dp-outro" type="button">${ui.icon('plus', 14)} Outro documento</button></div>` : ''}
    <p class="small muted" style="margin:8px 0 0">${state.user && state.user.role === 'admin' ? '' : 'Por segurança, o arquivo só abre para quem foi autorizado pelo administrador. '}Anexar ou conferir não altera a contratação nem a situação da ficha.</p>`;
  const porId = new Map(d.itens.filter((i) => i.id).map((i) => [String(i.id), i]));
  container.querySelectorAll('.doc-linha').forEach((linha) => {
    const id = linha.dataset.doc; const it = id ? porId.get(id) : null;
    const cat = linha.dataset.cat;
    const on = (sel, fn) => { const b = linha.querySelector(sel); if (b) b.addEventListener('click', fn); };
    on('[data-ver]', () => ver(id).catch((e) => ui.toast(e.message, 'error')));
    on('[data-baixar]', () => baixar(id).catch((e) => ui.toast(e.message, 'error')));
    on('[data-conferir]', () => janelaConferencia(it, recarregar));
    on('[data-hist]', () => janelaHistorico(id));
    on('[data-anexar]', () => janelaEnvio({
      titulo: id ? `Nova versão: ${it.titulo || it.categoria_rotulo}` : `Anexar: ${linha.querySelector('b').textContent}`,
      caminho: id ? `/documentos/${id}/versoes` : '/documentos', meta: id ? {} : { funcao, registro_id: registroId, categoria: cat }, maxMb: d.armazenamento.max_mb, depois: recarregar
    }));
  });
  const outro = container.querySelector('#dp-outro');
  if (outro) outro.addEventListener('click', () => janelaEnvio({ titulo: 'Anexar outro documento', caminho: '/documentos', meta: { funcao, registro_id: registroId, categoria: 'outros' }, pedirNome: true, maxMb: d.armazenamento.max_mb, depois: recarregar }));
  void meta;
}

/** Resumo por função para a ficha central (pessoa/empresa): só a situação geral. */
export function resumoCentral(documentos, funcao, registroId) {
  const r = (documentos || []).find((x) => x.funcao === funcao && x.registro_id === registroId);
  if (!r) return '';
  return badge(`Arquivo digital: ${r.geral.rotulo}`, TOM_GERAL[r.geral.codigo] || 'neutral');
}

/** Bloco de CPF/CNPJ da ficha central (somente administrador; o servidor decide de novo). */
export function blocoProtegido(container, state, tipo, id, protegido, depois) {
  const eh = tipo === 'pessoa';
  const campo = eh ? 'cpf' : 'cnpj'; const rotulo = eh ? 'CPF' : 'CNPJ'; const caminho = `/${eh ? 'pessoas' : 'empresas'}/${id}/${campo}`;
  const aceita = protegido.coleta === 'opcional';
  container.innerHTML = `<div class="card" style="margin:14px 0"><div class="card-body" style="display:grid;gap:8px">
    <div><b>${rotulo} (dado protegido)</b> ${protegido.tem ? badge(protegido.mascara, 'neutral') : badge('não informado', 'neutral')}</div>
    <p class="small muted" style="margin:0">${ui.icon('lock', 13)} Guardado cifrado. Só o administrador consulta, e cada consulta fica registrada.${protegido.finalidade ? ` Finalidade: ${ui.esc(protegido.finalidade)}.` : ''}</p>
    ${aceita ? '' : `<p class="small" style="margin:0">A coleta de ${rotulo} está desligada: depende de decisão do dono (Documentos → Política).</p>`}
    <div class="row" style="gap:8px;flex-wrap:wrap">
      ${aceita ? `<button class="btn btn-sm btn-soft" id="pr-def" type="button">${protegido.tem ? 'Atualizar' : 'Informar'} ${rotulo}</button>` : ''}
      ${protegido.tem ? `<button class="btn btn-sm btn-ghost" id="pr-rev" type="button">Mostrar número</button><button class="btn btn-sm btn-ghost" id="pr-rem" type="button">Remover</button>` : ''}
    </div></div></div>`;
  const q = (s) => container.querySelector(s);
  if (q('#pr-def')) q('#pr-def').addEventListener('click', () => {
    const m = ui.modal({ title: `${rotulo}`, size: 'small',
      body: `<div style="display:grid;gap:12px"><div class="field"><label for="pr-v">${rotulo}</label><input id="pr-v" inputmode="numeric" autocomplete="off"></div>
        <div class="field"><label for="pr-f">Finalidade (por que este dado é necessário)</label><input id="pr-f" maxlength="200" placeholder="Ex.: contratação de motorista"></div>
        <p class="small" id="pr-e" style="color:#b42318;margin:0" role="alert"></p></div>`,
      footer: '<button class="btn btn-ghost" data-fechar type="button">Cancelar</button><button class="btn btn-primary" id="pr-ok" type="button">Salvar</button>' });
    m.dialog.querySelector('[data-fechar]').addEventListener('click', m.close);
    m.dialog.querySelector('#pr-ok').addEventListener('click', async () => {
      try { await api.put(caminho, { [campo]: m.dialog.querySelector('#pr-v').value, finalidade: m.dialog.querySelector('#pr-f').value }); ui.toast(`${rotulo} salvo (cifrado).`, 'success'); m.close(); depois(); } catch (err) { m.dialog.querySelector('#pr-e').textContent = err.message; }
    });
  });
  if (q('#pr-rev')) q('#pr-rev').addEventListener('click', async () => {
    try { const r = await api.post(`${caminho}/revelar`); ui.toast(`${rotulo}: ${r.valor} (consulta registrada)`, 'info'); } catch (err) { ui.toast(err.message, 'error'); }
  });
  if (q('#pr-rem')) q('#pr-rem').addEventListener('click', async () => {
    const ok = await ui.confirmDialog({ title: `Remover ${rotulo}`, message: `O ${rotulo} será apagado desta ficha. Deseja continuar?`, confirmLabel: 'Remover', danger: true });
    if (!ok) return;
    try { await api.post(`${caminho}/remover`, { confirmo: true }); ui.toast(`${rotulo} removido.`, 'success'); depois(); } catch (err) { ui.toast(err.message, 'error'); }
  });
}

/* ------------------------------ tela "Documentos" ------------------------------ */
export async function renderDocumentos(view, state) {
  const admin = state.user && state.user.role === 'admin';
  const meta = await api.get('/documentos/meta');
  const f = { situacao: '', funcao: '', q: '', page: 1 };
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Documentos</div><h2>Arquivo digital</h2>
      <p class="sub">Situação da conferência de todos os documentos, por função</p></div>
      <div class="page-actions no-print">${podePdf(state, 'documentos') ? `<button class="btn btn-ghost" id="dc-exp" type="button">${ui.icon('download', 16)} Exportar</button>` : ''}</div></div>
    ${meta.armazenamento.pronto ? '' : `<div class="notice warn" style="margin-bottom:12px">${ui.icon('alert', 15)} <span>Armazenamento não está pronto: ${ui.esc(meta.armazenamento.motivo || '')}</span></div>`}
    <div id="dc-pend"></div>
    <div class="toolbar no-print">
      <div class="field" style="flex:1;min-width:150px"><label for="dc-q">Buscar pelo nome</label><input id="dc-q" type="search" placeholder="Nome na ficha"></div>
      <div class="field"><label for="dc-s">Situação</label><select id="dc-s"><option value="">Todas</option>${Object.entries(meta.situacoes).map(([k, v]) => `<option value="${k}">${ui.esc(v)}</option>`).join('')}</select></div>
      <div class="field"><label for="dc-f">Função</label><select id="dc-f"><option value="">Todas</option>${Object.keys(meta.funcoes).map((k) => `<option value="${k}">${ui.esc(ROTULO_FUNCAO[k] || k)}</option>`).join('')}</select></div>
    </div>
    <div class="card"><div class="card-body" id="dc-corpo"><p class="muted small">Carregando…</p></div></div>
    <div id="dc-pol"></div>`;
  const corpo = view.querySelector('#dc-corpo');
  let seq = 0;
  async function carregar() {
    const mine = ++seq;
    const q = new URLSearchParams({ page: f.page });
    for (const k of ['situacao', 'funcao', 'q']) if (f[k]) q.set(k, f[k]);
    let r;
    try { r = await api.get(`/documentos/lista?${q}`); } catch (err) { if (mine === seq) corpo.innerHTML = `<p class="small" style="color:#b42318">${ui.esc(err.message)}</p>`; return; }
    if (mine !== seq) return;
    corpo.innerHTML = r.items.length ? `<div class="doc-lista">${r.items.map((i) => {
      const ent = ENTIDADE_DA_FUNCAO[i.funcao];
      return `<div class="doc-linha"><div class="doc-info"><div><b>${ui.esc(i.titulo || i.categoria_rotulo)}</b> · ${ui.esc(i.registro_titulo)}</div>
        <div style="margin:3px 0">${badge(i.situacao_rotulo, TOM[i.situacao] || 'neutral')} <span class="small muted">${ui.esc(i.funcao_rotulo)}</span></div>
        <span class="small muted">${i.versao_atual ? `v${i.versao_atual.numero} · recebido em ${ui.fmtDate(i.versao_atual.data_envio)}` : ''}${i.conferido_por_nome ? ` · conferido por ${ui.esc(i.conferido_por_nome)}` : ''}</span></div>
        <div class="doc-acoes">${i.registro_existe && ent ? `<a class="btn btn-sm btn-soft" href="#/${ent}?abrir=${i.registro_id}">Abrir ficha</a>` : '<span class="small muted">Ficha encerrada</span>'}
        <button class="btn btn-sm btn-ghost" data-hist="${i.id}" type="button">Histórico</button></div></div>`;
    }).join('')}</div>
      <div class="row" style="justify-content:space-between;margin-top:10px"><span class="small muted">${ui.fmtInt(r.total)} documento(s)</span>
        <span class="row" style="gap:6px"><button class="btn btn-sm btn-ghost" id="dc-ant" ${r.page <= 1 ? 'disabled' : ''} type="button">Anterior</button><button class="btn btn-sm btn-ghost" id="dc-prox" ${r.page >= r.pages ? 'disabled' : ''} type="button">Próxima</button></span></div>`
      : '<div class="empty"><p>Nenhum documento encontrado para estes filtros.</p></div>';
    corpo.querySelectorAll('[data-hist]').forEach((b) => b.addEventListener('click', () => janelaHistorico(b.dataset.hist)));
    const ant = corpo.querySelector('#dc-ant'); const prox = corpo.querySelector('#dc-prox');
    if (ant) ant.addEventListener('click', () => { f.page -= 1; carregar(); });
    if (prox) prox.addEventListener('click', () => { f.page += 1; carregar(); });
  }
  view.querySelector('#dc-q').addEventListener('input', ui.debounce((e) => { f.q = e.target.value.trim(); f.page = 1; carregar(); }));
  view.querySelector('#dc-s').addEventListener('change', (e) => { f.situacao = e.target.value; f.page = 1; carregar(); });
  view.querySelector('#dc-f').addEventListener('change', (e) => { f.funcao = e.target.value; f.page = 1; carregar(); });
  const exp = view.querySelector('#dc-exp');
  if (exp) exp.addEventListener('click', () => {
    const q = new URLSearchParams({ type: 'documentos' });
    for (const k of ['situacao', 'funcao', 'q']) if (f[k]) q.set(k, f[k]);
    abrirExportacao(state, { titulo: 'Exportar documentos', tipo: 'documentos', pdf: q.toString(), csv: q.toString(), csvNome: 'documentos.csv' });
  });
  if (admin) politicaAdmin(view.querySelector('#dc-pol'), view.querySelector('#dc-pend'));
  await carregar();
}

/** Política de documentos (somente administrador) e as decisões que ainda dependem do dono. */
async function politicaAdmin(host, hostPend) {
  let p;
  try { p = await api.get('/documentos/politica'); } catch (err) { return; }
  const pol = p.politica;
  if (p.decisoes_pendentes.length) {
    hostPend.innerHTML = `<div class="notice warn" style="margin-bottom:12px">${ui.icon('alert', 15)} <span><b>Decisões do dono ainda pendentes</b> (nada é apagado nem exigido até lá):<ul style="margin:6px 0 0 18px;padding:0">${p.decisoes_pendentes.map((d) => `<li>${ui.esc(d.texto)}</li>`).join('')}</ul></span></div>`;
  }
  const cats = [...new Map(Object.values(p.categorias).flat().map((c) => [c.chave, c.rotulo])).entries()];
  host.innerHTML = `<div class="section-title">Política de documentos (administrador)</div>
    <div class="card"><div class="card-body" style="display:grid;gap:14px">
      <div><b>Arquivos que o gestor pode ver e baixar</b><p class="small muted" style="margin:2px 0 6px">Nenhum por padrão: o gestor só vê a situação.</p>
        <div class="pol-checks">${cats.map(([k, r]) => `<label class="check"><input type="checkbox" data-vis="${k}" ${pol.gestor.categorias_visiveis.includes(k) ? 'checked' : ''}> ${ui.esc(r)}</label>`).join('')}</div></div>
      <label class="check"><input type="checkbox" id="pl-conf" ${pol.gestor.conferir ? 'checked' : ''}> Gestor pode conferir (só os tipos que ele pode ver)</label>
      <label class="check"><input type="checkbox" id="pl-anex" ${pol.gestor.anexar ? 'checked' : ''}> Gestor pode anexar documentos</label>
      <label class="check"><input type="checkbox" id="pl-cpf" ${pol.cpf_cnpj.cpf === 'opcional' ? 'checked' : ''}> Permitir informar CPF (pessoas) — opcional</label>
      <label class="check"><input type="checkbox" id="pl-cnpj" ${pol.cpf_cnpj.cnpj === 'opcional' ? 'checked' : ''}> Permitir informar CNPJ (empresas) — opcional</label>
      <label class="check"><input type="checkbox" id="pl-exc" ${pol.exclusao_definitiva ? 'checked' : ''}> Permitir exclusão definitiva de arquivos (só administrador, com motivo)</label>
      <div><b>Documentos exigidos por função</b>${Object.entries(p.categorias).map(([fn, lista]) => `<div style="margin-top:6px"><span class="small muted">${ui.esc(ROTULO_FUNCAO[fn] || fn)}</span>
        <div class="pol-checks">${lista.filter((c) => c.chave !== 'outros').map((c) => `<label class="check"><input type="checkbox" data-obr="${fn}:${c.chave}" ${(pol.obrigatorios[fn] || []).includes(c.chave) ? 'checked' : ''}> ${ui.esc(c.rotulo)}</label>`).join('')}</div></div>`).join('')}</div>
      <p class="small muted" style="margin:0">Armazenamento: ${ui.esc(p.armazenamento.tipo)}${p.armazenamento.pronto ? ' (pronto)' : ` — não pronto: ${ui.esc(p.armazenamento.motivo || '')}`}. Formatos: ${ui.esc(p.armazenamento.formatos.join(', '))}, até ${p.armazenamento.max_mb} MB.</p>
      <div><button class="btn btn-primary" id="pl-salvar" type="button">Salvar política</button></div></div></div>`;
  host.querySelector('#pl-salvar').addEventListener('click', async () => {
    const obrigatorios = {};
    for (const fn of Object.keys(p.categorias)) obrigatorios[fn] = [...host.querySelectorAll(`[data-obr^="${fn}:"]:checked`)].map((c) => c.dataset.obr.split(':')[1]);
    try {
      await api.put('/documentos/politica', {
        obrigatorios,
        gestor: { categorias_visiveis: [...host.querySelectorAll('[data-vis]:checked')].map((c) => c.dataset.vis), conferir: host.querySelector('#pl-conf').checked, anexar: host.querySelector('#pl-anex').checked },
        cpf_cnpj: { cpf: host.querySelector('#pl-cpf').checked ? 'opcional' : 'desligado', cnpj: host.querySelector('#pl-cnpj').checked ? 'opcional' : 'desligado' },
        exclusao_definitiva: host.querySelector('#pl-exc').checked
      });
      ui.toast('Política salva e registrada na auditoria.', 'success');
      politicaAdmin(host, hostPend);
    } catch (err) { ui.toast(err.message, 'error'); }
  });
}

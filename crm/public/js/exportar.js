// Exportação padrão do CRM: PDF é o formato principal (baixar, abrir/imprimir, compartilhar); CSV fica como alternativa.
// A permissão é decidida no servidor; aqui só escondemos o que o perfil não pode usar (state.meta.can).
import { api } from './api.js';
import * as ui from './ui.js';

export const podePdf = (state, tipo) => !!(state.meta.can && (state.meta.can.exportar_pdf || []).includes(tipo));
export const podeCsv = (state) => !!(state.meta.can && state.meta.can.exportar);
export const podeExportar = (state, tipo) => podePdf(state, tipo) || podeCsv(state);

const tamanho = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Abre a janela "Exportar". `pdf` = query do PDF (ex.: 'type=motoristas&q=ana'); `csv` = query do CSV (ex.: 'type=motoristas&modo=lista') ou null.
 * O PDF é gerado uma vez ao abrir; os botões usam o mesmo arquivo.
 */
export function abrirExportacao(state, { titulo, tipo, pdf, csv = null, csvNome = 'exportacao.csv' }) {
  const temPdf = podePdf(state, tipo);
  const temCsv = !!csv && podeCsv(state);
  if (!temPdf && !temCsv) { ui.toast('Seu perfil não pode exportar este relatório.', 'error'); return; }
  let urlBlob = null;
  const m = ui.modal({
    title: titulo || 'Exportar',
    subtitle: 'PDF com a identidade da Fortaleza Move, filtros aplicados e totais.',
    size: 'small',
    body: '<div id="exp-corpo"><p class="small muted">Gerando o PDF…</p></div>',
    onClose: () => { if (urlBlob) URL.revokeObjectURL(urlBlob); }
  });
  const corpo = m.body.querySelector('#exp-corpo');

  const csvBtn = temCsv ? `<button class="btn btn-ghost btn-sm" id="exp-csv" type="button">${ui.icon('download', 14)} Baixar CSV (planilha)</button>` : '';
  const ligarCsv = () => {
    const b = m.dialog.querySelector('#exp-csv');
    if (!b) return;
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { await api.download(`/reports/export?${csv}`, csvNome); ui.toast('Arquivo CSV gerado.', 'success'); } catch (err) { ui.toast(err.message, 'error'); } finally { b.disabled = false; }
    });
  };

  if (!temPdf) { corpo.innerHTML = `<p class="small muted">Neste relatório seu perfil pode exportar somente em CSV.</p><div class="row" style="margin-top:12px">${csvBtn}</div>`; ligarCsv(); return; }

  api.blob(`/reports/pdf?${pdf}`, 'relatorio.pdf').then(({ blob, nome, linhas }) => {
    urlBlob = URL.createObjectURL(blob);
    const arquivo = new File([blob], nome, { type: 'application/pdf' });
    const podeCompartilhar = typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] });
    const resumo = linhas === null ? '' : (linhas === 0 ? 'Nenhum registro para os filtros aplicados — o PDF informa isso.' : `${ui.fmtInt(linhas)} registro${linhas === 1 ? '' : 's'} no relatório.`);
    corpo.innerHTML = `
      <p style="font-size:14px;margin:0 0 4px"><b>${ui.esc(nome)}</b> · ${tamanho(blob.size)}</p>
      <p class="small muted" style="margin:0 0 14px">${ui.esc(resumo)}</p>
      <div class="exp-acoes" style="display:grid;gap:8px">
        <button class="btn btn-primary" id="exp-baixar" type="button">${ui.icon('download', 16)} Baixar PDF</button>
        <button class="btn btn-soft" id="exp-abrir" type="button">${ui.icon('print', 16)} Abrir para imprimir</button>
        ${podeCompartilhar ? `<button class="btn btn-soft" id="exp-compartilhar" type="button">${ui.icon('send', 16)} Compartilhar</button>` : ''}
      </div>
      ${temCsv ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #e3e9f4"><p class="small muted" style="margin:0 0 8px">Alternativa para planilhas:</p>${csvBtn}</div>` : ''}`;
    m.dialog.querySelector('#exp-baixar').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = urlBlob; a.download = nome;
      document.body.appendChild(a); a.click(); a.remove();
      ui.toast('PDF gerado.', 'success');
    });
    // Abre em outra aba (o visualizador do navegador tem imprimir); sem frame, por causa da CSP.
    m.dialog.querySelector('#exp-abrir').addEventListener('click', () => {
      const w = window.open(urlBlob, '_blank');
      if (!w) ui.toast('O navegador bloqueou a nova aba. Use “Baixar PDF”.', 'error');
    });
    const comp = m.dialog.querySelector('#exp-compartilhar');
    if (comp) comp.addEventListener('click', async () => {
      try { await navigator.share({ files: [arquivo], title: titulo || nome }); } catch (err) { if (err && err.name !== 'AbortError') ui.toast('Não foi possível compartilhar. Use “Baixar PDF”.', 'error'); }
    });
    ligarCsv();
  }).catch((err) => {
    corpo.innerHTML = `<p class="small" style="color:#b42318">${ui.esc(err.message)}</p>${temCsv ? `<div class="row" style="margin-top:12px">${csvBtn}</div>` : ''}`;
    ligarCsv();
  });
}

/** Botão padrão "Exportar" (HTML) — o clique é ligado por quem usa. */
export const botaoExportar = (classe = 'btn btn-ghost') => `<button class="${classe} no-print" data-exportar type="button">${ui.icon('download', 16)} Exportar</button>`;

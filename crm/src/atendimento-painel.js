'use strict';
// Resumo dos atendimentos pelo WhatsApp para o painel inicial (13/11/2026, pedido do dono): o que está aberto, o que depende
// da equipe, o que está com a IA, o que aguarda o cliente e o que já foi concluído, por assunto. Só leitura; nenhum texto de
// mensagem sai daqui (só nome do contato, assunto, motivo e tempo). Contatos pessoais e ignorados ficam de fora.
const C = require('./ia/central');

const SEM_ASSUNTO = 'sem_assunto';

function rotuloDoAssunto(chave) {
  if (chave === SEM_ASSUNTO) return 'Ainda sem assunto (só cumprimentou ou escolhendo no menu)';
  if (typeof chave === 'string' && chave.endsWith('_menu')) return `${C.nomeDoAssunto(chave)} — escolhendo no segundo menu`;
  return C.nomeDoAssunto(chave) || 'Outros assuntos';
}

/** Chave estável de um atend_assunto salvo (normaliza os valores antigos). */
function chaveDoAssunto(valor) {
  if (!valor) return SEM_ASSUNTO;
  const nome = C.nomeDoAssunto(valor);
  return nome ? (valor === 'comercio_aguardando' ? 'encomendas_aguardando' : valor) : 'outros';
}

function resumoAtendimentos({ db, hoje, localDate }) {
  const linhas = db.prepare(
    `SELECT c.id, c.atendimento, c.atend_assunto, c.atend_motivo, c.atend_em, c.ultima_em, c.ultima_direcao, c.nao_lidas,
            k.nome, k.telefone
       FROM wa_conversas c JOIN wa_contatos k ON k.id = c.contato_id
      WHERE COALESCE(k.ignorado, 0) = 0 AND COALESCE(k.pessoal, 0) = 0`).all();

  const r = {
    abertos: 0,
    dependem_de_voce: 0, aguardando_equipe: 0, cliente_esperando: 0,
    com_a_ia: 0, aguardando_cliente: 0,
    concluidos_hoje: 0, concluidos_total: 0,
    nao_lidas: 0,
    mais_antigo_desde: null,
    por_assunto: [], por_motivo: [], esperando_voce: []
  };
  const assuntos = new Map();
  const motivos = new Map();
  const esperando = [];
  for (const c of linhas) {
    if (c.atendimento === 'concluido') {
      r.concluidos_total += 1;
      if (c.atend_em && localDate(c.atend_em) === hoje) r.concluidos_hoje += 1;
      continue;
    }
    r.abertos += 1;
    r.nao_lidas += c.nao_lidas > 0 ? 1 : 0;
    const chave = chaveDoAssunto(c.atend_assunto);
    const item = assuntos.get(chave) || { chave, rotulo: rotuloDoAssunto(chave), total: 0, dependem: 0 };
    item.total += 1;
    let depende = false;
    let desde = null;
    if (c.atendimento === 'aguardando') {
      r.aguardando_equipe += 1; depende = true; desde = c.atend_em || c.ultima_em;
      const m = c.atend_motivo || 'sem_motivo';
      motivos.set(m, (motivos.get(m) || 0) + 1);
    } else if (c.atendimento === 'humano') {
      if (c.ultima_direcao === 'in') { r.cliente_esperando += 1; depende = true; desde = c.ultima_em; } else r.aguardando_cliente += 1;
    } else {
      r.com_a_ia += 1;
    }
    if (depende) {
      r.dependem_de_voce += 1; item.dependem += 1;
      if (desde && (!r.mais_antigo_desde || desde < r.mais_antigo_desde)) r.mais_antigo_desde = desde;
      const fone = String(c.telefone || '');
      esperando.push({
        id: c.id, estado: c.atendimento, desde,
        nome: c.nome || (fone ? `Contato ••••${fone.slice(-4)}` : 'Contato'),
        assunto: rotuloDoAssunto(chave),
        motivo: c.atendimento === 'aguardando' ? (C.MOTIVOS_TRANSFERENCIA[c.atend_motivo] || 'Encaminhado para a equipe') : 'Cliente esperando resposta'
      });
    }
    assuntos.set(chave, item);
  }
  r.por_assunto = [...assuntos.values()].sort((a, b) => b.total - a.total);
  r.por_motivo = [...motivos.entries()].map(([chave, total]) => ({ chave, rotulo: C.MOTIVOS_TRANSFERENCIA[chave] || 'Encaminhado para a equipe', total })).sort((a, b) => b.total - a.total);
  r.esperando_voce = esperando.sort((a, b) => String(a.desde || '').localeCompare(String(b.desde || ''))).slice(0, 8);
  return r;
}

module.exports = { resumoAtendimentos, rotuloDoAssunto, chaveDoAssunto, SEM_ASSUNTO };

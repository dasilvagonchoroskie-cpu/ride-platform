'use strict';
// Painel inicial: contagem dos atendimentos do WhatsApp (13/11/2026, pedido do dono). Dados fictícios; só leitura.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

function montar() {
  process.env.FM_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-dash-'));
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}`)) delete require.cache[k];
  const { db } = require('../src/db');
  const { createStore } = require('../src/whatsapp/store');
  const { resumoAtendimentos } = require('../src/atendimento-painel');
  const { localDate, todayISO } = require('../src/http');
  const waStore = createStore(db);
  let n = 0;
  const nova = (nome, estado, { assunto = null, motivo = null, direcao = 'in', pessoal = 0 } = {}) => {
    n += 1;
    const tel = `55859999${String(1000 + n)}`;
    const r = waStore.ingerir({ jid: `${tel}@s.whatsapp.net`, telefone: tel, nome, externoId: `D${n}`, texto: 'oi', tipo: 'text', quando: new Date().toISOString(), deMim: false });
    const agora = new Date().toISOString();
    db.prepare('UPDATE wa_conversas SET atendimento = ?, atend_assunto = ?, atend_motivo = ?, atend_em = ?, ultima_direcao = ? WHERE id = ?').run(estado, assunto, motivo, agora, direcao, r.conversaId);
    if (pessoal) db.prepare('UPDATE wa_contatos SET pessoal = 1 WHERE id = ?').run(waStore.obterConversa(r.conversaId).contato_id);
    return r.conversaId;
  };
  const resumo = () => resumoAtendimentos({ db, hoje: todayISO(), localDate });
  return { db, nova, resumo };
}

test('painel: separa o que depende da equipe, o que está com a IA, o que aguarda o cliente e o que foi concluído', () => {
  const { nova, resumo } = montar();
  nova('Ana', 'aguardando', { assunto: 'comercio_cadastrar', motivo: 'valores' });
  nova('Bruno', 'aguardando', { assunto: 'encomendas_aguardando', motivo: 'reclamacao' });
  nova('Carla', 'humano', { assunto: 'passageiro', direcao: 'in' });   // cliente esperando resposta
  nova('Davi', 'humano', { assunto: 'passageiro', direcao: 'out' });   // aguardando o cliente
  nova('Eva', 'ia', { assunto: 'cadastro' });
  nova('Fábio', 'ia', { assunto: null });
  nova('Gil', 'ia', { assunto: 'encomendas_menu' });
  nova('Helena', 'concluido', { assunto: 'clube' });
  const r = resumo();
  assert.equal(r.abertos, 7);
  assert.equal(r.aguardando_equipe, 2);
  assert.equal(r.cliente_esperando, 1);
  assert.equal(r.dependem_de_voce, 3);
  assert.equal(r.aguardando_cliente, 1);
  assert.equal(r.com_a_ia, 3);
  assert.equal(r.concluidos_hoje, 1);
  assert.equal(r.concluidos_total, 1);
  assert.equal(r.abertos, r.dependem_de_voce + r.aguardando_cliente + r.com_a_ia, 'cada atendimento aberto conta em um só grupo');
  assert.equal(r.esperando_voce.length, 3);
  assert.ok(r.esperando_voce.every((e) => e.nome && e.assunto && e.motivo && e.id));
  assert.deepEqual(r.por_motivo.map((m) => m.chave).sort(), ['reclamacao', 'valores']);
  const pass = r.por_assunto.find((a) => a.chave === 'passageiro');
  assert.equal(pass.total, 2); assert.equal(pass.dependem, 1);
  assert.ok(r.por_assunto.find((a) => a.chave === 'sem_assunto'));
  assert.match(r.por_assunto.find((a) => a.chave === 'encomendas_menu').rotulo, /segundo menu/);
  assert.equal(r.por_assunto.reduce((t, a) => t + a.total, 0), r.abertos);
});

test('painel: contatos pessoais e ignorados não entram; assunto antigo (comercio_aguardando) vira encomendas_aguardando; sem conversas = zeros', () => {
  const { db, nova, resumo } = montar();
  assert.equal(resumo().abertos, 0);
  nova('Mãe', 'aguardando', { motivo: 'pediu_humano', pessoal: 1 });
  const id = nova('Cliente antigo', 'ia', { assunto: 'comercio_aguardando' });
  const ign = nova('Ignorado', 'ia');
  db.prepare('UPDATE wa_contatos SET ignorado = 1 WHERE id = (SELECT contato_id FROM wa_conversas WHERE id = ?)').run(ign);
  const r = resumo();
  assert.equal(r.abertos, 1);
  assert.equal(r.dependem_de_voce, 0);
  assert.equal(r.por_assunto[0].chave, 'encomendas_aguardando');
  assert.ok(id);
});

test('painel: não expõe texto de mensagem nem telefone completo', () => {
  const { nova, resumo, db } = montar();
  nova('', 'aguardando', { motivo: 'pediu_humano' });
  db.prepare("UPDATE wa_contatos SET nome = NULL");
  const texto = JSON.stringify(resumo());
  assert.doesNotMatch(texto, /5585999\d{4}/, 'telefone completo não sai');
  assert.match(texto, /Contato ••••\d{4}/);
  assert.doesNotMatch(texto, /"oi"/);
});

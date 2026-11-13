'use strict';
// Fotos e PDFs recebidos pelo WhatsApp → arquivo digital protegido da ficha (13/11/2026, pedido do dono).
// Integração no processo: rotas reais + banco real + armazenamento local real + cifra real (FM_DOCS_KEY de teste).
// SIMULADO: o canal do WhatsApp (canal falso) e as respostas do Gemini (fetch falso). Não comprova o WhatsApp/Gemini reais.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-anexos-'));
Object.assign(process.env, {
  FM_DATA_DIR: dir, FM_ETAPA2: '1', FM_DOCS_KEY: crypto.randomBytes(32).toString('hex'), FM_DADOS_KEY: crypto.randomBytes(32).toString('hex'),
  WA_CANAL: 'fake', IA_VARREDURA: '0', IA_MIDIA_REPETIR_MS: '0', IA_CONFIRMACAO_MS: '0', GEMINI_API_KEY: 'AIza-chave-falsa-000000000000'
});
// Gemini falso: a próxima leitura devolve o texto da fila (ou falha, se for um Error).
const leituras = [];
globalThis.fetch = async (url) => {
  if (!/generateContent/.test(String(url))) return { ok: false, status: 404, json: async () => ({}) };
  const r = leituras.shift();
  if (r instanceof Error) return { ok: false, status: 503, json: async () => ({ error: { message: 'indisponível' } }) };
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: r || 'Descrição: uma foto' }] } }] }) };
};

const { db, setSetting } = require('../src/db');
setSetting('ia_ativo', '1'); setSetting('ia_modo', 'sugerir'); setSetting('ia_provedor', 'gemini'); setSetting('ia_modelo_gemini', 'gemini-falso'); setSetting('wa_ativo', '1');
const rotas = require('../src/routes');
const entities = require('../src/entities');
const { ENTITIES } = require('../src/defs');

// Arquivos de teste com assinatura real (o conteúdo é validado pelos primeiros bytes).
const jpg = (marca) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`JFIF-teste-${marca}-${crypto.randomUUID()}`), Buffer.alloc(64, 1)]);
const pdf = (extra = '') => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog${extra}>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n${crypto.randomUUID()}`);
let n = 0;
const espere = (ms = 30) => new Promise((ok) => setTimeout(ok, ms));
async function preparar() {
  await rotas.wa.iniciar();
  const canal = rotas.wa.canalFalso();
  assert.ok(canal, 'canal falso ligado');
  return canal;
}
async function chegar(canal, { telefone = '5564999990001', tipo = 'image', arquivo, nome = null, texto, leitura, deMim = false }) {
  n += 1;
  if (leitura !== undefined) leituras.push(leitura);
  canal.receber({
    jid: `${telefone}@s.whatsapp.net`, telefone, nome: 'Candidato Fictício', externoId: `M${n}`, tipo, quando: new Date().toISOString(), deMim,
    texto: texto || (tipo === 'document' ? `[documento] ${nome || ''}`.trim() : '[imagem]'),
    ...(arquivo ? { midia: { tipo, mime: tipo === 'document' ? 'application/pdf' : 'image/jpeg', nome, bytes: arquivo.length, segundos: 0, baixar: async () => arquivo } } : {})
  });
  await espere(60);
  return db.prepare('SELECT id, conversa_id FROM wa_mensagens WHERE externo_id = ?').get(`M${n}`);
}
const anexoDa = (mensagemId) => db.prepare('SELECT * FROM wa_anexos WHERE mensagem_id = ?').get(mensagemId);
const req = (role = 'admin', id = null, nome = 'Equipe Fictícia') => ({ app: { locals: { db } }, user: { id, nome, role }, headers: {}, ip: '127.0.0.1', socket: {} });
function novoMotorista(nome, telefone) {
  const r = entities.createEntity(ENTITIES.motoristas, { nome, telefone, cidade: 'Fortaleza', situacao: 'Novo interessado', origem: 'WhatsApp', data_primeiro_contato: '2026-11-13' }, req());
  assert.ok(r.item, JSON.stringify(r));
  return r.item.id;
}
function ligar(conversaId, motoristaId) {
  const c = db.prepare('SELECT contato_id FROM wa_conversas WHERE id = ?').get(conversaId);
  assert.ok(rotas.wa.store.definirVinculo(c.contato_id, 'motoristas', motoristaId).ok);
}
const todosOsArquivos = () => {
  const lista = [];
  const andar = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) andar(p); else lista.push(p); } };
  andar(path.join(dir, 'documentos'));
  return lista;
};

test('CNH chega antes da ficha: guardada CIFRADA na espera; ao ligar a ficha vai para o arquivo digital e só então conta como recebida', async () => {
  const canal = await preparar();
  const original = jpg('cnh');
  const m = await chegar(canal, { arquivo: original, leitura: 'Tipo: CNH\nNome: Candidato Fictício\nCategoria da CNH: B' });
  let a = anexoDa(m.id);
  assert.equal(a.situacao, 'aguardando_ficha');
  assert.equal(a.categoria, 'cnh');
  assert.equal(a.sha256, crypto.createHash('sha256').update(original).digest('hex'));
  // No disco: nome interno aleatório, conteúdo cifrado (não é o JPEG original nem começa com a assinatura de JPEG).
  const arquivos = todosOsArquivos();
  assert.equal(arquivos.length, 1);
  const bruto = fs.readFileSync(arquivos[0]);
  assert.ok(!bruto.includes(original.subarray(4, 30)), 'conteúdo não fica em claro');
  assert.notDeepEqual(bruto.subarray(0, 3), Buffer.from([0xff, 0xd8, 0xff]));
  assert.ok(!/cnh|candidato/i.test(arquivos[0]), 'o nome do arquivo no disco não revela nada');
  assert.ok(!arquivos[0].includes(path.join('public')), 'fora de pasta pública');
  // Ficha criada e ligada à conversa: o arquivo entra no arquivo digital e o campo da ficha muda.
  const mot = novoMotorista('Candidato Fictício', '64999990001');
  ligar(m.conversa_id, mot);
  await espere(80);
  a = anexoDa(m.id);
  assert.equal(a.situacao, 'anexado');
  assert.equal(a.registro_id, mot);
  assert.ok(a.documento_id);
  assert.equal(a.guarda_chave, null, 'cópia da espera descartada depois de guardada na ficha');
  const v = db.prepare('SELECT v.sha256, v.incluido_por_nome FROM documentos d JOIN documento_versoes v ON v.id = d.versao_atual_id WHERE d.id = ?').get(a.documento_id);
  assert.equal(v.sha256, a.sha256, 'o arquivo da ficha é exatamente o recebido');
  assert.equal(v.incluido_por_nome, 'WhatsApp (recebimento automático)');
  const ficha = db.prepare('SELECT doc_cnh, doc_crlv, documentos FROM motoristas WHERE id = ?').get(mot);
  assert.equal(ficha.doc_cnh, 'Recebido — conferir');
  assert.ok(!ficha.doc_crlv);
  assert.equal(ficha.documentos, 'Incompletos');
  // O arquivo guardado abre de volta, íntegro, pelo caminho normal (com permissão e auditoria).
  const aberto = await rotas.docs.obterArquivo(req('admin'), a.documento_id, { acao: 'ver' });
  assert.ok(Buffer.from(aberto.conteudo).equals(original));
  assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'wa_anexo_recebido'").get(), 'recebimento auditado');
  assert.ok(db.prepare("SELECT 1 FROM wa_eventos WHERE tipo = 'anexo'").get(), 'a equipe vê o recebimento na conversa');
});

test('mesmo arquivo de novo não duplica; as 3 fotos do veículo ficam em 3 itens separados', async () => {
  const canal = await preparar();
  const tel = '5564999990002';
  const mot = novoMotorista('Segundo Fictício', '64999990002');
  const m0 = await chegar(canal, { telefone: tel, arquivo: jpg('x'), leitura: 'Descrição: oi' }); // foto comum: não é documento
  assert.equal(anexoDa(m0.id), undefined, 'foto comum não vira documento');
  ligar(m0.conversa_id, mot);
  const crlv = pdf();
  const m1 = await chegar(canal, { telefone: tel, tipo: 'document', nome: 'crlv.pdf', arquivo: crlv, leitura: 'Tipo: CRLV\nPlaca: ABC1D23' });
  assert.equal(anexoDa(m1.id).situacao, 'anexado');
  const m2 = await chegar(canal, { telefone: tel, tipo: 'document', nome: 'crlv-de-novo.pdf', arquivo: crlv, leitura: 'Tipo: CRLV\nPlaca: ABC1D23' });
  assert.equal(anexoDa(m2.id).situacao, 'duplicado');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM documento_versoes v JOIN documentos d ON d.id = v.documento_id WHERE d.registro_id = ? AND d.categoria = 'crlv'").get(mot).n, 1, 'uma versão só');
  for (const [lado, cat] of [['frente', 'foto_veiculo_frente'], ['lado', 'foto_veiculo_lado'], ['traseira', 'foto_veiculo_traseira']]) {
    const m = await chegar(canal, { telefone: tel, arquivo: jpg(lado), leitura: `Tipo: Foto do veículo (${lado})\nCor: Prata` });
    assert.equal(anexoDa(m.id).categoria, cat);
    assert.equal(anexoDa(m.id).situacao, 'anexado');
  }
  const f = db.prepare('SELECT doc_foto_frente, doc_foto_lado, doc_foto_traseira FROM motoristas WHERE id = ?').get(mot);
  assert.deepEqual(Object.values(f), ['Recebido — conferir', 'Recebido — conferir', 'Recebido — conferir']);
});

test('sem certeza da categoria (ou Gemini fora do ar): fica pendente de classificação, sem categoria errada; a equipe classifica', async () => {
  const canal = await preparar();
  const tel = '5564999990003';
  const mot = novoMotorista('Terceiro Fictício', '64999990003');
  const m1 = await chegar(canal, { telefone: tel, arquivo: jpg('ambigua'), leitura: 'Tipo: Foto do veículo\nCor: Branca' });
  ligar(m1.conversa_id, mot);
  await espere(40);
  let a = anexoDa(m1.id);
  assert.equal(a.situacao, 'pendente_classificacao', 'foto do veículo sem lado claro não vira frente/lado/traseira');
  assert.equal(a.categoria, null);
  assert.ok(a.guarda_chave, 'guardada cifrada até alguém classificar');
  leituras.push(new Error('fora do ar')); // a leitura tenta de novo uma vez (IA_MIDIA_REPETIR_MS=0): as duas falham
  const m2 = await chegar(canal, { telefone: tel, arquivo: jpg('semleitura'), leitura: new Error('fora do ar') });
  assert.equal(anexoDa(m2.id).situacao, 'pendente_classificacao', 'leitura falhou: o arquivo não se perde');
  const ficha = db.prepare('SELECT doc_foto_frente, doc_foto_lado FROM motoristas WHERE id = ?').get(mot);
  assert.ok(!ficha.doc_foto_frente && !ficha.doc_foto_lado, 'nada marcado sem classificação');
  const lista = rotas.recebidos().listar();
  assert.ok(lista.some((x) => x.id === a.id && x.na_espera));
  // Avaliador/gestor sem permissão de anexar não classificam; a equipe com permissão classifica.
  await assert.rejects(rotas.recebidos().classificar(req('avaliador'), a.id, { categoria: 'foto_veiculo_lado' }), /não pode anexar/);
  a = await rotas.recebidos().classificar(req('gestor'), a.id, { categoria: 'foto_veiculo_lado' });
  assert.equal(a.situacao, 'anexado');
  assert.equal(a.classificado_por, 'equipe');
  assert.equal(db.prepare('SELECT doc_foto_lado FROM motoristas WHERE id = ?').get(mot).doc_foto_lado, 'Recebido — conferir');
  // "Não é documento" só registra a decisão (nada é apagado).
  const r = rotas.recebidos().resolver(req('gestor'), anexoDa(m2.id).id, { acao: 'nao_documento' });
  assert.equal(r.situacao, 'nao_documento');
  assert.throws(() => db.prepare('DELETE FROM wa_anexos').run(), /histórico/);
});

test('arquivo inválido é recusado (nada guardado) e a equipe é avisada; foto da equipe e texto sozinho não contam', async () => {
  const canal = await preparar();
  const tel = '5564999990004';
  const mot = novoMotorista('Quarto Fictício', '64999990004');
  const m0 = await chegar(canal, { telefone: tel, texto: '📎 Tipo: CNH\nCategoria da CNH: B', tipo: 'text' }); // texto, sem arquivo
  ligar(m0.conversa_id, mot);
  assert.equal(anexoDa(m0.id), undefined);
  assert.ok(!db.prepare('SELECT doc_cnh FROM motoristas WHERE id = ?').get(mot).doc_cnh, 'texto não é comprovante');
  const antes = todosOsArquivos().length;
  const m1 = await chegar(canal, { telefone: tel, tipo: 'document', nome: 'cnh.pdf', arquivo: pdf('/OpenAction 5 0 R/JavaScript'), leitura: 'Tipo: CNH' });
  const a = anexoDa(m1.id);
  assert.equal(a.situacao, 'recusado');
  assert.match(a.motivo, /conteúdo ativo/);
  assert.equal(todosOsArquivos().length, antes, 'nada foi guardado');
  assert.ok(db.prepare("SELECT 1 FROM wa_eventos WHERE conversa_id = ? AND tipo = 'anexo' AND detalhe LIKE 'Arquivo recusado%'").get(m1.conversa_id));
  assert.ok(rotas.recebidos().contarPendentes() >= 1, 'aparece para a equipe');
  rotas.recebidos().resolver(req('admin'), a.id, { acao: 'ciente' });
  const m2 = await chegar(canal, { telefone: tel, arquivo: jpg('da-equipe'), leitura: 'Tipo: CNH', deMim: true });
  assert.equal(anexoDa(m2.id), undefined, 'foto enviada pela equipe pelo celular não é documento do candidato');
});

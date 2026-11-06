'use strict';
// Leitura de mídias: foto/PDF/vídeo (Gemini), Office e texto (no servidor), localização/contato, migração de colunas.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('zlib');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { criarTranscritor } = require('../src/ia/transcricao');
const { extrairTextoOffice } = require('../src/ia/office');
const { mensagemParaEvento, textoLocalizacao, textoContatos } = require('../src/whatsapp/baileys-channel');

// Monta um ZIP mínimo (deflate) em memória, igual ao formato dos arquivos do Office.
function zip(arquivos) {
  const locais = []; const centrais = []; let offset = 0;
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const dados = Buffer.from(conteudo, 'utf8');
    const comp = zlib.deflateRawSync(dados);
    const n = Buffer.from(nome);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(8, 8); l.writeUInt32LE(comp.length, 18); l.writeUInt32LE(dados.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(dados.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42);
    locais.push(l, n, comp); centrais.push(c, n);
    offset += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(centrais);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(arquivos).length, 8); e.writeUInt16LE(Object.keys(arquivos).length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(offset, 16);
  return Buffer.concat([...locais, cd, e]);
}

const cofre = (k) => ({ ler: (p) => k[p] || '' });
function fetchOk(texto) {
  const chamadas = [];
  const f = async (url, init) => { chamadas.push({ url, init }); return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }) }; };
  f.chamadas = chamadas; return f;
}

test('Word, Excel e PowerPoint: texto extraído no servidor, sem IA', () => {
  const docx = zip({ 'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>Contrato de parceria</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Lava-Jato &amp; Cia, </w:t></w:r><w:r><w:t>10% de desconto</w:t></w:r></w:p></w:body></w:document>' });
  assert.equal(extrairTextoOffice(docx, 'contrato.docx'), 'Contrato de parceria\nLava-Jato & Cia, 10% de desconto');
  const xlsx = zip({ 'xl/sharedStrings.xml': '<sst><si><t>Motorista</t></si><si><t>Placa</t></si><si><t>Ana</t></si></sst>',
    'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row><row><c t="s"><v>2</v></c><c t="inlineStr"><is><t>ABC1D23</t></is></c><c><v>42</v></c></row></sheetData></worksheet>' });
  assert.equal(extrairTextoOffice(xlsx, 'frota.xlsx'), '# sheet1\nMotorista | Placa\nAna | ABC1D23 | 42');
  const pptx = zip({ 'ppt/slides/slide2.xml': '<p:sld><a:t>Segundo</a:t></p:sld>', 'ppt/slides/slide1.xml': '<p:sld><a:t>Primeiro</a:t><a:t>slide</a:t></p:sld>' });
  assert.equal(extrairTextoOffice(pptx, 'apresentacao.pptx'), '# Slide 1\nPrimeiro slide\n# Slide 2\nSegundo');
  assert.throws(() => extrairTextoOffice(Buffer.from('não é zip'), 'x.docx'));
});

test('documento do Office e texto não gastam cota da IA', async () => {
  const f = fetchOk('não deveria chamar');
  const t = criarTranscritor({ cofre: cofre({ gemini: 'AIza-00000000000000000000' }), obterModeloGemini: async () => 'g', fetchImpl: f });
  const docx = zip({ 'word/document.xml': '<w:p><w:t>Proposta</w:t></w:p>' });
  const r = await t.lerMidia({ tipo: 'document', arquivo: docx, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', nome: 'proposta.docx' });
  assert.equal(r.texto, 'Proposta'); assert.equal(r.provedor, 'local');
  const csv = await t.lerMidia({ tipo: 'document', arquivo: Buffer.from('nome;placa\nAna;ABC1D23'), mime: 'text/csv', nome: 'lista.csv' });
  assert.match(csv.texto, /ABC1D23/);
  assert.equal(f.chamadas.length, 0);
});

test('foto e PDF vão para o Gemini com o tipo certo e pedido de dados do documento', async () => {
  const f = fetchOk('Nome: Ana Souza\nCategoria da CNH: B');
  const t = criarTranscritor({ cofre: cofre({ gemini: 'AIza-00000000000000000000' }), obterModeloGemini: async () => 'gemini-x', fetchImpl: f });
  const foto = await t.lerMidia({ tipo: 'image', arquivo: Buffer.from('jpg'), mime: 'image/jpeg' });
  assert.equal(foto.simbolo, '📎');
  let corpo = JSON.parse(f.chamadas[0].init.body);
  assert.equal(corpo.contents[0].parts[1].inline_data.mime_type, 'image/jpeg');
  assert.match(corpo.contents[0].parts[0].text, /CNH/);
  await t.lerMidia({ tipo: 'document', arquivo: Buffer.from('%PDF'), mime: 'application/pdf', nome: 'crlv.pdf' });
  corpo = JSON.parse(f.chamadas[1].init.body);
  assert.equal(corpo.contents[0].parts[1].inline_data.mime_type, 'application/pdf');
  await assert.rejects(t.lerMidia({ tipo: 'document', arquivo: Buffer.from('MZ'), mime: 'application/x-msdownload', nome: 'virus.exe' }), /não suportado/);
  const semChave = criarTranscritor({ cofre: cofre({}), obterModeloGemini: async () => 'g', fetchImpl: f });
  await assert.rejects(semChave.lerMidia({ tipo: 'image', arquivo: Buffer.from('jpg'), mime: 'image/jpeg' }), (e) => e.codigo === 'sem_chave');
});

test('foto, vídeo e documento do WhatsApp trazem os dados para leitura; localização e contato viram texto', () => {
  const agora = Math.floor(Date.now() / 1000);
  const k = (id) => ({ remoteJid: '5564999990000@s.whatsapp.net', id });
  const foto = mensagemParaEvento({ key: k('F1'), messageTimestamp: agora, message: { imageMessage: { mimetype: 'image/jpeg', caption: 'minha CNH', fileLength: 1000 } } }, 'notify', agora);
  assert.equal(foto.texto, '[imagem] minha CNH');
  assert.equal(foto.midia.tipo, 'image');
  const doc = mensagemParaEvento({ key: k('D1'), messageTimestamp: agora, message: { documentMessage: { mimetype: 'application/pdf', fileName: 'crlv.pdf' } } }, 'notify', agora);
  assert.equal(doc.midia.nome, 'crlv.pdf');
  assert.equal(doc.midia.mime, 'application/pdf');
  assert.match(textoLocalizacao({ degreesLatitude: -18.0123, degreesLongitude: -49.3456, name: 'Lava-Jato do Eduardo' }), /Lava-Jato do Eduardo .*maps\.google\.com\/\?q=-18\.012300,-49\.345600/);
  assert.equal(textoContatos([{ displayName: 'João', vcard: 'BEGIN:VCARD\nFN:João\nTEL;type=CELL:+55 64 99999-0000\nEND:VCARD' }]), '[contato] João: +55 64 99999-0000');
});

test('banco antigo ganha as colunas novas do motorista sem perder dados', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-mig-'));
  const Database = require('better-sqlite3');
  const antigo = new Database(path.join(dir, 'crm.db'));
  antigo.exec(`CREATE TABLE motoristas (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, telefone TEXT NOT NULL, cidade TEXT NOT NULL,
    data_primeiro_contato TEXT NOT NULL, origem TEXT NOT NULL, situacao TEXT NOT NULL, proxima_acao TEXT, data_acompanhamento TEXT,
    observacoes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, created_by INTEGER);
    INSERT INTO motoristas (nome, telefone, cidade, data_primeiro_contato, origem, situacao, created_at, updated_at) VALUES ('Ana','1','Goiatuba','2026-11-01','WhatsApp','Novo','x','x');`);
  antigo.close();
  const { execFileSync } = require('child_process');
  const out = execFileSync(process.execPath, ['-e', `const {db}=require(${JSON.stringify(path.join(__dirname, '..', 'src', 'db'))});const c=db.prepare('PRAGMA table_info(motoristas)').all().map(x=>x.name);console.log(JSON.stringify({c, nome: db.prepare('SELECT nome FROM motoristas').get().nome}));`],
    { env: { ...process.env, FM_DATA_DIR: dir } }).toString();
  const r = JSON.parse(out.trim().split('\n').pop());
  for (const col of ['veiculo', 'placa', 'cnh_categoria']) assert.ok(r.c.includes(col), col);
  assert.equal(r.nome, 'Ana');
});

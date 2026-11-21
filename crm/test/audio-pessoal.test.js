'use strict';
// Áudio em contato pessoal (20/11/2026, pedido do dono): o áudio é SEMPRE transcrito, inclusive o que ele manda pelo
// próprio WhatsApp do celular; foto/PDF/vídeo de contato pessoal continuam sem leitura; a IA continua sem atender.
// Integração no processo: rotas reais + banco real. SIMULADO: canal do WhatsApp (falso) e respostas do Gemini (fetch falso).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-audio-pessoal-'));
Object.assign(process.env, {
  FM_DATA_DIR: dir, FM_ETAPA2: '1', FM_DOCS_KEY: crypto.randomBytes(32).toString('hex'), FM_DADOS_KEY: crypto.randomBytes(32).toString('hex'),
  WA_CANAL: 'fake', IA_VARREDURA: '0', IA_MIDIA_REPETIR_MS: '0', IA_CONFIRMACAO_MS: '0', IA_ATRASO_MS: '0', GEMINI_API_KEY: 'AIza-chave-falsa-000000000000'
});
// Gemini falso: cada leitura devolve o próximo texto da fila.
const leituras = [];
let chamadasGemini = 0;
globalThis.fetch = async (url) => {
  if (!/generateContent/.test(String(url))) return { ok: false, status: 404, json: async () => ({}) };
  chamadasGemini += 1;
  const r = leituras.shift() || 'texto padrão';
  return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: r }] } }] }) };
};

const { db, setSetting } = require('../src/db');
setSetting('ia_ativo', '1'); setSetting('ia_modo', 'automatico'); setSetting('ia_responder', '1');
setSetting('ia_provedor', 'gemini'); setSetting('ia_modelo_gemini', 'gemini-falso'); setSetting('wa_ativo', '1');
const rotas = require('../src/routes');
const { extrairNumerosSensiveis } = require('../src/ia/documentos');

let n = 0;
const espere = (ms = 100) => new Promise((ok) => setTimeout(ok, ms));
async function chegar(canal, { telefone, tipo = 'text', texto, mime, leitura, deMim = false }) {
  n += 1;
  if (leitura !== undefined) leituras.push(leitura);
  canal.receber({
    jid: `${telefone}@s.whatsapp.net`, telefone, nome: 'Amigo Fictício', externoId: `AP${n}`, tipo, quando: new Date().toISOString(), deMim,
    texto: texto || (tipo === 'audio' ? '[mensagem de voz]' : tipo === 'image' ? '[imagem]' : 'oi'),
    ...(mime ? { midia: { tipo, mime, nome: null, bytes: 12, segundos: 5, baixar: async () => Buffer.from('OggS-conteudo') } } : {})
  });
  await espere();
  return db.prepare('SELECT * FROM wa_mensagens WHERE externo_id = ?').get(`AP${n}`);
}
async function contatoPessoal(canal, telefone) {
  const m = await chegar(canal, { telefone, texto: 'Oi, tudo bem?' });
  const c = db.prepare('SELECT contato_id FROM wa_conversas WHERE id = ?').get(m.conversa_id);
  assert.equal(rotas.wa.store.definirPessoal(c.contato_id, true), true);
  return m.conversa_id;
}
const daIA = (conversaId) => db.prepare("SELECT id FROM wa_mensagens WHERE conversa_id = ? AND origem = 'ia'").all(conversaId);

test('contato pessoal: o áudio é transcrito (recebido e enviado pelo celular) e a IA não responde', async () => {
  await rotas.wa.iniciar();
  const canal = rotas.wa.canalFalso();
  assert.ok(canal, 'canal falso ligado');
  const conversaId = await contatoPessoal(canal, '5564999990101');
  const antes = chamadasGemini;
  const respostasAntes = daIA(conversaId).length; // a 1ª mensagem chegou antes da marcação e pode ter sido atendida

  const recebido = await chegar(canal, { telefone: '5564999990101', tipo: 'audio', mime: 'audio/ogg', leitura: 'Vamos almoçar domingo na casa da mãe' });
  assert.equal(recebido.direcao, 'in');
  assert.match(recebido.texto, /\[mensagem de voz\] 🎤 Vamos almoçar domingo/);

  const enviado = await chegar(canal, { telefone: '5564999990101', tipo: 'audio', mime: 'audio/ogg', deMim: true, leitura: 'Beleza, levo o carvão' });
  assert.equal(enviado.direcao, 'out');
  assert.match(enviado.texto, /\[mensagem de voz\] 🎤 Beleza, levo o carvão/);

  assert.equal(chamadasGemini - antes, 2, 'só as 2 transcrições; nenhuma chamada de análise da IA');
  assert.equal(daIA(conversaId).length, respostasAntes, 'depois de marcado como pessoal, a IA não respondeu nada');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM motoristas').get().n, 0, 'nenhum cadastro criado');
});

test('contato pessoal: foto continua sem ser lida nem guardada como documento', async () => {
  const canal = rotas.wa.canalFalso();
  await contatoPessoal(canal, '5564999990102');
  const antes = chamadasGemini;
  const foto = await chegar(canal, { telefone: '5564999990102', tipo: 'image', mime: 'image/jpeg', leitura: 'Descrição: foto da família' });
  assert.equal(foto.texto, '[imagem]', 'texto da foto não muda');
  assert.equal(chamadasGemini, antes, 'a foto não vai ao Gemini');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM wa_anexos WHERE mensagem_id = ?').get(foto.id).n, 0, 'nada guardado como documento');
  leituras.length = 0;
});

test('contato pessoal: CPF falado em áudio não vai para o cofre temporário de números sensíveis', async () => {
  const canal = rotas.wa.canalFalso();
  const conversaId = await contatoPessoal(canal, '5564999990103');
  const fala = 'o cpf do tio é 529.982.247-25';
  assert.ok(extrairNumerosSensiveis(fala).cpf, 'pré-condição: o texto realmente tem um CPF válido');
  const audio = await chegar(canal, { telefone: '5564999990103', tipo: 'audio', mime: 'audio/ogg', leitura: fala });
  assert.match(audio.texto, /🎤/);
  const tabela = db.prepare("SELECT name FROM sqlite_master WHERE name = 'wa_num_pendentes'").get();
  const linhas = tabela ? db.prepare('SELECT COUNT(*) n FROM wa_num_pendentes WHERE conversa_id = ?').get(conversaId).n : 0;
  assert.equal(linhas, 0, 'nada guardado');
});

test('contato comum continua igual: áudio transcrito e CPF falado guardado no cofre temporário', async () => {
  const canal = rotas.wa.canalFalso();
  const fala = 'meu cpf é 529.982.247-25';
  const audio = await chegar(canal, { telefone: '5564999990104', tipo: 'audio', mime: 'audio/ogg', leitura: fala });
  assert.match(audio.texto, /🎤 meu cpf é/);
  const tabela = db.prepare("SELECT name FROM sqlite_master WHERE name = 'wa_num_pendentes'").get();
  assert.ok(tabela, 'cofre temporário criado');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM wa_num_pendentes WHERE conversa_id = ?').get(audio.conversa_id).n, 1);
  await rotas.wa.desligar();
});

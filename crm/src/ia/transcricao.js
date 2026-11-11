'use strict';
// Transcrição de áudio do WhatsApp (mensagens de voz) com provedores de plano grátis:
//  - Google Gemini (API nativa generateContent com o áudio embutido), usando a mesma chave da IA;
//  - Groq (Whisper, POST /audio/transcriptions), se houver chave do Groq.
// O texto transcrito é dado NÃO confiável (vem da fala do cliente): fica na mensagem e passa pelas mesmas proteções
// de qualquer texto de conversa. A IA nunca executa o que está nele.
const { ErroIA, erroDeStatus, PROVEDORES } = require('./provider');
const { extrairTextoOffice } = require('./office');

const MAX_BYTES = 15 * 1024 * 1024;       // limite do envio embutido ao Gemini (com folga)
const MAX_SEGUNDOS = 15 * 60;
const MIME_ACEITOS = /^audio\/(ogg|opus|mpeg|mp3|mp4|m4a|aac|wav|x-wav|webm|amr|3gpp)$/;
const INSTRUCAO = 'Transcreva fielmente este áudio, em português do Brasil. Responda SOMENTE com a transcrição, sem comentários, '
  + 'sem aspas e sem resumo. Se não houver fala compreensível, responda exatamente: [sem fala]';

// Foto ou PDF: extrair dados (não descrever). Documentos de motorista têm lista fixa de campos.
const INSTRUCAO_DOCUMENTO = 'Você extrai dados de arquivos enviados por WhatsApp para um cadastro. Responda em português do Brasil, '
  + 'SOMENTE com linhas no formato "Campo: valor", sem frases, sem descrição do documento e sem comentários.\n'
  + 'Primeira linha: "Tipo: <tipo do documento ou da imagem>".\n'
  + 'Se for CNH (carteira de motorista, física ou digital): Nome, CPF, Data de nascimento, Categoria da CNH (só as letras, ex.: B ou AB), '
  + 'Validade, Primeira habilitação, Número do registro, Cidade/UF.\n'
  + 'Se for CRLV / documento do veículo: Placa, Marca/Modelo, Ano fabricação, Ano modelo, Cor, Renavam, Proprietário, Cidade/UF.\n'
  + 'Se for comprovante de endereço (conta de luz, água, telefone, internet ou gás, fatura, declaração de residência): '
  + '"Tipo: Comprovante de endereço", Nome do titular, Endereço (rua, número e bairro, numa linha só), Cidade/UF, CEP, Data de emissão ou vencimento.\n'
  + 'Se for RG, CPF, boleto, nota, contrato ou outro: os campos principais (nome, números, valores, datas, endereço).\n'
  + 'Se não for documento: "Descrição: <uma frase>" e o texto visível, se houver.\n'
  + 'Copie os valores exatamente como estão. Se não der para ler um campo, não escreva esse campo. Não invente.';

function limparTranscricao(t) {
  return String(t || '').replace(/\u0000/g, '').replace(/\s+\n/g, '\n').trim().slice(0, 6000);
}

async function chamar(fetchImpl, url, init, timeoutMs) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controle.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new ErroIA('timeout', 'A transcrição demorou demais.');
    throw new ErroIA('rede', 'Não consegui falar com o serviço de transcrição.');
  } finally {
    clearTimeout(timer);
  }
}

// Gemini: modelo = o mesmo da IA (ou descoberto). Chave no cabeçalho x-goog-api-key (nunca na URL).
async function transcreverGemini({ audio, mime, chave, modelo, fetchImpl, timeoutMs, instrucao = INSTRUCAO }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;
  const resposta = await chamar(fetchImpl, url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': chave },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: instrucao }, { inline_data: { mime_type: mime === 'audio/opus' ? 'audio/ogg' : mime, data: audio.toString('base64') } }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 8192 }
    })
  }, timeoutMs);
  if (!resposta.ok) throw erroDeStatus(resposta.status);
  let dados;
  try { dados = await resposta.json(); } catch (err) { throw new ErroIA('resposta_invalida', 'A transcrição voltou em formato inesperado.'); }
  const partes = (dados && dados.candidates && dados.candidates[0] && dados.candidates[0].content && dados.candidates[0].content.parts) || [];
  const texto = partes.filter((p) => p && typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
  if (!texto.trim()) throw new ErroIA('resposta_vazia', 'A transcrição voltou vazia.');
  return texto;
}

// Groq: Whisper (envio do arquivo em formulário).
async function transcreverGroq({ audio, mime, chave, fetchImpl, timeoutMs }) {
  const form = new FormData();
  const ext = (mime.split('/')[1] || 'ogg').replace('mpeg', 'mp3').replace('x-wav', 'wav').replace('opus', 'ogg');
  form.append('file', new Blob([audio], { type: mime }), `audio.${ext}`);
  form.append('model', 'whisper-large-v3');
  form.append('language', 'pt');
  form.append('response_format', 'json');
  const resposta = await chamar(fetchImpl, `${PROVEDORES.groq.urlBase}/audio/transcriptions`, {
    method: 'POST', headers: { authorization: `Bearer ${chave}` }, body: form
  }, timeoutMs);
  if (!resposta.ok) throw erroDeStatus(resposta.status);
  let dados;
  try { dados = await resposta.json(); } catch (err) { throw new ErroIA('resposta_invalida', 'A transcrição voltou em formato inesperado.'); }
  if (!dados || typeof dados.text !== 'string' || !dados.text.trim()) throw new ErroIA('resposta_vazia', 'A transcrição voltou vazia.');
  return dados.text;
}

// opcoes: { cofre, obterModeloGemini: async () => string, ordem: ['gemini','groq'], fetchImpl, timeoutMs }
function criarTranscritor({ cofre, obterModeloGemini, fetchImpl = globalThis.fetch, timeoutMs = 90000 }) {
  // Quais serviços dá para usar agora (cada um só com a própria chave).
  const disponiveis = () => ['gemini', 'groq'].filter((p) => !!cofre.ler(p));

  async function transcrever({ audio, mime = 'audio/ogg', segundos = 0 }) {
    if (!Buffer.isBuffer(audio) || !audio.length) throw new ErroIA('invalido', 'Áudio vazio.');
    if (audio.length > MAX_BYTES) throw new ErroIA('invalido', 'Áudio grande demais para transcrever.');
    if (segundos > MAX_SEGUNDOS) throw new ErroIA('invalido', 'Áudio longo demais para transcrever.');
    const tipo = String(mime || 'audio/ogg').toLowerCase();
    if (!MIME_ACEITOS.test(tipo)) throw new ErroIA('invalido', `Formato de áudio não suportado (${tipo}).`);
    const lista = disponiveis();
    if (!lista.length) throw new ErroIA('sem_chave', 'Cadastre a chave do Gemini ou do Groq para transcrever áudios.');
    let ultimoErro = null;
    for (const p of lista) {
      try {
        const texto = p === 'gemini'
          ? await transcreverGemini({ audio, mime: tipo, chave: cofre.ler('gemini'), modelo: await obterModeloGemini(), fetchImpl, timeoutMs })
          : await transcreverGroq({ audio, mime: tipo, chave: cofre.ler('groq'), fetchImpl, timeoutMs });
        return { texto: limparTranscricao(texto), provedor: p };
      } catch (err) {
        ultimoErro = err; // tenta o próximo serviço grátis, se houver
      }
    }
    throw ultimoErro;
  }

  // Lê qualquer mídia: áudio (transcrição), foto, PDF e vídeo (Gemini), Office e texto (no próprio servidor, sem IA).
  async function lerMidia({ tipo, arquivo, mime = '', nome = '', segundos = 0 }) {
    if (!Buffer.isBuffer(arquivo) || !arquivo.length) throw new ErroIA('invalido', 'Arquivo vazio.');
    if (arquivo.length > MAX_BYTES) throw new ErroIA('invalido', 'Arquivo grande demais para ler (máximo 15 MB).');
    const m = String(mime || '').toLowerCase();
    const ext = (String(nome || '').toLowerCase().match(/\.([a-z0-9]{1,5})$/) || [])[1] || '';
    if (tipo === 'audio' || m.startsWith('audio/')) {
      const r = await transcrever({ audio: arquivo, mime: m || 'audio/ogg', segundos });
      return { ...r, simbolo: '🎤' };
    }
    // Office e texto: lidos aqui mesmo (não gastam cota da IA nem saem do servidor).
    if (/^(docx|xlsx|pptx)$/.test(ext) || /officedocument/.test(m)) {
      let texto;
      try { texto = extrairTextoOffice(arquivo, nome || `arquivo.${ext}`); } catch (err) { throw new ErroIA('invalido', err.message); }
      return { texto: limparTranscricao(texto) || '[documento sem texto]', provedor: 'local', simbolo: '📎' };
    }
    if (/^(txt|csv|json|xml|md)$/.test(ext) || /^text\//.test(m)) {
      return { texto: limparTranscricao(arquivo.toString('utf8')), provedor: 'local', simbolo: '📎' };
    }
    if (!cofre.ler('gemini')) throw new ErroIA('sem_chave', 'Cadastre a chave do Gemini para ler fotos, PDFs e vídeos.');
    let instrucao; let tipoMime = m;
    if (tipo === 'image' || m.startsWith('image/')) {
      if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(m)) tipoMime = 'image/jpeg';
      instrucao = INSTRUCAO_DOCUMENTO;
    } else if (m === 'application/pdf' || ext === 'pdf') {
      tipoMime = 'application/pdf';
      instrucao = INSTRUCAO_DOCUMENTO;
    } else if (tipo === 'video' || m.startsWith('video/')) {
      if (!/^video\/(mp4|mpeg|mov|quicktime|webm|3gpp|x-flv|wmv)$/.test(m)) tipoMime = 'video/mp4';
      instrucao = 'Descreva este vídeo em português do Brasil em até 10 linhas e transcreva a fala, se houver. Sem comentários.';
    } else {
      throw new ErroIA('invalido', `Formato não suportado para leitura (${m || ext || 'desconhecido'}).`);
    }
    const texto = await transcreverGemini({ audio: arquivo, mime: tipoMime, chave: cofre.ler('gemini'), modelo: await obterModeloGemini(), fetchImpl, timeoutMs, instrucao });
    return { texto: limparTranscricao(texto), provedor: 'gemini', simbolo: '📎' };
  }

  return { transcrever, lerMidia, disponiveis };
}

module.exports = { criarTranscritor, transcreverGemini, transcreverGroq, limparTranscricao, MAX_BYTES, MAX_SEGUNDOS };

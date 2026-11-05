'use strict';
// Provedores de IA. Chamam a API pelo servidor (a chave nunca vai ao navegador).
// Dois formatos cobrem quase tudo: "anthropic" (Claude) e "openai" (POST /chat/completions: DeepSeek, OpenAI,
// OpenRouter, Groq, Ollama etc.). Escolher outro provedor é só configuração (Configurações > Inteligência).
const URL_API = 'https://api.anthropic.com/v1/messages';
const VERSAO_API = '2023-06-01';

// modelo: sugestão inicial (o administrador pode trocar). Vazio = precisa informar. campoMaxTokens: nome do campo no formato OpenAI.
// gratis: tem plano grátis sem cartão (com limite de uso). ondeChave: onde o administrador cria a chave.
// extra: campos a mais no corpo da chamada. minTokens: piso do limite de resposta (modelos que "pensam" gastam parte dele).
const PROVEDORES = {
  gemini: { nome: 'Google Gemini (grátis)', tipo: 'openai', urlBase: 'https://generativelanguage.googleapis.com/v1beta/openai', modelo: '',
    campoMaxTokens: 'max_tokens', gratis: true, ondeChave: 'https://aistudio.google.com/apikey', extra: { reasoning_effort: 'low' }, minTokens: 2500,
    aviso: 'No plano grátis do Gemini, o Google pode usar as conversas enviadas para melhorar os produtos dele, e pessoas podem revisá-las. Evite dados sensíveis e informe no aviso de privacidade.' },
  groq: { nome: 'Groq (grátis)', tipo: 'openai', urlBase: 'https://api.groq.com/openai/v1', modelo: 'openai/gpt-oss-120b',
    campoMaxTokens: 'max_tokens', gratis: true, ondeChave: 'https://console.groq.com/keys', extra: { reasoning_effort: 'low' }, minTokens: 2500 },
  anthropic: { nome: 'Anthropic (Claude)', tipo: 'anthropic', urlBase: 'https://api.anthropic.com', modelo: 'claude-haiku-5-5' },
  deepseek: { nome: 'DeepSeek', tipo: 'openai', urlBase: 'https://api.deepseek.com', modelo: 'deepseek-v4-flash', campoMaxTokens: 'max_tokens' },
  openai: { nome: 'OpenAI', tipo: 'openai', urlBase: 'https://api.openai.com/v1', modelo: '', campoMaxTokens: 'max_completion_tokens' },
  openrouter: { nome: 'OpenRouter (tem modelos grátis)', tipo: 'openai', urlBase: 'https://openrouter.ai/api/v1', modelo: '', campoMaxTokens: 'max_tokens', gratis: true, ondeChave: 'https://openrouter.ai/keys', minTokens: 1500 },
  personalizado: { nome: 'Outro (formato OpenAI)', tipo: 'openai', urlBase: '', modelo: '', campoMaxTokens: 'max_tokens' }
};
const ehProvedor = (id) => Object.prototype.hasOwnProperty.call(PROVEDORES, id);

// Só https (ou localhost, para modelos rodando na própria máquina). Nunca http para a internet.
function urlBaseValida(url) {
  try {
    const u = new URL(url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    if (u.username || u.password || u.search || u.hash) return false;
    return u.protocol === 'https:' || (u.protocol === 'http:' && local);
  } catch (err) { return false; }
}

class ErroIA extends Error {
  constructor(codigo, mensagem, status) { super(mensagem); this.name = 'ErroIA'; this.codigo = codigo; this.status = status; }
}

// Mensagens seguras para mostrar ao usuário (nunca incluem a chave nem o corpo bruto da resposta).
function erroDeStatus(status) {
  if (status === 401 || status === 403) return new ErroIA('chave_invalida', 'A chave da IA foi recusada. Confira a chave em Configurações.', status);
  if (status === 404) return new ErroIA('modelo_invalido', 'O modelo de IA configurado não existe. Ajuste o modelo em Configurações.', status);
  if (status === 429) return new ErroIA('limite_provedor', 'A IA está com limite de uso no momento. Tente de novo em instantes.', status);
  if (status === 402) return new ErroIA('sem_saldo', 'A conta da IA está sem saldo. Faça uma recarga no site do provedor.', status);
  if (status === 400 || status === 422) return new ErroIA('requisicao_invalida', 'A IA recusou a solicitação (verifique o modelo e o saldo da conta).', status);
  if (status >= 500) return new ErroIA('indisponivel', 'O serviço de IA está indisponível agora. Tente de novo em instantes.', status);
  return new ErroIA('erro', `Falha ao falar com a IA (código ${status}).`, status);
}

function mensagemRede(err) {
  if (err && err.name === 'AbortError') return new ErroIA('timeout', 'A IA demorou demais para responder. Tente de novo.');
  return new ErroIA('rede', 'Não consegui falar com a IA (sem internet ou endereço incorreto?).');
}

function criarProvedorAnthropic({ obterChave, obterModelo, fetchImpl = globalThis.fetch, timeoutMs = 40000 }) {
  return {
    nome: 'anthropic',
    async completar({ system, user, maxTokens = 1200 }) {
      const chave = obterChave();
      if (!chave) throw new ErroIA('sem_chave', 'A chave da IA não está configurada.');
      if (typeof fetchImpl !== 'function') throw new ErroIA('sem_fetch', 'Este Node não tem suporte a rede (fetch). Use Node 18 ou mais novo.');
      const controle = new AbortController();
      const timer = setTimeout(() => controle.abort(), timeoutMs);
      let resposta;
      try {
        resposta = await fetchImpl(URL_API, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': chave, 'anthropic-version': VERSAO_API },
          body: JSON.stringify({ model: obterModelo(), max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
          signal: controle.signal
        });
      } catch (err) {
        if (err && err.name === 'AbortError') throw new ErroIA('timeout', 'A IA demorou demais para responder. Tente de novo.');
        throw new ErroIA('rede', 'Não consegui falar com a IA (sem internet?).');
      } finally {
        clearTimeout(timer);
      }
      if (!resposta.ok) throw erroDeStatus(resposta.status);
      let dados;
      try { dados = await resposta.json(); } catch (err) { throw new ErroIA('resposta_invalida', 'A IA respondeu em formato inesperado.'); }
      const blocos = Array.isArray(dados && dados.content) ? dados.content : [];
      const texto = blocos.filter((b) => b && b.type === 'text').map((b) => b.text).join('');
      if (!texto) throw new ErroIA('resposta_vazia', 'A IA respondeu vazio.');
      return {
        texto,
        modelo: (dados && dados.model) || obterModelo(),
        tokensEntrada: Number(dados && dados.usage && dados.usage.input_tokens) || 0,
        tokensSaida: Number(dados && dados.usage && dados.usage.output_tokens) || 0
      };
    }
  };
}

// Descoberta automática do modelo: quando nenhum modelo foi informado, pergunta ao provedor (GET {urlBase}/models)
// e escolhe um modelo de conversa, preferindo os rápidos/baratos. O resultado fica em memória por 1 hora.
const MODELOS_DESCOBERTOS = new Map();
const NAO_CONVERSA = /embed|whisper|tts|speech|audio|image|imagem|vision-only|moderat|guard|rerank|transcri|dall-e|video|realtime|live|imagen|veo|aqa|safeguard|ocr/i;
const PREFERIDOS = /(mini|flash|fast|lite|instant|small|haiku|chat|turbo)/i;

function escolherModelo(ids) {
  const lista = (Array.isArray(ids) ? ids : [])
    .map((x) => String(x || '').replace(/^models\//, ''))
    .filter((x) => /^[a-zA-Z0-9._:\/-]{3,100}$/.test(x) && !NAO_CONVERSA.test(x));
  if (!lista.length) return '';
  const semRaciocinio = lista.filter((x) => !/reason|think|r1|o1|o3|o4/i.test(x));
  const base = semRaciocinio.length ? semRaciocinio : lista;
  // Evita versões de teste (preview/exp), que têm limites menores no plano grátis e são desligadas sem aviso.
  const estaveis = base.filter((x) => !/preview|exp|latest/i.test(x));
  const pool = estaveis.length ? estaveis : base;
  const gratis = pool.find((x) => /:free$/.test(x) && PREFERIDOS.test(x)) || base.find((x) => /:free$/.test(x));
  if (gratis) return gratis;
  // Gemini: "flash-lite" tem o maior limite grátis; ordena pela versão mais nova.
  const porVersao = (a, b) => b.localeCompare(a, 'en', { numeric: true });
  const gem = pool.filter((x) => /^gemini-/.test(x)).sort(porVersao);
  if (gem.length) return gem.find((x) => /flash-lite/.test(x)) || gem.find((x) => /flash/.test(x)) || gem[0];
  return pool.find((x) => PREFERIDOS.test(x)) || pool[0];
}

async function descobrirModelo({ urlBase, chave, fetchImpl, timeoutMs }) {
  const k = `${String(urlBase).replace(/\/+$/, '')}|${String(chave).slice(-6)}`;
  const guardado = MODELOS_DESCOBERTOS.get(k);
  if (guardado && guardado.ate > Date.now()) return guardado.modelo;
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), timeoutMs);
  let resposta;
  try {
    resposta = await fetchImpl(`${String(urlBase).replace(/\/+$/, '')}/models`, { headers: { authorization: `Bearer ${chave}` }, signal: controle.signal });
  } catch (err) {
    throw mensagemRede(err);
  } finally {
    clearTimeout(timer);
  }
  if (!resposta.ok) throw erroDeStatus(resposta.status);
  let dados;
  try { dados = await resposta.json(); } catch (err) { dados = null; }
  const ids = dados && Array.isArray(dados.data) ? dados.data.map((m) => m && m.id) : (dados && Array.isArray(dados.models) ? dados.models.map((m) => m && (m.id || m.name)) : []);
  const modelo = escolherModelo(ids);
  if (!modelo) throw new ErroIA('modelo_invalido', 'Não consegui descobrir um modelo nesse provedor. Informe o nome do modelo em Configurações.');
  MODELOS_DESCOBERTOS.set(k, { modelo, ate: Date.now() + 3600000 });
  return modelo;
}

// Formato OpenAI (POST {urlBase}/chat/completions). Serve para DeepSeek, OpenAI, OpenRouter e similares.
function criarProvedorOpenAI({ id = 'personalizado', obterChave, obterModelo, urlBase, fetchImpl = globalThis.fetch, timeoutMs = 40000, esperaRepetir = 20000 }) {
  const preset = PROVEDORES[id] || PROVEDORES.personalizado;
  return {
    nome: id,
    async completar({ system, user, maxTokens = 1200 }) {
      const chave = obterChave();
      if (!chave) throw new ErroIA('sem_chave', 'A chave da IA não está configurada.');
      if (!urlBaseValida(urlBase)) throw new ErroIA('url_invalida', 'O endereço da IA é inválido. Use um endereço https:// em Configurações.');
      if (typeof fetchImpl !== 'function') throw new ErroIA('sem_fetch', 'Este Node não tem suporte a rede (fetch). Use Node 18 ou mais novo.');
      const modelo = obterModelo() || await descobrirModelo({ urlBase, chave, fetchImpl, timeoutMs });
      const limite = Math.max(maxTokens, preset.minTokens || 0);
      const corpo = JSON.stringify({ ...(preset.extra || {}), model: modelo, [preset.campoMaxTokens || 'max_tokens']: limite,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }] });
      const chamar = async () => {
        const controle = new AbortController();
        const timer = setTimeout(() => controle.abort(), timeoutMs);
        try {
          return await fetchImpl(`${String(urlBase).replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${chave}` }, body: corpo, signal: controle.signal
          });
        } catch (err) {
          throw mensagemRede(err);
        } finally {
          clearTimeout(timer);
        }
      };
      let resposta = await chamar();
      // Plano grátis: limite por minuto estoura fácil. Espera o tempo pedido (até 20 s) e tenta uma vez de novo.
      if (resposta.status === 429 && esperaRepetir > 0) {
        const pedido = Number(resposta.headers && typeof resposta.headers.get === 'function' ? resposta.headers.get('retry-after') : NaN);
        const ms = Math.min(Number.isFinite(pedido) && pedido > 0 ? pedido * 1000 : 5000, esperaRepetir);
        await new Promise((r) => setTimeout(r, ms));
        resposta = await chamar();
      }
      if (!resposta.ok) throw erroDeStatus(resposta.status);
      let dados;
      try { dados = await resposta.json(); } catch (err) { throw new ErroIA('resposta_invalida', 'A IA respondeu em formato inesperado.'); }
      const msg = dados && Array.isArray(dados.choices) && dados.choices[0] && dados.choices[0].message;
      const texto = msg && typeof msg.content === 'string' ? msg.content : '';
      if (!texto.trim()) throw new ErroIA('resposta_vazia', 'A IA respondeu vazio. Se o modelo for de "raciocínio", ele pode gastar o limite pensando: teste um modelo comum.');
      return {
        texto,
        modelo: (dados && dados.model) || modelo,
        tokensEntrada: Number(dados && dados.usage && dados.usage.prompt_tokens) || 0,
        tokensSaida: Number(dados && dados.usage && dados.usage.completion_tokens) || 0
      };
    }
  };
}

const CAI_PARA_RESERVA = new Set(['limite_provedor', 'indisponivel', 'timeout', 'rede', 'sem_saldo']);

// Escolhe o provedor real a cada chamada, conforme a configuração salva (trocar em Configurações vale na hora).
// resolver() devolve { id, tipo, urlBase, modelo, chave } do provedor ativo.
function criarProvedorMulti({ resolver, fetchImpl = globalThis.fetch, timeoutMs, esperaRepetir }) {
  return {
    nome: 'multi',
    async completar(args) {
      const r = resolver();
      const montar = (x) => {
        const comum = { obterChave: () => x.chave, obterModelo: () => x.modelo, fetchImpl, ...(timeoutMs ? { timeoutMs } : {}), ...(esperaRepetir !== undefined ? { esperaRepetir } : {}) };
        return x.tipo === 'anthropic' ? criarProvedorAnthropic(comum) : criarProvedorOpenAI({ ...comum, id: x.id, urlBase: x.urlBase });
      };
      try {
        return await montar(r).completar(args);
      } catch (err) {
        // Provedor reserva (opcional): só quando o principal está fora do ar ou sem cota, e só se o reserva tem a própria chave.
        // A chave de um provedor nunca vai para o outro: cada um usa a sua.
        const r2 = r.reserva;
        if (!r2 || !r2.chave || r2.id === r.id || !(err instanceof ErroIA) || !CAI_PARA_RESERVA.has(err.codigo)) throw err;
        const resp = await montar(r2).completar(args);
        return { ...resp, reserva: r2.id };
      }
    }
  };
}

// Provedor de mentira para testes: devolve respostas prontas e guarda as chamadas recebidas.
function criarProvedorFalso(respostas = []) {
  const fila = Array.isArray(respostas) ? [...respostas] : [respostas];
  const chamadas = [];
  return {
    nome: 'falso',
    chamadas,
    async completar(args) {
      chamadas.push(args);
      const proxima = fila.length > 1 ? fila.shift() : fila[0];
      if (proxima instanceof Error) throw proxima;
      const texto = typeof proxima === 'string' ? proxima : JSON.stringify(proxima);
      return { texto, modelo: 'falso', tokensEntrada: 100, tokensSaida: 50 };
    }
  };
}

module.exports = { escolherModelo, criarProvedorAnthropic, criarProvedorOpenAI, criarProvedorMulti, criarProvedorFalso, ErroIA, erroDeStatus, URL_API, PROVEDORES, ehProvedor, urlBaseValida };

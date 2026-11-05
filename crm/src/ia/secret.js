'use strict';
// Chave da API de IA, uma por provedor (assim trocar de provedor nunca manda a chave de um para o outro).
// Fica FORA do banco (o banco é copiado em backups) e nunca volta para o navegador.
// Ordem: variável de ambiente do provedor (ex.: DEEPSEEK_API_KEY), depois o arquivo em data/ (permissão 0600).
// Compatível com o formato antigo: a chave da Anthropic continua em data/ia-key e em ANTHROPIC_API_KEY.
const fs = require('fs');
const path = require('path');

const ENV = {
  gemini: 'GEMINI_API_KEY', groq: 'GROQ_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY', deepseek: 'DEEPSEEK_API_KEY', openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY', personalizado: 'IA_API_KEY'
};

function criarCofre(dataDir) {
  const id = (p) => (Object.prototype.hasOwnProperty.call(ENV, p) ? p : 'anthropic');
  const arquivoDe = (p) => path.join(dataDir, id(p) === 'anthropic' ? 'ia-key' : `ia-key-${id(p)}`);
  const doEnv = (p) => String(process.env[ENV[id(p)]] || '').trim();
  const ler = (p = 'anthropic') => {
    const env = doEnv(p);
    if (env) return env;
    try { return fs.readFileSync(arquivoDe(p), 'utf8').trim(); } catch (err) { return ''; }
  };
  return {
    ler,
    origem(p = 'anthropic') { return doEnv(p) ? 'ambiente' : (fs.existsSync(arquivoDe(p)) ? 'arquivo' : ''); },
    gravar(chave, p = 'anthropic') {
      const k = String(chave || '').trim();
      if (k.length < 20 || /\s/.test(k)) throw new Error('Chave inválida. Cole a chave inteira, sem espaços.');
      fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(arquivoDe(p), k, { mode: 0o600 });
      try { fs.chmodSync(arquivoDe(p), 0o600); } catch (err) { /* ok */ }
    },
    apagar(p = 'anthropic') { try { fs.rmSync(arquivoDe(p), { force: true }); } catch (err) { /* ok */ } },
    // Só os 4 últimos caracteres, para o administrador reconhecer qual chave está em uso.
    final4(p = 'anthropic') { const k = ler(p); return k ? k.slice(-4) : ''; },
    envDe: (p) => ENV[id(p)]
  };
}

module.exports = { criarCofre, ENV };

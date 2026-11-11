'use strict';
// Campos protegidos (CPF e CNPJ) — Etapa 2. Nenhuma tela coleta esses dados nesta fase.
//
// - O valor só é gravado CIFRADO (AES-256-GCM) com a chave FM_DADOS_KEY (64 caracteres hex), que fica fora do banco e
//   fora do repositório. Sem a chave, o campo não pode ser gravado nem lido (falha fechada).
// - Para encontrar repetido sem guardar o número aberto: índice HMAC-SHA256 (chave derivada da mesma FM_DADOS_KEY).
// - Toda gravação exige a FINALIDADE (LGPD: por que o dado é necessário). Exibição padrão: mascarada (***.***.*89-01).
const crypto = require('crypto');

const soDigitos = (v) => String(v || '').replace(/\D/g, '');

function chaves() {
  const k = Buffer.from(String(process.env.FM_DADOS_KEY || ''), 'hex');
  if (k.length !== 32) throw Object.assign(new Error('Campo protegido indisponível: FM_DADOS_KEY não configurada.'), { code: 'sem_chave' });
  const derivar = (rotulo) => Buffer.from(crypto.hkdfSync('sha256', k, Buffer.alloc(0), Buffer.from(rotulo), 32));
  return { cifra: derivar('fm-crm-protegido-cifra-v1'), indice: derivar('fm-crm-protegido-indice-v1') };
}

function validarCPF(v) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function validarCNPJ(v) {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n) => { const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * pesos[i]; const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

/**
 * Prepara um CPF/CNPJ para gravar: { cifrado, indice, finalidade }. Lança erro se o número for inválido, se faltar a
 * finalidade ou a chave. `tipo` entra no dado cifrado (um CNPJ não abre como CPF).
 */
function proteger(tipo, valor, finalidade) {
  if (!['cpf', 'cnpj'].includes(tipo)) throw new Error('Tipo de campo protegido desconhecido.');
  const d = soDigitos(valor);
  if (!(tipo === 'cpf' ? validarCPF(d) : validarCNPJ(d))) throw Object.assign(new Error(`${tipo.toUpperCase()} inválido.`), { code: 'invalido' });
  const fin = String(finalidade || '').trim();
  if (fin.length < 5) throw Object.assign(new Error('Informe a finalidade do dado (LGPD).'), { code: 'sem_finalidade' });
  const k = chaves();
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k.cifra, iv);
  c.setAAD(Buffer.from(`fm-${tipo}-v1`));
  const corpo = Buffer.concat([c.update(d), c.final()]);
  return {
    cifrado: `P1.${Buffer.concat([iv, c.getAuthTag(), corpo]).toString('base64')}`,
    indice: crypto.createHmac('sha256', k.indice).update(`${tipo}:${d}`).digest('hex'),
    finalidade: fin.slice(0, 200)
  };
}

/** Índice para procurar um CPF/CNPJ já gravado (sem abrir nenhum registro). */
function indiceDe(tipo, valor) {
  return crypto.createHmac('sha256', chaves().indice).update(`${tipo}:${soDigitos(valor)}`).digest('hex');
}

/** Abre o valor (uso restrito: quem chama registra o acesso na auditoria). Lança erro se adulterado. */
function abrir(tipo, cifrado) {
  const s = String(cifrado || '');
  if (!s.startsWith('P1.')) throw new Error('Formato de campo protegido desconhecido.');
  const buf = Buffer.from(s.slice(3), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', chaves().cifra, buf.subarray(0, 12));
  d.setAAD(Buffer.from(`fm-${tipo}-v1`));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString();
}

/** Máscara para exibir sem revelar o número inteiro. */
function mascarar(tipo, digitos) {
  const d = soDigitos(digitos);
  if (tipo === 'cpf' && d.length === 11) return `***.***.*${d.slice(7, 9)}-${d.slice(9)}`;
  if (tipo === 'cnpj' && d.length === 14) return `**.***.***/${d.slice(8, 12)}-${d.slice(12)}`;
  return '***';
}

module.exports = { proteger, abrir, indiceDe, mascarar, validarCPF, validarCNPJ };

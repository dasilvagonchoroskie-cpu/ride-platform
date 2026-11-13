'use strict';
// Entrada assinada do aplicativo do motorista (backend da plataforma → CRM). Etapa 2, 12/11/2026.
// Rota pública (o backend não tem sessão do CRM), mas NADA é executado sem:
//  - segredo compartilhado configurado (FM_INTEGRACAO_SEGREDO, ≥ 32 caracteres, fora do repositório). Sem ele: 404 (fail-closed);
//  - assinatura HMAC-SHA256 válida do método, caminho, horário, nonce, metadados e corpo (comparação em tempo constante);
//  - horário dentro de ±5 min e nonce nunca usado (proteção contra repetição: cada nonce vale uma vez);
//  - limite de requisições por origem; validação de cada campo; documento pelas mesmas regras do M4 (assinatura do arquivo,
//    extensão, tamanho, PDF ativo) e cifrado (AES-256-GCM) como qualquer outro.
// O que o app manda é DADO: nunca aprova, nunca decide, nunca sobrescreve campo preenchido. O candidato entra na avaliação.
// Não recebe CPF nem número da CNH (minimização; CPF/CNPJ no CRM continuam só cifrados e só com o administrador).
//
// Assinatura (versão 1):
//   base = `v1.${timestamp}.${nonce}.${MÉTODO}.${caminho}.${sha256hex(X-FM-Meta || '')}.${sha256hex(corpo)}`
//   X-FM-Assinatura: v1=<hmac_sha256_hex(segredo, base)>     X-FM-Timestamp: segundos Unix     X-FM-Nonce: 16–64 [A-Za-z0-9_-]
const crypto = require('crypto');

const JANELA_S = 300;
const sha256hex = (b) => crypto.createHash('sha256').update(b || Buffer.alloc(0)).digest('hex');

function segredos(env = process.env) {
  return [env.FM_INTEGRACAO_SEGREDO, env.FM_INTEGRACAO_SEGREDO_ANTERIOR].map((s) => String(s || '').trim()).filter((s) => s.length >= 32);
}
const configurada = (env = process.env) => segredos(env).length > 0;

function baseAssinatura({ timestamp, nonce, metodo, caminho, meta, corpo }) {
  return `v1.${timestamp}.${nonce}.${String(metodo).toUpperCase()}.${caminho}.${sha256hex(Buffer.from(meta || '', 'utf8'))}.${sha256hex(corpo)}`;
}
function assinar(segredo, partes) {
  return `v1=${crypto.createHmac('sha256', segredo).update(baseAssinatura(partes)).digest('hex')}`;
}

/** Confere assinatura, horário e nonce. Devolve { ok } ou { status, codigo, mensagem } (mensagens genéricas: nada vaza). */
function verificar({ db, cabecalhos, metodo, caminho, corpo, agora = Date.now(), env = process.env }) {
  const lista = segredos(env);
  if (!lista.length) return { status: 404, codigo: 'not_found', mensagem: 'Recurso não encontrado.' };
  const ts = String(cabecalhos['x-fm-timestamp'] || '');
  const nonce = String(cabecalhos['x-fm-nonce'] || '');
  const ass = String(cabecalhos['x-fm-assinatura'] || '');
  const meta = String(cabecalhos['x-fm-meta'] || '');
  const recusa = { status: 401, codigo: 'assinatura_invalida', mensagem: 'Requisição não autenticada.' };
  if (!/^\d{9,12}$/.test(ts) || !/^[A-Za-z0-9_-]{16,64}$/.test(nonce) || !/^v1=[0-9a-f]{64}$/.test(ass) || meta.length > 4000) return recusa;
  if (Math.abs(agora / 1000 - Number(ts)) > JANELA_S) return { status: 401, codigo: 'expirada', mensagem: 'Requisição fora do horário aceito.' };
  const recebida = Buffer.from(ass, 'utf8');
  const confere = lista.some((s) => {
    const esperada = Buffer.from(assinar(s, { timestamp: ts, nonce, metodo, caminho, meta, corpo }), 'utf8');
    return esperada.length === recebida.length && crypto.timingSafeEqual(esperada, recebida);
  });
  if (!confere) return recusa;
  // Nonce de uso único (só depois de a assinatura conferir, para ninguém encher a tabela).
  db.prepare('DELETE FROM integracao_nonces WHERE recebido_em < ?').run(new Date(agora - 2 * JANELA_S * 1000).toISOString());
  try {
    db.prepare('INSERT INTO integracao_nonces (nonce, recebido_em) VALUES (?, ?)').run(nonce, new Date(agora).toISOString());
  } catch (err) {
    return { status: 409, codigo: 'repetida', mensagem: 'Esta requisição já foi recebida.' };
  }
  let metaObj = {};
  if (meta) { try { metaObj = JSON.parse(meta); } catch (e) { return { status: 422, codigo: 'invalido', mensagem: 'Metadados inválidos.' }; } }
  return { ok: true, meta: metaObj && typeof metaObj === 'object' && !Array.isArray(metaObj) ? metaObj : {} };
}

// Tipos de documento do aplicativo (backend) → categorias do M4. CNH frente = "cnh"; o resto que não tem categoria própria
// vira "outros" com nome fixo (cada um com o seu histórico de versões).
const TIPOS_DOC = {
  CNH_FRONT: { categoria: 'cnh' },
  CRLV: { categoria: 'crlv' },
  RESIDENCE_PROOF: { categoria: 'comprovante_endereco' },
  CNH_BACK: { categoria: 'outros', titulo: 'CNH (verso)' },
  PROFILE_PHOTO: { categoria: 'outros', titulo: 'Foto de perfil' },
  VEHICLE_FRONT: { categoria: 'outros', titulo: 'Foto do veículo (frente)' },
  VEHICLE_BACK: { categoria: 'outros', titulo: 'Foto do veículo (traseira)' },
  VEHICLE_PLATE: { categoria: 'outros', titulo: 'Foto da placa do veículo' },
  CRIMINAL_RECORD: { categoria: 'outros', titulo: 'Certidão de antecedentes criminais' }
};

const ID_EXTERNO = /^[A-Za-z0-9-]{8,64}$/;
const CNH_CATEGORIAS = ['A', 'B', 'AB', 'C', 'D', 'E', 'AC', 'AD', 'AE'];

/** Normaliza o candidato vindo do app. Só os campos necessários; o que não passar na validação é descartado. */
function normalizarCandidato(c) {
  const t = (v, max) => { const s = String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim(); return s ? s.slice(0, max) : ''; };
  if (!c || typeof c !== 'object') return { erro: 'Corpo inválido.' };
  const externo = t(c.externo_id, 64);
  if (!ID_EXTERNO.test(externo)) return { erro: 'externo_id inválido.' };
  const nome = t(c.nome, 120);
  if (nome.length < 3) return { erro: 'nome inválido.' };
  const telefone = t(c.telefone, 20).replace(/[^\d+]/g, '');
  if (!/^\+?\d{10,13}$/.test(telefone)) return { erro: 'telefone inválido.' };
  const cnh = t(c.cnh_categoria, 4).toUpperCase();
  const data = t(c.data_cadastro, 30);
  return {
    externo_id: externo, nome, telefone,
    cidade: t(c.cidade, 80) || null,
    veiculo: t(c.veiculo, 120) || null,
    placa: t(c.placa, 8).toUpperCase().replace(/[^A-Z0-9]/g, '') || null,
    cnh_categoria: CNH_CATEGORIAS.includes(cnh) ? cnh : null,
    data_cadastro: /^\d{4}-\d{2}-\d{2}T/.test(data) && !Number.isNaN(Date.parse(data)) ? data : null
  };
}

module.exports = { verificar, assinar, baseAssinatura, sha256hex, configurada, segredos, normalizarCandidato, TIPOS_DOC, ID_EXTERNO, JANELA_S };

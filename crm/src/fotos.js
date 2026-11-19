'use strict';
// Foto de perfil dos usuários do CRM (19/11/2026, pedido do dono: "estilo premium", foto de cada atendente).
// Guardada no próprio banco (tabela separada, fora de `users`, para nunca vazar em SELECT * de usuário) e assim entra nos
// retratos do cofre. O navegador reduz a imagem para 256x256 antes de enviar; aqui só aceitamos JPEG, PNG ou WebP de até
// 200 KB, conferidos pelos primeiros bytes (o tipo declarado tem de bater com o conteúdo).

const MAX_BYTES = 200 * 1024;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Tipo real pelos primeiros bytes (ou null). */
function tipoDe(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

function criarFotos(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS user_fotos (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    dados BLOB NOT NULL,
    atualizado_em TEXT NOT NULL
  )`);

  /** Grava a foto (data URL vinda do navegador). Devolve { ok, versao } ou { erro }. */
  function salvar(userId, dataUrl) {
    const m = DATA_URL.exec(String(dataUrl || ''));
    if (!m) return { erro: 'Envie uma imagem JPG, PNG ou WebP.' };
    if (m[2].length > Math.ceil((MAX_BYTES * 4) / 3) + 4) return { erro: 'A foto ficou grande demais (máximo 200 KB).' };
    const dados = Buffer.from(m[2], 'base64');
    if (!dados.length || dados.length > MAX_BYTES) return { erro: 'A foto ficou grande demais (máximo 200 KB).' };
    const tipo = tipoDe(dados);
    if (!tipo || tipo !== m[1]) return { erro: 'O arquivo não é uma imagem válida.' };
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId)) return { erro: 'Usuário não encontrado.', status: 404 };
    const versao = new Date().toISOString();
    db.prepare(`INSERT INTO user_fotos (user_id, tipo, dados, atualizado_em) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET tipo = excluded.tipo, dados = excluded.dados, atualizado_em = excluded.atualizado_em`).run(userId, tipo, dados, versao);
    return { ok: true, versao };
  }

  const apagar = (userId) => db.prepare('DELETE FROM user_fotos WHERE user_id = ?').run(userId).changes > 0;
  const obter = (userId) => db.prepare('SELECT tipo, dados, atualizado_em FROM user_fotos WHERE user_id = ?').get(userId) || null;
  const versao = (userId) => (db.prepare('SELECT atualizado_em v FROM user_fotos WHERE user_id = ?').get(userId) || {}).v || null;
  /** Mapa id -> versão de todos os que têm foto. */
  function versoes() {
    const r = {};
    for (const x of db.prepare('SELECT user_id, atualizado_em FROM user_fotos').all()) r[x.user_id] = x.atualizado_em;
    return r;
  }
  return { salvar, apagar, obter, versao, versoes };
}

module.exports = { criarFotos, tipoDe, MAX_BYTES };

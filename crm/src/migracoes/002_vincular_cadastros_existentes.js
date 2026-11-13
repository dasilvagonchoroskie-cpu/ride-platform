'use strict';
// Etapa 2 — liga os cadastros que já existem às pessoas/empresas, SEM alterar nem apagar nenhum deles.
//
// Regra conservadora (nunca junta por engano):
// - Motorista/passageiro com o MESMO telefone (DDD + 8 últimos dígitos) E o MESMO nome (sem acento, maiúscula ou espaço
//   extra) de uma pessoa já criada nesta migração → é a mesma pessoa (ex.: alguém que é motorista e passageiro).
// - Qualquer outra coincidência (mesmo telefone com nome diferente, ou dois registros da MESMA função) → pessoas
//   separadas; a dúvida aparece no relatório de possíveis duplicados para o administrador decidir.
// - Parceiro do Clube → empresa, com a mesma regra (nome do estabelecimento + telefone).
// - Cada registro funcional ganha um vínculo ativo com o seu titular.
// O código de normalização fica DENTRO da migração (congelado): mudar um utilitário depois não muda o que ela fez.
const crypto = require('crypto');

const digitos = (v) => String(v === null || v === undefined ? '' : v).replace(/\D/g, '');
function telefoneWa(v) {
  let d = digitos(v).replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d;
}
function chaveTelefone(v) {
  const d = telefoneWa(v);
  const k = d.startsWith('55') && (d.length === 12 || d.length === 13) ? d.slice(2, 4) + d.slice(-8) : d;
  return k.length >= 10 ? k : null;
}
const nomeNormal = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

module.exports = {
  versao: 2,
  nome: 'vincular_cadastros_existentes',
  up(db) {
    const agora = new Date().toISOString();
    const tem = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t);
    const insPessoa = db.prepare('INSERT INTO pessoas (uid, nome, telefone, telefone_chave, cidade, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insEmpresa = db.prepare('INSERT INTO empresas (uid, nome_fantasia, telefone, telefone_chave, cidade, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insVinculo = db.prepare('INSERT INTO vinculos (titular_tipo, titular_id, funcao, registro_tabela, registro_id, ativo, criado_em) VALUES (?, ?, ?, ?, ?, 1, ?)');
    const jaTem = db.prepare('SELECT 1 FROM vinculos WHERE registro_tabela = ? AND registro_id = ? AND ativo = 1');
    const funcoesDe = db.prepare("SELECT funcao FROM vinculos WHERE titular_tipo = ? AND titular_id = ? AND ativo = 1");

    const resumo = { pessoas_criadas: 0, empresas_criadas: 0, vinculos_criados: 0, unidos_por_telefone_e_nome: 0, ja_vinculados: 0 };
    const porChave = new Map(); // "tipo|telefone|nome" -> id do titular criado nesta migração

    function titular(tipo, nome, telefone, cidade, funcao) {
      const chave = chaveTelefone(telefone);
      const nn = nomeNormal(nome);
      const k = chave && nn ? `${tipo}|${chave}|${nn}` : null;
      if (k && porChave.has(k)) {
        const id = porChave.get(k);
        // Mesma pessoa, mas já tem esta função: não junta (seriam dois registros da mesma função).
        const funcoes = funcoesDe.all(tipo, id).map((r) => r.funcao);
        if (!funcoes.includes(funcao)) { resumo.unidos_por_telefone_e_nome += 1; return id; }
      }
      const uid = crypto.randomUUID();
      const tel = telefoneWa(telefone) || null;
      const id = Number((tipo === 'pessoa' ? insPessoa : insEmpresa).run(uid, String(nome || '').trim() || '(sem nome)', tel, chave, cidade || null, agora, agora).lastInsertRowid);
      if (tipo === 'pessoa') resumo.pessoas_criadas += 1; else resumo.empresas_criadas += 1;
      if (k && !porChave.has(k)) porChave.set(k, id);
      return id;
    }

    const fontes = [
      { tabela: 'motoristas', tipo: 'pessoa', funcao: 'motorista', sql: 'SELECT id, nome, telefone, cidade FROM motoristas ORDER BY id' },
      { tabela: 'passageiros', tipo: 'pessoa', funcao: 'passageiro', sql: 'SELECT id, nome, telefone, cidade FROM passageiros ORDER BY id' },
      { tabela: 'parceiros', tipo: 'empresa', funcao: 'parceiro_clube', sql: 'SELECT id, nome_estabelecimento AS nome, telefone, cidade FROM parceiros ORDER BY id' }
    ];
    for (const f of fontes) {
      if (!tem(f.tabela)) continue;
      for (const r of db.prepare(f.sql).all()) {
        if (jaTem.get(f.tabela, r.id)) { resumo.ja_vinculados += 1; continue; }
        const id = titular(f.tipo, r.nome, r.telefone, r.cidade, f.funcao);
        insVinculo.run(f.tipo, id, f.funcao, f.tabela, r.id, agora);
        resumo.vinculos_criados += 1;
      }
    }
    return resumo;
  },
  verificar(db) {
    const problemas = [];
    for (const [tabela, tipo] of [['motoristas', 'pessoa'], ['passageiros', 'pessoa'], ['parceiros', 'empresa']]) {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabela)) continue;
      const sem = db.prepare(`SELECT COUNT(*) c FROM ${tabela} t WHERE NOT EXISTS (SELECT 1 FROM vinculos v WHERE v.registro_tabela = ? AND v.registro_id = t.id AND v.ativo = 1)`).get(tabela).c;
      if (sem) problemas.push(`${sem} registro(s) de ${tabela} sem vínculo`);
      const orfaos = db.prepare(`SELECT COUNT(*) c FROM vinculos v WHERE v.registro_tabela = ? AND v.titular_tipo = ? AND NOT EXISTS (SELECT 1 FROM ${tipo === 'pessoa' ? 'pessoas' : 'empresas'} x WHERE x.id = v.titular_id)`).get(tabela, tipo).c;
      if (orfaos) problemas.push(`${orfaos} vínculo(s) de ${tabela} sem titular`);
    }
    return problemas;
  }
};

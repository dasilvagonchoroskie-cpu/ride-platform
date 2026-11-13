'use strict';
// SIMULAÇÃO do armazenamento de arquivos do WhatsApp para os testes da IA/Central (sem cifra nem disco).
// Regra imitada: foto/documento cuja leitura diz com segurança o tipo ("📎 Tipo: ...") conta como GUARDADO; se a conversa
// tem ficha de motorista, o campo do documento passa a "Recebido — conferir" (o que o arquivo digital real faz).
// O fluxo real (cifra, disco, ficha) é testado em test/wa-anexos.test.js.
const { DOCUMENTOS_MOTORISTA } = require('../../src/defs');
const { tipoDocumento } = require('../../src/ia/documentos');

function recebidosFalso(db) {
  const porTipo = Object.fromEntries(DOCUMENTOS_MOTORISTA.map((d) => [d.tipo, d]));
  const midias = (conversaId) => db.prepare("SELECT * FROM wa_mensagens WHERE conversa_id = ? AND direcao = 'in' AND tipo IN ('image', 'document') ORDER BY id").all(conversaId);
  const categoria = (m) => { const t = tipoDocumento(m.texto); return t ? porTipo[t].categoria : null; };
  return {
    ativo: () => true,
    daMensagem(id) {
      const m = db.prepare('SELECT * FROM wa_mensagens WHERE id = ?').get(id);
      if (!m || !['image', 'document'].includes(m.tipo)) return null;
      const c = categoria(m);
      return { situacao: c ? 'anexado' : 'pendente_classificacao', categoria: c };
    },
    categoriasGuardadas: (conversaId) => new Set(midias(conversaId).map(categoria).filter(Boolean)),
    async processar(conversaId) {
      const v = db.prepare('SELECT k.vinculo_tipo, k.vinculo_id FROM wa_conversas c JOIN wa_contatos k ON k.id = c.contato_id WHERE c.id = ?').get(conversaId);
      if (!v || v.vinculo_tipo !== 'motoristas') return [];
      const feitos = [];
      for (const m of midias(conversaId)) {
        const c = categoria(m);
        const d = c && DOCUMENTOS_MOTORISTA.find((x) => x.categoria === c);
        if (!d) continue;
        const r = db.prepare(`UPDATE motoristas SET ${d.campo} = 'Recebido — conferir' WHERE id = ? AND COALESCE(${d.campo}, '') NOT IN ('Recebido — conferir', 'Conferido')`).run(v.vinculo_id);
        if (r.changes) feitos.push(c);
      }
      return feitos;
    }
  };
}
// Tipo da mensagem pelo rótulo do texto (como o conector real faz).
const tipoDoTexto = (texto, padrao = 'text') => (/^\[imagem\]/.test(texto) ? 'image' : /^\[documento\]/.test(texto) ? 'document' : padrao);

module.exports = { recebidosFalso, tipoDoTexto };

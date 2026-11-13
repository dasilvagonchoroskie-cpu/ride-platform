'use strict';
// Arquivos (fotos e PDFs) recebidos pelo WhatsApp → arquivo digital protegido da ficha do candidato (13/11/2026).
//
// Regras (pedido do dono):
//  - o arquivo SÓ conta como recebido depois de guardado (cifrado) no arquivo digital da ficha certa; texto não basta;
//  - tipo, tamanho e conteúdo validados pelas MESMAS regras do envio pela tela (assinatura do arquivo, PDF ativo, limite);
//  - categoria só quando a leitura disse com segurança (linha "Tipo:" → um dos 7 itens); na dúvida fica PENDENTE DE
//    CLASSIFICAÇÃO pela equipe — nunca uma categoria errada. As 3 fotos do veículo são categorias separadas;
//  - sem ficha ligada à conversa ainda: fica CIFRADO na área de espera e entra na ficha quando ela existir;
//  - mesmo arquivo de novo (SHA-256): não duplica; falha de download/armazenamento: fica registrada e a equipe é avisada;
//  - toda entrada vira linha em wa_anexos (histórico, sem apagar), evento na conversa e auditoria.
const { DOCUMENTOS_MOTORISTA } = require('../defs');
const { tipoDocumento, extrairDadosDocumentos } = require('../ia/documentos');
const { validarArquivo, detectarTipo, nomeSeguro, TIPOS } = require('./validacao');
const { sha256 } = require('./cifra');

const CATEGORIA_DO_TIPO = Object.fromEntries(DOCUMENTOS_MOTORISTA.map((d) => [d.tipo, d.categoria]));
const MIDIAS = new Set(['image', 'document']);
const PENDENTES = ['pendente_classificacao', 'aguardando_ficha', 'falhou', 'recusado'];

/** Categoria do arquivo pelo que a leitura escreveu (📎 Tipo: ...). null = não dá para afirmar. */
function categoriaDaLeitura(textoLido) {
  if (!textoLido) return null;
  const t = /📎/u.test(textoLido) || /^\s*tipo\s*:/im.test(textoLido) ? textoLido : `📎 ${textoLido}`;
  const tipo = tipoDocumento(t);
  return tipo ? CATEGORIA_DO_TIPO[tipo] || null : null;
}
/** A leitura indica documento (ou não deu para ler)? Foto comum (só "Descrição: ...") não é guardada como documento. */
function pareceDocumento({ tipoMidia, textoLido, leituraFalhou }) {
  if (leituraFalhou || !textoLido) return true; // sem leitura não dá para descartar: guarda e a equipe olha
  if (tipoMidia === 'document') return true;    // PDF/arquivo enviado como documento
  if (categoriaDaLeitura(textoLido)) return true;
  if (/(^|\n)\s*tipo\s*:/i.test(textoLido)) return true;
  return Object.keys(extrairDadosDocumentos([{ direcao: 'in', texto: `📎 ${textoLido}` }]) || {}).length > 0;
}

function createRecebidos({ db, docs, candidaturas, audit, log = console }) {
  const agora = () => new Date().toISOString();
  const temTabela = () => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'wa_anexos'").get();
  const ativo = () => !!(docs && docs.ativo() && temTabela() && docs.estadoArmazenamento().pronto);
  const reqSistema = () => ({ app: { locals: { db } }, user: { id: null, nome: 'WhatsApp (recebimento automático)' }, headers: {}, ip: '', socket: {} });
  const evento = (conversaId, detalhe) => {
    try { db.prepare("INSERT INTO wa_eventos (conversa_id, tipo, detalhe, usuario_id, criado_em) VALUES (?, 'anexo', ?, NULL, ?)").run(conversaId, String(detalhe).slice(0, 300), agora()); } catch (_) { /* conversa removida */ }
  };
  const rotulo = (cat) => { const d = DOCUMENTOS_MOTORISTA.find((x) => x.categoria === cat); return d ? d.rotulo : (cat === 'outros' ? 'Outro documento' : cat || 'sem classificação'); };
  const linha = (id) => db.prepare('SELECT * FROM wa_anexos WHERE id = ?').get(Number(id));
  const conversaDaMensagem = (mensagemId) => (db.prepare('SELECT conversa_id FROM wa_mensagens WHERE id = ?').get(Number(mensagemId)) || {}).conversa_id || null;
  /** Ficha de motorista ligada à conversa (pelo contato), ou null. */
  function fichaDaConversa(conversaId) {
    const r = db.prepare(`SELECT k.vinculo_tipo, k.vinculo_id FROM wa_conversas c JOIN wa_contatos k ON k.id = c.contato_id WHERE c.id = ?`).get(Number(conversaId));
    if (!r || r.vinculo_tipo !== 'motoristas' || !r.vinculo_id) return null;
    return db.prepare('SELECT id FROM motoristas WHERE id = ?').get(r.vinculo_id) ? r.vinculo_id : null;
  }
  function registrar(dados) {
    const t = agora();
    const id = Number(db.prepare(`INSERT INTO wa_anexos (mensagem_id, conversa_id, tipo_midia, nome_arquivo, mime, extensao, tamanho, sha256, categoria, classificado_por,
      situacao, motivo, guarda_uid, guarda_chave, guarda_chave_embrulhada, guarda_armazenamento, duplicado_de, criado_em, atualizado_em)
      VALUES (@mensagem_id, @conversa_id, @tipo_midia, @nome_arquivo, @mime, @extensao, @tamanho, @sha256, @categoria, @classificado_por,
      @situacao, @motivo, @guarda_uid, @guarda_chave, @guarda_chave_embrulhada, @guarda_armazenamento, @duplicado_de, @t, @t)`).run({
      nome_arquivo: null, mime: null, extensao: null, tamanho: null, sha256: null, categoria: null, classificado_por: null, motivo: null,
      guarda_uid: null, guarda_chave: null, guarda_chave_embrulhada: null, guarda_armazenamento: null, duplicado_de: null, ...dados, t
    }).lastInsertRowid);
    return linha(id);
  }

  /**
   * Chamado quando o arquivo de uma foto/documento já foi baixado do WhatsApp (pelo mecanismo do próprio conector).
   * Idempotente por mensagem. Devolve a linha de wa_anexos (ou null quando não se aplica).
   */
  async function receber({ mensagemId, tipoMidia, nome, arquivo, textoLido = null, leituraFalhou = false }) {
    if (!MIDIAS.has(tipoMidia) || !temTabela()) return null;
    const ja = db.prepare('SELECT * FROM wa_anexos WHERE mensagem_id = ?').get(Number(mensagemId));
    if (ja) return ja;
    const conversaId = conversaDaMensagem(mensagemId);
    if (!conversaId) return null;
    const base = { mensagem_id: Number(mensagemId), conversa_id: conversaId, tipo_midia: tipoMidia };
    if (!pareceDocumento({ tipoMidia, textoLido, leituraFalhou })) return null; // foto comum: não vira documento
    if (!Buffer.isBuffer(arquivo) || !arquivo.length) {
      const r = registrar({ ...base, situacao: 'falhou', motivo: 'O arquivo não pôde ser baixado do WhatsApp.' });
      evento(conversaId, 'Arquivo não pôde ser baixado: confira no celular e anexe pela ficha.');
      audit(reqSistema(), 'wa_anexo_falhou', 'wa_anexos', r.id, 'download');
      return r;
    }
    // Nome só para exibir: extensão sempre a do CONTEÚDO (o nome que vem do WhatsApp não é confiável).
    const tipo = detectarTipo(arquivo);
    const ext = tipo ? TIPOS[tipo].exts[0] : 'bin';
    const nomeBase = nomeSeguro(String(nome || `whatsapp-${mensagemId}`).replace(/\.[A-Za-z0-9]{1,6}$/, ''));
    const nomeArquivo = `${nomeBase}.${ext}`;
    const v = validarArquivo(arquivo, nomeArquivo);
    const hash = sha256(arquivo);
    const dadosArquivo = { nome_arquivo: nomeArquivo, mime: v.ok ? v.mime : null, extensao: v.ok ? v.ext : null, tamanho: arquivo.length, sha256: hash };
    // Arquivo de outro formato (planilha, Word...) que a leitura não reconheceu como documento do cadastro: não é anexo.
    if (!v.ok && !tipo && !categoriaDaLeitura(textoLido)) return null;
    if (!v.ok) {
      const r = registrar({ ...base, ...dadosArquivo, situacao: 'recusado', motivo: v.erro });
      evento(conversaId, `Arquivo recusado (${v.erro})`);
      audit(reqSistema(), 'wa_anexo_recusado', 'wa_anexos', r.id, v.erro);
      return r;
    }
    const categoria = leituraFalhou ? null : categoriaDaLeitura(textoLido);
    // Mesmo arquivo já recebido nesta conversa: não guarda de novo.
    const igual = db.prepare(`SELECT id FROM wa_anexos WHERE conversa_id = ? AND sha256 = ? AND situacao IN ('anexado', 'aguardando_ficha', 'pendente_classificacao', 'nao_documento') ORDER BY id LIMIT 1`).get(conversaId, hash);
    if (igual) {
      const r = registrar({ ...base, ...dadosArquivo, categoria, situacao: 'duplicado', duplicado_de: igual.id, motivo: 'Mesmo arquivo já recebido nesta conversa.' });
      evento(conversaId, 'Arquivo repetido (já estava guardado).');
      return r;
    }
    let guarda;
    try { guarda = await docs.guardarRecebido(arquivo); } catch (err) {
      const r = registrar({ ...base, ...dadosArquivo, categoria, situacao: 'falhou', motivo: `Não foi possível guardar o arquivo: ${String(err.message || err).slice(0, 160)}` });
      evento(conversaId, 'Arquivo NÃO foi guardado (armazenamento indisponível): confira no celular.');
      audit(reqSistema(), 'wa_anexo_falhou', 'wa_anexos', r.id, 'armazenamento');
      log.error(`[documentos] arquivo da mensagem ${mensagemId} não guardado: ${err.message}`);
      return r;
    }
    let r;
    try {
      r = registrar({
        ...base, ...dadosArquivo, categoria, classificado_por: categoria ? 'leitura' : null,
        situacao: categoria ? 'aguardando_ficha' : 'pendente_classificacao',
        motivo: categoria ? null : 'A leitura não identificou com segurança qual documento é: a equipe precisa classificar.',
        guarda_uid: guarda.uid, guarda_chave: guarda.chave, guarda_chave_embrulhada: guarda.chaveEmbrulhada, guarda_armazenamento: guarda.armazenamento
      });
    } catch (err) {
      await docs.descartarGuardado(guarda.chave).catch(() => {});
      throw err;
    }
    audit(reqSistema(), 'wa_anexo_recebido', 'wa_anexos', r.id, `${rotulo(categoria)} (${v.ext}, ${arquivo.length} bytes)`);
    evento(conversaId, categoria ? `Arquivo guardado: ${rotulo(categoria)}` : 'Arquivo guardado: precisa de classificação pela equipe');
    await processar(conversaId);
    return linha(r.id);
  }

  /** Passa para a ficha o que estava esperando (quando a conversa já tem ficha de motorista). */
  async function processar(conversaId) {
    if (!ativo()) return [];
    const registroId = fichaDaConversa(conversaId);
    if (!registroId) return [];
    const feitos = [];
    for (const a of db.prepare("SELECT * FROM wa_anexos WHERE conversa_id = ? AND situacao = 'aguardando_ficha' ORDER BY id").all(Number(conversaId))) {
      try { feitos.push(await anexarNaFicha(a, registroId, a.categoria, null)); } catch (err) {
        log.error(`[documentos] arquivo ${a.id} da conversa ${conversaId} não foi para a ficha: ${err.message}`);
        db.prepare('UPDATE wa_anexos SET motivo = ?, atualizado_em = ? WHERE id = ?').run(`Ainda não foi para a ficha: ${String(err.message).slice(0, 160)}`, agora(), a.id);
      }
    }
    return feitos;
  }

  /** Copia o arquivo da espera para o arquivo digital da ficha; só então marca "anexado" e descarta a cópia da espera. */
  async function anexarNaFicha(a, registroId, categoria, req, titulo) {
    const conteudo = await docs.lerRecebido({ uid: a.guarda_uid, chave: a.guarda_chave, chaveEmbrulhada: a.guarda_chave_embrulhada });
    if (sha256(conteudo) !== a.sha256) throw new Error('arquivo da espera não confere (integridade)');
    // Mesmo arquivo que já é a versão atual desse documento na ficha: não cria versão repetida.
    if (categoria !== 'outros' && docs.hashAtual('motorista', registroId, categoria) === a.sha256) {
      const d = db.prepare("SELECT id FROM documentos WHERE funcao = 'motorista' AND registro_id = ? AND categoria = ? AND excluido_em IS NULL").get(registroId, categoria);
      db.prepare(`UPDATE wa_anexos SET situacao = 'duplicado', categoria = ?, funcao = 'motorista', registro_id = ?, documento_id = ?, motivo = 'Igual à versão atual da ficha.', atualizado_em = ? WHERE id = ?`)
        .run(categoria, registroId, d ? d.id : null, agora(), a.id);
      await docs.descartarGuardado(a.guarda_chave).catch(() => {});
      return linha(a.id);
    }
    const dados = { funcao: 'motorista', registro_id: registroId, categoria, nome: a.nome_arquivo, conteudo, observacoes: 'Recebido pelo WhatsApp', titulo };
    const r = req ? await docs.anexar(req, dados) : await docs.anexarRecebido(dados);
    db.prepare(`UPDATE wa_anexos SET situacao = 'anexado', categoria = ?, funcao = 'motorista', registro_id = ?, documento_id = ?, versao_numero = ?, motivo = NULL,
      classificado_por = COALESCE(?, classificado_por), resolvido_por = ?, resolvido_por_nome = ?, resolvido_em = ?, atualizado_em = ? WHERE id = ?`)
      .run(categoria, registroId, r.documento.id, r.versao, req ? 'equipe' : null, req && req.user ? req.user.id : null, req && req.user ? req.user.nome : null, req ? agora() : null, agora(), a.id);
    // A cópia da espera só sai depois que o arquivo está no arquivo digital (gravado, cifrado e com o mesmo SHA-256).
    await docs.descartarGuardado(a.guarda_chave).catch((err) => log.error(`[documentos] cópia de espera do arquivo ${a.id} ficou guardada: ${err.message}`));
    db.prepare('UPDATE wa_anexos SET guarda_chave = NULL, guarda_uid = NULL, guarda_chave_embrulhada = NULL WHERE id = ?').run(a.id);
    if (candidaturas) candidaturas.atualizarPelosDocumentos('motorista', registroId, req || reqSistema());
    evento(a.conversa_id, `${rotulo(categoria)} anexado à ficha do motorista (v${r.versao})`);
    return linha(a.id);
  }

  /* ---------------------------------- ações da equipe ---------------------------------- */
  function erro(status, codigo, mensagem) { const e = new Error(mensagem); e.status = status; e.codigo = codigo; return e; }
  /** Equipe escolhe a categoria (e, se a conversa não tem ficha ligada, a ficha). Permissão de anexar é conferida em docs.anexar. */
  async function classificar(req, id, { categoria, registro_id: registroId, titulo } = {}) {
    if (!ativo()) throw erro(503, 'armazenamento_indisponivel', 'Armazenamento de documentos indisponível.');
    const a = linha(id);
    if (!a) throw erro(404, 'not_found', 'Arquivo não encontrado.');
    if (!['pendente_classificacao', 'aguardando_ficha'].includes(a.situacao) || !a.guarda_chave) throw erro(409, 'ja_resolvido', 'Este arquivo já foi resolvido.');
    const validas = [...DOCUMENTOS_MOTORISTA.map((d) => d.categoria), 'outros'];
    if (!validas.includes(categoria)) throw erro(422, 'invalido', 'Escolha qual documento é.');
    const rid = registroId ? Number(registroId) : fichaDaConversa(a.conversa_id);
    if (!rid) throw erro(422, 'sem_ficha', 'Esta conversa ainda não tem ficha de motorista: escolha a ficha.');
    if (!db.prepare('SELECT 1 FROM motoristas WHERE id = ?').get(rid)) throw erro(404, 'not_found', 'Ficha de motorista não encontrada.');
    const r = await anexarNaFicha(a, rid, categoria, req, titulo);
    audit(req, 'wa_anexo_classificar', 'wa_anexos', a.id, `${rotulo(categoria)} → ficha motorista #${rid}`);
    return r;
  }
  /** Equipe confirma que viu um aviso (recusado/falhou) ou que o arquivo não é documento. Nada é apagado. */
  function resolver(req, id, { acao } = {}) {
    const a = linha(id);
    if (!a) throw erro(404, 'not_found', 'Arquivo não encontrado.');
    const u = req.user || {};
    if (acao === 'nao_documento') {
      if (a.situacao !== 'pendente_classificacao') throw erro(409, 'ja_resolvido', 'Só um arquivo pendente de classificação pode ser marcado como "não é documento".');
      db.prepare("UPDATE wa_anexos SET situacao = 'nao_documento', resolvido_por = ?, resolvido_por_nome = ?, resolvido_em = ?, atualizado_em = ? WHERE id = ?").run(u.id || null, u.nome || null, agora(), agora(), a.id);
    } else if (acao === 'ciente') {
      if (!['recusado', 'falhou'].includes(a.situacao) || a.resolvido_em) throw erro(409, 'ja_resolvido', 'Nada a confirmar neste arquivo.');
      db.prepare('UPDATE wa_anexos SET resolvido_por = ?, resolvido_por_nome = ?, resolvido_em = ?, atualizado_em = ? WHERE id = ?').run(u.id || null, u.nome || null, agora(), agora(), a.id);
    } else throw erro(422, 'invalido', 'Ação inválida.');
    audit(req, 'wa_anexo_resolver', 'wa_anexos', a.id, acao);
    return linha(a.id);
  }
  /** Arquivo da espera para quem vai classificar (só administrador: a rota confere; o acesso é auditado). */
  async function arquivoDaEspera(req, id) {
    const a = linha(id);
    if (!a || !a.guarda_chave) throw erro(404, 'not_found', 'Arquivo não encontrado na área de espera.');
    const conteudo = await docs.lerRecebido({ uid: a.guarda_uid, chave: a.guarda_chave, chaveEmbrulhada: a.guarda_chave_embrulhada });
    if (sha256(conteudo) !== a.sha256) throw erro(500, 'integridade', 'O arquivo não confere (integridade).');
    audit(req, 'wa_anexo_ver', 'wa_anexos', a.id, a.extensao || '');
    return { conteudo, mime: a.mime, nome: a.nome_arquivo };
  }

  /* ---------------------------------- consultas ---------------------------------- */
  const publico = (a) => a && ({
    id: a.id, mensagem_id: a.mensagem_id, conversa_id: a.conversa_id, tipo_midia: a.tipo_midia, nome_arquivo: a.nome_arquivo, extensao: a.extensao,
    tamanho: a.tamanho, categoria: a.categoria, categoria_rotulo: a.categoria ? rotulo(a.categoria) : null, situacao: a.situacao, motivo: a.motivo,
    registro_id: a.registro_id, documento_id: a.documento_id, versao_numero: a.versao_numero, criado_em: a.criado_em, resolvido_em: a.resolvido_em,
    resolvido_por_nome: a.resolvido_por_nome, na_espera: !!a.guarda_chave
  });
  function listar({ pendentes = true } = {}) {
    if (!temTabela()) return [];
    const rows = pendentes
      ? db.prepare(`SELECT a.*, COALESCE(k.nome, k.telefone) AS contato FROM wa_anexos a LEFT JOIN wa_conversas c ON c.id = a.conversa_id LEFT JOIN wa_contatos k ON k.id = c.contato_id
          WHERE a.situacao IN ('pendente_classificacao', 'aguardando_ficha') OR (a.situacao IN ('recusado', 'falhou') AND a.resolvido_em IS NULL) ORDER BY a.id DESC LIMIT 200`).all()
      : db.prepare(`SELECT a.*, COALESCE(k.nome, k.telefone) AS contato FROM wa_anexos a LEFT JOIN wa_conversas c ON c.id = a.conversa_id LEFT JOIN wa_contatos k ON k.id = c.contato_id ORDER BY a.id DESC LIMIT 200`).all();
    return rows.map((r) => ({ ...publico(r), contato: r.contato || null, ficha_da_conversa: fichaDaConversa(r.conversa_id) }));
  }
  function contarPendentes() {
    if (!temTabela()) return 0;
    return db.prepare("SELECT COUNT(*) n FROM wa_anexos WHERE situacao = 'pendente_classificacao' OR (situacao IN ('recusado', 'falhou') AND resolvido_em IS NULL)").get().n;
  }
  const daMensagem = (mensagemId) => (temTabela() ? publico(db.prepare('SELECT * FROM wa_anexos WHERE mensagem_id = ?').get(Number(mensagemId))) : null);
  /** Categorias com arquivo GUARDADO nesta conversa (na ficha ou esperando a ficha). Texto sozinho nunca entra aqui. */
  function categoriasGuardadas(conversaId) {
    if (!temTabela()) return new Set();
    return new Set(db.prepare("SELECT DISTINCT categoria FROM wa_anexos WHERE conversa_id = ? AND categoria IS NOT NULL AND (situacao IN ('anexado', 'aguardando_ficha') OR (situacao = 'duplicado' AND documento_id IS NOT NULL))").all(Number(conversaId)).map((r) => r.categoria));
  }

  return { ativo, receber, processar, classificar, resolver, arquivoDaEspera, listar, contarPendentes, daMensagem, categoriasGuardadas, publico };
}

module.exports = { createRecebidos, categoriaDaLeitura, pareceDocumento, CATEGORIA_DO_TIPO };

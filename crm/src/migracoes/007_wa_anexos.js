'use strict';
// Etapa 2 — arquivos (fotos e PDFs) que chegam pelo WhatsApp (13/11/2026, pedido do dono).
// Só CRIA uma tabela nova; não toca em nenhuma existente. Cada arquivo recebido vira UMA linha (uma por mensagem):
//  - anexado: o arquivo foi guardado no arquivo digital (documentos/documento_versoes, cifrado) da ficha certa;
//  - aguardando_ficha: guardado CIFRADO numa área de espera até a conversa ter uma ficha de motorista ligada;
//  - pendente_classificacao: guardado CIFRADO, mas a leitura não disse com segurança qual documento é (a equipe escolhe);
//  - duplicado: mesmo arquivo (mesmo SHA-256) já recebido nesta conversa (não guarda de novo);
//  - recusado: formato/tamanho não aceito ou PDF com conteúdo ativo (nada guardado; a equipe é avisada);
//  - falhou: download, armazenamento ou cifra falhou (a equipe é avisada; a mensagem original continua na conversa);
//  - nao_documento: a equipe olhou e disse que não é documento (o arquivo cifrado continua guardado; nada é apagado).
// Nada é apagado por aqui: a linha guarda o histórico; o arquivo da área de espera só é descartado DEPOIS de copiado e
// conferido no arquivo digital. Sem chave de cifra (FM_DOCS_KEY) nada é guardado em claro: vira "falhou".

module.exports = {
  versao: 7,
  nome: 'wa_anexos',
  up(db) {
    db.exec(`
      CREATE TABLE wa_anexos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mensagem_id INTEGER NOT NULL UNIQUE,
        conversa_id INTEGER NOT NULL,
        tipo_midia TEXT NOT NULL,
        nome_arquivo TEXT,
        mime TEXT,
        extensao TEXT,
        tamanho INTEGER,
        sha256 TEXT,
        categoria TEXT,
        classificado_por TEXT CHECK (classificado_por IS NULL OR classificado_por IN ('leitura', 'equipe')),
        situacao TEXT NOT NULL CHECK (situacao IN ('aguardando_ficha', 'pendente_classificacao', 'anexado', 'duplicado', 'recusado', 'falhou', 'nao_documento')),
        motivo TEXT,
        guarda_uid TEXT,
        guarda_chave TEXT,
        guarda_chave_embrulhada BLOB,
        guarda_armazenamento TEXT,
        funcao TEXT CHECK (funcao IS NULL OR funcao IN ('motorista')),
        registro_id INTEGER,
        documento_id INTEGER REFERENCES documentos(id),
        versao_numero INTEGER,
        duplicado_de INTEGER REFERENCES wa_anexos(id),
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        resolvido_por INTEGER,
        resolvido_por_nome TEXT,
        resolvido_em TEXT,
        CHECK (situacao <> 'anexado' OR (documento_id IS NOT NULL AND registro_id IS NOT NULL)),
        CHECK (situacao NOT IN ('aguardando_ficha', 'pendente_classificacao') OR guarda_chave IS NOT NULL)
      );
      CREATE INDEX wa_anexos_situacao ON wa_anexos (situacao);
      CREATE INDEX wa_anexos_conversa ON wa_anexos (conversa_id);
      CREATE INDEX wa_anexos_hash ON wa_anexos (conversa_id, sha256);
      CREATE TRIGGER wa_anexos_sem_apagar BEFORE DELETE ON wa_anexos BEGIN
        SELECT RAISE(ABORT, 'wa_anexos é histórico: não se apaga');
      END;
    `);
  },
  verificar(db) {
    const problemas = [];
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'wa_anexos'").get()) problemas.push('tabela wa_anexos não foi criada');
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = 'wa_anexos_sem_apagar'").get()) problemas.push('gatilho wa_anexos_sem_apagar não foi criado');
    return problemas;
  }
};

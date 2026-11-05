'use strict';
// Canal de mentira: não fala com o WhatsApp. Serve para testes automatizados e para demonstrar a tela de Conversas
// (ligue com a variável de ambiente WA_CANAL=fake). Implementa a mesma interface do canal real.
function criarCanalFalso(opts = {}) {
  let handlers = null;
  let estado = opts.conectado ? 'conectado' : 'desconectado';
  let seq = 0;
  const enviados = [];
  const canal = {
    nome: 'falso',
    disponivel: true,
    enviados,
    falharProximos: 0,
    async start(h) { handlers = h; },
    async stop() { estado = 'desconectado'; },
    getState() { return { state: estado, phone: estado === 'conectado' ? '5585900000000' : null, detail: '' }; },
    async requestPairing(phone) {
      if (opts.falhaPareamento) throw new Error('Falha simulada no pareamento');
      estado = 'aguardando_pareamento';
      return { code: 'ABCD-1234', phone };
    },
    async logout() { estado = 'desconectado'; },
    async sendText(jid, texto) {
      if (estado !== 'conectado') throw new Error('WhatsApp desconectado');
      if (canal.falharProximos > 0) { canal.falharProximos -= 1; throw new Error('Falha simulada no envio'); }
      seq += 1;
      const externalId = `FAKE${seq}`;
      enviados.push({ jid, texto, externalId });
      return { externalId };
    },
    // ---- auxiliares de teste ----
    conectar() { estado = 'conectado'; if (handlers && handlers.onConnection) handlers.onConnection(canal.getState()); },
    desconectar() { estado = 'desconectado'; },
    receber(evt) { return handlers.onMessage(evt); },
    status(externoId, status) { return handlers.onStatus({ externoId, status }); }
  };
  return canal;
}

module.exports = { criarCanalFalso };

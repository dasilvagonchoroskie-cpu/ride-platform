import { EventEmitter } from 'events';

/**
 * Chamado na hora (Evandro, 09/10/2026: "ta demorando para notificar o
 * motorista da corrida").
 *
 * O vigia do celular do motorista pergunta por chamados e, se nao ha
 * nenhum, o servidor SEGURA a pergunta por ate 25 s. Quando uma corrida e
 * oferecida a ele, a resposta sai na mesma hora (antes ele so descobria na
 * proxima volta do relogio). Um servidor so (Render), entao basta um aviso
 * em memoria.
 */
const canal = new EventEmitter();
canal.setMaxListeners(0);

/** Avisa quem esta esperando que o motorista recebeu chamado. */
export function avisarOfertaNova(driverId: string): void {
  canal.emit(driverId);
}

/** Espera um chamado novo para o motorista, no maximo [ms]. */
export function esperarOferta(driverId: string, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const fim = () => {
      clearTimeout(relogio);
      canal.off(driverId, fim);
      resolve();
    };
    const relogio = setTimeout(fim, ms);
    canal.on(driverId, fim);
  });
}

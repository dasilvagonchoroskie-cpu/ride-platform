/**
 * Ritmo dos pedidos a TomTom (29/10/2026). A chave da TomTom aceita poucos
 * pedidos por segundo PARA A PLATAFORMA INTEIRA (tabela de QPS da TomTom:
 * busca 5/s, rota 5/s, mapa 10/s). Passando disso, a TomTom responde 429 —
 * nao e a cota acabando, e so "devagar". Aqui os pedidos entram em fila e
 * saem no maximo [porSegundo] por segundo; quem esperaria demais desiste
 * (e o app usa a reserva) em vez de travar a tela.
 */
export class Ritmo {
  private readonly saidas: number[] = [];
  private fila: Promise<void> = Promise.resolve();

  constructor(
    private readonly porSegundo: number,
    private readonly esperaMaxima = 4000,
    private readonly agora: () => number = () => Date.now(),
    private readonly dormir: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Espera a vez. false = a fila esta longa demais (desistir). */
  vez(): Promise<boolean> {
    const inicio = this.agora();
    const pedido = this.fila.then(async () => {
      for (;;) {
        const t = this.agora();
        while (this.saidas.length > 0 && t - this.saidas[0] >= 1000) this.saidas.shift();
        if (this.saidas.length < this.porSegundo) {
          this.saidas.push(t);
          return true;
        }
        const espera = 1000 - (t - this.saidas[0]) + 5;
        if (t + espera - inicio > this.esperaMaxima) return false;
        await this.dormir(espera);
      }
    });
    this.fila = pedido.then(
      () => undefined,
      () => undefined,
    );
    return pedido;
  }
}

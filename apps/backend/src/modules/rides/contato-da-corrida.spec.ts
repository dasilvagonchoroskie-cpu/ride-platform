import { contatoEncerrado } from './rides.service';

describe('Contato entre as pontas da corrida', () => {
  const agora = Date.parse('2026-11-26T12:00:00Z');
  const ha = (horas: number) => new Date(agora - horas * 3600_000);

  it.each(['SCHEDULED', 'SEARCHING', 'DRIVER_ARRIVING', 'IN_PROGRESS'])('corrida em aberto (%s): segue', (status) => {
    expect(contatoEncerrado({ status, updatedAt: ha(100) }, agora)).toBe(false);
  });

  it('ate um dia depois do fim: segue (objeto esquecido no carro)', () => {
    expect(contatoEncerrado({ status: 'COMPLETED', finishedAt: ha(23) }, agora)).toBe(false);
  });

  it('mais de um dia depois: encerra, tambem em corrida cancelada ou sem horario de fim', () => {
    expect(contatoEncerrado({ status: 'COMPLETED', finishedAt: ha(25), updatedAt: ha(1) }, agora)).toBe(true);
    expect(contatoEncerrado({ status: 'CANCELLED_BY_DRIVER', cancelledAt: ha(25) }, agora)).toBe(true);
    expect(contatoEncerrado({ status: 'EXPIRED', updatedAt: ha(25) }, agora)).toBe(true);
  });
});

import { CHAVE_VEICULOS, dadosMudaram, lerMapaDeCarros } from './vehicles.situacao';
import { VehiclesService } from './vehicles.service';

/**
 * Motorista ja aprovado que muda marca, modelo, ano ou cor: o carro volta para
 * a Central conferir. Banco falso na memoria.
 */
function montar(opcoes: { status?: string; approvedAt?: Date | null; fichas?: Record<string, unknown> } = {}) {
  const motorista = { id: 'd1', userId: 'u1', status: opcoes.status ?? 'APPROVED', approvedAt: opcoes.approvedAt === undefined ? new Date() : opcoes.approvedAt, isOnline: true };
  const carros: any[] = [
    { id: 'c1', driverId: 'd1', plate: 'ABC1D23', brand: 'Fiat', model: 'Argo', year: 2021, color: 'Branco', category: 'CARRO', isActive: true, createdAt: new Date(2) },
    { id: 'c2', driverId: 'd1', plate: 'XYZ9Z99', brand: 'VW', model: 'Gol', year: 2018, color: 'Prata', category: 'CARRO', isActive: false, createdAt: new Date(1) },
  ];
  const settings: Record<string, any> = { [CHAVE_VEICULOS]: { value: opcoes.fichas ?? {} } };
  const corridas: Array<{ driverId: string; vehicleId: string }> = [];
  const auditoria: any[] = [];
  const casa = (v: any, w: any) =>
    (!w.id || v.id === w.id) && (!w.driverId || v.driverId === w.driverId) && (w.isActive === undefined || v.isActive === w.isActive) && (!w.NOT || v.id !== w.NOT.id);
  const prisma: any = {
    driver: {
      findUnique: async ({ where }: any) => (where.userId === 'u1' || where.id === 'd1' ? { ...motorista } : null),
      findUniqueOrThrow: async () => ({ ...motorista }),
      update: async ({ data }: any) => Object.assign(motorista, data),
    },
    vehicle: {
      findFirst: async ({ where }: any) => {
        const v = carros.find((c) => casa(c, where) && (!where.driver || where.driver.userId === 'u1'));
        return v ? { ...v } : null;
      },
      findUnique: async ({ where }: any) => carros.find((v) => (where.id ? v.id === where.id : v.plate === where.plate)) ?? null,
      findUniqueOrThrow: async ({ where }: any) => carros.find((v) => v.id === where.id),
      findMany: async ({ where }: any = {}) => carros.filter((v) => casa(v, where ?? {})).map((v) => ({ ...v })),
      count: async ({ where }: any) => carros.filter((v) => casa(v, where)).length,
      create: async ({ data }: any) => {
        const novo = { id: `c${carros.length + 1}`, category: 'CARRO', createdAt: new Date(), ...data };
        carros.push(novo);
        return { ...novo };
      },
      update: async ({ where, data }: any) => ({ ...Object.assign(carros.find((v) => v.id === where.id), data) }),
      updateMany: async ({ where, data }: any) => void carros.filter((v) => casa(v, where)).forEach((v) => Object.assign(v, data)),
    },
    ride: {
      count: async ({ where }: any) =>
        corridas.filter((r) => (where.OR ? where.OR.some((o: any) => (o.vehicleId ? r.vehicleId === o.vehicleId : r.driverId === o.driverId)) : r.driverId === where.driverId || r.vehicleId === where.vehicleId)).length,
    },
    setting: {
      findUnique: async ({ where }: any) => (settings[where.key] ? { key: where.key, value: JSON.parse(JSON.stringify(settings[where.key].value)) } : null),
      upsert: async ({ where, update }: any) => void (settings[where.key] = { value: update.value }),
    },
    auditLog: { create: async ({ data }: any) => void auditoria.push(data) },
    jornada: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
    $queryRaw: async () => [],
    $executeRaw: jest.fn(async () => 0),
    $transaction: async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)),
  };
  const caixa = { avisarMotorista: jest.fn(async () => undefined) };
  const s = new VehiclesService(prisma, caixa as never);
  const ficha = (id: string) => lerMapaDeCarros(settings[CHAVE_VEICULOS].value)[id];
  return { s, motorista, carros, corridas, auditoria, ficha, caixa };
}

jest.mock('../painel-motorista/jornada', () => ({ fecharJornada: jest.fn(async () => undefined), abrirJornada: jest.fn() }));

describe('Dados do carro mudados pelo motorista', () => {
  it('compara sem contar maiuscula e espaco sobrando', () => {
    const a = { brand: 'Fiat', model: 'Argo', year: 2021, color: 'Branco' };
    expect(dadosMudaram(a, { ...a, color: '  BRANCO ' })).toBe(false);
    expect(dadosMudaram(a, { ...a, color: 'Preto' })).toBe(true);
    expect(dadosMudaram(a, { ...a, year: 2022 })).toBe(true);
    expect(dadosMudaram(a, { ...a, model: 'Mobi' })).toBe(true);
    expect(dadosMudaram(a, { ...a, brand: 'VW' })).toBe(true);
  });

  it('carro em uso: volta para a conferencia, nenhum outro entra no lugar e o motorista fica indisponivel', async () => {
    const { s, motorista, carros, auditoria, ficha } = montar();
    const r = await s.update('u1', 'c1', { color: 'Preto' });
    expect(r.situacao).toBe('PENDENTE');
    expect(r.alteracao?.antes).toEqual({ brand: 'Fiat', model: 'Argo', year: 2021, color: 'Branco' });
    expect(carros.every((c) => !c.isActive)).toBe(true);
    expect(motorista.isOnline).toBe(false);
    expect(ficha('c1')).toMatchObject({ situacao: 'PENDENTE', alteracao: { eraEmUso: true } });
    expect(auditoria).toEqual([expect.objectContaining({ action: 'VEHICLE_DATA_CHANGED', actorId: 'u1', before: expect.objectContaining({ color: 'Branco' }), after: expect.objectContaining({ color: 'Preto' }) })]);
    await expect(s.usar('u1', 'c1')).rejects.toThrow('espera a Central');
  });

  it('carro guardado: volta para a conferencia sem tirar o motorista do ar', async () => {
    const { s, motorista, carros, ficha } = montar();
    await s.update('u1', 'c2', { year: 2019 });
    expect(ficha('c2')).toMatchObject({ situacao: 'PENDENTE', alteracao: { eraEmUso: false } });
    expect(carros.find((c) => c.id === 'c1')!.isActive).toBe(true);
    expect(motorista.isOnline).toBe(true);
  });

  it('so maiuscula diferente: salva sem pedir nova conferencia', async () => {
    const { s, motorista, ficha, auditoria } = montar();
    const r = await s.update('u1', 'c1', { brand: 'FIAT', model: 'Argo', year: 2021, color: 'branco' });
    expect(r.situacao).toBe('EM_USO');
    expect(ficha('c1')).toBeUndefined();
    expect(motorista.isOnline).toBe(true);
    expect(auditoria).toHaveLength(0);
  });

  it('primeiro cadastro (nunca aprovado): corrige sem fila a parte', async () => {
    const { s, ficha } = montar({ status: 'PENDING', approvedAt: null });
    await s.update('u1', 'c1', { color: 'Preto' });
    expect(ficha('c1')).toBeUndefined();
  });

  it('aprovado que depois foi suspenso tambem passa pela conferencia (mudanca e carro novo)', async () => {
    const { s, ficha } = montar({ status: 'SUSPENDED' });
    await s.update('u1', 'c1', { color: 'Preto' });
    expect(ficha('c1')?.situacao).toBe('PENDENTE');
    const novo = await s.create('u1', { plate: 'NOV0A00', brand: 'Kia', model: 'Rio', year: 2020, color: 'Azul', isActive: true });
    expect(novo.situacao).toBe('PENDENTE');
  });

  it('nao muda os dados do carro em uso durante uma corrida', async () => {
    const { s, corridas, carros, ficha } = montar();
    corridas.push({ driverId: 'd1', vehicleId: 'c1' });
    await expect(s.update('u1', 'c1', { color: 'Preto' })).rejects.toThrow('Termine a corrida');
    expect(carros[0]).toMatchObject({ color: 'Branco', isActive: true });
    expect(ficha('c1')).toBeUndefined();
    // O carro guardado (fora da corrida) pode ser corrigido.
    await s.update('u1', 'c2', { color: 'Preto' });
    expect(ficha('c2')?.situacao).toBe('PENDENTE');
  });

  it('veiculo suspenso: o motorista nao muda os dados', async () => {
    const { s, carros } = montar({ fichas: { c1: { situacao: 'SUSPENSO', motivo: 'x' } } });
    await expect(s.update('u1', 'c1', { color: 'Preto' })).rejects.toThrow('suspendeu');
    expect(carros[0].color).toBe('Branco');
  });

  it('segunda mudanca antes da conferencia guarda os dados que a Central tinha liberado', async () => {
    const { s, ficha } = montar();
    await s.update('u1', 'c1', { color: 'Preto' });
    await s.update('u1', 'c1', { color: 'Vermelho' });
    expect(ficha('c1')?.alteracao).toMatchObject({ antes: { color: 'Branco' }, eraEmUso: true });
    // Voltar ao que era nao libera sozinho.
    await s.update('u1', 'c1', { color: 'Branco' });
    expect(ficha('c1')?.situacao).toBe('PENDENTE');
  });

  it('carro novo ainda em conferencia, corrigido, continua sendo carro novo', async () => {
    const { s, ficha } = montar({ fichas: { c2: { situacao: 'PENDENTE' } } });
    await s.update('u1', 'c2', { color: 'Preto' });
    expect(ficha('c2')?.alteracao).toBeUndefined();
    expect(ficha('c2')?.situacao).toBe('PENDENTE');
  });

  it('aprovado: volta a ser o carro em uso e a validade do CRLV continua', async () => {
    const { s, carros, ficha, auditoria } = montar({ fichas: { c1: { crlvValidade: '2027-05-01' } } });
    await s.update('u1', 'c1', { color: 'Preto' });
    await s.adminRevisar('c1', 'adm', true);
    expect(carros.find((c) => c.id === 'c1')!.isActive).toBe(true);
    expect(carros.find((c) => c.id === 'c2')!.isActive).toBe(false);
    expect(ficha('c1')).toMatchObject({ crlvValidade: '2027-05-01' });
    expect(ficha('c1')?.situacao).toBeUndefined();
    expect(ficha('c1')?.alteracao).toBeUndefined();
    expect(auditoria.at(-1)).toMatchObject({ action: 'VEHICLE_APPROVED', before: { color: 'Branco' } });
  });

  it('aprovado depois que o motorista escolheu outro carro: nao troca sozinho', async () => {
    const { s, carros } = montar();
    await s.update('u1', 'c1', { color: 'Preto' });
    await s.usar('u1', 'c2');
    await s.adminRevisar('c1', 'adm', true);
    expect(carros.find((c) => c.id === 'c2')!.isActive).toBe(true);
    expect(carros.find((c) => c.id === 'c1')!.isActive).toBe(false);
  });

  it('recusado: nao pode usar; corrigido volta para a conferencia com os dados antigos guardados', async () => {
    const { s, ficha } = montar();
    await s.update('u1', 'c1', { color: 'Preto' });
    await s.adminRevisar('c1', 'adm', false, 'Foto mostra carro branco.');
    expect(ficha('c1')?.situacao).toBe('RECUSADO');
    await expect(s.usar('u1', 'c1')).rejects.toThrow('recusou');
    await s.update('u1', 'c1', { color: 'Branco' });
    expect(ficha('c1')).toMatchObject({ situacao: 'PENDENTE', alteracao: { antes: { color: 'Branco' } } });
  });

  it('suspender e reativar nao vale como conferir', async () => {
    const { s, ficha, carros } = montar();
    await s.update('u1', 'c1', { color: 'Preto' });
    await s.adminSuspender('c1', 'adm', true, 'Conferencia presencial.');
    await s.adminSuspender('c1', 'adm', false);
    expect(ficha('c1')?.situacao).toBe('PENDENTE');
    expect(carros.find((c) => c.id === 'c1')!.isActive).toBe(false);
  });

  it('carro novo suspenso e reativado volta para a conferencia', async () => {
    const { s, ficha } = montar({ fichas: { c2: { situacao: 'PENDENTE' } } });
    await s.adminSuspender('c2', 'adm', true, 'x');
    await s.adminSuspender('c2', 'adm', false);
    expect(ficha('c2')?.situacao).toBe('PENDENTE');
    expect(ficha('c2')?.voltarParaConferencia).toBeUndefined();
  });
});

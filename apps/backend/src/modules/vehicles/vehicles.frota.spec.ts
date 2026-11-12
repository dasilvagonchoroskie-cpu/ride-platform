import { UserRole } from '@ride/shared';
import { ROLES_KEY } from '../../common/constants/metadata.constants';
import { CHAVE_VEICULOS, lerMapaDeCarros } from './vehicles.situacao';
import { AdminVehiclesController } from './admin-vehicles.controller';
import { VehiclesService } from './vehicles.service';

/**
 * Motos e Carros na Central: a frota (um veiculo por linha, da cidade do operador) e a
 * suspensao/reativacao do VEICULO. Banco falso na memoria; nada toca permissao de cidade.
 */
function montar(mapaInicial: Record<string, unknown> = {}) {
  const veiculos: any[] = [
    { id: 'vMoto', driverId: 'd1', plate: 'MOT1A23', brand: 'Honda', model: 'CG 160', year: 2022, color: 'Preta', category: 'MOTO', isActive: true, createdAt: new Date(3) },
    { id: 'vCarro', driverId: 'd2', plate: 'CAR2B34', brand: 'Fiat', model: 'Argo', year: 2021, color: 'Branco', category: 'CARRO', isActive: true, createdAt: new Date(2) },
    { id: 'vMoto2', driverId: 'd1', plate: 'MOT9Z99', brand: 'Yamaha', model: 'Factor', year: 2020, color: 'Azul', category: 'MOTO', isActive: false, createdAt: new Date(1) },
    { id: 'vOutraCidade', driverId: 'd3', plate: 'OUT0C00', brand: 'VW', model: 'Gol', year: 2019, color: 'Prata', category: 'CARRO', isActive: true, createdAt: new Date(0) },
  ];
  const motoristas: Record<string, any> = {
    d1: { id: 'd1', status: 'APPROVED', user: { name: 'João Moto', phone: '+5564911110000' } },
    d2: { id: 'd2', status: 'APPROVED', user: { name: 'Maria Carro', phone: '+5564922220000' } },
    d3: { id: 'd3', status: 'APPROVED', user: { name: 'Pedro Outra', phone: '+5564933330000' } },
  };
  const settings: Record<string, any> = { [CHAVE_VEICULOS]: { value: mapaInicial } };
  const corridasAtivas: Record<string, number> = {};
  const auditoria: any[] = [];
  const avisos: any[] = [];

  const filtrar = (where: any) =>
    veiculos.filter((v) => {
      if (where?.driverId?.in && !where.driverId.in.includes(v.driverId)) return false;
      if (where?.driverId && typeof where.driverId === 'string' && v.driverId !== where.driverId) return false;
      if (where?.isActive !== undefined && v.isActive !== where.isActive) return false;
      const busca = where?.OR;
      if (busca) {
        const casa = busca.some((c: any) => {
          if (c.plate) return v.plate.includes(c.plate.contains);
          if (c.brand) return v.brand.toLowerCase().includes(c.brand.contains.toLowerCase());
          if (c.model) return v.model.toLowerCase().includes(c.model.contains.toLowerCase());
          if (c.driver) return motoristas[v.driverId].user.name.toLowerCase().includes(c.driver.user.name.contains.toLowerCase());
          return false;
        });
        if (!casa) return false;
      }
      return true;
    });

  const prisma: any = {
    vehicle: {
      findUnique: async ({ where }: any) => veiculos.find((v) => v.id === where.id) ?? null,
      findMany: async ({ where }: any = {}) =>
        filtrar(where)
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((v) => ({ ...v, driver: motoristas[v.driverId] })),
      count: async ({ where }: any) => filtrar(where).length,
      update: jest.fn(async ({ where, data }: any) => Object.assign(veiculos.find((v) => v.id === where.id), data)),
    },
    ride: { count: async ({ where }: any) => corridasAtivas[where.vehicleId] ?? 0 },
    setting: {
      findUnique: async ({ where }: any) => (settings[where.key] ? { key: where.key, value: settings[where.key].value } : null),
      upsert: async ({ where, update }: any) => void (settings[where.key] = { value: update.value }),
    },
    auditLog: { create: jest.fn(async ({ data }: any) => void auditoria.push(data)) },
  };
  const caixa = { avisarMotorista: jest.fn(async (...a: unknown[]) => void avisos.push(a)) };
  const s = new VehiclesService(prisma, caixa as never);
  return { s, prisma, veiculos, settings, corridasAtivas, auditoria, avisos };
}

describe('Frota na Central (Motos e Carros)', () => {
  it('lista com tipo MOTO/CARRO pela categoria, dados do veiculo, motorista e situacao', async () => {
    const { s } = montar();
    const r = await s.adminFrota(null, {});
    expect(r.total).toBe(4);
    const moto = r.itens.find((i) => i.id === 'vMoto')!;
    expect(moto).toMatchObject({ tipo: 'MOTO', plate: 'MOT1A23', brand: 'Honda', model: 'CG 160', year: 2022, situacao: 'EM_USO', emUso: true, driver: { id: 'd1', name: 'João Moto' } });
    expect(r.itens.find((i) => i.id === 'vMoto2')!.situacao).toBe('GUARDADO');
    expect(r.itens.find((i) => i.id === 'vCarro')!.tipo).toBe('CARRO');
  });

  it('filtra por tipo, busca (placa, marca, modelo, motorista) e situacao', async () => {
    const { s } = montar({ vMoto2: { situacao: 'SUSPENSO', motivo: 'Documento vencido' } });
    expect((await s.adminFrota(null, { tipo: 'MOTO' })).itens.map((i) => i.id).sort()).toEqual(['vMoto', 'vMoto2']);
    expect((await s.adminFrota(null, { tipo: 'CARRO' })).itens.map((i) => i.id).sort()).toEqual(['vCarro', 'vOutraCidade']);
    expect((await s.adminFrota(null, { busca: 'cg 160' })).itens.map((i) => i.id)).toEqual(['vMoto']);
    expect((await s.adminFrota(null, { busca: 'mot-9z99' })).itens.map((i) => i.id)).toEqual(['vMoto2']);
    expect((await s.adminFrota(null, { busca: 'maria' })).itens.map((i) => i.id)).toEqual(['vCarro']);
    const sus = await s.adminFrota(null, { situacao: 'SUSPENSO' });
    expect(sus.itens.map((i) => i.id)).toEqual(['vMoto2']);
    expect(sus.itens[0].motivo).toBe('Documento vencido');
  });

  it('operador de cidade ve so os motoristas da cidade dele; removidos nao aparecem', async () => {
    const { s } = montar({ vCarro: { situacao: 'REMOVIDO' } });
    const r = await s.adminFrota(['d1', 'd2'], {});
    expect(r.itens.map((i) => i.id).sort()).toEqual(['vMoto', 'vMoto2']);
    expect(r.itens.some((i) => i.driver.id === 'd3')).toBe(false);
  });

  it('mostra se ha foto e CRLV enviados (nao inventa validade: o modelo nao tem esse campo)', async () => {
    const { s } = montar({ vMoto: { foto: '/arquivos/f1', crlv: '/arquivos/c1', em: '2026-11-01T10:00:00.000Z' } });
    const moto = (await s.adminFrota(null, {})).itens.find((i) => i.id === 'vMoto')!;
    expect(moto).toMatchObject({ fotoUrl: '/arquivos/f1', crlvUrl: '/arquivos/c1', enviadoEm: '2026-11-01T10:00:00.000Z' });
    expect(Object.keys(moto)).not.toContain('validade');
  });
});

describe('Suspender e reativar veiculo (Central)', () => {
  it('suspende com motivo: sai de uso, outro carro liberado assume, motorista avisado, auditoria com autor', async () => {
    const ctx = montar();
    await ctx.s.adminSuspender('vMoto', 'admin1', true, '  Documento vencido ');
    const mapa = lerMapaDeCarros(ctx.settings[CHAVE_VEICULOS].value);
    expect(mapa.vMoto).toMatchObject({ situacao: 'SUSPENSO', motivo: 'Documento vencido' });
    expect(ctx.veiculos.find((v) => v.id === 'vMoto').isActive).toBe(false);
    // o outro veiculo do motorista (liberado) passa a ser o de uso
    expect(ctx.veiculos.find((v) => v.id === 'vMoto2').isActive).toBe(true);
    expect(ctx.auditoria[0]).toMatchObject({ actorId: 'admin1', action: 'VEHICLE_SUSPENDED', entity: 'Vehicle', entityId: 'vMoto' });
    expect(ctx.avisos[0][0]).toBe('d1');
    expect(String(ctx.avisos[0][2])).toContain('Documento vencido');
    // o motorista ve o motivo na lista dele
    const lista = await ctx.s.carrosDoMotorista('d1');
    expect(lista.find((c) => c.id === 'vMoto')).toMatchObject({ situacao: 'SUSPENSO', motivo: 'Documento vencido' });
  });

  it('exige motivo, nao suspende em corrida ativa e nao suspende duas vezes', async () => {
    const ctx = montar();
    await expect(ctx.s.adminSuspender('vMoto', 'a', true, '  ')).rejects.toThrow('motivo');
    ctx.corridasAtivas.vMoto = 1;
    await expect(ctx.s.adminSuspender('vMoto', 'a', true, 'x')).rejects.toThrow('corrida ativa');
    ctx.corridasAtivas.vMoto = 0;
    await ctx.s.adminSuspender('vMoto', 'a', true, 'x');
    await expect(ctx.s.adminSuspender('vMoto', 'a', true, 'y')).rejects.toThrow('ja esta suspenso');
  });

  it('reativa: volta a ser liberado (mantem fotos/CRLV), avisa e audita; so reativa quem esta suspenso', async () => {
    const ctx = montar({ vMoto: { foto: '/arquivos/f1', crlv: '/arquivos/c1' } });
    await expect(ctx.s.adminSuspender('vMoto', 'a', false)).rejects.toThrow('nao esta suspenso');
    await ctx.s.adminSuspender('vMoto', 'a', true, 'x');
    await ctx.s.adminSuspender('vMoto', 'a', false);
    const mapa = lerMapaDeCarros(ctx.settings[CHAVE_VEICULOS].value);
    expect(mapa.vMoto.situacao).toBeUndefined();
    expect(mapa.vMoto).toMatchObject({ foto: '/arquivos/f1', crlv: '/arquivos/c1' });
    expect(ctx.auditoria.map((a) => a.action)).toEqual(['VEHICLE_SUSPENDED', 'VEHICLE_REACTIVATED']);
  });

  it('veiculo suspenso nao pode ser colocado em uso pelo motorista e nao e aprovado/recusado por engano', async () => {
    const ctx = montar();
    await ctx.s.adminSuspender('vMoto', 'a', true, 'x');
    await expect(ctx.s.adminRevisar('vMoto', 'a', true)).rejects.toThrow('suspenso');
    await expect(ctx.s.adminRevisar('vMoto', 'a', false, 'nao')).rejects.toThrow('suspenso');
    await expect((ctx.s as any).trocarParaEste(ctx.veiculos.find((v) => v.id === 'vMoto'))).rejects.toThrow('suspendeu');
  });

  it('veiculo inexistente: 404; so o ADMIN usa as rotas', async () => {
    await expect(montar().s.adminSuspender('nao-existe', 'a', true, 'x')).rejects.toThrow('nao encontrado');
    expect(Reflect.getMetadata(ROLES_KEY, AdminVehiclesController)).toEqual([UserRole.ADMIN]);
  });
});

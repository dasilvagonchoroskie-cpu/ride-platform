import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@ride/shared';
import { DadosPessoaisCentralController } from './dados-pessoais.controller';

/**
 * Revisao de seguranca (Requisicao 1, 11/11/2026): operador de uma cidade so
 * ve e muda dados pessoais dos motoristas da cidade dele; passageiros e
 * outras cidades so o dono.
 */
describe('Dados pessoais na Central: alcance do operador', () => {
  const pessoas: Record<string, { role: UserRole; driver: { id: string } | null }> = {
    motoristaA: { role: UserRole.DRIVER, driver: { id: 'dA' } },
    motoristaB: { role: UserRole.DRIVER, driver: { id: 'dB' } },
    passageiro: { role: UserRole.PASSENGER, driver: null },
  };
  const pracaDe: Record<string, string> = { dA: 'cidade-a', dB: 'cidade-b' };

  function montar(escopo: string | null) {
    const dados = {
      dadosDaPessoa: jest.fn(async (id: string) => ({ id })),
      aprovar: jest.fn(async () => ({ ok: true })),
      recusar: jest.fn(async () => ({ ok: true })),
      editarPelaCentral: jest.fn(async () => ({ ok: true })),
      pendentes: jest.fn(async () => [
        { userId: 'motoristaA', driverId: 'dA' },
        { userId: 'motoristaB', driverId: 'dB' },
      ]),
    };
    const pracas = {
      escopoDe: jest.fn(async () => escopo),
      pracaDoMotorista: jest.fn(async (d: string) => pracaDe[d] ?? null),
      idsDeMotoristas: jest.fn(async (p: string | null) => (p ? Object.keys(pracaDe).filter((d) => pracaDe[d] === p) : null)),
      exigirDono: jest.fn(async () => undefined),
    };
    const prisma = { user: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => pessoas[where.id] ?? null) } };
    const c = new DadosPessoaisCentralController(dados as never, pracas as never, prisma as never);
    return { c, dados };
  }
  const admin = { id: 'adm', role: UserRole.ADMIN } as never;

  it('operador ve e aprova motorista da cidade dele', async () => {
    const { c, dados } = montar('cidade-a');
    await expect(c.ver(admin, 'motoristaA')).resolves.toEqual({ id: 'motoristaA' });
    await c.aprovar(admin, 'motoristaA');
    expect(dados.aprovar).toHaveBeenCalled();
  });

  it('operador NAO ve nem muda motorista de outra cidade nem passageiro', async () => {
    const { c, dados } = montar('cidade-a');
    await expect(c.ver(admin, 'motoristaB')).rejects.toBeInstanceOf(NotFoundException);
    await expect(c.ver(admin, 'passageiro')).rejects.toBeInstanceOf(NotFoundException);
    await expect(c.aprovar(admin, 'motoristaB')).rejects.toBeInstanceOf(NotFoundException);
    await expect(c.recusar(admin, 'motoristaB', { motivo: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(c.editar(admin, 'passageiro', {} as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(dados.aprovar).not.toHaveBeenCalled();
    expect(dados.editarPelaCentral).not.toHaveBeenCalled();
  });

  it('operador so ve os pedidos da cidade dele; o dono ve todos', async () => {
    expect(await montar('cidade-a').c.pendentes(admin)).toEqual([{ userId: 'motoristaA', driverId: 'dA' }]);
    expect(await montar(null).c.pendentes(admin)).toHaveLength(2);
  });

  it('dono ve e muda qualquer um', async () => {
    const { c } = montar(null);
    await expect(c.ver(admin, 'passageiro')).resolves.toEqual({ id: 'passageiro' });
    await expect(c.ver(admin, 'motoristaB')).resolves.toEqual({ id: 'motoristaB' });
  });
});

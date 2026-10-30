import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ACTIVE_RIDE_STATUSES, ERROR_CODES, normalizePlate } from '@ride/shared';
import type { Vehicle } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BusinessException } from '../../common/errors/business.exception';
import { buildPaginated, toSkip } from '../../common/dto/pagination.dto';
import { CreateVehicleInput, UpdateVehicleInput } from '@ride/shared';
import { decodificarFoto, soArquivosDoBanco } from '../arquivos/arquivos.service';
import { lerCategorias } from '../rides/categorias';
import { ehEntrega } from '../entregas/entregas.regras';
import { CaixaDeEntradaService } from '../../integrations/notifications/caixa-de-entrada.service';
import {
  CHAVE_VEICULOS,
  carroLiberado,
  FichaDoCarro,
  lerMapaDeCarros,
  MapaDeCarros,
  situacaoDoCarro,
} from './vehicles.situacao';

/** Carro como o aplicativo e a Central leem: dados, situacao e fotos. */
export type CarroPublico = Vehicle & {
  situacao: ReturnType<typeof situacaoDoCarro>;
  motivo: string | null;
  fotoUrl: string | null;
  crlvUrl: string | null;
  enviadoEm: string | null;
  /** Categoria pedida pelo motorista, esperando a Central (null = nenhuma). */
  categoriaPedida: string | null;
  categoriaPedidaEm: string | null;
  /** Motivo da ultima recusa de categoria. */
  categoriaMotivo: string | null;
};

/**
 * Carros do motorista (Evandro, 09/10/2026): cadastrar outro carro, trocar o
 * carro em uso, corrigir os dados e tirar um carro. Carro novo de motorista
 * ja aprovado passa pela Central (foto e CRLV) antes de rodar. Ver
 * vehicles.situacao.ts.
 */
@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly caixa: CaixaDeEntradaService,
  ) {}

  // --------------------------- SITUACAO ---------------------------

  async mapa(): Promise<MapaDeCarros> {
    const s = await this.prisma.setting.findUnique({ where: { key: CHAVE_VEICULOS } });
    return lerMapaDeCarros(s?.value);
  }

  /** Le, muda e grava o mapa de situacao (sempre o mais novo do banco). */
  private async mudar(fn: (m: MapaDeCarros) => void, quem?: string): Promise<MapaDeCarros> {
    const mapa = await this.mapa();
    fn(mapa);
    await this.prisma.setting.upsert({
      where: { key: CHAVE_VEICULOS },
      update: { value: mapa as never, updatedBy: quem ?? null },
      create: { key: CHAVE_VEICULOS, value: mapa as never, updatedBy: quem ?? null, description: 'Situacao e fotos dos carros dos motoristas' },
    });
    return mapa;
  }

  private publico(v: Vehicle, mapa: MapaDeCarros): CarroPublico {
    const f: FichaDoCarro = mapa[v.id] ?? {};
    return {
      ...v,
      situacao: situacaoDoCarro(v, mapa),
      motivo: f.situacao === 'RECUSADO' ? (f.motivo ?? null) : null,
      fotoUrl: f.foto ?? null,
      crlvUrl: f.crlv ?? null,
      enviadoEm: f.em ?? null,
      categoriaPedida: f.categoriaPedida ?? null,
      categoriaPedidaEm: f.categoriaPedidaEm ?? null,
      categoriaMotivo: f.categoriaMotivo ?? null,
    };
  }

  // --------------------------- CATEGORIA ---------------------------

  /** Lista para o motorista escolher (todas: a Central liga a categoria na cidade quando houver carro). */
  async categoriasParaEscolher() {
    // "Entrega" e tarifa, nao categoria de carro (Etapa 5).
    return (await lerCategorias(this.prisma)).filter((c) => !ehEntrega(c.codigo)).map((c) => ({
      codigo: c.codigo,
      nome: c.nome,
      icone: c.icone,
      descricao: c.descricao,
      capacidade: c.capacidade,
    }));
  }

  /** Confere se a categoria existe (ligada ou nao: Conforto liga depois que ha carro aprovado). */
  private async categoriaQueExiste(codigo: string): Promise<string> {
    const c = codigo.trim().toUpperCase();
    const lista = await lerCategorias(this.prisma);
    if (ehEntrega(c) || !lista.some((x) => x.codigo === c)) throw BusinessException.validation('Categoria nao encontrada. Escolha uma da lista.');
    return c;
  }

  /**
   * O motorista pede a categoria do carro (Evandro, 29/10/2026: "escolhe a
   * categoria no cadastro do veiculo, com aprovacao da Central"). Ate a
   * Central aprovar, o carro continua recebendo chamados da categoria de antes.
   */
  private async registrarPedidoDeCategoria(vehicle: Vehicle, codigo: string, quem: string): Promise<MapaDeCarros> {
    const categoria = await this.categoriaQueExiste(codigo);
    return this.mudar((m) => {
      const f = { ...(m[vehicle.id] ?? {}) };
      if (categoria === vehicle.category) {
        delete f.categoriaPedida;
        delete f.categoriaPedidaEm;
      } else {
        f.categoriaPedida = categoria;
        f.categoriaPedidaEm = new Date().toISOString();
        delete f.categoriaMotivo;
      }
      if (Object.keys(f).length) m[vehicle.id] = f;
      else delete m[vehicle.id];
    }, quem);
  }

  async pedirCategoria(userId: string, vehicleId: string, categoria: string) {
    const vehicle = await this.carroDoMotorista(userId, vehicleId);
    const mapa = await this.mapa();
    if (mapa[vehicleId]?.situacao === 'REMOVIDO') throw BusinessException.notFound('Veiculo nao encontrado.');
    const novo = await this.registrarPedidoDeCategoria(vehicle, categoria, userId);
    this.logger.log(`Carro ${vehicle.plate}: motorista pediu a categoria ${categoria}`);
    return this.publico(vehicle, novo);
  }

  /** A Central aprova (a categoria passa a valer) ou recusa (motivo obrigatorio) o pedido. */
  async adminRevisarCategoria(vehicleId: string, adminId: string, aprovar: boolean, motivo?: string | null) {
    const v = await this.carroPorId(vehicleId);
    const mapa = await this.mapa();
    const pedida = mapa[vehicleId]?.categoriaPedida;
    if (!pedida) throw BusinessException.validation('Este carro nao tem pedido de categoria.');
    if (!aprovar && !motivo?.trim()) throw BusinessException.validation('Escreva o motivo da recusa (o motorista ve).');
    if (aprovar) {
      await this.categoriaQueExiste(pedida);
      await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { category: pedida } });
    }
    await this.mudar((m) => {
      const f = { ...(m[vehicleId] ?? {}) };
      delete f.categoriaPedida;
      delete f.categoriaPedidaEm;
      if (aprovar) delete f.categoriaMotivo;
      else f.categoriaMotivo = motivo!.trim();
      if (Object.keys(f).length) m[vehicleId] = f;
      else delete m[vehicleId];
    }, adminId);
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorRole: 'ADMIN',
        action: aprovar ? 'VEHICLE_CATEGORY_APPROVED' : 'VEHICLE_CATEGORY_REJECTED',
        entity: 'Vehicle',
        entityId: vehicleId,
        before: { category: v.category },
        after: { category: aprovar ? pedida : v.category, pedida, motivo: motivo ?? null },
      },
    });
    const nomeDaCategoria = (await lerCategorias(this.prisma)).find((c) => c.codigo === pedida)?.nome ?? pedida;
    await this.caixa.avisarMotorista(
      v.driverId,
      aprovar ? `Categoria ${nomeDaCategoria} aprovada` : `Categoria ${nomeDaCategoria} recusada`,
      aprovar ? `O carro ${v.plate} já recebe corridas ${nomeDaCategoria}.` : `Carro ${v.plate}: ${motivo!.trim()}`,
      { tipo: 'categoria', abrir: 'carros' },
    );
    this.logger.log(`Carro ${v.plate}: Central ${aprovar ? 'aprovou' : 'recusou'} a categoria ${pedida}`);
    return this.carrosDoMotorista(v.driverId);
  }

  /** A Central muda a categoria direto (sem pedido): vale na hora e limpa o pedido. */
  async definirCategoria(vehicleIds: string[], categoria: string, quem: string): Promise<string> {
    const c = await this.categoriaQueExiste(categoria);
    await this.prisma.vehicle.updateMany({ where: { id: { in: vehicleIds } }, data: { category: c } });
    await this.mudar((m) => {
      for (const id of vehicleIds) {
        const f = m[id];
        if (!f) continue;
        delete f.categoriaPedida;
        delete f.categoriaPedidaEm;
        delete f.categoriaMotivo;
        if (!Object.keys(f).length) delete m[id];
      }
    }, quem);
    return c;
  }

  /** Pedidos de categoria esperando a Central (o mais novo primeiro). */
  async categoriasParaConferir(driverIds: string[] | null) {
    const mapa = await this.mapa();
    const ids = Object.entries(mapa)
      .filter(([, f]) => f.categoriaPedida && f.situacao !== 'REMOVIDO')
      .map(([id]) => id);
    if (ids.length === 0) return [];
    const carros = await this.prisma.vehicle.findMany({
      where: { id: { in: ids }, driver: { user: { deletedAt: null }, ...(driverIds ? { id: { in: driverIds } } : {}) } },
      select: { id: true, plate: true, brand: true, model: true, year: true, category: true, driverId: true, driver: { select: { user: { select: { name: true } } } } },
    });
    return carros
      .map((c) => ({
        id: c.id,
        plate: c.plate,
        carro: `${c.brand} ${c.model} ${c.year}`,
        driverId: c.driverId,
        name: c.driver.user?.name ?? null,
        categoriaAtual: c.category,
        categoriaPedida: mapa[c.id]?.categoriaPedida ?? null,
        pedidaEm: mapa[c.id]?.categoriaPedidaEm ?? null,
      }))
      .sort((a, b) => (b.pedidaEm ?? '').localeCompare(a.pedidaEm ?? ''));
  }

  /** Carros do motorista (sem os removidos): o em uso primeiro. */
  async carrosDoMotorista(driverId: string): Promise<CarroPublico[]> {
    const [carros, mapa] = await Promise.all([
      this.prisma.vehicle.findMany({ where: { driverId }, orderBy: { createdAt: 'desc' } }),
      this.mapa(),
    ]);
    return carros
      .filter((v) => mapa[v.id]?.situacao !== 'REMOVIDO')
      .map((v) => this.publico(v, mapa))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive));
  }

  private async motoristaDe(userId: string) {
    const driver = await this.prisma.driver.findUnique({ where: { userId }, select: { id: true, status: true, userId: true } });
    if (!driver) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');
    return driver;
  }

  private async carroDoMotorista(userId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, driver: { userId } } });
    if (!vehicle) throw BusinessException.notFound('Veiculo nao encontrado.');
    return vehicle;
  }

  private async emCorrida(driverId: string): Promise<boolean> {
    return (await this.prisma.ride.count({ where: { driverId, status: { in: [...ACTIVE_RIDE_STATUSES] } } })) > 0;
  }

  /** Sem carro em uso e com um liberado: o mais novo liberado passa a ser o de uso. */
  private async garantirCarroEmUso(driverId: string, mapa?: MapaDeCarros): Promise<void> {
    const ativos = await this.prisma.vehicle.count({ where: { driverId, isActive: true } });
    if (ativos > 0) return;
    const m = mapa ?? (await this.mapa());
    const carros = await this.prisma.vehicle.findMany({ where: { driverId }, orderBy: { createdAt: 'desc' } });
    const livre = carros.find((c) => carroLiberado(c.id, m));
    if (livre) await this.prisma.vehicle.update({ where: { id: livre.id }, data: { isActive: true } });
  }

  /** Um carro so em uso por motorista. */
  private async usarCarro(driverId: string, vehicleId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.vehicle.updateMany({ where: { driverId, NOT: { id: vehicleId } }, data: { isActive: false } }),
      this.prisma.vehicle.update({ where: { id: vehicleId }, data: { isActive: true } }),
    ]);
  }

  // --------------------------- MOTORISTA ---------------------------

  async listMine(userId: string) {
    const driver = await this.motoristaDe(userId);
    return this.carrosDoMotorista(driver.id);
  }

  /**
   * Cadastra um carro. No primeiro cadastro (motorista ainda em analise) o
   * carro entra junto com o cadastro. Motorista ja aprovado: o carro novo
   * fica PENDENTE ate a Central conferir a foto e o CRLV.
   */
  async create(userId: string, input: CreateVehicleInput) {
    const driver = await this.motoristaDe(userId);
    const conferir = driver.status === 'APPROVED';
    return this.cadastrar(driver.id, input, conferir ? 'CONFERIR' : 'LIBERAR', userId, false);
  }

  private async cadastrar(
    driverId: string,
    input: CreateVehicleInput,
    modo: 'CONFERIR' | 'LIBERAR',
    quem: string,
    /** true = a Central cadastrou: a categoria vale na hora; false = pedido do motorista. */
    categoriaDaCentral: boolean,
  ): Promise<CarroPublico> {
    const categoria = input.categoria ? await this.categoriaQueExiste(input.categoria) : null;
    const plate = normalizePlate(input.plate);
    const mapa = await this.mapa();
    const dados = { brand: input.brand, model: input.model, year: input.year, color: input.color };
    const existente = await this.prisma.vehicle.findUnique({ where: { plate } });
    let carro: Vehicle;
    if (existente) {
      const removido = mapa[existente.id]?.situacao === 'REMOVIDO';
      // Mesmo carro do mesmo motorista (reenviou o cadastro): nao e erro.
      if (existente.driverId === driverId && !removido) return this.publico(existente, mapa);
      if (!removido) {
        throw BusinessException.conflict('Esta placa ja esta cadastrada para outro motorista.', ERROR_CODES.VEHICLE_PLATE_ALREADY_USED);
      }
      // Carro que tinha saido (dele mesmo, ou vendido por outro motorista):
      // volta para este motorista. As corridas antigas continuam com o carro.
      carro = await this.prisma.vehicle.update({ where: { id: existente.id }, data: { ...dados, driverId, isActive: false } });
    } else {
      try {
        carro = await this.prisma.vehicle.create({ data: { ...dados, driverId, plate, isActive: false } });
      } catch (e) {
        // Dois envios no mesmo instante (toque duplo no celular, 08/10/2026):
        // o segundo batia na placa unica e o motorista via um erro do banco.
        if ((e as { code?: string })?.code !== 'P2002') throw e;
        const mesmo = await this.prisma.vehicle.findUnique({ where: { plate } });
        if (mesmo && mesmo.driverId === driverId) return this.publico(mesmo, await this.mapa());
        throw BusinessException.conflict('Esta placa ja esta cadastrada para outro motorista.', ERROR_CODES.VEHICLE_PLATE_ALREADY_USED);
      }
    }
    // Categoria igual a do carro que ele ja usa (a Central muda se precisar).
    const atual = await this.prisma.vehicle.findFirst({ where: { driverId, isActive: true, NOT: { id: carro.id } } });
    if (atual && atual.category !== carro.category) {
      carro = await this.prisma.vehicle.update({ where: { id: carro.id }, data: { category: atual.category } });
    }
    if (categoria && categoriaDaCentral && categoria !== carro.category) {
      carro = await this.prisma.vehicle.update({ where: { id: carro.id }, data: { category: categoria } });
    }
    const pedir = categoria && !categoriaDaCentral && categoria !== carro.category;
    const novoMapa = await this.mudar((m) => {
      if (modo === 'CONFERIR') m[carro.id] = { situacao: 'PENDENTE', em: new Date().toISOString() };
      else delete m[carro.id];
      if (pedir) m[carro.id] = { ...(m[carro.id] ?? {}), categoriaPedida: categoria, categoriaPedidaEm: new Date().toISOString() };
    }, quem);
    if (modo === 'LIBERAR') await this.garantirCarroEmUso(driverId, novoMapa);
    const final = await this.prisma.vehicle.findUniqueOrThrow({ where: { id: carro.id } });
    this.logger.log(`Carro ${final.plate} do motorista ${driverId}: ${modo === 'CONFERIR' ? 'para a Central conferir' : 'liberado'}`);
    return this.publico(final, novoMapa);
  }

  /** Corrige marca, modelo, ano e cor. Outra placa = outro carro. */
  async update(userId: string, vehicleId: string, input: UpdateVehicleInput) {
    const vehicle = await this.carroDoMotorista(userId, vehicleId);
    const mapa = await this.mapa();
    if (mapa[vehicleId]?.situacao === 'REMOVIDO') throw BusinessException.notFound('Veiculo nao encontrado.');
    if (input.plate && normalizePlate(input.plate) !== vehicle.plate) {
      throw BusinessException.validation('Para outra placa, cadastre outro carro (a Central confere o documento dele).');
    }
    const atualizado = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        ...(input.brand ? { brand: input.brand } : {}),
        ...(input.model ? { model: input.model } : {}),
        ...(input.year ? { year: input.year } : {}),
        ...(input.color ? { color: input.color } : {}),
      },
    });
    // Recusado e corrigido: volta para a Central conferir.
    let novo = mapa[vehicleId]?.situacao === 'RECUSADO'
      ? await this.mudar((m) => {
          m[vehicleId] = { ...m[vehicleId], situacao: 'PENDENTE', motivo: null, em: new Date().toISOString() };
        }, userId)
      : mapa;
    if (input.categoria) novo = await this.registrarPedidoDeCategoria(atualizado, input.categoria, userId);
    return this.publico(atualizado, novo);
  }

  /** Troca o carro em uso (so carro liberado pela Central e fora de corrida). */
  async usar(userId: string, vehicleId: string) {
    const vehicle = await this.carroDoMotorista(userId, vehicleId);
    await this.trocarParaEste(vehicle);
    return this.carrosDoMotorista(vehicle.driverId);
  }

  private async trocarParaEste(vehicle: Vehicle): Promise<void> {
    const mapa = await this.mapa();
    const s = mapa[vehicle.id]?.situacao;
    if (s === 'PENDENTE') throw BusinessException.validation('Este carro ainda espera a Central conferir a foto e o documento.');
    if (s === 'RECUSADO') throw BusinessException.validation('A Central recusou este carro. Corrija os dados ou mande as fotos de novo.');
    if (s === 'REMOVIDO') throw BusinessException.notFound('Veiculo nao encontrado.');
    if (vehicle.isActive) return;
    if (await this.emCorrida(vehicle.driverId)) {
      throw BusinessException.conflict('Termine a corrida antes de trocar de carro.');
    }
    await this.usarCarro(vehicle.driverId, vehicle.id);
  }

  /** Foto do carro (de frente, com a placa) ou do CRLV deste carro. */
  async foto(userId: string, vehicleId: string, tipo: 'FOTO' | 'CRLV', mime: string, base64: string) {
    const vehicle = await this.carroDoMotorista(userId, vehicleId);
    const mapa = await this.mapa();
    const s = mapa[vehicleId]?.situacao;
    if (s === 'REMOVIDO') throw BusinessException.notFound('Veiculo nao encontrado.');
    if (!s) {
      throw BusinessException.validation(
        'Este carro ja foi conferido. Para atualizar o CRLV ou a foto, use Perfil e documentos.',
      );
    }
    return this.guardarFoto(vehicle, tipo, mime, base64, userId, true);
  }

  private async guardarFoto(vehicle: Vehicle, tipo: 'FOTO' | 'CRLV', mime: string, base64: string, quem: string, reenviar: boolean) {
    const dados = decodificarFoto(mime, base64);
    const driver = await this.prisma.driver.findUniqueOrThrow({ where: { id: vehicle.driverId }, select: { userId: true } });
    const id = randomUUID();
    await this.prisma.arquivo.create({
      data: { id, ownerId: driver.userId, tipo: tipo === 'FOTO' ? 'VEHICLE_FRONT' : 'CRLV', mime, tamanho: dados.length, dados },
    });
    const url = `/arquivos/${id}`;
    let antigo: string | null | undefined;
    const novo = await this.mudar((m) => {
      const f = m[vehicle.id] ?? {};
      antigo = tipo === 'FOTO' ? f.foto : f.crlv;
      m[vehicle.id] = {
        ...f,
        ...(tipo === 'FOTO' ? { foto: url } : { crlv: url }),
        // Recusado com foto nova: volta para a Central conferir.
        ...(reenviar && f.situacao === 'RECUSADO' ? { situacao: 'PENDENTE' as const, motivo: null, em: new Date().toISOString() } : {}),
      };
    }, quem);
    const antigoId = antigo?.replace('/arquivos/', '');
    if (antigoId) await this.prisma.arquivo.deleteMany({ where: { id: { in: soArquivosDoBanco([antigoId]) } } });
    return this.publico(vehicle, novo);
  }

  /**
   * Tira o carro. Com corridas no historico ele fica guardado (escondido) para
   * as corridas antigas continuarem com a placa; sem corridas, sai de vez.
   */
  async remove(userId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.carroDoMotorista(userId, vehicleId);
    await this.removerCarro(vehicle, userId);
  }

  private async removerCarro(vehicle: Vehicle, quem: string): Promise<void> {
    const activeRide = await this.prisma.ride.count({
      where: { vehicleId: vehicle.id, status: { in: [...ACTIVE_RIDE_STATUSES] } },
    });
    if (activeRide > 0) throw BusinessException.conflict('Veiculo em uso em uma corrida ativa.');
    const corridas = await this.prisma.ride.count({ where: { vehicleId: vehicle.id } });
    const mapa = await this.mapa();
    const f = mapa[vehicle.id] ?? {};
    const fotos = soArquivosDoBanco([f.foto, f.crlv].filter((x): x is string => !!x).map((u) => u.replace('/arquivos/', '')));
    if (corridas > 0) {
      await this.prisma.vehicle.update({ where: { id: vehicle.id }, data: { isActive: false } });
      await this.mudar((m) => {
        m[vehicle.id] = { situacao: 'REMOVIDO', em: new Date().toISOString() };
      }, quem);
    } else {
      await this.prisma.vehicle.delete({ where: { id: vehicle.id } });
      await this.mudar((m) => {
        delete m[vehicle.id];
      }, quem);
    }
    if (fotos.length) await this.prisma.arquivo.deleteMany({ where: { id: { in: fotos } } });
    await this.garantirCarroEmUso(vehicle.driverId);
  }

  // ------------------------------- ADMIN -------------------------------

  async carroPorId(vehicleId: string): Promise<Vehicle> {
    const v = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!v) throw BusinessException.notFound('Veiculo nao encontrado.');
    return v;
  }

  /** A Central cadastra um carro para o motorista (ja conferido por ela). */
  async adminCriar(driverId: string, adminId: string, input: CreateVehicleInput) {
    const d = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { id: true } });
    if (!d) throw BusinessException.notFound('Motorista nao encontrado.');
    return this.cadastrar(driverId, input, 'LIBERAR', adminId, true);
  }

  /** A Central aprova ou recusa o carro novo. */
  async adminRevisar(vehicleId: string, adminId: string, aprovar: boolean, motivo?: string | null) {
    const v = await this.carroPorId(vehicleId);
    const mapa = await this.mapa();
    if (mapa[vehicleId]?.situacao === 'REMOVIDO') throw BusinessException.notFound('Veiculo nao encontrado.');
    if (!aprovar && !motivo?.trim()) throw BusinessException.validation('Escreva o motivo da recusa (o motorista ve).');
    const novo = await this.mudar((m) => {
      const f = m[vehicleId] ?? {};
      m[vehicleId] = aprovar
        ? {
            foto: f.foto ?? null,
            crlv: f.crlv ?? null,
            em: new Date().toISOString(),
            // O pedido de categoria continua (a Central confere a parte).
            ...(f.categoriaPedida ? { categoriaPedida: f.categoriaPedida, categoriaPedidaEm: f.categoriaPedidaEm ?? null } : {}),
          }
        : { ...f, situacao: 'RECUSADO', motivo: motivo!.trim(), em: new Date().toISOString() };
    }, adminId);
    if (aprovar) await this.garantirCarroEmUso(v.driverId, novo);
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        actorRole: 'ADMIN',
        action: aprovar ? 'VEHICLE_APPROVED' : 'VEHICLE_REJECTED',
        entity: 'Vehicle',
        entityId: vehicleId,
        after: { plate: v.plate, motivo: motivo ?? null },
      },
    });
    await this.caixa.avisarMotorista(
      v.driverId,
      aprovar ? `Carro ${v.plate} aprovado` : `Carro ${v.plate} recusado`,
      aprovar ? `${v.model} liberado pela Central.` : motivo!.trim(),
      { tipo: 'carro', abrir: 'carros' },
    );
    return this.carrosDoMotorista(v.driverId);
  }

  async adminUsar(vehicleId: string) {
    const v = await this.carroPorId(vehicleId);
    await this.trocarParaEste(v);
    return this.carrosDoMotorista(v.driverId);
  }

  /** A Central corrige os dados (inclusive a placa digitada errada). */
  async adminEditar(vehicleId: string, input: UpdateVehicleInput) {
    const v = await this.carroPorId(vehicleId);
    let plate: string | undefined;
    if (input.plate) {
      plate = normalizePlate(input.plate);
      const taken = await this.prisma.vehicle.findFirst({ where: { plate, NOT: { id: vehicleId } } });
      if (taken) throw BusinessException.conflict('Placa ja cadastrada.', ERROR_CODES.VEHICLE_PLATE_ALREADY_USED);
    }
    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        ...(plate ? { plate } : {}),
        ...(input.brand ? { brand: input.brand } : {}),
        ...(input.model ? { model: input.model } : {}),
        ...(input.year ? { year: input.year } : {}),
        ...(input.color ? { color: input.color } : {}),
      },
    });
    if (input.categoria) await this.definirCategoria([vehicleId], input.categoria, 'central');
    return this.carrosDoMotorista(v.driverId);
  }

  async adminRemover(vehicleId: string, adminId: string) {
    const v = await this.carroPorId(vehicleId);
    await this.removerCarro(v, adminId);
    return this.carrosDoMotorista(v.driverId);
  }

  /** Foto do carro ou CRLV mandados pela Central (o carro continua como esta). */
  async adminFoto(vehicleId: string, adminId: string, tipo: 'FOTO' | 'CRLV', mime: string, base64: string) {
    const v = await this.carroPorId(vehicleId);
    await this.guardarFoto(v, tipo, mime, base64, adminId, false);
    return this.carrosDoMotorista(v.driverId);
  }

  /** Carros novos esperando a Central (o mais novo primeiro), so de motoristas aprovados. */
  async paraConferir(driverIds: string[] | null) {
    const mapa = await this.mapa();
    const ids = Object.entries(mapa)
      .filter(([, f]) => f.situacao === 'PENDENTE')
      .map(([id]) => id);
    if (ids.length === 0) return [];
    const carros = await this.prisma.vehicle.findMany({
      where: {
        id: { in: ids },
        driver: { status: 'APPROVED', user: { deletedAt: null }, ...(driverIds ? { id: { in: driverIds } } : {}) },
      },
      select: { id: true, plate: true, driverId: true, driver: { select: { user: { select: { name: true } } } } },
    });
    return carros
      .map((c) => ({ id: c.id, plate: c.plate, driverId: c.driverId, name: c.driver.user?.name ?? null, createdAt: mapa[c.id]?.em ?? null }))
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }

  async adminListVehicles(params: { page: number; limit: number; search?: string }) {
    const where = params.search
      ? {
          OR: [
            { plate: { contains: params.search.toUpperCase() } },
            { brand: { contains: params.search, mode: 'insensitive' as const } },
            { model: { contains: params.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        skip: toSkip(params.page, params.limit),
        take: params.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          driver: { select: { id: true, status: true, user: { select: { name: true, phone: true } } } },
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    return buildPaginated(items, total, params.page, params.limit);
  }
}

import { abrirJornada, fecharJornada } from '../painel-motorista/jornada';
import { regrasDaCarteira, semSaldo } from '../painel-motorista/regras-carteira';
import { Injectable, Logger } from '@nestjs/common';
import { ACTIVE_RIDE_STATUSES, ERROR_CODES, DriverStatus, DocumentStatus, REQUIRED_DRIVER_DOCUMENTS, UserRole, UserStatus } from '@ride/shared';
import { PrismaService } from '../../database/prisma.service';
import { PracasService } from '../pracas/pracas.service';
import { BusinessException } from '../../common/errors/business.exception';
import { buildPaginated, toSkip } from '../../common/dto/pagination.dto';
import { acharContaComOsMesmosDados, erroContaExistente } from '../auth/conta-existente';
import { DriversRepository } from './drivers.repository';
import type { CriarMotoristaInput } from './admin-drivers.controller';
import { StorageService } from '../../integrations/storage/storage.service';
import { NotificationService } from '../../integrations/notifications/notification.service';
import { NotificationChannel } from '@ride/shared';
import {
  DriverOnboardingInput,
  UpdateDriverInput,
  UpdateDriverLocationInput,
  ReviewDriverInput,
} from '@ride/shared';


/** Acao gravada na auditoria quando a Central aprova sem as fotos no sistema. */
const APROVACAO_PRESENCIAL = 'DRIVER_APPROVED_PRESENTIAL';

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    private readonly repo: DriversRepository,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationService,
    private readonly pracas: PracasService,
  ) {}

  /** Onboarding do motorista: cria o registro e a carteira virtual. */
  async onboard(userId: string, input: DriverOnboardingInput) {
    const existing = await this.repo.findByUserId(userId);
    if (existing) {
      throw BusinessException.conflict('Motorista ja cadastrado.', ERROR_CODES.DRIVER_ALREADY_EXISTS);
    }

    // Nome, e-mail e telefone vem no mesmo envio: a conta nasce so com o
    // telefone (ou so com o e-mail) e "Motorista 1234" no lugar do nome.
    const usuario = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!usuario) throw BusinessException.notFound('Usuario nao encontrado.');
    const semTelefone = !usuario.phone || usuario.phone.startsWith('pend-');
    if (semTelefone && !input.phone) throw BusinessException.validation('Informe o seu telefone com DDD.');

    // E-mail, CPF, CNH ou telefone de OUTRA conta (ex.: a de passageiro da
    // mesma pessoa): nao recusa mais. O app confirma com o codigo enviado a
    // essa conta e continua o cadastro nela (Evandro, 08/10/2026).
    const outra = await acharContaComOsMesmosDados(this.prisma, userId, {
      email: input.email && input.email !== usuario.email ? input.email : null,
      cpf: input.cpf,
      cnhNumber: input.cnhNumber,
      phone: semTelefone ? input.phone : null,
    });
    if (outra) throw erroContaExistente(outra);

    const driver = await this.prisma.$transaction(async (tx) => {
      const created = await tx.driver.create({
        data: {
          userId,
          status: DriverStatus.PENDING,
          cpf: input.cpf,
          birthDate: input.birthDate,
          cnhNumber: input.cnhNumber,
          cnhCategory: input.cnhCategory,
          cnhExpiresAt: input.cnhExpiresAt,
          pixKey: input.pixKey,
        },
      });

      await tx.wallet.create({ data: { driverId: created.id } });

      await tx.user.update({
        where: { id: userId },
        data: {
          role: UserRole.DRIVER,
          status: UserStatus.ACTIVE,
          cpf: input.cpf,
          birthDate: input.birthDate,
          ...(input.name ? { name: input.name.replace(/\s+/g, ' ').trim() } : {}),
          ...(input.email && input.email !== usuario.email ? { email: input.email, emailVerifiedAt: null } : {}),
          ...(semTelefone && input.phone ? { phone: input.phone, phoneVerifiedAt: null } : {}),
        },
      });

      return created;
    });

    // Cidade onde vai trabalhar: a escolhida no cadastro (varias cidades) ou,
    // com uma so, ela mesma. Sem escolha, a primeira posicao do GPS decide.
    const pracas = await this.pracas.listar();
    const escolhida = input.praca ? pracas.find((p) => p.id === input.praca) : pracas.length === 1 ? pracas[0] : undefined;
    if (escolhida) await this.pracas.definirPracaDoMotorista(userId, escolhida.id);

    // Avisa a Central por e-mail (quando o e-mail estiver ligado): com o
    // aplicativo da Central fechado ninguem ficava sabendo do cadastro novo.
    void this.avisarCentralCadastroNovo(driver.id).catch(() => undefined);

    return this.withProgress(driver.id);
  }

  /** E-mail para cada conta da Central: motorista novo esperando aprovacao. */
  private async avisarCentralCadastroNovo(driverId: string) {
    if (!this.notifications.emailConfigurado) return;
    const d = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: { select: { name: true, phone: true, email: true } } },
    });
    if (!d) return;
    const admins = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN, deletedAt: null, email: { not: null } },
      select: { id: true, email: true },
    });
    const tel = (d.user?.phone ?? '').replace(/^\+55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');
    const texto = [
      'Um motorista novo terminou o cadastro e esta aguardando aprovacao.',
      '',
      `Nome: ${d.user?.name ?? '-'}`,
      `Telefone: ${tel || '-'}`,
      `E-mail: ${d.user?.email ?? '-'}`,
      '',
      'Abra o aplicativo da Central > Motoristas > Pendentes para conferir e aprovar.',
    ].join('\n');
    for (const a of admins) {
      await this.notifications.send({
        userId: a.id,
        channel: NotificationChannel.EMAIL,
        to: a.email,
        title: `Motorista aguardando aprovacao: ${d.user?.name ?? 'cadastro novo'}`,
        body: texto,
      });
    }
  }

  async getMe(userId: string) {
    const driver = await this.repo.findByUserId(userId);
    if (!driver) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');
    return this.withProgress(driver.id);
  }

  async updateMe(userId: string, input: UpdateDriverInput) {
    const driver = await this.repo.findByUserId(userId);
    if (!driver) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');

    await this.repo.update(driver.id, {
      ...(input.birthDate ? { birthDate: input.birthDate } : {}),
      ...(input.cnhNumber ? { cnhNumber: input.cnhNumber } : {}),
      ...(input.cnhCategory ? { cnhCategory: input.cnhCategory } : {}),
      ...(input.cnhExpiresAt ? { cnhExpiresAt: input.cnhExpiresAt } : {}),
      ...(input.pixKey !== undefined ? { pixKey: input.pixKey } : {}),
    });

    return this.withProgress(driver.id);
  }

  /** Alterna Online/Offline. Exige aprovacao, documentos completos e veiculo ativo. */
  async setOnline(userId: string, isOnline: boolean) {
    const driver = await this.repo.findByUserId(userId);
    if (!driver) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');

    if (isOnline) {
      if (driver.status !== DriverStatus.APPROVED) {
        throw new BusinessException(
          ERROR_CODES.DRIVER_NOT_APPROVED,
          'Sua conta ainda nao foi aprovada para ficar online.',
          403,
        );
      }

      const progress = await this.getDocumentProgress(driver.id);
      // Aprovado com conferencia presencial: as fotos ainda nao existem no
      // sistema, mas os documentos foram vistos pela Central.
      if (!progress.isComplete && !(await this.aprovadoPresencialmente(driver.id))) {
        throw new BusinessException(
          ERROR_CODES.DOCUMENTS_INCOMPLETE,
          `Documentos pendentes: ${progress.missing.join(', ')}.`,
          422,
          progress,
        );
      }

      const activeVehicles = await this.prisma.vehicle.count({ where: { driverId: driver.id, isActive: true } });
      if (activeVehicles === 0) {
        throw BusinessException.validation('Cadastre um veiculo ativo antes de ficar online.');
      }

      if (driver.cnhExpiresAt < new Date()) {
        throw BusinessException.validation('Sua CNH esta vencida. Atualize o documento.');
      }

      // Carteira pre-paga: para FICAR ONLINE o saldo precisa estar acima do
      // minimo (padrao R$ 0,00) — vale sempre. Ja online, uma corrida que
      // deixe o saldo negativo nao derruba o motorista: o debito fica
      // registrado e ele e avisado (so a Central, ligando o bloqueio, corta
      // os chamados no meio do turno).
      const regras = await regrasDaCarteira(this.prisma);
      {
        const w = await this.prisma.wallet.findUnique({ where: { driverId: driver.id } });
        const saldo = w?.balanceCents ?? 0;
        if (semSaldo(saldo, regras.minimoCents)) {
          const r = (c: number) => `R$ ${(c / 100).toFixed(2).replace('.', ',')}`;
          throw BusinessException.validation(
            `Saldo insuficiente na carteira (${r(saldo)}). O mínimo para receber corridas é acima de ${r(regras.minimoCents)}. Faça uma recarga com a Central.`,
          );
        }
      }
    }

    const updated = await this.repo.update(driver.id, { isOnline });

    // Tempo online da tela Atividades.
    if (isOnline) await abrirJornada(this.prisma, driver.id);
    else await fecharJornada(this.prisma, driver.id);

    await this.prisma.$executeRaw`
      UPDATE driver_locations SET is_online = ${isOnline}, is_available = ${isOnline}, updated_at = NOW()
      WHERE driver_id = ${driver.id}::uuid
    `;

    this.logger.log(`Motorista ${driver.id} -> ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    return { id: updated.id, isOnline: updated.isOnline, status: updated.status };
  }

  /** Atualiza a posicao do motorista (chamado pelo app a cada poucos segundos). */
  async updateLocation(userId: string, input: UpdateDriverLocationInput) {
    const driver = await this.repo.findByUserId(userId);
    if (!driver) throw BusinessException.notFound('Cadastro de motorista nao encontrado.');

    const activeRide = await this.prisma.ride.count({
      where: { driverId: driver.id, status: { in: [...ACTIVE_RIDE_STATUSES] } },
    });

    await this.prisma.upsertDriverLocation({
      driverId: driver.id,
      latitude: input.latitude,
      longitude: input.longitude,
      heading: input.heading ?? null,
      speed: input.speed ?? null,
      accuracy: input.accuracy ?? null,
      isOnline: driver.isOnline,
      isAvailable: driver.isOnline && activeRide === 0,
    });

    // Motorista ainda sem cidade: fica com a cidade onde esta (uma vez so).
    const meta = ((await this.prisma.user.findUnique({ where: { id: userId }, select: { metadata: true } }))?.metadata ??
      {}) as Record<string, unknown>;
    if (!meta.praca) {
      const p = await this.pracas.doPonto({ latitude: input.latitude, longitude: input.longitude });
      if (p) await this.pracas.definirPracaDoMotorista(userId, p.id);
    }

    return { updatedAt: new Date().toISOString(), isAvailable: driver.isOnline && activeRide === 0 };
  }

  // ------------------------------ ADMIN ------------------------------

  async adminList(
    params: { page: number; limit: number; status?: DriverStatus; isOnline?: boolean; search?: string },
    ids: string[] | null = null,
    pracaDe?: (driverId: string) => { id: string | null; nome: string | null },
  ) {
    const { items, total } = await this.repo.list({
      skip: toSkip(params.page, params.limit),
      take: params.limit,
      status: params.status,
      isOnline: params.isOnline,
      search: params.search,
      ids,
    });

    // documents: a ultima foto de cada documento (lista, como a Central le);
    // documentProgress: o resumo. Antes "documents" vinha como resumo e a
    // Central nao conseguia ler a lista de pendentes.
    const drivers = await Promise.all(
      items.map(async (driver) => ({
        ...driver,
        documents: await this.ultimosDocumentos(driver.id),
        documentProgress: await this.getDocumentProgress(driver.id),
        praca: pracaDe?.(driver.id).id ?? null,
        pracaNome: pracaDe?.(driver.id).nome ?? null,
      })),
    );

    return buildPaginated(drivers, total, params.page, params.limit);
  }

  async adminDetail(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: {
          select: { id: true, name: true, phone: true, email: true, avatarUrl: true, status: true, createdAt: true },
        },
        vehicles: true,
        documents: { orderBy: { createdAt: 'desc' } },
        wallet: true,
      },
    });

    if (!driver) throw BusinessException.notFound('Motorista nao encontrado.');

    const documents = await Promise.all(
      driver.documents.map(async (doc) => ({
        ...doc,
        // Foto guardada no proprio banco (/arquivos/...) ja e o endereco certo.
        fileUrl: doc.fileUrl?.startsWith('/arquivos/')
          ? doc.fileUrl
          : await this.storage.createPresignedDownload(doc.fileKey).catch(() => null),
      })),
    );

    return {
      ...driver,
      documents,
      progress: await this.getDocumentProgress(driverId),
    };
  }

  /** A Central aprovou este motorista conferindo os documentos pessoalmente? */
  private async aprovadoPresencialmente(driverId: string): Promise<boolean> {
    const registro = await this.prisma.auditLog.findFirst({
      where: { entity: 'Driver', entityId: driverId, action: APROVACAO_PRESENCIAL },
      select: { id: true },
    });
    return registro !== null;
  }

  /**
   * Cadastro feito pela Central: conta (ou a conta que ja existe com este
   * telefone, ex.: a de passageiro), motorista, carteira e veiculo, ja
   * aprovado se a Central conferiu pessoalmente. O motorista so entra no
   * app do motorista com o telefone e o codigo.
   */
  async adminCreate(adminId: string, input: CriarMotoristaInput) {
    const existente = await this.prisma.user.findUnique({
      where: { phone: input.phone },
      include: { driver: { select: { id: true } } },
    });
    if (existente?.role === UserRole.ADMIN) {
      throw BusinessException.conflict('Este telefone e da conta da Central.', ERROR_CODES.CONFLICT);
    }
    if (existente?.driver) {
      throw BusinessException.conflict('Este telefone ja e de um motorista cadastrado.', ERROR_CODES.DRIVER_ALREADY_EXISTS);
    }
    if (existente?.cpf && existente.cpf !== input.cpf) {
      throw BusinessException.validation('O CPF informado e diferente do CPF da conta deste telefone.');
    }
    const outra = await acharContaComOsMesmosDados(this.prisma, existente?.id ?? '00000000-0000-0000-0000-000000000000', {
      email: input.email && input.email !== existente?.email ? input.email : null,
      cpf: input.cpf,
      cnhNumber: input.cnhNumber,
    });
    if (outra) {
      throw BusinessException.conflict(
        `O e-mail, o CPF ou a CNH ja estao na conta do ${outra.destino}. Cadastre o motorista com esse telefone.`,
        ERROR_CODES.CONTA_EXISTENTE,
      );
    }
    const placa = input.vehicle.plate;
    if (await this.prisma.vehicle.findUnique({ where: { plate: placa } })) {
      throw BusinessException.conflict('Esta placa ja esta cadastrada para outro motorista.', ERROR_CODES.VEHICLE_PLATE_ALREADY_USED);
    }

    const agora = new Date();
    const nome = input.name.replace(/\s+/g, ' ').trim();
    const driver = await this.prisma.$transaction(async (tx) => {
      const user = existente
        ? await tx.user.update({
            where: { id: existente.id },
            data: {
              role: UserRole.DRIVER,
              status: UserStatus.ACTIVE,
              name: nome,
              cpf: input.cpf,
              birthDate: input.birthDate,
              ...(input.email && !existente.email ? { email: input.email } : {}),
            },
          })
        : await tx.user.create({
            data: {
              role: UserRole.DRIVER,
              status: UserStatus.ACTIVE,
              name: nome,
              phone: input.phone,
              email: input.email ?? null,
              cpf: input.cpf,
              birthDate: input.birthDate,
            },
          });
      const criado = await tx.driver.create({
        data: {
          userId: user.id,
          status: input.aprovar ? DriverStatus.APPROVED : DriverStatus.PENDING,
          cpf: input.cpf,
          birthDate: input.birthDate,
          cnhNumber: input.cnhNumber,
          cnhCategory: input.cnhCategory,
          cnhExpiresAt: input.cnhExpiresAt,
          ...(input.aprovar ? { approvedAt: agora, approvedBy: adminId } : {}),
        },
      });
      await tx.wallet.create({ data: { driverId: criado.id } });
      await tx.vehicle.create({
        data: {
          driverId: criado.id,
          plate: placa,
          brand: input.vehicle.brand,
          model: input.vehicle.model,
          year: input.vehicle.year,
          color: input.vehicle.color,
        },
      });
      return criado;
    });
    this.logger.log(`Central ${adminId} cadastrou o motorista ${driver.id} (${existente ? 'conta existente' : 'conta nova'})`);
    return { ...(await this.withProgress(driver.id)), contaExistente: !!existente };
  }

  /** Aprova, reprova ou suspende o motorista. */
  async adminReview(driverId: string, reviewerId: string, input: ReviewDriverInput) {
    const driver = await this.repo.findById(driverId);
    if (!driver) throw BusinessException.notFound('Motorista nao encontrado.');

    // Documentos sem foto no sistema, aprovados por conferencia presencial.
    let semFoto: string[] | null = null;
    if (input.status === DriverStatus.APPROVED) {
      const progress = await this.getDocumentProgress(driverId);
      if (!progress.isComplete) {
        if (!input.presentialCheck) {
          throw new BusinessException(
            ERROR_CODES.DOCUMENTS_INCOMPLETE,
            `Nao e possivel aprovar: documentos pendentes (${progress.missing.join(', ')}). ` +
              'Para aprovar conferindo pessoalmente, use a conferencia presencial na Central.',
            422,
            progress,
          );
        }
        semFoto = progress.missing;
      }
      if (driver.cnhExpiresAt < new Date()) {
        throw BusinessException.validation('CNH vencida: reprove e solicite atualizacao.');
      }
    }

    const updated = await this.repo.update(driverId, {
      status: input.status,
      approvedAt: input.status === DriverStatus.APPROVED ? new Date() : null,
      approvedBy: input.status === DriverStatus.APPROVED ? reviewerId : null,
      rejectionReason: input.status === DriverStatus.APPROVED ? null : (input.reason ?? 'Sem justificativa informada.'),
      isOnline: input.status === DriverStatus.APPROVED ? driver.isOnline : false,
    });

    if (semFoto) {
      // Registro permanente: quem aprovou sem as fotos, quando e o que conferiu.
      await this.prisma.auditLog.create({
        data: {
          actorId: reviewerId,
          actorRole: 'ADMIN',
          action: APROVACAO_PRESENCIAL,
          entity: 'Driver',
          entityId: driverId,
          after: { conferencia: input.reason ?? '', documentosSemFoto: semFoto },
        },
      });
    }

    this.logger.log(`Motorista ${driverId} revisado -> ${input.status} por ${reviewerId}`);
    return this.withProgress(updated.id);
  }

  // ------------------------------------------------------------------
  // Excluir motorista (Evandro, 08/10/2026: "nao ficar guardando dados de
  // motorista que nem faz mais parte da plataforma").
  // Apaga o cadastro, CNH, fotos dos documentos, carros, carteira e extrato,
  // saques, jornadas e chamados. As corridas ja feitas ficam no historico do
  // passageiro e no financeiro, sem o motorista. A conta (telefone/e-mail):
  //  - tambem usada no app do passageiro (cadastro de passageiro feito ou
  //    corridas como passageiro): continua, so como passageiro;
  //  - sem nenhum uso: apagada de vez;
  //  - com avaliacoes ou pagamentos: dados pessoais apagados (anonimizada).
  // ------------------------------------------------------------------
  async adminDelete(
    driverId: string,
    adminId: string,
  ): Promise<{ id: string; resultado: 'APAGADO' | 'ANONIMIZADO' | 'VIROU_PASSAGEIRO'; corridas: number }> {
    const d = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true, userId: true, user: { select: { role: true, metadata: true } } },
    });
    if (!d) throw BusinessException.notFound('Motorista nao encontrado (ja excluido?).');
    // Fez o cadastro no app do passageiro (nome, e-mail, cidade): e passageiro tambem.
    const cadastroDePassageiro = (d.user.metadata as { cadastroCompleto?: boolean } | null)?.cadastroCompleto === true;
    const contaDeTeste = (d.user.metadata as { teste?: boolean } | null)?.teste === true;
    if (d.user.role === UserRole.ADMIN) throw BusinessException.validation('A conta da Central nao pode ser excluida aqui.');
    const emCorrida = await this.prisma.ride.count({
      where: { driverId, status: { in: [...ACTIVE_RIDE_STATUSES] } },
    });
    if (emCorrida > 0) {
      throw BusinessException.conflict('Este motorista esta numa corrida agora. Espere a corrida terminar para excluir.');
    }
    const userId = d.userId;
    const [corridas, comoPassageiro, pagamentos, avaliacoes] = await Promise.all([
      this.prisma.ride.count({ where: { driverId } }),
      this.prisma.ride.count({ where: { passengerId: userId } }),
      this.prisma.payment.count({ where: { payerId: userId } }),
      this.prisma.rating.count({ where: { OR: [{ authorId: userId }, { targetId: userId }] } }),
    ]);

    let resultado: 'APAGADO' | 'ANONIMIZADO' | 'VIROU_PASSAGEIRO' = 'APAGADO';
    await this.prisma.$transaction(
      async (tx) => {
        // Fotos dos documentos (CNH, CRLV, antecedentes) guardadas no banco.
        await tx.arquivo.deleteMany({ where: { ownerId: userId, tipo: { not: 'AVATAR' } } });
        // Em cascata: documentos, carros, carteira e extrato, saques,
        // jornadas, chamados e posicao. Corridas ficam, sem o motorista.
        await tx.driver.delete({ where: { id: driverId } });

        if (comoPassageiro > 0 || cadastroDePassageiro) {
          await tx.user.update({ where: { id: userId }, data: { role: UserRole.PASSENGER } });
          resultado = 'VIROU_PASSAGEIRO';
        } else if (pagamentos + avaliacoes === 0) {
          await tx.arquivo.deleteMany({ where: { ownerId: userId } });
          await tx.user.delete({ where: { id: userId } });
          resultado = 'APAGADO';
        } else {
          // Avaliacoes das corridas continuam apontando para a conta, entao
          // ela fica, mas sem nada que identifique a pessoa.
          await tx.arquivo.deleteMany({ where: { ownerId: userId } });
          await tx.refreshToken.deleteMany({ where: { userId } });
          await tx.device.deleteMany({ where: { userId } });
          await tx.userAddress.deleteMany({ where: { userId } });
          await tx.user.update({
            where: { id: userId },
            data: {
              role: UserRole.PASSENGER,
              status: UserStatus.DELETED,
              name: 'Motorista excluido',
              email: null,
              phone: `excl-${userId.replace(/-/g, '').slice(0, 15)}`,
              cpf: null,
              birthDate: null,
              passwordHash: null,
              avatarUrl: null,
              // Conta do teste automatico continua marcada (a limpeza do
              // teste apaga o resto); conta de verdade fica sem nada.
              metadata: contaDeTeste ? { teste: true } : {},
              blockedReason: 'Conta excluida pela Central.',
              deletedAt: new Date(),
            },
          });
          resultado = 'ANONIMIZADO';
        }

        await tx.auditLog.create({
          data: {
            actorId: adminId,
            actorRole: 'ADMIN',
            action: 'DRIVER_DELETED',
            entity: 'Driver',
            entityId: driverId,
            after: { resultado, corridas },
          },
        });
      },
      { timeout: 30_000 },
    );

    this.logger.log(`Motorista ${driverId} excluido pela Central (${resultado}, ${corridas} corrida(s)) por ${adminId}`);
    return { id: driverId, resultado, corridas };
  }

  /** Varios de uma vez (ex.: limpar os cadastros de teste). Um erro nao para os outros. */
  async adminDeleteMany(ids: string[], adminId: string) {
    const itens: Array<{ id: string; resultado?: string; corridas?: number; erro?: string }> = [];
    for (const id of ids) {
      try {
        itens.push(await this.adminDelete(id, adminId));
      } catch (e) {
        itens.push({ id, erro: (e as Error).message });
      }
    }
    return { excluidos: itens.filter((i) => !i.erro).length, itens };
  }

  /** Mapa do admin: motoristas online com posicao atual. */
  async adminActiveDrivers(ids: string[] | null = null) {
    const todos = await this.ativosNoMapa();
    return ids ? todos.filter((d) => ids.includes(d.driverId)) : todos;
  }

  private async ativosNoMapa() {
    return this.prisma.$queryRaw<
      Array<{
        driverId: string;
        name: string;
        phone: string;
        ratingAvg: number;
        totalRides: number;
        latitude: number;
        longitude: number;
        isAvailable: boolean;
        lastSeenAt: Date;
      }>
    >`
      SELECT
        d.id            AS "driverId",
        u.name          AS "name",
        u.phone         AS "phone",
        d.rating_avg::float AS "ratingAvg",
        d.total_rides   AS "totalRides",
        ST_Y(dl.location::geometry) AS "latitude",
        ST_X(dl.location::geometry) AS "longitude",
        dl.is_available AS "isAvailable",
        dl.last_seen_at AS "lastSeenAt"
      FROM drivers d
      JOIN users u ON u.id = d.user_id
      JOIN driver_locations dl ON dl.driver_id = d.id
      WHERE d.status = 'APPROVED' AND d.is_online = TRUE
        AND dl.last_seen_at > NOW() - INTERVAL '5 minutes'
      ORDER BY d.is_online DESC, dl.last_seen_at DESC
      LIMIT 500
    `;
  }

  // ------------------------------ HELPERS ------------------------------

  /** Situacao dos documentos obrigatorios do motorista. */
  async ultimosDocumentos(driverId: string) {
    const docs = await this.prisma.driverDocument.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, status: true, rejectionReason: true, fileUrl: true, uploadedAt: true },
    });
    const vistos = new Set<string>();
    return docs.filter((d) => (vistos.has(d.type) ? false : (vistos.add(d.type), true)));
  }

  async getDocumentProgress(driverId: string) {
    const documents = await this.prisma.driverDocument.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      select: { type: true, status: true, uploadedAt: true },
    });

    // Vale o ultimo enviado de cada tipo — MAS um documento ja aprovado
    // continua valendo enquanto a troca dele (foto nova, CNH renovada) espera
    // a Central ou se a troca for recusada. Assim o motorista aprovado que
    // troca a foto de perfil nao fica impedido de trabalhar (Evandro, 09/10/2026).
    const latestByType = new Map<string, { status: DocumentStatus; uploadedAt: Date | null }>();
    for (const doc of documents) {
      if (!latestByType.has(doc.type)) latestByType.set(doc.type, { status: doc.status, uploadedAt: doc.uploadedAt });
    }
    for (const doc of documents) {
      if (doc.status === DocumentStatus.APPROVED) latestByType.set(doc.type, { status: doc.status, uploadedAt: doc.uploadedAt });
    }

    const missing = REQUIRED_DRIVER_DOCUMENTS.filter((type) => !latestByType.has(type));
    const pending = REQUIRED_DRIVER_DOCUMENTS.filter(
      (type) => latestByType.get(type)?.status === DocumentStatus.PENDING,
    );
    const rejected = REQUIRED_DRIVER_DOCUMENTS.filter(
      (type) => latestByType.get(type)?.status === DocumentStatus.REJECTED,
    );

    return {
      total: REQUIRED_DRIVER_DOCUMENTS.length,
      sent: latestByType.size,
      approved: REQUIRED_DRIVER_DOCUMENTS.filter(
        (type) => latestByType.get(type)?.status === DocumentStatus.APPROVED,
      ).length,
      missing,
      pending,
      rejected,
      isComplete:
        missing.length === 0 &&
        pending.length === 0 &&
        rejected.length === 0 &&
        REQUIRED_DRIVER_DOCUMENTS.every(
          (type) => latestByType.get(type)?.status === DocumentStatus.APPROVED,
        ),
    };
  }

  private async withProgress(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        user: { select: { id: true, name: true, phone: true, email: true, avatarUrl: true } },
        vehicles: { where: { isActive: true } },
        wallet: true,
      },
    });

    return { ...driver, progress: await this.getDocumentProgress(driverId) };
  }
}

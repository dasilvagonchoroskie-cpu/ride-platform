import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../database/prisma.service';
import { CredencialFcm, enviarFcm } from './fcm';

/**
 * Notificacao push (Firebase) para os aplicativos — liga sozinha quando as
 * variaveis FCM_PROJECT_ID, FCM_CLIENT_EMAIL e FCM_PRIVATE_KEY existirem no
 * Render. Sem elas, nada e enviado (os aplicativos continuam com os vigias
 * proprios).
 *
 * - Motorista: "chamado" acorda o celular e abre a tela de chamado mesmo se
 *   o Android tiver fechado o aplicativo.
 * - Passageiro: aviso de cada etapa da corrida (aceita, chegando, chegou...).
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get credencial(): CredencialFcm | null {
    const f = this.config.fcm;
    return f.projectId && f.clientEmail && f.privateKey ? { projectId: f.projectId, clientEmail: f.clientEmail, privateKey: f.privateKey } : null;
  }

  get ligado(): boolean {
    return this.credencial != null;
  }

  /** Guarda o endereco de push do aparelho; tira de outra conta que usava o mesmo celular. */
  async registrar(userId: string, token: string, deviceId?: string | null): Promise<void> {
    const id = (deviceId?.trim() || `push-${token.slice(-24)}`).slice(0, 200);
    await this.prisma.device.updateMany({ where: { fcmToken: token, NOT: { userId } }, data: { fcmToken: null } });
    await this.prisma.device.upsert({
      where: { userId_deviceId: { userId, deviceId: id } },
      update: { fcmToken: token, lastSeenAt: new Date() },
      create: { userId, deviceId: id, platform: 'ANDROID', fcmToken: token },
    });
  }

  /** Saiu da conta: este celular nao recebe mais avisos dela. */
  async esquecer(userId: string, token?: string | null): Promise<void> {
    await this.prisma.device.updateMany({
      where: { userId, ...(token ? { fcmToken: token } : {}) },
      data: { fcmToken: null },
    });
  }

  /** Manda para todos os aparelhos da conta (sem esperar; erro so vai para o log). */
  paraUsuario(userId: string, data: Record<string, string>, validadeSegundos = 60): void {
    const c = this.credencial;
    if (!c) return;
    void (async () => {
      const aparelhos = await this.prisma.device.findMany({
        where: { userId, fcmToken: { not: null } },
        select: { id: true, fcmToken: true },
      });
      for (const a of aparelhos) {
        try {
          const r = await enviarFcm(c, a.fcmToken!, { data, validadeSegundos });
          if (r.invalido) await this.prisma.device.update({ where: { id: a.id }, data: { fcmToken: null } });
          else if (!r.ok) this.logger.warn(`Push nao foi: ${r.erro}`);
        } catch (e) {
          this.logger.warn(`Push falhou: ${(e as Error).message}`);
        }
      }
    })().catch((e) => this.logger.warn(`Push falhou: ${(e as Error).message}`));
  }

  /** Chamado novo para o motorista: acorda o celular. */
  async chamadoParaMotorista(driverId: string): Promise<void> {
    if (!this.ligado) return;
    const d = await this.prisma.driver.findUnique({ where: { id: driverId }, select: { userId: true } });
    if (d) this.paraUsuario(d.userId, { tipo: 'chamado' }, 30);
  }

  /** Etapa da corrida para o passageiro. */
  async etapaParaPassageiro(rideId: string, evento: 'ACEITA' | 'CHEGANDO' | 'CHEGOU' | 'INICIOU' | 'TERMINOU' | 'CANCELADA'): Promise<void> {
    if (!this.ligado) return;
    const r = await this.prisma.ride.findUnique({
      where: { id: rideId },
      select: {
        passengerId: true,
        vehicle: { select: { plate: true, model: true, color: true } },
        driver: { select: { user: { select: { name: true } } } },
      },
    });
    if (!r) return;
    const motorista = r.driver?.user?.name?.split(' ')[0] ?? 'O motorista';
    const carro = r.vehicle ? `${r.vehicle.model} ${r.vehicle.color} · ${r.vehicle.plate}` : '';
    const textos: Record<typeof evento, [string, string]> = {
      ACEITA: ['Motorista a caminho', `${motorista} aceitou sua corrida.${carro ? ` ${carro}.` : ''}`],
      CHEGANDO: ['Motorista a caminho', `${motorista} está indo até você.`],
      CHEGOU: ['Seu motorista chegou', `${motorista} está no local de embarque.${carro ? ` ${carro}.` : ''}`],
      INICIOU: ['Viagem iniciada', 'Boa viagem! Acompanhe pelo aplicativo.'],
      TERMINOU: ['Viagem concluída', 'Obrigado por viajar com a Fortaleza Mov. Avalie o motorista.'],
      CANCELADA: ['Corrida cancelada', `${motorista} cancelou a corrida. Peça de novo pelo aplicativo.`],
    };
    const [titulo, texto] = textos[evento];
    this.paraUsuario(r.passengerId, { tipo: 'corrida', evento, rideId, titulo, texto }, 300);
  }
}

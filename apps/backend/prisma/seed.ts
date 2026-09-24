/* eslint-disable no-console */
import { FareFlag, PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Bandeiras da plataforma.
 *
 * Modalidade unica: nao ha categoria de veiculo a escolher. O que muda o
 * preco e a HORA da corrida.
 *
 * A bandeirada ja inclui o primeiro quilometro e os tres primeiros
 * minutos parado. Passando disso, cobra-se so o excedente.
 */
const BANDEIRAS = [
  {
    flag: FareFlag.DIURNA,
    startHour: 6,
    endHour: 22,
    baseFareCents: 1000,
    perKmCents: 250,
    waitingPerMinuteCents: 50,
    freeDistanceMeters: 1000,
    freeWaitingSeconds: 180,
    minFareCents: 1000,
    cancellationFeeCents: 500,
    commissionPercent: 20,
  },
  {
    flag: FareFlag.NOTURNA,
    startHour: 22,
    endHour: 6,
    baseFareCents: 2000,
    perKmCents: 250,
    waitingPerMinuteCents: 50,
    freeDistanceMeters: 1000,
    freeWaitingSeconds: 180,
    minFareCents: 2000,
    cancellationFeeCents: 500,
    commissionPercent: 20,
  },
];

async function main(): Promise<void> {
  console.log('Semeando banco...');

  for (const bandeira of BANDEIRAS) {
    await prisma.fareConfig.upsert({
      where: { flag: bandeira.flag },
      create: { ...bandeira, isActive: true },
      update: { ...bandeira, isActive: true },
    });
    const reais = (bandeira.baseFareCents / 100).toFixed(2).replace('.', ',');
    console.log(`  bandeira ${bandeira.flag}: R$ ${reais} das ${bandeira.startHour}h as ${bandeira.endHour}h`);
  }

  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';
  const admin = await prisma.user.upsert({
    where: { phone: '+5511999990000' },
    create: {
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      name: 'Administrador',
      phone: '+5511999990000',
      email: 'admin@ride.local',
      passwordHash: await bcrypt.hash(adminPassword, 10),
      phoneVerifiedAt: new Date(),
      emailVerifiedAt: new Date(),
    },
    update: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
  });
  console.log(`  admin ok: ${admin.email} (senha: ${adminPassword})`);

  for (const setting of SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      create: { key: setting.key, value: setting.value, description: setting.description },
      update: { description: setting.description },
    });
  }
  console.log(`  ${SETTINGS.length} configuracoes ok`);

  const coupon = await prisma.coupon.upsert({
    where: { code: 'PRIMEIRACORRIDA' },
    create: {
      code: 'PRIMEIRACORRIDA',
      description: 'Desconto de R$ 10 na primeira corrida',
      discountType: 'FIXED',
      discountValue: 1000,
      maxDiscountCents: 1000,
      minFareCents: 1500,
      maxUses: 1000,
      maxUsesPerUser: 1,
      isActive: true,
    },
    update: { isActive: true },
  });
  console.log(`  cupom ok: ${coupon.code}`);

  console.log('Seed concluido.');
}

main()
  .catch((error) => {
    console.error('Falha no seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

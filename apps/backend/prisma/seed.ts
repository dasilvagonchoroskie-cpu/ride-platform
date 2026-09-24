/* eslint-disable no-console */
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

interface CategorySeed {
  slug: string;
  name: string;
  description: string;
  seats: number;
  sortOrder: number;
  fare: {
    baseFareCents: number;
    perKmCents: number;
    perMinuteCents: number;
    minFareCents: number;
    bookingFeeCents: number;
    cancellationFeeCents: number;
    waitingPerMinuteCents: number;
  };
}

const CATEGORIES: CategorySeed[] = [
  {
    slug: 'moto',
    name: 'Moto',
    description: 'Rapido e economico para um passageiro',
    seats: 1,
    sortOrder: 1,
    fare: { baseFareCents: 300, perKmCents: 120, perMinuteCents: 20, minFareCents: 600, bookingFeeCents: 100, cancellationFeeCents: 300, waitingPerMinuteCents: 30 },
  },
  {
    slug: 'ride',
    name: 'Ride',
    description: 'Carro popular para ate 4 pessoas',
    seats: 4,
    sortOrder: 2,
    fare: { baseFareCents: 500, perKmCents: 180, perMinuteCents: 30, minFareCents: 900, bookingFeeCents: 150, cancellationFeeCents: 500, waitingPerMinuteCents: 50 },
  },
  {
    slug: 'comfort',
    name: 'Comfort',
    description: 'Carros mais novos e espacosos',
    seats: 4,
    sortOrder: 3,
    fare: { baseFareCents: 700, perKmCents: 240, perMinuteCents: 40, minFareCents: 1200, bookingFeeCents: 200, cancellationFeeCents: 600, waitingPerMinuteCents: 60 },
  },
  {
    slug: 'black',
    name: 'Black',
    description: 'Carros de luxo com motorista',
    seats: 4,
    sortOrder: 4,
    fare: { baseFareCents: 1100, perKmCents: 380, perMinuteCents: 60, minFareCents: 2000, bookingFeeCents: 300, cancellationFeeCents: 900, waitingPerMinuteCents: 90 },
  },
  {
    slug: 'van',
    name: 'Van',
    description: 'Ate 6 passageiros, ideal para grupos',
    seats: 6,
    sortOrder: 5,
    fare: { baseFareCents: 900, perKmCents: 300, perMinuteCents: 45, minFareCents: 1800, bookingFeeCents: 250, cancellationFeeCents: 800, waitingPerMinuteCents: 70 },
  },
];

const SETTINGS = [
  { key: 'platform.commission_percent', value: 20, description: 'Comissao padrao da plataforma (%)' },
  { key: 'ride.offer_ttl_seconds', value: 15, description: 'Tempo de resposta da oferta de corrida' },
  { key: 'ride.search_radius_km', value: 3, description: 'Raio inicial de busca de motorista' },
  { key: 'ride.max_search_radius_km', value: 15, description: 'Raio maximo de busca' },
  { key: 'payout.min_cents', value: 5000, description: 'Valor minimo para saque (centavos)' },
  { key: 'driver.location_interval_seconds', value: 5, description: 'Intervalo de envio de posicao do motorista' },
];

async function main(): Promise<void> {
  console.log('Semeando banco...');

  for (const category of CATEGORIES) {
    const record = await prisma.vehicleCategory.upsert({
      where: { slug: category.slug },
      create: {
        slug: category.slug,
        name: category.name,
        description: category.description,
        seats: category.seats,
        sortOrder: category.sortOrder,
        isActive: true,
      },
      update: {
        name: category.name,
        description: category.description,
        seats: category.seats,
        sortOrder: category.sortOrder,
        isActive: true,
      },
    });

    const activeFare = await prisma.fareConfig.findFirst({
      where: { categoryId: record.id, isActive: true },
    });

    if (!activeFare) {
      await prisma.fareConfig.create({
        data: {
          categoryId: record.id,
          ...category.fare,
          surgeEnabled: true,
          maxSurgeMultiplier: 2,
          commissionPercent: 20,
          isActive: true,
        },
      });
      console.log(`  tarifa criada: ${category.slug}`);
    }

    console.log(`  categoria ok: ${category.slug}`);
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

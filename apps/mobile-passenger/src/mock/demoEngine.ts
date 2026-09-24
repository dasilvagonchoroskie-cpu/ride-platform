import type { Coords } from '../services/location';
import { buildRoute, distanceKm } from '../lib/geo';

/**
 * Motor de demonstracao: simula o backend inteiro no dispositivo.
 * Usado quando a API nao esta configurada ou nao responde, para que o APK
 * seja utilizavel sem servidor. Todo o fluxo (estimativa -> pareamento ->
 * viagem -> conclusao -> historico) roda localmente.
 */

export interface DemoCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  seats: number;
  etaMinutes: number;
  priceCents: number;
  priceRangeCents: [number, number];
  icon: string;
}

export interface DemoDriver {
  id: string;
  name: string;
  rating: number;
  totalRides: number;
  vehicle: string;
  plate: string;
  color: string;
  photoSeed: string;
  position: Coords;
}

export interface DemoRide {
  id: string;
  code: string;
  status:
    | 'SEARCHING'
    | 'DRIVER_ASSIGNED'
    | 'DRIVER_ARRIVING'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED_BY_PASSENGER';
  pickup: { address: string; coords: Coords };
  dropoff: { address: string; coords: Coords };
  category: DemoCategory;
  driver: DemoDriver | null;
  distanceMeters: number;
  durationSeconds: number;
  fareCents: number;
  paymentMethod: string;
  pin: string;
  createdAt: string;
  finishedAt?: string;
  rating?: number;
}

const CATEGORY_BASE: Array<{
  slug: string;
  name: string;
  description: string;
  seats: number;
  base: number;
  perKm: number;
  perMin: number;
  min: number;
  icon: string;
}> = [
  { slug: 'moto', name: 'Moto', description: 'Rapido e economico', seats: 1, base: 300, perKm: 120, perMin: 20, min: 600, icon: 'bike' },
  { slug: 'ride', name: 'Ride', description: 'Carro popular, ate 4', seats: 4, base: 500, perKm: 180, perMin: 30, min: 900, icon: 'car' },
  { slug: 'comfort', name: 'Comfort', description: 'Mais novo e espacoso', seats: 4, base: 700, perKm: 240, perMin: 40, min: 1200, icon: 'car-sport' },
  { slug: 'black', name: 'Black', description: 'Luxo com motorista', seats: 4, base: 1100, perKm: 380, perMin: 60, min: 2000, icon: 'diamond' },
  { slug: 'van', name: 'Van', description: 'Ate 6 passageiros', seats: 6, base: 900, perKm: 300, perMin: 45, min: 1800, icon: 'bus' },
];

const DRIVER_POOL: Array<Omit<DemoDriver, 'position'>> = [
  { id: 'd1', name: 'Carlos Mendes', rating: 4.92, totalRides: 3120, vehicle: 'Toyota Corolla', plate: 'FKR-2A18', color: 'Prata', photoSeed: 'cm' },
  { id: 'd2', name: 'Ana Paula Souza', rating: 4.98, totalRides: 1874, vehicle: 'Hyundai HB20', plate: 'GTP-7C42', color: 'Branco', photoSeed: 'ap' },
  { id: 'd3', name: 'Roberto Lima', rating: 4.85, totalRides: 5210, vehicle: 'Chevrolet Onix', plate: 'HJM-9D07', color: 'Cinza', photoSeed: 'rl' },
  { id: 'd4', name: 'Juliana Reis', rating: 4.95, totalRides: 962, vehicle: 'Honda City', plate: 'LQN-4B55', color: 'Preto', photoSeed: 'jr' },
  { id: 'd5', name: 'Marcos Oliveira', rating: 4.79, totalRides: 4410, vehicle: 'Fiat Cronos', plate: 'KDS-1E33', color: 'Vermelho', photoSeed: 'mo' },
];

const ADDRESSES = [
  'Av. Paulista, 1578 — Bela Vista, Sao Paulo',
  'Rua Augusta, 902 — Consolacao, Sao Paulo',
  'Av. Brigadeiro Faria Lima, 2232 — Jardim Paulistano',
  'Rua Oscar Freire, 585 — Jardins, Sao Paulo',
  'Av. Ibirapuera, 2033 — Moema, Sao Paulo',
  'Rua Vergueiro, 1470 — Liberdade, Sao Paulo',
  'Av. Reboucas, 3970 — Pinheiros, Sao Paulo',
  'Rua Teodoro Sampaio, 1200 — Pinheiros, Sao Paulo',
  'Av. Faria Lima, 3477 — Itaim Bibi, Sao Paulo',
  'Rua da Consolacao, 2416 — Consolacao, Sao Paulo',
  'Av. Sumare, 300 — Perdizes, Sao Paulo',
  'Rua Harmonia, 200 — Vila Madalena, Sao Paulo',
];

const PAYMENTS = ['Pix', 'Cartao de credito •••• 4291', 'Dinheiro', 'Carteira Ride'];

let rideCounter = 4820;

function pick<T>(list: T[], index: number): T {
  return list[index % list.length];
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function demoSuggestions(origin: Coords): Array<{ address: string; coords: Coords; distanceKm: number }> {
  return ADDRESSES.map((address) => {
    const coords: Coords = {
      latitude: origin.latitude + randomBetween(-0.045, 0.045),
      longitude: origin.longitude + randomBetween(-0.045, 0.045),
    };
    return { address, coords, distanceKm: Number(distanceKm(origin, coords).toFixed(2)) };
  }).sort((a, b) => a.distanceKm - b.distanceKm);
}

export function demoEstimate(origin: Coords, destination: Coords): {
  categories: DemoCategory[];
  distanceMeters: number;
  durationSeconds: number;
} {
  const km = Math.max(0.8, distanceKm(origin, destination));
  const distanceMeters = Math.round(km * 1000);
  // Velocidade media urbana ~24 km/h
  const durationSeconds = Math.round((km / 24) * 3600);

  const categories = CATEGORY_BASE.map((base) => {
    const raw = base.base + base.perKm * km + base.perMin * (durationSeconds / 60);
    const priceCents = Math.max(base.min, Math.round(raw / 10) * 10);
    return {
      id: base.slug,
      slug: base.slug,
      name: base.name,
      description: base.description,
      seats: base.seats,
      etaMinutes: Math.max(1, Math.round(randomBetween(2, 7))),
      priceCents,
      priceRangeCents: [priceCents, Math.round(priceCents * 1.15)] as [number, number],
      icon: base.icon,
    };
  });

  return { categories, distanceMeters, durationSeconds };
}

export function demoNearbyDrivers(origin: Coords, count = 4): DemoDriver[] {
  return Array.from({ length: count }, (_, index) => ({
    ...pick(DRIVER_POOL, index + Math.floor(Math.random() * DRIVER_POOL.length)),
    position: {
      latitude: origin.latitude + randomBetween(-0.012, 0.012),
      longitude: origin.longitude + randomBetween(-0.012, 0.012),
    },
  }));
}

export function demoCreateRide(params: {
  origin: Coords;
  destination: Coords;
  pickupAddress: string;
  dropoffAddress: string;
  category: DemoCategory;
  paymentMethod: string;
}): DemoRide {
  rideCounter += 1;
  const km = Math.max(0.8, distanceKm(params.origin, params.destination));
  const distanceMeters = Math.round(km * 1000);
  const durationSeconds = Math.round((km / 24) * 3600);

  return {
    id: `demo-ride-${Date.now()}`,
    code: `RD${rideCounter}`,
    status: 'SEARCHING',
    pickup: { address: params.pickupAddress, coords: params.origin },
    dropoff: { address: params.dropoffAddress, coords: params.destination },
    category: params.category,
    driver: null,
    distanceMeters,
    durationSeconds,
    fareCents: params.category.priceCents,
    paymentMethod: params.paymentMethod,
    pin: String(Math.floor(1000 + Math.random() * 8999)),
    createdAt: new Date().toISOString(),
  };
}

export function demoAssignDriver(ride: DemoRide): { ride: DemoRide; route: Coords[] } {
  const driver = {
    ...pick(DRIVER_POOL, Math.floor(Math.random() * DRIVER_POOL.length)),
    position: {
      latitude: ride.pickup.coords.latitude + randomBetween(-0.008, 0.008),
      longitude: ride.pickup.coords.longitude + randomBetween(-0.008, 0.008),
    },
  };

  return {
    ride: { ...ride, driver, status: 'DRIVER_ASSIGNED' },
    route: buildRoute(driver.position, ride.pickup.coords, 30),
  };
}

export function demoHistory(origin: Coords): DemoRide[] {
  const destinations = demoSuggestions(origin).slice(0, 6);

  return destinations.map((destination, index) => {
    const estimate = demoEstimate(origin, destination.coords);
    const category = pick(estimate.categories, index);
    const finishedAt = new Date(Date.now() - (index + 1) * 26 * 3600 * 1000).toISOString();

    return {
      id: `demo-history-${index}`,
      code: `RD${4700 + index}`,
      status: 'COMPLETED' as const,
      pickup: { address: ADDRESSES[0], coords: origin },
      dropoff: { address: destination.address, coords: destination.coords },
      category,
      driver: { ...pick(DRIVER_POOL, index), position: destination.coords },
      distanceMeters: estimate.distanceMeters,
      durationSeconds: estimate.durationSeconds,
      fareCents: category.priceCents,
      paymentMethod: pick(PAYMENTS, index),
      pin: String(1000 + index * 137),
      createdAt: finishedAt,
      finishedAt,
      rating: index % 3 === 0 ? 5 : 4,
    };
  });
}

export function demoPaymentMethods(): Array<{ id: string; label: string; detail: string; type: string }> {
  return [
    { id: 'pm1', label: 'Pix', detail: 'Aprovacao imediata', type: 'PIX' },
    { id: 'pm2', label: 'Cartao de credito', detail: 'Mastercard •••• 4291', type: 'CREDIT_CARD' },
    { id: 'pm3', label: 'Dinheiro', detail: 'Pague ao motorista', type: 'CASH' },
    { id: 'pm4', label: 'Carteira Ride', detail: 'Saldo R$ 42,50', type: 'WALLET' },
  ];
}

export { PAYMENTS as DEMO_PAYMENT_LABELS, ADDRESSES as DEMO_ADDRESSES };

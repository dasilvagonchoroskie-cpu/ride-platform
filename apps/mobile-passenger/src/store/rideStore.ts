import { create } from 'zustand';
import { API_URL } from '../services/config';
import { apiRequest } from '../services/api';
import { getItem, setItem, removeItem, STORAGE_KEYS } from '../services/storage';
import type { Coords } from '../services/location';
import { buildRoute } from '../lib/geo';
import {
  demoAssignDriver,
  demoCreateRide,
  demoEstimate,
  demoHistory,
  demoNearbyDrivers,
  type DemoCategory,
  type DemoDriver,
  type DemoRide,
} from '../mock/demoEngine';
import { useAppStore } from './appStore';

interface RideState {
  activeRide: DemoRide | null;
  driverRoute: Coords[];
  tripRoute: Coords[];
  history: DemoRide[];
  categories: DemoCategory[];
  nearbyDrivers: DemoDriver[];
  estimating: boolean;
  error: string | null;
  estimate: (origin: Coords, destination: Coords) => Promise<DemoCategory[]>;
  requestRide: (params: {
    origin: Coords;
    destination: Coords;
    pickupAddress: string;
    dropoffAddress: string;
    category: DemoCategory;
    paymentMethod: string;
  }) => Promise<DemoRide>;
  advanceRide: () => void;
  completeRide: (rating?: number) => Promise<void>;
  cancelRide: () => Promise<void>;
  loadHistory: (origin: Coords) => Promise<void>;
  restoreActiveRide: () => Promise<void>;
  reset: () => void;
}

const isDemo = () => useAppStore.getState().dataSource !== 'api' || !API_URL;

export const useRideStore = create<RideState>((set, get) => ({
  activeRide: null,
  driverRoute: [],
  tripRoute: [],
  history: [],
  categories: [],
  nearbyDrivers: [],
  estimating: false,
  error: null,

  async estimate(origin, destination) {
    set({ estimating: true, error: null });
    try {
      let categories: DemoCategory[];

      if (isDemo()) {
        categories = demoEstimate(origin, destination).categories;
        set({ nearbyDrivers: demoNearbyDrivers(origin) });
      } else {
        const response = await apiRequest<{
          options: Array<{
            category: { id: string; slug: string; name: string; description: string | null; seats: number };
            etaMinutes: number;
            priceCents: number;
            priceRangeCents: [number, number];
          }>;
        }>('post', '/rides/estimate', {
          pickup: { latitude: origin.latitude, longitude: origin.longitude },
          dropoff: { latitude: destination.latitude, longitude: destination.longitude },
        });

        categories = response.options.map((option) => ({
          id: option.category.id,
          slug: option.category.slug,
          name: option.category.name,
          description: option.category.description ?? '',
          seats: option.category.seats,
          etaMinutes: option.etaMinutes,
          priceCents: option.priceCents,
          priceRangeCents: option.priceRangeCents,
          icon: 'car',
        }));
      }

      set({ categories });
      return categories;
    } catch {
      // Fallback silencioso: a estimativa local mantem o app utilizavel.
      const categories = demoEstimate(origin, destination).categories;
      useAppStore.getState().forceDemo();
      set({ categories, nearbyDrivers: demoNearbyDrivers(origin) });
      return categories;
    } finally {
      set({ estimating: false });
    }
  },

  async requestRide(params) {
    let ride: DemoRide;

    if (isDemo()) {
      ride = demoCreateRide(params);
    } else {
      try {
        const response = await apiRequest<{ ride: DemoRide }>('post', '/rides', {
          pickup: { address: params.pickupAddress, latitude: params.origin.latitude, longitude: params.origin.longitude },
          dropoff: {
            address: params.dropoffAddress,
            latitude: params.destination.latitude,
            longitude: params.destination.longitude,
          },
          categoryId: params.category.id,
          paymentMethodType: 'PIX',
        });
        ride = response.ride;
      } catch {
        useAppStore.getState().forceDemo();
        ride = demoCreateRide(params);
      }
    }

    await setItem(STORAGE_KEYS.activeRide, JSON.stringify(ride));
    set({ activeRide: ride, driverRoute: [], tripRoute: [] });
    return ride;
  },

  /** Avanca a maquina de estados da corrida (simulacao de progresso). */
  advanceRide() {
    const ride = get().activeRide;
    if (!ride) return;

    if (ride.status === 'SEARCHING') {
      const { ride: assigned, route } = demoAssignDriver(ride);
      set({ activeRide: { ...assigned, status: 'DRIVER_ARRIVING' }, driverRoute: route });
      return;
    }

    if (ride.status === 'DRIVER_ASSIGNED' || ride.status === 'DRIVER_ARRIVING') {
      set({ activeRide: { ...ride, status: 'IN_PROGRESS' }, tripRoute: buildRoute(ride.pickup.coords, ride.dropoff.coords, 40) });
      return;
    }

    if (ride.status === 'IN_PROGRESS') {
      set({
        activeRide: { ...ride, status: 'COMPLETED', finishedAt: new Date().toISOString() },
      });
    }
  },

  async completeRide(rating) {
    const ride = get().activeRide;
    if (!ride) return;

    const finished: DemoRide = {
      ...ride,
      status: 'COMPLETED',
      finishedAt: ride.finishedAt ?? new Date().toISOString(),
      rating: rating ?? ride.rating,
    };

    const history = [finished, ...get().history.filter((item) => item.id !== finished.id)];
    set({ activeRide: null, history, driverRoute: [], tripRoute: [] });
    await removeItem(STORAGE_KEYS.activeRide);
  },

  async cancelRide() {
    const ride = get().activeRide;
    if (ride) {
      const cancelled: DemoRide = { ...ride, status: 'CANCELLED_BY_PASSENGER' };
      set({ history: [cancelled, ...get().history] });
    }
    set({ activeRide: null, driverRoute: [], tripRoute: [] });
    await removeItem(STORAGE_KEYS.activeRide);
  },

  async loadHistory(origin) {
    if (isDemo()) {
      const existing = get().history;
      const merged = [...existing];
      for (const item of demoHistory(origin)) {
        if (!merged.some((entry) => entry.id === item.id)) merged.push(item);
      }
      set({ history: merged });
      return;
    }

    try {
      const response = await apiRequest<{ items: DemoRide[] }>('get', '/rides/history', { limit: 30 });
      set({ history: response.items });
    } catch {
      set({ history: demoHistory(origin) });
    }
  },

  async restoreActiveRide() {
    const raw = await getItem(STORAGE_KEYS.activeRide);
    if (!raw) return;
    try {
      set({ activeRide: JSON.parse(raw) as DemoRide });
    } catch {
      await removeItem(STORAGE_KEYS.activeRide);
    }
  },

  reset() {
    set({ activeRide: null, driverRoute: [], tripRoute: [], categories: [], nearbyDrivers: [] });
  },
}));

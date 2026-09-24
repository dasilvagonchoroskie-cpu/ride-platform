import { create } from 'zustand';
import { DEMO_MODE_SETTING, API_URL } from '../services/config';
import { checkApiHealth } from '../services/api';
import { getItem, setItem, STORAGE_KEYS } from '../services/storage';
import type { Coords } from '../services/location';

export type DataSource = 'api' | 'demo' | 'unknown';

interface AppState {
  bootstrapped: boolean;
  dataSource: DataSource;
  apiUrl: string;
  coords: Coords | null;
  locationGranted: boolean;
  recentPlaces: string[];
  bootstrap: (coords: Coords, granted: boolean) => Promise<void>;
  setCoords: (coords: Coords) => void;
  addRecentPlace: (address: string) => Promise<void>;
  forceDemo: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  bootstrapped: false,
  dataSource: 'unknown',
  apiUrl: API_URL,
  coords: null,
  locationGranted: false,
  recentPlaces: [],

  async bootstrap(coords, granted) {
    let dataSource: DataSource = 'demo';

    if (DEMO_MODE_SETTING === 'true') {
      dataSource = 'demo';
    } else if (DEMO_MODE_SETTING === 'false') {
      dataSource = 'api';
    } else {
      dataSource = (await checkApiHealth()) ? 'api' : 'demo';
    }

    const stored = await getItem(STORAGE_KEYS.recentPlaces);
    const recentPlaces: string[] = stored ? (JSON.parse(stored) as string[]) : [];

    set({ bootstrapped: true, dataSource, coords, locationGranted: granted, recentPlaces });
  },

  setCoords(coords) {
    set({ coords });
  },

  async addRecentPlace(address) {
    const next = [address, ...get().recentPlaces.filter((item) => item !== address)].slice(0, 6);
    set({ recentPlaces: next });
    await setItem(STORAGE_KEYS.recentPlaces, JSON.stringify(next));
  },

  forceDemo() {
    set({ dataSource: 'demo' });
  },
}));

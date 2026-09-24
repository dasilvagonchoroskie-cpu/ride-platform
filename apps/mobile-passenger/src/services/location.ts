import * as Location from 'expo-location';

export interface Coords {
  latitude: number;
  longitude: number;
}

export const FALLBACK_COORDS: Coords = { latitude: -23.5613, longitude: -46.6565 };

export interface LocationResult {
  coords: Coords;
  granted: boolean;
  mocked: boolean;
}

/** Pede permissao e devolve a posicao atual (com fallback para Sao Paulo). */
export async function getCurrentCoords(): Promise<LocationResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { coords: FALLBACK_COORDS, granted: false, mocked: true };
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      coords: { latitude: position.coords.latitude, longitude: position.coords.longitude },
      granted: true,
      mocked: false,
    };
  } catch {
    return { coords: FALLBACK_COORDS, granted: false, mocked: true };
  }
}

export function formatCoords(coords: Coords): string {
  return `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
}

/** Design tokens do app do passageiro. Paleta escura, alto contraste. */

export const colors = {
  background: '#0B0B0F',
  surface: '#14141B',
  surfaceElevated: '#1C1C26',
  border: '#2A2A38',
  text: '#F5F5F7',
  textMuted: '#9A9AAE',
  textFaint: '#63637A',
  primary: '#00D775',
  primaryDark: '#00A85B',
  primarySoft: 'rgba(0, 215, 117, 0.14)',
  danger: '#FF4D5E',
  dangerSoft: 'rgba(255, 77, 94, 0.14)',
  warning: '#FFB020',
  info: '#3B9DFF',
  mapBackground: '#101018',
  mapRoad: '#23232F',
  mapRoadLight: '#2E2E3D',
  mapBlock: '#181822',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.8 },
  title: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.4 },
  heading: { fontSize: 19, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  label: { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.6 },
} as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

/** Centro inicial do mapa (Sao Paulo). Trocado pela posicao real do usuario. */
export const DEFAULT_REGION = {
  latitude: -23.5613,
  longitude: -46.6565,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

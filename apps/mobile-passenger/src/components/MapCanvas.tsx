import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { Coords } from '../services/location';

/**
 * Mapa renderizado com SVG — sem dependencia nativa de Google Maps, portanto
 * funciona em qualquer APK sem chave de API.
 *
 * Para usar o mapa real do Google: instale `react-native-maps`, defina
 * GOOGLE_MAPS_ANDROID_KEY e troque este componente por MapCanvasGoogle
 * (o exemplo esta em src/components/MapCanvasGoogle.example.tsx).
 * A interface de props e a mesma, entao a troca e de uma linha.
 */

export interface MapMarker {
  id: string;
  coords: Coords;
  kind: 'pickup' | 'dropoff' | 'driver' | 'car';
  label?: string;
}

export interface MapCanvasProps {
  center: Coords;
  markers: MapMarker[];
  route?: Coords[];
  driverRoute?: Coords[];
  height?: number;
  zoom?: number;
  interactive?: boolean;
}

const VIEW_W = 360;

function project(coords: Coords, center: Coords, span: number): { x: number; y: number } {
  const x = VIEW_W / 2 + ((coords.longitude - center.longitude) / span) * VIEW_W;
  const y = VIEW_W / 2 - ((coords.latitude - center.latitude) / span) * VIEW_W;
  return { x, y };
}

export function MapCanvas({
  center,
  markers,
  route = [],
  driverRoute = [],
  height = 280,
  zoom = 0.05,
}: MapCanvasProps) {
  const span = zoom;
  const viewBoxHeight = height;

  const toPath = (points: Coords[]): string =>
    points
      .map((point, index) => {
        const { x, y } = project(point, center, span);
        const sy = (y / VIEW_W) * viewBoxHeight;
        return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${sy.toFixed(1)}`;
      })
      .join(' ');

  const grid = useMemo(() => {
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; strong: boolean }> = [];
    for (let i = 0; i <= 12; i += 1) {
      const step = (i / 12) * viewBoxHeight;
      lines.push({ x1: 0, y1: step, x2: VIEW_W, y2: step, strong: i % 3 === 0 });
      lines.push({ x1: (i / 12) * VIEW_W, y1: 0, x2: (i / 12) * VIEW_W, y2: viewBoxHeight, strong: i % 4 === 0 });
    }
    return lines;
  }, [viewBoxHeight]);

  const markerPosition = (coords: Coords) => {
    const { x, y } = project(coords, center, span);
    return { x, y: (y / VIEW_W) * viewBoxHeight };
  };

  return (
    <View style={[styles.wrapper, { height }]}>
      <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_W} ${viewBoxHeight}`}>
        <Rect x={0} y={0} width={VIEW_W} height={viewBoxHeight} fill={colors.mapBackground} />

        {grid.map((line, index) => (
          <Line
            key={`g${index}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={line.strong ? colors.mapRoad : colors.mapRoadLight}
            strokeWidth={line.strong ? 5 : 2}
            strokeOpacity={line.strong ? 0.55 : 0.3}
          />
        ))}

        <Circle
          cx={VIEW_W / 2}
          cy={viewBoxHeight / 2}
          r={Math.min(VIEW_W, viewBoxHeight) / 2 - 6}
          fill="none"
          stroke={colors.border}
          strokeWidth={1}
          strokeDasharray="4 8"
        />

        {driverRoute.length > 1 ? (
          <Path d={toPath(driverRoute)} stroke={colors.info} strokeWidth={3} fill="none" strokeLinecap="round" />
        ) : null}

        {route.length > 1 ? (
          <Path d={toPath(route)} stroke={colors.primary} strokeWidth={4} fill="none" strokeLinecap="round" />
        ) : null}

        {markers.map((marker) => {
          const { x, y } = markerPosition(marker.coords);
          const fill =
            marker.kind === 'pickup'
              ? colors.primary
              : marker.kind === 'dropoff'
                ? colors.danger
                : colors.info;
          const size = marker.kind === 'car' ? 7 : 8;

          return (
            <React.Fragment key={marker.id}>
              <Circle cx={x} cy={y} r={size + 7} fill={fill} fillOpacity={0.18} />
              <Circle cx={x} cy={y} r={size} fill={fill} stroke={colors.background} strokeWidth={2} />
            </React.Fragment>
          );
        })}
      </Svg>

      <View style={styles.badge}>
        <Text style={styles.badgeText}>MAPA SIMULADO</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.mapBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(11,11,15,0.82)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: { ...typography.label, color: colors.textFaint, fontSize: 9 },
});

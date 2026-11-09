import { distanceM, type LatLng } from '../common/geo.js';

export interface TrackPoint extends LatLng {
  accuracyM: number | null;
  recordedAt: Date;
}

/** Más rápido que esto (≈250 km/h) entre dos lecturas es un salto del GPS, no un trayecto. */
const MAX_PLAUSIBLE_SPEED_MPS = 70;

/**
 * Kilómetros recorridos sumando tramos entre posiciones consecutivas.
 * Ignora lecturas imprecisas y saltos imposibles del GPS para no inflar la cifra.
 */
export function distanceKm(points: TrackPoint[], maxAccuracyM: number): number {
  let total = 0;
  let previous: TrackPoint | undefined;
  for (const point of points) {
    if (point.accuracyM !== null && point.accuracyM > maxAccuracyM) continue;
    if (previous) {
      const meters = distanceM(previous, point);
      const seconds =
        (point.recordedAt.getTime() - previous.recordedAt.getTime()) / 1000;
      if (seconds <= 0 || meters / seconds > MAX_PLAUSIBLE_SPEED_MPS) continue;
      total += meters;
    }
    previous = point;
  }
  return Math.round(total / 10) / 100;
}

/** Reduce a `max` puntos tomando uno cada N, conservando siempre el primero y el último. */
export function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  return points.filter(
    (_, index) => index % step === 0 || index === points.length - 1,
  );
}

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Recuadro que contiene todo: el front lo usa para encuadrar el mapa. */
export function boundsOf(points: LatLng[]): Bounds | null {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  return {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
}

/**
 * Orden real en que se llegó a cada cliente (1, 2, 3…) según `arrivedAt`.
 * Las visitas sin llegada quedan en `null`. Comparado con `sequence` muestra
 * si el chofer siguió el orden planeado.
 */
export function actualOrder(
  visits: { id: string; arrivedAt: Date | null }[],
): Map<string, number> {
  const order = new Map<string, number>();
  visits
    .filter((v) => v.arrivedAt)
    .sort((a, b) => a.arrivedAt!.getTime() - b.arrivedAt!.getTime())
    .forEach((v, index) => order.set(v.id, index + 1));
  return order;
}

/** Minutos entre dos instantes, redondeado a un decimal; `null` si falta alguno. */
export function minutesBetween(
  from: Date | null,
  to: Date | null,
): number | null {
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 6000) / 10;
}

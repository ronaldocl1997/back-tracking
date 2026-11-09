import { distanceM } from '../common/geo.js';
import type { VisitStatus, VisitMethod } from '../generated/prisma/enums.js';

export interface DetectorVisit {
  id: string;
  status: VisitStatus;
  method: VisitMethod | null;
  arrivedAt: Date | null;
  departedAt: Date | null;
  client: { latitude: number; longitude: number; geofenceRadiusM: number };
}

export interface DetectorPing {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  recordedAt: Date;
}

export interface DetectorOptions {
  /** Tiempo mínimo dentro del radio para confirmar la visita. */
  dwellMs: number;
  /** Posiciones con peor precisión no deciden nada. */
  maxAccuracyM: number;
  /**
   * Para salir hay que alejarse más que el radio (radio × factor). Evita que el
   * ruido del GPS en el borde marque entradas y salidas falsas.
   */
  exitFactor?: number;
}

/** Lo que cambió en una visita; se guarda tal cual con `prisma.visit.update`. */
export interface VisitChange {
  status?: VisitStatus;
  method?: VisitMethod;
  arrivedAt?: Date | null;
  departedAt?: Date;
  latitude?: number | null;
  longitude?: number | null;
  distanceM?: number | null;
}

/**
 * Decide llegadas y salidas a partir de posiciones ordenadas por `recordedAt`.
 *
 * - Primera posición dentro del radio de una visita PENDING: llegada tentativa (`arrivedAt`).
 * - Sigue dentro `dwellMs` o más: VISITED (AUTO_GEOFENCE).
 * - Sale (más allá de radio × exitFactor) antes de confirmar: se descarta la llegada.
 * - Ya VISITED y sale: `departedAt`.
 *
 * Es una función pura: no toca la base de datos y no muta sus entradas.
 */
export function detectVisits(
  visits: DetectorVisit[],
  pings: DetectorPing[],
  { dwellMs, maxAccuracyM, exitFactor = 1.2 }: DetectorOptions,
): Map<string, VisitChange> {
  const state = new Map(visits.map((v) => [v.id, { ...v }]));
  const changes = new Map<string, VisitChange>();
  const change = (id: string, patch: VisitChange) =>
    changes.set(id, { ...changes.get(id), ...patch });

  for (const ping of pings) {
    if (ping.accuracyM !== null && ping.accuracyM > maxAccuracyM) continue;

    for (const visit of state.values()) {
      const distance = distanceM(ping, visit.client);
      const radius = visit.client.geofenceRadiusM;
      const inside = distance <= radius;
      const outside = distance > radius * exitFactor;

      if (visit.status === 'PENDING') {
        if (inside && !visit.arrivedAt) {
          visit.arrivedAt = ping.recordedAt;
          change(visit.id, {
            arrivedAt: ping.recordedAt,
            latitude: ping.latitude,
            longitude: ping.longitude,
            distanceM: Math.round(distance),
          });
        }
        if (
          inside &&
          visit.arrivedAt &&
          ping.recordedAt.getTime() - visit.arrivedAt.getTime() >= dwellMs
        ) {
          visit.status = 'VISITED';
          visit.method = 'AUTO_GEOFENCE';
          change(visit.id, { status: 'VISITED', method: 'AUTO_GEOFENCE' });
        } else if (outside && visit.arrivedAt) {
          // Se fue antes de confirmar: pasó de largo.
          visit.arrivedAt = null;
          change(visit.id, {
            arrivedAt: null,
            latitude: null,
            longitude: null,
            distanceM: null,
          });
        }
      } else if (
        visit.status === 'VISITED' &&
        visit.arrivedAt &&
        !visit.departedAt &&
        outside
      ) {
        visit.departedAt = ping.recordedAt;
        change(visit.id, { departedAt: ping.recordedAt });
      }
    }
  }

  return changes;
}

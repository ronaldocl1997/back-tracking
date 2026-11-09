import { distanceM } from '../common/geo.js';
import {
  detectVisits,
  type DetectorPing,
  type DetectorVisit,
} from './visit-detector.js';

const CLIENT = { latitude: 20.67, longitude: -103.35, geofenceRadiusM: 100 };
/** Grados de latitud por metro (aprox.). */
const M = 1 / 111_195;
const OPTIONS = { dwellMs: 120_000, maxAccuracyM: 50 };
const T0 = new Date('2026-11-10T15:00:00Z').getTime();

const visit = (overrides: Partial<DetectorVisit> = {}): DetectorVisit => ({
  id: 'v1',
  status: 'PENDING',
  method: null,
  arrivedAt: null,
  departedAt: null,
  client: CLIENT,
  ...overrides,
});

/** Posición a `meters` al norte del cliente, `seconds` después de T0. */
const ping = (
  meters: number,
  seconds: number,
  accuracyM: number | null = 10,
): DetectorPing => ({
  latitude: CLIENT.latitude + meters * M,
  longitude: CLIENT.longitude,
  accuracyM,
  recordedAt: new Date(T0 + seconds * 1000),
});

describe('distanceM', () => {
  it('mide ~100 m en 100 m de latitud', () => {
    expect(distanceM(CLIENT, ping(100, 0))).toBeCloseTo(100, 0);
  });
});

describe('detectVisits', () => {
  it('confirma la visita tras permanecer el tiempo mínimo dentro del radio', () => {
    const changes = detectVisits(
      [visit()],
      [ping(500, 0), ping(30, 60), ping(20, 120), ping(25, 180)],
      OPTIONS,
    );
    expect(changes.get('v1')).toMatchObject({
      status: 'VISITED',
      method: 'AUTO_GEOFENCE',
      arrivedAt: new Date(T0 + 60_000),
    });
  });

  it('no cuenta pasar de largo frente al cliente', () => {
    const changes = detectVisits(
      [visit()],
      [ping(300, 0), ping(10, 30), ping(300, 60)],
      OPTIONS,
    );
    expect(changes.get('v1')).toMatchObject({ arrivedAt: null });
    expect(changes.get('v1')?.status).toBeUndefined();
  });

  it('deja la llegada tentativa si aún no cumple el tiempo', () => {
    const changes = detectVisits([visit()], [ping(10, 0), ping(15, 60)], OPTIONS);
    expect(changes.get('v1')).toEqual({
      arrivedAt: new Date(T0),
      latitude: expect.any(Number),
      longitude: expect.any(Number),
      distanceM: 10,
    });
  });

  it('continúa una llegada tentativa de un lote anterior', () => {
    const changes = detectVisits(
      [visit({ arrivedAt: new Date(T0) })],
      [ping(20, 130)],
      OPTIONS,
    );
    expect(changes.get('v1')).toMatchObject({ status: 'VISITED' });
  });

  it('ignora posiciones imprecisas', () => {
    const changes = detectVisits(
      [visit()],
      [ping(10, 0, 200), ping(10, 200, 200)],
      OPTIONS,
    );
    expect(changes.size).toBe(0);
  });

  it('el ruido en el borde del radio no descarta la llegada (histéresis)', () => {
    const changes = detectVisits(
      [visit()],
      [ping(90, 0), ping(110, 60), ping(95, 130)],
      OPTIONS,
    );
    expect(changes.get('v1')).toMatchObject({ status: 'VISITED' });
  });

  it('registra la salida de una visita ya confirmada', () => {
    const changes = detectVisits(
      [
        visit({
          status: 'VISITED',
          method: 'AUTO_GEOFENCE',
          arrivedAt: new Date(T0),
        }),
      ],
      [ping(20, 300), ping(400, 360)],
      OPTIONS,
    );
    expect(changes.get('v1')).toEqual({ departedAt: new Date(T0 + 360_000) });
  });

  it('no toca visitas saltadas o perdidas', () => {
    const changes = detectVisits(
      [visit({ status: 'SKIPPED' }), visit({ id: 'v2', status: 'MISSED' })],
      [ping(0, 0), ping(0, 300)],
      OPTIONS,
    );
    expect(changes.size).toBe(0);
  });

  it('evalúa varias visitas a la vez', () => {
    const far = { ...CLIENT, latitude: CLIENT.latitude + 1000 * M };
    const changes = detectVisits(
      [visit(), visit({ id: 'v2', client: far })],
      [ping(0, 0), ping(0, 150), ping(1000, 400), ping(1000, 600)],
      OPTIONS,
    );
    expect(changes.get('v1')).toMatchObject({
      status: 'VISITED',
      departedAt: new Date(T0 + 400_000),
    });
    expect(changes.get('v2')).toMatchObject({ status: 'VISITED' });
  });
});

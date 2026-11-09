import {
  actualOrder,
  boundsOf,
  distanceKm,
  downsample,
  minutesBetween,
  type TrackPoint,
} from './run-map.js';

const M = 1 / 111_195; // grados de latitud por metro
const T0 = new Date('2026-11-17T15:00:00Z').getTime();
const point = (
  metersNorth: number,
  seconds: number,
  accuracyM: number | null = 10,
): TrackPoint => ({
  latitude: 20 + metersNorth * M,
  longitude: -103,
  accuracyM,
  recordedAt: new Date(T0 + seconds * 1000),
});

describe('distanceKm', () => {
  it('suma los tramos', () => {
    expect(distanceKm([point(0, 0), point(500, 60), point(1500, 180)], 50)).toBe(1.5);
  });

  it('ignora lecturas imprecisas', () => {
    expect(
      distanceKm([point(0, 0), point(5000, 30, 300), point(1000, 120)], 50),
    ).toBe(1);
  });

  it('ignora saltos imposibles del GPS', () => {
    // 50 km en 10 s es un salto, no un trayecto.
    expect(
      distanceKm([point(0, 0), point(50_000, 10), point(200, 60)], 50),
    ).toBe(0.2);
  });

  it('cero sin puntos', () => {
    expect(distanceKm([], 50)).toBe(0);
  });
});

describe('downsample', () => {
  it('no toca listas cortas', () => {
    expect(downsample([1, 2, 3], 10)).toEqual([1, 2, 3]);
  });

  it('reduce y conserva primero y último', () => {
    const result = downsample(
      Array.from({ length: 101 }, (_, i) => i),
      10,
    );
    expect(result.length).toBeLessThanOrEqual(11);
    expect(result[0]).toBe(0);
    expect(result.at(-1)).toBe(100);
  });
});

describe('boundsOf', () => {
  it('encuadra todos los puntos', () => {
    expect(
      boundsOf([
        { latitude: 20, longitude: -103 },
        { latitude: 21, longitude: -104 },
      ]),
    ).toEqual({ north: 21, south: 20, east: -103, west: -104 });
  });

  it('null sin puntos', () => {
    expect(boundsOf([])).toBeNull();
  });
});

describe('actualOrder', () => {
  it('ordena por hora de llegada y omite las no visitadas', () => {
    const order = actualOrder([
      { id: 'a', arrivedAt: new Date(T0 + 300_000) },
      { id: 'b', arrivedAt: null },
      { id: 'c', arrivedAt: new Date(T0) },
    ]);
    expect([...order]).toEqual([
      ['c', 1],
      ['a', 2],
    ]);
  });
});

describe('minutesBetween', () => {
  it('calcula minutos con un decimal', () => {
    expect(minutesBetween(new Date(T0), new Date(T0 + 150_000))).toBe(2.5);
    expect(minutesBetween(new Date(T0), null)).toBeNull();
  });
});

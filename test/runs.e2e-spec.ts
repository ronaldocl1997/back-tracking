import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { RunGeneratorService } from '../src/runs/run-generator.service.js';
import { PingRetentionScheduler } from '../src/tracking/ping-retention.scheduler.js';
import { dayOfWeekOf, localDate } from '../src/common/time.js';
import {
  createClient,
  createEmployee,
  createProvider,
  createTestApp,
  DEG_PER_M,
  today,
  TZ,
} from './helpers.js';

type Pos = { latitude: number; longitude: number };
const C1: Pos = { latitude: 20.67, longitude: -103.35 };
const C2: Pos = { latitude: 20.68, longitude: -103.35 };
const C3: Pos = { latitude: 20.69, longitude: -103.35 };

/**
 * Un día de operación de punta a punta: generación de recorridos, el chofer en
 * ruta enviando posiciones, detección de visitas, check-in manual, el
 * supervisor monitoreando y revisando, el mapa y los jobs.
 */
describe('Recorridos y tracking (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let sup: Awaited<ReturnType<typeof createProvider>>;
  let driverToken: string;
  let helperToken: string;
  const ids: Record<string, string> = {};
  const { date, dayOfWeek } = today();

  /** Posición a `metersNorth` de `c`, `seconds` respecto de ahora. */
  const at = (c: Pos, metersNorth: number, seconds: number, accuracyM = 8) => ({
    id: randomUUID(),
    latitude: c.latitude + metersNorth * DEG_PER_M,
    longitude: c.longitude,
    accuracyM,
    speedMps: 3,
    recordedAt: new Date(Date.now() + seconds * 1000).toISOString(),
  });
  const sendPings = (pings: object[], token = driverToken, routeRunId = ids.run) =>
    ctx.api.post('/tracking/pings', token, { routeRunId, pings });

  beforeAll(async () => {
    ctx = await createTestApp();
    const admin = await ctx.adminToken();
    sup = await createProvider(ctx.api, admin, { role: 'SUPERVISOR' });

    const driver = await createEmployee(ctx.api, sup.token, { name: 'José Pérez', canDrive: true }, { account: true });
    const helper = await createEmployee(ctx.api, sup.token, { name: 'Ana Ruiz' }, { account: true });
    const driver2 = await createEmployee(ctx.api, sup.token, { name: 'Mario Gómez', canDrive: true });
    ids.driver = driver.employee.id;
    ids.helper = helper.employee.id;
    ids.driver2 = driver2.employee.id;
    driverToken = driver.token!;
    helperToken = helper.token!;

    const clients = [
      await createClient(ctx.api, sup.token, 'Tienda 1', C1),
      await createClient(ctx.api, sup.token, 'Tienda 2', C2),
      await createClient(ctx.api, sup.token, 'Tienda 3', C3),
    ];
    const north = (await ctx.api.post('/routes', sup.token, { name: 'Ruta Norte', clientIds: clients.map((c) => c.id) }).expect(201)).body;
    const south = (await ctx.api.post('/routes', sup.token, { name: 'Ruta Sur', clientIds: [clients[0].id] }).expect(201)).body;
    await ctx.api.post(`/routes/${north.id}/schedules`, sup.token, { driverId: ids.driver, dayOfWeek, companionIds: [ids.helper] }).expect(201);
    await ctx.api.post(`/routes/${south.id}/schedules`, sup.token, { driverId: ids.driver, dayOfWeek }).expect(201);
  });
  afterAll(() => ctx.app.close());

  describe('generación', () => {
    it('GET /my/runs genera los recorridos de hoy con visitas y acompañantes', async () => {
      const runs = (await ctx.api.get('/my/runs', driverToken).expect(200)).body;
      expect(runs.map((r: { route: { name: string }; myRole: string; status: string }) => [r.route.name, r.myRole, r.status])).toEqual([
        ['Ruta Norte', 'DRIVER', 'SCHEDULED'],
        ['Ruta Sur', 'DRIVER', 'SCHEDULED'],
      ]);
      const north = runs[0];
      expect(north.visits.map((v: { sequence: number; client: { name: string }; status: string }) => [v.sequence, v.client.name, v.status])).toEqual([
        [1, 'Tienda 1', 'PENDING'],
        [2, 'Tienda 2', 'PENDING'],
        [3, 'Tienda 3', 'PENDING'],
      ]);
      expect(north.companions.map((c: { name: string }) => c.name)).toEqual(['Ana Ruiz']);
      ids.run = north.id;
      ids.run2 = runs[1].id;
      ids.v1 = north.visits[0].id;
      ids.v2 = north.visits[1].id;
      ids.v3 = north.visits[2].id;
    });

    it('generar de nuevo no duplica', async () => {
      const [result] = (await ctx.api.post('/runs/generate', sup.token, { date }).expect(200)).body;
      expect(result).toMatchObject({ created: 0, existing: 2 });
    });

    it('el acompañante lo ve como COMPANION y no puede operarlo', async () => {
      const runs = (await ctx.api.get('/my/runs', helperToken).expect(200)).body;
      expect(runs.map((r: { myRole: string; driver: { name: string } }) => [r.myRole, r.driver.name])).toEqual([['COMPANION', 'José Pérez']]);
      await ctx.api.post(`/my/runs/${ids.run}/start`, helperToken).expect(404);
    });
  });

  describe('inicio', () => {
    it('no acepta posiciones antes de iniciar', () => sendPings([at(C1, 0, 0)]).expect(409));

    it('inicia, y no permite dos recorridos en curso a la vez', async () => {
      const run = (await ctx.api.post(`/my/runs/${ids.run}/start`, driverToken).expect(200)).body;
      expect(run.status).toBe('IN_PROGRESS');
      await ctx.api.post(`/my/runs/${ids.run2}/start`, driverToken).expect(409);
      await ctx.api.post(`/my/runs/${ids.run}/start`, driverToken).expect(409);
    });
  });

  describe('ubicación y detección automática', () => {
    const visit1 = [at(C1, 600, -290), at(C1, 40, -270), at(C1, 20, -200), at(C1, 30, -130), at(C1, 400, -110)];

    it('confirma la visita tras 2 min dentro del radio y registra la salida', async () => {
      const res = (await sendPings(visit1).expect(200)).body;
      expect(res).toMatchObject({ accepted: 5, duplicates: 0, rejected: 0 });
      expect(res.visits).toEqual([
        expect.objectContaining({ id: ids.v1, status: 'VISITED', method: 'AUTO_GEOFENCE', arrivedAt: expect.any(String), departedAt: expect.any(String) }),
      ]);
    });

    it('reenviar el mismo lote no duplica nada', async () => {
      const res = (await sendPings(visit1).expect(200)).body;
      expect(res).toMatchObject({ accepted: 0, duplicates: 5, visits: [] });
    });

    it('pasar de largo no cuenta como visita', async () => {
      const res = (await sendPings([at(C2, 50, -100), at(C2, 10, -80), at(C2, 300, -60)]).expect(200)).body;
      expect(res.visits).toEqual([expect.objectContaining({ id: ids.v2, status: 'PENDING', arrivedAt: null })]);
    });

    it('lecturas imprecisas no deciden; fuera de ventana se rechazan', async () => {
      const res = (await sendPings([at(C3, 0, -50, 500), at(C3, 0, -40, 500), at(C3, 0, -3600), at(C3, 0, 3600)]).expect(200)).body;
      expect(res).toMatchObject({ accepted: 2, rejected: 2, visits: [] });
    });

    it('valida el lote', async () => {
      const p = at(C1, 0, 0);
      await sendPings([p, p]).expect(400); // ids repetidos
      await sendPings([{ ...at(C1, 0, 0), recordedAt: '2026-11-10T10:00:00' }]).expect(400); // sin zona
      await sendPings([]).expect(400);
    });

    it('acepta lotes de 500 posiciones', async () => {
      const big = Array.from({ length: 500 }, (_, i) => at(C3, 2000, -35 + i * 0.05));
      expect((await sendPings(big).expect(200)).body.accepted).toBe(500);
    });

    it('solo el chofer envía ubicación', () => sendPings([at(C1, 0, 0)], helperToken).expect(404));
  });

  describe('check-in manual y saltar', () => {
    it('check-in lejos del cliente queda marcado para revisión', async () => {
      const visit = (
        await ctx.api
          .post(`/my/runs/${ids.run}/visits/${ids.v2}/check-in`, driverToken, {
            latitude: C2.latitude + 500 * DEG_PER_M,
            longitude: C2.longitude,
            accuracyM: 30,
            notes: 'GPS malo en el estacionamiento',
          })
          .expect(200)
      ).body;
      expect(visit).toMatchObject({ status: 'VISITED', method: 'MANUAL_CHECKIN', flagged: true, distanceM: 500 });
      await ctx.api
        .post(`/my/runs/${ids.run}/visits/${ids.v2}/check-in`, driverToken, { latitude: C2.latitude, longitude: C2.longitude })
        .expect(409);
    });

    it('saltar un cliente pide motivo', async () => {
      await ctx.api.post(`/my/runs/${ids.run}/visits/${ids.v3}/skip`, driverToken, { reason: '' }).expect(400);
      const visit = (await ctx.api.post(`/my/runs/${ids.run}/visits/${ids.v3}/skip`, driverToken, { reason: 'Cerrado' }).expect(200)).body;
      expect(visit).toMatchObject({ status: 'SKIPPED', notes: 'Cerrado' });
    });
  });

  describe('supervisor', () => {
    it('ve al chofer en el mapa en vivo con su avance', async () => {
      const live = (await ctx.api.get('/tracking/live', sup.token).expect(200)).body;
      expect(live).toEqual([
        expect.objectContaining({
          driver: expect.objectContaining({ name: 'José Pérez' }),
          lastLatitude: expect.any(Number),
          signalLost: false,
          progress: expect.objectContaining({ visited: 2, skipped: 1, flagged: 1 }),
        }),
      ]);
    });

    it('lista recorridos del día con avance y filtros', async () => {
      const list = (await ctx.api.get(`/runs?date=${date}`, sup.token).expect(200)).body;
      expect(list.data.map((r: { route: { name: string }; status: string; progress: { total: number } }) => [r.route.name, r.status, r.progress.total])).toEqual([
        ['Ruta Norte', 'IN_PROGRESS', 3],
        ['Ruta Sur', 'SCHEDULED', 1],
      ]);
      expect((await ctx.api.get('/runs?hasFlagged=true', sup.token)).body.meta.total).toBe(1);
    });

    it('aprueba la visita marcada y queda registrado quién', async () => {
      const visit = (
        await ctx.api.patch(`/runs/${ids.run}/visits/${ids.v2}`, sup.token, { flagged: false, notes: 'Confirmado por teléfono' }).expect(200)
      ).body;
      expect(visit).toMatchObject({ flagged: false, reviewedBy: { name: sup.user.name }, reviewedAt: expect.any(String) });
    });

    it('no cambia el chofer de un recorrido en curso, pero sí registra faltas', async () => {
      await ctx.api.patch(`/runs/${ids.run}`, sup.token, { driverId: ids.driver2 }).expect(409);
      const run = (
        await ctx.api.patch(`/runs/${ids.run}`, sup.token, { companions: [{ employeeId: ids.helper, attended: false }] }).expect(200)
      ).body;
      expect(run.companions).toEqual([expect.objectContaining({ name: 'Ana Ruiz', attended: false })]);
    });
  });

  describe('fin del recorrido', () => {
    it('termina con resumen', async () => {
      const run = (await ctx.api.post(`/my/runs/${ids.run}/finish`, driverToken).expect(200)).body;
      expect(run.status).toBe('COMPLETED');
      expect(run.progress).toEqual({ total: 3, visited: 2, pending: 0, missed: 0, skipped: 1, flagged: 0 });
    });

    it('acepta posiciones atrasadas y rechaza las posteriores al fin', async () => {
      const res = (await sendPings([at(C3, 3000, -10), at(C3, 3000, 600)]).expect(200)).body;
      expect(res).toMatchObject({ accepted: 1, rejected: 1, visits: [] });
      expect((await ctx.api.get('/tracking/live', sup.token)).body).toHaveLength(0);
    });
  });

  describe('mapa y búsqueda', () => {
    it('GET /runs/:id/map trae trazo, paradas con resultado y resumen', async () => {
      const map = (await ctx.api.get(`/runs/${ids.run}/map?maxPoints=50`, sup.token).expect(200)).body;
      expect(map.run).toMatchObject({ status: 'COMPLETED', driver: { name: 'José Pérez' } });
      expect(map.stops.map((s: { sequence: number; status: string; method: string | null; actualOrder: number | null }) => [s.sequence, s.status, s.method, s.actualOrder])).toEqual([
        [1, 'VISITED', 'AUTO_GEOFENCE', 1],
        [2, 'VISITED', 'MANUAL_CHECKIN', 2],
        [3, 'SKIPPED', null, null],
      ]);
      expect(map.stops[0].minutesOnSite).toBe(2.7);
      expect(map.summary).toMatchObject({ visited: 2, skipped: 1, followedPlannedOrder: true });
      expect(map.summary.distanceKm).toBeGreaterThan(0);
      expect(map.track.totalPoints).toBe(511);
      expect(map.track.points.length).toBeLessThanOrEqual(51);
      expect(map.bounds).toEqual({ north: expect.any(Number), south: expect.any(Number), east: expect.any(Number), west: expect.any(Number) });
      await ctx.api.get(`/runs/${ids.run}/map?maxPoints=1`, sup.token).expect(400);
      await ctx.api.get(`/runs/${ids.run}/map`, driverToken).expect(403);
    });

    it('busca por nombre del chofer o de la ruta', async () => {
      const byDriver = (await ctx.api.get(`/runs?date=${date}&search=josé`, sup.token).expect(200)).body;
      expect(byDriver.meta.total).toBe(2);
      const byRoute = (await ctx.api.get('/runs?search=norte', sup.token).expect(200)).body;
      expect(byRoute.data.map((r: { route: { name: string } }) => r.route.name)).toEqual(['Ruta Norte']);
    });

    it('employeeId incluye recorridos como acompañante; driverId no', async () => {
      expect((await ctx.api.get(`/runs?employeeId=${ids.helper}`, sup.token)).body.meta.total).toBe(1);
      expect((await ctx.api.get(`/runs?driverId=${ids.helper}`, sup.token)).body.meta.total).toBe(0);
    });

    it('valida fechas', async () => {
      await ctx.api.get(`/runs?date=${date}&dateFrom=${date}`, sup.token).expect(400);
      await ctx.api.get('/runs?dateFrom=2026-11-20&dateTo=2026-11-01', sup.token).expect(400);
    });
  });

  describe('reasignar y cancelar', () => {
    it('el supervisor reasigna un recorrido no iniciado', async () => {
      const run = (await ctx.api.patch(`/runs/${ids.run2}`, sup.token, { driverId: ids.driver2 }).expect(200)).body;
      expect(run.driver.name).toBe('Mario Gómez');
      await ctx.api.post(`/my/runs/${ids.run2}/start`, driverToken).expect(404);
    });

    it('cancelar salta las visitas pendientes; no se cancela dos veces', async () => {
      const run = (await ctx.api.post(`/runs/${ids.run2}/cancel`, sup.token).expect(200)).body;
      expect([run.status, run.visits.map((v: { status: string }) => v.status)]).toEqual(['CANCELLED', ['SKIPPED']]);
      await ctx.api.post(`/runs/${ids.run2}/cancel`, sup.token).expect(409);
    });

    it('los empleados no acceden a la gestión de recorridos', async () => {
      await ctx.api.get('/runs', driverToken).expect(403);
      await ctx.api.get('/tracking/live', driverToken).expect(403);
      await ctx.api.post('/runs/generate', sup.token, { date: '2026-13-40' }).expect(400);
    });
  });

  describe('jobs', () => {
    it('cierra los recorridos de días pasados', async () => {
      const generator = ctx.app.get(RunGeneratorService);
      const yesterday = localDate(TZ, new Date(Date.now() - 86_400_000));
      const route = (await ctx.api.post('/routes', sup.token, { name: 'Ruta Ayer', clientIds: [] }).expect(201)).body;
      const client = await createClient(ctx.api, sup.token, 'Tienda Ayer', C1);
      await ctx.api.put(`/routes/${route.id}/stops`, sup.token, { clientIds: [client.id] }).expect(200);
      await ctx.api.post(`/routes/${route.id}/schedules`, sup.token, { driverId: ids.driver2, dayOfWeek: dayOfWeekOf(yesterday) }).expect(201);

      await generator.generate(sup.provider.id, yesterday);
      await generator.closePastRuns();

      const runs = (await ctx.api.get(`/runs?date=${yesterday}&routeId=${route.id}`, sup.token).expect(200)).body;
      expect(runs.data.map((r: { status: string; progress: { missed: number } }) => [r.status, r.progress.missed])).toEqual([['NOT_STARTED', 1]]);
    });

    it('la retención borra solo el trazo más viejo que el límite', async () => {
      const config = { get: () => 30 } as unknown as ConfigService;
      const old = { clientPingId: randomUUID(), driverId: ids.driver, latitude: 1, longitude: 1, recordedAt: new Date(Date.now() - 40 * 86_400_000) };
      await ctx.prisma.locationPing.create({ data: old });

      const deleted = await new PingRetentionScheduler(ctx.prisma, config as never).purge();
      expect(deleted).toBeGreaterThanOrEqual(1);
      expect(await ctx.prisma.locationPing.count({ where: { clientPingId: old.clientPingId } })).toBe(0);
      // El trazo de hoy sigue ahí.
      expect(await ctx.prisma.locationPing.count({ where: { routeRunId: ids.run } })).toBe(511);
    });
  });
});

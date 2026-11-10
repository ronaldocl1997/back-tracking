import {
  createClient,
  createEmployee,
  createProvider,
  createTestApp,
  PASSWORD,
  uid,
} from './helpers.js';

/**
 * Empleados, clientes, rutas, paradas, asignaciones y "mi semana", con el
 * aislamiento entre proveedores. Un solo escenario que avanza paso a paso.
 */
describe('Catálogo del proveedor (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: string;
  let p1: Awaited<ReturnType<typeof createProvider>>;
  let p2: Awaited<ReturnType<typeof createProvider>>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await ctx.adminToken();
    p1 = await createProvider(ctx.api, admin);
    p2 = await createProvider(ctx.api, admin);
  });
  afterAll(() => ctx.app.close());

  describe('empleados', () => {
    it('crea choferes y acompañantes en el proveedor del usuario', async () => {
      const driver = (
        await ctx.api
          .post('/employees', p1.token, {
            name: 'Juan Chofer',
            phone: '+52 33 1234 5678',
            canDrive: true,
            licenseNumber: 'LIC-1',
          })
          .expect(201)
      ).body;
      expect(driver.providerId).toBe(p1.provider.id);
      ids.driver = driver.id;
      ids.driver2 = (await createEmployee(ctx.api, p1.token, { name: 'Mario Chofer', canDrive: true })).employee.id;
      const helper = (await createEmployee(ctx.api, p1.token, { name: 'Pedro Ayudante' })).employee;
      expect(helper.canDrive).toBe(false);
      ids.helper = helper.id;
      ids.otherEmployee = (await createEmployee(ctx.api, p2.token, { name: 'Empleado P2', canDrive: true })).employee.id;
    });

    it('valida datos y proveedor', async () => {
      await ctx.api.post('/employees', p1.token, { name: 'X', phone: 'abc' }).expect(400);
      await ctx.api.post('/employees', p1.token, { name: 'X', providerId: p2.provider.id }).expect(403);
      await ctx.api.post('/employees', admin, { name: 'X' }).expect(400); // ADMIN debe elegir proveedor
      await ctx.api.post('/employees', admin, { name: 'Por admin', providerId: p1.provider.id }).expect(201);
    });

    it('filtra, busca y ordena', async () => {
      const drivers = await ctx.api.get('/employees?canDrive=true&sortBy=name', p1.token).expect(200);
      expect(drivers.body.data.map((e: { name: string }) => e.name)).toEqual(['Juan Chofer', 'Mario Chofer']);
      await ctx.api.get('/employees?sortBy=password', p1.token).expect(400);
    });

    it('filtra por campo y trae el proveedor', async () => {
      const names = async (token: string, qs: string) =>
        (await ctx.api.get(`/employees?${qs}`, token).expect(200)).body.data.map((e: { name: string }) => e.name);
      expect(await names(p1.token, 'name=PEDRO')).toEqual(['Pedro Ayudante']);
      expect(await names(p1.token, 'phone=1234')).toEqual(['Juan Chofer']);
      expect(await names(p1.token, 'licenseNumber=lic-1')).toEqual(['Juan Chofer']);
      expect(await names(p1.token, 'name=juan&canDrive=false')).toEqual([]);

      const email = `emp-${uid()}@test.com`;
      const withAccount = (await createEmployee(ctx.api, p2.token, { name: 'Correo P2' })).employee;
      await ctx.api.post(`/employees/${withAccount.id}/account`, p2.token, { email, password: PASSWORD }).expect(201);
      expect(await names(p2.token, `email=${email.toUpperCase()}`)).toEqual(['Correo P2']);
      expect(await names(p1.token, `email=${email}`)).toEqual([]);

      const p2Name = encodeURIComponent(p2.provider.name.toLowerCase());
      expect(await names(admin, `providerName=${p2Name}`)).toEqual(['Correo P2', 'Empleado P2']);
      expect(await names(p1.token, `providerName=${p2Name}`)).toEqual([]);

      const one = (await ctx.api.get(`/employees/${ids.driver}`, p1.token).expect(200)).body;
      expect(one.provider).toEqual({ id: p1.provider.id, name: p1.provider.name, isActive: true });
    });

    it('no ve empleados de otro proveedor (404, no 403)', () =>
      ctx.api.get(`/employees/${ids.otherEmployee}`, p1.token).expect(404));
  });

  describe('clientes', () => {
    it('crea con coordenadas y radio válidos', async () => {
      ids.c1 = (await createClient(ctx.api, p1.token, 'Tienda Uno', { latitude: 20.67, longitude: -103.35 })).id;
      ids.c2 = (await createClient(ctx.api, p1.token, 'Tienda Dos', { latitude: 20.68, longitude: -103.35 })).id;
      ids.c3 = (await createClient(ctx.api, p1.token, 'Tienda Tres', { latitude: 20.69, longitude: -103.35 })).id;
      ids.otherClient = (await createClient(ctx.api, p2.token, 'Cliente P2', { latitude: 1, longitude: 1 })).id;
    });

    it('rechaza coordenadas o radio fuera de rango', async () => {
      const base = { name: 'X', address: 'X', longitude: -103 };
      await ctx.api.post('/clients', p1.token, { ...base, latitude: 120 }).expect(400);
      await ctx.api.post('/clients', p1.token, { ...base, latitude: 20, geofenceRadiusM: 99_999 }).expect(400);
    });

    it('PATCH acepta null para borrar campos opcionales', async () => {
      const res = await ctx.api
        .patch(`/clients/${ids.c1}`, p1.token, { contactName: null, phone: '3312345678' })
        .expect(200);
      expect(res.body).toMatchObject({ contactName: null, phone: '3312345678' });
    });

    it('no ve clientes de otro proveedor', () =>
      ctx.api.get(`/clients/${ids.otherClient}`, p1.token).expect(404));
  });

  describe('rutas y paradas', () => {
    it('crea la ruta con clientes en orden', async () => {
      const route = (
        await ctx.api.post('/routes', p1.token, { name: 'Ruta Centro', clientIds: [ids.c1, ids.c2] }).expect(201)
      ).body;
      expect(route.stops.map((s: { client: { name: string } }) => s.client.name)).toEqual(['Tienda Uno', 'Tienda Dos']);
      ids.route = route.id;
    });

    it('valida nombre único, clientes ajenos y repetidos', async () => {
      await ctx.api.post('/routes', p1.token, { name: 'Ruta Centro' }).expect(409);
      await ctx.api.post('/routes', p1.token, { name: `R ${uid()}`, clientIds: [ids.otherClient] }).expect(400);
      await ctx.api.post('/routes', p1.token, { name: `R ${uid()}`, clientIds: [ids.c1, ids.c1] }).expect(400);
    });

    it('PUT /stops reemplaza y reordena', async () => {
      const stops = (
        await ctx.api.put(`/routes/${ids.route}/stops`, p1.token, { clientIds: [ids.c3, ids.c1] }).expect(200)
      ).body;
      expect(stops.map((s: { sequence: number; client: { name: string } }) => [s.sequence, s.client.name])).toEqual([
        [1, 'Tienda Tres'],
        [2, 'Tienda Uno'],
      ]);
    });

    it('filtra clientes por ruta y sin ruta', async () => {
      const without = await ctx.api.get('/clients?withoutRoute=true', p1.token).expect(200);
      expect(without.body.data.map((c: { name: string }) => c.name)).toEqual(['Tienda Dos']);
      const inRoute = await ctx.api.get(`/clients?routeId=${ids.route}`, p1.token).expect(200);
      expect(inRoute.body.meta.total).toBe(2);
    });
  });

  describe('asignaciones', () => {
    const schedule = (body: object) => ctx.api.post(`/routes/${ids.route}/schedules`, p1.token, body);

    it('lunes: chofer con acompañante', async () => {
      ids.schedule = (
        await schedule({ driverId: ids.driver, dayOfWeek: 'MONDAY', companionIds: [ids.helper] }).expect(201)
      ).body.id;
    });

    it('valida reglas de la tripulación', async () => {
      await schedule({ driverId: ids.driver, dayOfWeek: 'MONDAY' }).expect(409); // duplicada
      await schedule({ driverId: ids.helper, dayOfWeek: 'TUESDAY' }).expect(400); // sin canDrive
      await schedule({ driverId: ids.driver, dayOfWeek: 'TUESDAY', companionIds: [ids.driver] }).expect(400);
      await schedule({ driverId: ids.driver, dayOfWeek: 'TUESDAY', companionIds: [ids.otherEmployee] }).expect(400);
      await schedule({ driverId: ids.driver, dayOfWeek: 'LUNES' }).expect(400);
    });

    it('permite varios choferes en la misma ruta y día, y varias rutas al chofer', async () => {
      await schedule({ driverId: ids.driver2, dayOfWeek: 'MONDAY' }).expect(201);
      await schedule({ driverId: ids.driver, dayOfWeek: 'WEDNESDAY' }).expect(201);
    });

    it('filtra asignaciones y rutas por día y por participante', async () => {
      const byHelper = await ctx.api.get(`/schedules?employeeId=${ids.helper}`, p1.token).expect(200);
      expect(byHelper.body.meta.total).toBe(1);
      expect((await ctx.api.get('/routes?dayOfWeek=MONDAY', p1.token)).body.meta.total).toBe(1);
      expect((await ctx.api.get('/routes?dayOfWeek=SUNDAY', p1.token)).body.meta.total).toBe(0);
    });

    it('PATCH reemplaza los acompañantes', async () => {
      const none = await ctx.api.patch(`/schedules/${ids.schedule}`, p1.token, { companionIds: [] }).expect(200);
      expect(none.body.companions).toHaveLength(0);
      await ctx.api.patch(`/schedules/${ids.schedule}`, p1.token, { companionIds: [ids.helper] }).expect(200);
    });
  });

  describe('cuentas de empleados y "mi semana"', () => {
    let driverToken: string;
    let helperToken: string;

    it('crea cuentas; una segunda o un correo usado dan 409', async () => {
      const driverEmail = `drv-${uid()}@test.com`;
      const helperEmail = `hlp-${uid()}@test.com`;
      await ctx.api.post(`/employees/${ids.driver}/account`, p1.token, { email: driverEmail, password: PASSWORD }).expect(201);
      await ctx.api.post(`/employees/${ids.helper}/account`, p1.token, { email: helperEmail, password: PASSWORD }).expect(201);
      await ctx.api.post(`/employees/${ids.helper}/account`, p1.token, { email: `o-${uid()}@test.com`, password: PASSWORD }).expect(409);
      await ctx.api.post(`/employees/${ids.driver2}/account`, p1.token, { email: driverEmail, password: PASSWORD }).expect(409);
      expect((await ctx.api.get('/employees?hasAccount=true', p1.token)).body.meta.total).toBe(2);
      driverToken = await ctx.api.login(driverEmail);
      helperToken = await ctx.api.login(helperEmail);
    });

    it('solo el ADMIN vincula cuentas existentes', async () => {
      const me = await ctx.api.get('/auth/me', helperToken).expect(200);
      await ctx.api.post(`/employees/${ids.otherEmployee}/account/link`, p2.token, { userId: me.body.id }).expect(403);
      // El ADMIN liga a la misma persona como empleado de P2.
      await ctx.api.post(`/employees/${ids.otherEmployee}/account/link`, admin, { userId: me.body.id }).expect(201);
    });

    it('el chofer ve su semana con acompañantes y clientes en orden', async () => {
      const week = (await ctx.api.get('/my/schedules', driverToken).expect(200)).body;
      expect(week.map((s: { dayOfWeek: string; myRole: string }) => [s.dayOfWeek, s.myRole])).toEqual([
        ['MONDAY', 'DRIVER'],
        ['WEDNESDAY', 'DRIVER'],
      ]);
      expect(week[0].companions.map((c: { name: string }) => c.name)).toEqual(['Pedro Ayudante']);
      expect(week[0].route.stops.map((s: { client: { name: string } }) => s.client.name)).toEqual(['Tienda Tres', 'Tienda Uno']);
    });

    it('el acompañante ve con quién va', async () => {
      const monday = (await ctx.api.get('/my/schedules?dayOfWeek=MONDAY', helperToken).expect(200)).body;
      expect(monday.map((s: { myRole: string; driver: { name: string } }) => [s.myRole, s.driver.name])).toEqual([
        ['COMPANION', 'Juan Chofer'],
      ]);
    });

    it('los empleados no entran a la gestión y la oficina no usa /my', async () => {
      await ctx.api.get('/employees', helperToken).expect(403);
      await ctx.api.get('/my/schedules', p1.token).expect(403);
    });

    it('bajas lógicas: el cliente inactivo sale de la ruta del chofer', async () => {
      await ctx.api.delete(`/clients/${ids.c3}`, p1.token).expect(204);
      expect((await ctx.api.get(`/clients/${ids.c3}`, p1.token)).body.isActive).toBe(false);
      const monday = (await ctx.api.get('/my/schedules?dayOfWeek=MONDAY', driverToken)).body;
      expect(monday[0].route.stops.map((s: { client: { name: string } }) => s.client.name)).toEqual(['Tienda Uno']);
      await ctx.api.put(`/routes/${ids.route}/stops`, p1.token, { clientIds: [ids.c3] }).expect(400);
    });

    it('borrar la asignación la quita de la semana del acompañante', async () => {
      await ctx.api.delete(`/schedules/${ids.schedule}`, p1.token).expect(204);
      await ctx.api.get(`/schedules/${ids.schedule}`, p1.token).expect(404);
      expect((await ctx.api.get('/my/schedules?dayOfWeek=MONDAY', helperToken)).body).toHaveLength(0);
      await ctx.api.delete(`/employees/${ids.helper}/account`, p1.token).expect(204);
    });
  });
});

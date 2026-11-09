import {
  createEmployee,
  createProvider,
  createTestApp,
  PASSWORD,
  uid,
} from './helpers.js';

describe('Equipo del proveedor y supervisor (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await ctx.adminToken();
  });
  afterAll(() => ctx.app.close());

  describe('/team (dueño)', () => {
    it('crea supervisores en su proveedor; SUPERVISOR es el rol por defecto', async () => {
      const owner = await createProvider(ctx.api, admin);
      const res = await ctx.api
        .post('/team', owner.token, {
          email: `sup-${uid()}@test.com`,
          password: PASSWORD,
          name: 'Ana Supervisora',
        })
        .expect(201);
      expect(res.body).toMatchObject({
        role: 'SUPERVISOR',
        providerId: owner.provider.id,
      });
    });

    it('no crea en otro proveedor ni con roles ajenos al equipo', async () => {
      const owner = await createProvider(ctx.api, admin);
      const other = await createProvider(ctx.api, admin);
      const body = { email: `x-${uid()}@test.com`, password: PASSWORD, name: 'X' };
      await ctx.api
        .post('/team', owner.token, { ...body, providerId: other.provider.id })
        .expect(403);
      await ctx.api.post('/team', owner.token, { ...body, role: 'ADMIN' }).expect(400);
    });

    it('ve solo a su equipo y filtra por rol', async () => {
      const owner = await createProvider(ctx.api, admin);
      await createProvider(ctx.api, admin); // otro proveedor: no debe aparecer
      await ctx.api
        .post('/team', owner.token, { email: `s-${uid()}@test.com`, password: PASSWORD, name: 'Sup' })
        .expect(201);
      const all = await ctx.api.get('/team', owner.token).expect(200);
      expect(all.body.meta.total).toBe(2);
      const sups = await ctx.api.get('/team?role=SUPERVISOR', owner.token).expect(200);
      expect(sups.body.meta.total).toBe(1);
    });

    it('filtra por nombre, correo y nombre del proveedor; trae los datos del proveedor', async () => {
      const owner = await createProvider(ctx.api, admin);
      const other = await createProvider(ctx.api, admin);
      const tag = uid();
      const sup = (
        await ctx.api
          .post('/team', owner.token, { email: `f-${tag}@test.com`, password: PASSWORD, name: `Filtro ${tag}` })
          .expect(201)
      ).body;
      expect(sup.provider).toMatchObject({ id: owner.provider.id, name: owner.provider.name });

      const ids = async (token: string, qs: string) =>
        (await ctx.api.get(`/team?${qs}`, token).expect(200)).body.data.map((m: { id: string }) => m.id);
      expect(await ids(owner.token, `name=${tag.toUpperCase()}`)).toEqual([sup.id]);
      expect(await ids(owner.token, `email=f-${tag}`)).toEqual([sup.id]);
      expect(await ids(owner.token, `name=${tag}&role=PROVIDER`)).toEqual([]);
      expect(await ids(admin, `providerName=${encodeURIComponent(owner.provider.name.toLowerCase())}&role=SUPERVISOR`)).toEqual([sup.id]);
      // El dueño no ve otro proveedor aunque lo busque por nombre.
      expect(await ids(other.token, `providerName=${encodeURIComponent(owner.provider.name)}`)).toEqual([]);
    });

    it('no puede desactivarse ni quitarse el rol de dueño a sí mismo', async () => {
      const owner = await createProvider(ctx.api, admin);
      await ctx.api.patch(`/team/${owner.user.id}`, owner.token, { isActive: false }).expect(400);
      await ctx.api.patch(`/team/${owner.user.id}`, owner.token, { role: 'SUPERVISOR' }).expect(400);
    });

    it('desactivar a un supervisor le corta el acceso', async () => {
      const owner = await createProvider(ctx.api, admin);
      const email = `s-${uid()}@test.com`;
      const sup = (
        await ctx.api.post('/team', owner.token, { email, password: PASSWORD, name: 'Sup' }).expect(201)
      ).body;
      const token = await ctx.api.login(email);
      await ctx.api.patch(`/team/${sup.id}`, owner.token, { isActive: false }).expect(200);
      await ctx.api.get('/auth/me', token).expect(401);
    });
  });

  describe('supervisor', () => {
    it('opera clientes, empleados, rutas y asignaciones de su proveedor', async () => {
      const sup = await createProvider(ctx.api, admin, { role: 'SUPERVISOR' });
      const { employee } = await createEmployee(
        ctx.api,
        sup.token,
        { name: 'Chofer', canDrive: true },
        { account: true },
      );
      const client = (
        await ctx.api
          .post('/clients', sup.token, { name: 'C', address: 'X', latitude: 20, longitude: -103 })
          .expect(201)
      ).body;
      const route = (
        await ctx.api.post('/routes', sup.token, { name: 'R', clientIds: [client.id] }).expect(201)
      ).body;
      await ctx.api
        .post(`/routes/${route.id}/schedules`, sup.token, { driverId: employee.id, dayOfWeek: 'FRIDAY' })
        .expect(201);
    });

    it('no gestiona el equipo, el proveedor ni usuarios', async () => {
      const sup = await createProvider(ctx.api, admin, { role: 'SUPERVISOR' });
      const other = await createProvider(ctx.api, admin);
      await ctx.api.get(`/providers/${sup.provider.id}`, sup.token).expect(200);
      await ctx.api.get(`/providers/${other.provider.id}`, sup.token).expect(403);
      await ctx.api.get('/team', sup.token).expect(403);
      await ctx.api.patch(`/providers/${sup.provider.id}`, sup.token, { name: 'hack' }).expect(403);
      await ctx.api.get('/users', sup.token).expect(403);
    });

    it('no ve datos de otro proveedor', async () => {
      const a = await createProvider(ctx.api, admin, { role: 'SUPERVISOR' });
      const b = await createProvider(ctx.api, admin);
      await ctx.api.post('/routes', b.token, { name: 'Ruta B' }).expect(201);
      const routes = await ctx.api.get('/routes', a.token).expect(200);
      expect(routes.body.meta.total).toBe(0);
    });
  });
});

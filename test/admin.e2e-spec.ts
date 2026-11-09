import { createProvider, createTestApp, PASSWORD, uid } from './helpers.js';

describe('Usuarios y proveedores (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await ctx.adminToken();
  });
  afterAll(() => ctx.app.close());

  describe('/providers', () => {
    it('crea, valida la zona horaria y rechaza campos desconocidos', async () => {
      await ctx.api
        .post('/providers', admin, { name: `P ${uid()}`, timezone: 'America/Monterrey' })
        .expect(201);
      await ctx.api.post('/providers', admin, { name: 'X', timezone: 'Marte/Base' }).expect(400);
      await ctx.api.post('/providers', admin, { name: 'X', hack: true }).expect(400);
    });

    it('pagina y busca', async () => {
      const tag = uid();
      for (let i = 0; i < 3; i++) {
        await ctx.api.post('/providers', admin, { name: `Pag ${tag} ${i}` }).expect(201);
      }
      const res = await ctx.api
        .get(`/providers?search=${tag}&page=2&limit=2`, admin)
        .expect(200);
      expect(res.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
      expect(res.body.data).toHaveLength(1);
      await ctx.api.get('/providers?limit=500', admin).expect(400);
    });

    it('404 al editar uno inexistente; 400 con un id inválido', async () => {
      await ctx.api
        .patch('/providers/0195f0c4-0000-7000-8000-000000000000', admin, { name: 'Z' })
        .expect(404);
      await ctx.api.get('/providers/abc', admin).expect(400);
    });

    it('el dueño ve y edita solo el suyo, sin poder desactivarlo', async () => {
      const a = await createProvider(ctx.api, admin);
      const b = await createProvider(ctx.api, admin);
      await ctx.api.get(`/providers/${a.provider.id}`, a.token).expect(200);
      await ctx.api.get(`/providers/${b.provider.id}`, a.token).expect(403);
      await ctx.api.get('/providers', a.token).expect(403);
      await ctx.api
        .patch(`/providers/${a.provider.id}`, a.token, { timezone: 'America/Cancun' })
        .expect(200);
      await ctx.api
        .patch(`/providers/${a.provider.id}`, a.token, { isActive: false })
        .expect(403);
      await ctx.api
        .patch(`/providers/${b.provider.id}`, a.token, { name: 'hack' })
        .expect(403);
      await ctx.api.post('/providers', a.token, { name: 'X' }).expect(403);
    });
  });

  describe('/users', () => {
    it('crea sin exponer el hash de la contraseña', async () => {
      const res = await ctx.api
        .post('/users', admin, {
          email: `u-${uid()}@test.com`,
          password: PASSWORD,
          name: 'U',
          role: 'ADMIN',
        })
        .expect(201);
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('exige providerId justo para PROVIDER y SUPERVISOR', async () => {
      const { provider } = await createProvider(ctx.api, admin);
      const base = { password: PASSWORD, name: 'X' };
      await ctx.api
        .post('/users', admin, { ...base, email: `a-${uid()}@test.com`, role: 'SUPERVISOR' })
        .expect(400);
      await ctx.api
        .post('/users', admin, {
          ...base,
          email: `b-${uid()}@test.com`,
          role: 'ADMIN',
          providerId: provider.id,
        })
        .expect(400);
      await ctx.api
        .post('/users', admin, {
          ...base,
          email: `c-${uid()}@test.com`,
          role: 'SUPERVISOR',
          providerId: provider.id,
        })
        .expect(201);
    });

    it('correo duplicado → 409', async () => {
      const body = { email: `dup-${uid()}@test.com`, password: PASSWORD, name: 'X', role: 'ADMIN' };
      await ctx.api.post('/users', admin, body).expect(201);
      await ctx.api.post('/users', admin, body).expect(409);
    });

    it('filtra por rol y busca', async () => {
      const tag = uid();
      await ctx.api
        .post('/users', admin, {
          email: `f-${tag}@test.com`,
          password: PASSWORD,
          name: `Filtro ${tag}`,
          role: 'ADMIN',
        })
        .expect(201);
      const res = await ctx.api.get(`/users?role=ADMIN&search=${tag}`, admin).expect(200);
      expect(res.body.data.map((u: { name: string }) => u.name)).toEqual([`Filtro ${tag}`]);
    });

    it('cambiar la contraseña cierra sus sesiones', async () => {
      const { user, email } = await createProvider(ctx.api, admin);
      const { refreshToken } = (
        await ctx.api.post('/auth/login', undefined, { email, password: PASSWORD }).expect(200)
      ).body;
      await ctx.api.patch(`/users/${user.id}`, admin, { password: 'nueva-secreta' }).expect(200);
      await ctx.api.post('/auth/refresh', undefined, { refreshToken }).expect(401);
      await ctx.api.login(email, 'nueva-secreta');
    });

    it('solo ADMIN', async () => {
      const { token } = await createProvider(ctx.api, admin);
      await ctx.api.get('/users', token).expect(403);
    });
  });
});

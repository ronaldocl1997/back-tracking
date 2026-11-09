import { createProvider, createTestApp, PASSWORD, uid } from './helpers.js';

describe('Auth (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let admin: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await ctx.adminToken();
  });
  afterAll(() => ctx.app.close());

  const loginBody = (email: string) =>
    ctx.api
      .post('/auth/login', undefined, { email, password: PASSWORD })
      .expect(200)
      .then((res) => res.body);

  describe('login', () => {
    it('responde igual a contraseña incorrecta y a correo inexistente', async () => {
      const { email } = await createProvider(ctx.api, admin);
      const wrong = await ctx.api
        .post('/auth/login', undefined, { email, password: 'incorrecta' })
        .expect(401);
      const unknown = await ctx.api
        .post('/auth/login', undefined, {
          email: `x-${uid()}@test.com`,
          password: PASSWORD,
        })
        .expect(401);
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it('valida el cuerpo', () =>
      ctx.api
        .post('/auth/login', undefined, { email: 'no-es-email', password: 'x' })
        .expect(400));

    it('acepta el correo en mayúsculas', async () => {
      const { email } = await createProvider(ctx.api, admin);
      await ctx.api.login(email.toUpperCase());
    });

    it('devuelve el par de tokens', async () => {
      const { email } = await createProvider(ctx.api, admin);
      expect(await loginBody(email)).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: 900,
      });
    });
  });

  it('GET /auth/me devuelve perfil y proveedor sin el hash', async () => {
    const { token, provider } = await createProvider(ctx.api, admin);
    const me = await ctx.api.get('/auth/me', token).expect(200);
    expect(me.body).toMatchObject({
      role: 'PROVIDER',
      provider: { id: provider.id },
    });
    expect(me.body).not.toHaveProperty('passwordHash');
  });

  describe('refresh tokens', () => {
    it('rota: el viejo deja de servir y su reuso revoca la sesión entera', async () => {
      const { email } = await createProvider(ctx.api, admin);
      const first = await loginBody(email);
      const second = (
        await ctx.api
          .post('/auth/refresh', undefined, { refreshToken: first.refreshToken })
          .expect(200)
      ).body;
      expect(second.refreshToken).not.toBe(first.refreshToken);

      await ctx.api
        .post('/auth/refresh', undefined, { refreshToken: first.refreshToken })
        .expect(401);
      // Reuso = robo: también el nuevo queda revocado.
      await ctx.api
        .post('/auth/refresh', undefined, { refreshToken: second.refreshToken })
        .expect(401);
    });

    it('logout invalida el refresh token', async () => {
      const { email } = await createProvider(ctx.api, admin);
      const { refreshToken } = await loginBody(email);
      await ctx.api.post('/auth/logout', undefined, { refreshToken }).expect(204);
      await ctx.api.post('/auth/refresh', undefined, { refreshToken }).expect(401);
    });

    it('logout con un token desconocido no revela nada', () =>
      ctx.api
        .post('/auth/logout', undefined, { refreshToken: 'inventado' })
        .expect(204));

    it('logout-all cierra todas las sesiones', async () => {
      const { email } = await createProvider(ctx.api, admin);
      const a = await loginBody(email);
      const b = await loginBody(email);
      await ctx.api.post('/auth/logout-all', a.accessToken).expect(204);
      await ctx.api
        .post('/auth/refresh', undefined, { refreshToken: a.refreshToken })
        .expect(401);
      await ctx.api
        .post('/auth/refresh', undefined, { refreshToken: b.refreshToken })
        .expect(401);
    });
  });

  describe('usuario o proveedor desactivado', () => {
    it('el usuario desactivado pierde el acceso al instante', async () => {
      const { token, user, email } = await createProvider(ctx.api, admin);
      await ctx.api.patch(`/users/${user.id}`, admin, { isActive: false }).expect(200);
      await ctx.api.get('/auth/me', token).expect(401);
      await ctx.api
        .post('/auth/login', undefined, { email, password: PASSWORD })
        .expect(401);
    });

    it('si se desactiva el proveedor, su equipo pierde el acceso', async () => {
      const { token, provider, email } = await createProvider(ctx.api, admin);
      await ctx.api
        .patch(`/providers/${provider.id}`, admin, { isActive: false })
        .expect(200);
      await ctx.api.get('/auth/me', token).expect(401);
      await ctx.api
        .post('/auth/login', undefined, { email, password: PASSWORD })
        .expect(401);
    });
  });
});

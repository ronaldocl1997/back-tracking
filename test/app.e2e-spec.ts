import { createTestApp } from './helpers.js';

describe('App (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());

  it('GET /health es público y revisa la base de datos', async () => {
    const res = await ctx.api.get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', database: 'up' });
  });

  it('todo lo demás exige sesión', async () => {
    await ctx.api.get('/auth/me').expect(401);
    await ctx.api.get('/clients').expect(401);
  });

  it('rechaza un token inválido', () =>
    ctx.api.get('/auth/me', 'no-es-un-jwt').expect(401));
});

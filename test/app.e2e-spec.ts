import { createTestApp } from './helpers.js';

describe('App (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => ctx.app.close());

  it('GET / es público', () => ctx.api.get('/').expect(200));

  it('todo lo demás exige sesión', async () => {
    await ctx.api.get('/auth/me').expect(401);
    await ctx.api.get('/clients').expect(401);
  });

  it('rechaza un token inválido', () =>
    ctx.api.get('/auth/me', 'no-es-un-jwt').expect(401));
});

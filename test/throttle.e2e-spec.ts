import { createTestApp } from './helpers.js';

describe('Límite de intentos (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(() => {
    process.env.THROTTLE_AUTH_LIMIT = '100000';
    return ctx.app.close();
  });

  it('bloquea con 429 al pasar THROTTLE_AUTH_LIMIT intentos de login por minuto', async () => {
    process.env.THROTTLE_AUTH_LIMIT = '3';
    const attempt = () =>
      ctx.api.post('/auth/login', undefined, {
        email: 'nadie@test.com',
        password: 'incorrecta',
      });

    for (let i = 0; i < 3; i++) await attempt().expect(401);
    await attempt().expect(429);
  });
});

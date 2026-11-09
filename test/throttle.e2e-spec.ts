import request from 'supertest';
import { createTestApp } from './helpers.js';

/**
 * Límite de intentos de login por IP, y cómo TRUST_PROXY decide cuál es esa IP.
 * Cada app tiene su propio contador, así que cada caso arranca la suya.
 */
describe('Límite de intentos (e2e)', () => {
  const LIMIT = 3;

  beforeAll(() => {
    process.env.THROTTLE_AUTH_LIMIT = String(LIMIT);
  });
  afterAll(() => {
    process.env.THROTTLE_AUTH_LIMIT = '100000';
  });

  const attempt = (
    app: Awaited<ReturnType<typeof createTestApp>>['app'],
    forwardedFor?: string,
  ) => {
    let req = request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nadie@test.com', password: 'incorrecta' });
    if (forwardedFor) req = req.set('X-Forwarded-For', forwardedFor);
    return req;
  };

  it('bloquea con 429 al pasar THROTTLE_AUTH_LIMIT intentos por minuto', async () => {
    const { app } = await createTestApp();
    try {
      for (let i = 0; i < LIMIT; i++) await attempt(app).expect(401);
      const blocked = await attempt(app).expect(429);
      expect(blocked.headers['retry-after']).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('sin proxy (TRUST_PROXY=0), falsificar X-Forwarded-For no salta el límite', async () => {
    const { app } = await createTestApp({ trustProxy: 0 });
    try {
      for (let i = 0; i < LIMIT; i++) await attempt(app, `203.0.113.${i}`).expect(401);
      await attempt(app, '203.0.113.99').expect(429);
    } finally {
      await app.close();
    }
  });

  it('detrás de un proxy (TRUST_PROXY=1), cada cliente real tiene su propio contador', async () => {
    const { app } = await createTestApp({ trustProxy: 1 });
    try {
      for (let i = 0; i < LIMIT; i++) await attempt(app, '198.51.100.7').expect(401);
      await attempt(app, '198.51.100.7').expect(429);
      // Otro usuario detrás del mismo balanceador no queda bloqueado.
      await attempt(app, '198.51.100.8').expect(401);
    } finally {
      await app.close();
    }
  });
});

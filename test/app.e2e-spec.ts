import request from 'supertest';
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

  describe('CORS', () => {
    const server = () => ctx.app.getHttpServer();

    it('permite el preflight desde localhost', async () => {
      const res = await request(server())
        .options('/auth/login')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'authorization,content-type')
        .expect(204);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-headers']).toBe('Authorization,Content-Type');
      expect(res.headers['access-control-allow-methods']).toContain('PATCH');
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('no autoriza a otros orígenes', async () => {
      const res = await request(server())
        .get('/health')
        .set('Origin', 'https://evil.com')
        .expect(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('las peticiones sin Origin (app móvil) funcionan igual', () =>
      ctx.api.get('/health').expect(200));
  });
});

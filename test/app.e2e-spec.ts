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

  describe('cabeceras de seguridad (helmet)', () => {
    it('se envían en las respuestas de la API', async () => {
      const res = await ctx.api.get('/health').expect(200);
      expect(res.headers).toMatchObject({
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
        'strict-transport-security': expect.stringContaining('max-age='),
        'content-security-policy': expect.stringContaining("default-src 'self'"),
        'referrer-policy': 'no-referrer',
      });
    });

    it('no revela la tecnología del servidor', async () => {
      const res = await ctx.api.get('/health').expect(200);
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('también en los errores', async () => {
      const res = await ctx.api.get('/auth/me').expect(401);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

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

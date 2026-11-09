import type { OpenAPIObject } from '@nestjs/swagger';
import { TAGS } from '../src/swagger.js';
import { createTestApp } from './helpers.js';

/** Endpoints que no exigen sesión. Cualquier otro debe declarar seguridad bearer. */
const PUBLIC = new Set([
  'get /health',
  'post /auth/login',
  'post /auth/refresh',
  'post /auth/logout',
]);

/**
 * Guardia de la documentación: falla si alguien agrega un endpoint sin
 * resumen, sin roles, sin etiqueta, sin respuesta documentada o sin seguridad.
 */
describe('Documentación OpenAPI (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let doc: OpenAPIObject;
  const operations: { key: string; op: Record<string, any> }[] = [];

  beforeAll(async () => {
    ctx = await createTestApp({ swagger: true });
    doc = (await ctx.api.get('/docs/json').expect(200)).body;
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(methods as Record<string, any>)) {
        operations.push({ key: `${method} ${path}`, op });
      }
    }
  });
  afterAll(() => ctx.app.close());

  it('sirve la interfaz en /docs', async () => {
    const res = await ctx.api.get('/docs/').expect(200);
    expect(res.text).toContain('swagger-ui');
  });

  it('la interfaz funciona con la Content-Security-Policy de helmet', async () => {
    const res = await ctx.api.get('/docs/').expect(200);
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    // La CSP bloquea scripts en línea: todos deben cargarse como archivos del mismo origen…
    const scripts = [...res.text.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, attrs, body] of scripts) {
      expect(body.trim(), 'script en línea').toBe('');
      const src = /src="([^"]+)"/.exec(attrs)?.[1];
      expect(src, 'script sin src').toBeDefined();
      expect(src!.startsWith('http'), `script externo: ${src}`).toBe(false);
      // …y existir.
      await ctx.api.get(new URL(src!, 'http://x/docs/').pathname).expect(200);
    }
  });

  it('documenta todas las operaciones', () => {
    expect(operations.length).toBeGreaterThanOrEqual(60);
  });

  it('cada operación tiene resumen, roles y una etiqueta conocida', () => {
    const tags = new Set<string>(Object.values(TAGS));
    for (const { key, op } of operations) {
      expect(op.summary, key).toBeTruthy();
      expect(op.description, key).toContain('**Roles:**');
      expect(op.tags?.length, key).toBe(1);
      expect(tags.has(op.tags[0]), `${key}: etiqueta ${op.tags[0]}`).toBe(true);
    }
  });

  it('cada operación documenta su respuesta exitosa', () => {
    for (const { key, op } of operations) {
      const success = Object.keys(op.responses ?? {}).filter((code) => code.startsWith('2'));
      expect(success.length, key).toBeGreaterThan(0);
      for (const code of success) expect(op.responses[code].description, `${key} ${code}`).toBeTruthy();
    }
  });

  it('solo los endpoints públicos van sin seguridad bearer', () => {
    for (const { key, op } of operations) {
      const secured = (op.security ?? []).some((s: object) => 'bearer' in s);
      expect(secured, key).toBe(!PUBLIC.has(key));
    }
  });

  it('todas las referencias a modelos existen', () => {
    const refs = JSON.stringify(doc).match(/#\/components\/schemas\/\w+/g) ?? [];
    const missing = [...new Set(refs)]
      .map((ref) => ref.split('/').pop()!)
      .filter((name) => !doc.components?.schemas?.[name]);
    expect(missing).toEqual([]);
  });

  it('los cuerpos y filtros salen de los esquemas de validación', () => {
    const body = (doc.paths['/clients'] as any).post.requestBody.content['application/json'].schema;
    expect(body.required).toEqual(['name', 'address', 'latitude', 'longitude']);
    expect(body.additionalProperties).toBe(false);
    expect(body.properties.geofenceRadiusM).toMatchObject({ minimum: 10, maximum: 2000 });

    const search = (doc.paths['/runs'] as any).get.parameters.find((p: { name: string }) => p.name === 'search');
    expect(search).toMatchObject({ in: 'query', required: false, description: expect.any(String) });
  });
});

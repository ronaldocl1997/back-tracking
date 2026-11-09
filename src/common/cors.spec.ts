import { isAllowedOrigin, parseCorsOrigins } from './cors.js';

describe('CORS', () => {
  const allowed = parseCorsOrigins(
    'http://localhost:*, http://127.0.0.1:*, https://panel.empresa.com/',
  );
  const ok = (origin: string) => isAllowedOrigin(origin, allowed);

  it('acepta localhost en cualquier puerto', () => {
    expect(ok('http://localhost:3000')).toBe(true);
    expect(ok('http://localhost:5173')).toBe(true);
    expect(ok('http://127.0.0.1:4200')).toBe(true);
  });

  it('acepta un dominio exacto (la barra final no importa)', () => {
    expect(ok('https://panel.empresa.com')).toBe(true);
  });

  it('rechaza otros orígenes y variantes engañosas', () => {
    expect(ok('https://evil.com')).toBe(false);
    expect(ok('http://localhost')).toBe(false); // sin puerto
    expect(ok('https://localhost:3000')).toBe(false); // otro esquema
    expect(ok('http://localhost:3000.evil.com')).toBe(false);
    expect(ok('http://evil-localhost:3000')).toBe(false);
    expect(ok('https://panel.empresa.com.evil.com')).toBe(false);
    expect(ok('http://panel.empresa.com')).toBe(false);
  });

  it('el punto del dominio no actúa como comodín', () => {
    expect(ok('https://panelXempresa.com')).toBe(false);
  });
});

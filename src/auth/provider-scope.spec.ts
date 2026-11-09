import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthUser } from './auth-user.js';
import { providerScope, requireProviderScope } from './provider-scope.js';

const base = { id: 'u1', email: 'x@x.com', name: 'X', employments: [] };
const admin: AuthUser = { ...base, role: 'ADMIN', providerId: null };
const providerA: AuthUser = { ...base, role: 'PROVIDER', providerId: 'A' };
const employee: AuthUser = {
  ...base,
  role: 'EMPLOYEE',
  providerId: null,
  employments: [{ employeeId: 'e1', providerId: 'A' }],
};

describe('providerScope', () => {
  it('ADMIN ve todos o el que pida', () => {
    expect(providerScope(admin)).toBeUndefined();
    expect(providerScope(admin, 'B')).toBe('B');
  });

  it('PROVIDER siempre queda limitado a su proveedor', () => {
    expect(providerScope(providerA)).toBe('A');
    expect(providerScope(providerA, 'A')).toBe('A');
  });

  it('SUPERVISOR queda limitado a su proveedor igual que el dueño', () => {
    const supervisor: AuthUser = { ...providerA, role: 'SUPERVISOR' };
    expect(providerScope(supervisor)).toBe('A');
    expect(() => providerScope(supervisor, 'B')).toThrow(ForbiddenException);
  });

  it('PROVIDER no puede pedir otro proveedor', () => {
    expect(() => providerScope(providerA, 'B')).toThrow(ForbiddenException);
  });

  it('PROVIDER sin proveedor asignado es rechazado', () => {
    expect(() => providerScope({ ...providerA, providerId: null })).toThrow(
      ForbiddenException,
    );
  });

  it('EMPLOYEE no consulta datos de proveedor por esta vía', () => {
    expect(() => providerScope(employee)).toThrow(ForbiddenException);
  });

  it('requireProviderScope obliga al ADMIN a elegir proveedor', () => {
    expect(() => requireProviderScope(admin)).toThrow(BadRequestException);
    expect(requireProviderScope(admin, 'B')).toBe('B');
    expect(requireProviderScope(providerA)).toBe('A');
  });
});

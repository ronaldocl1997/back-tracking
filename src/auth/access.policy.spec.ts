import { AccessPolicy } from './access.policy.js';
import type { AuthUser } from './auth-user.js';

const make = (role: AuthUser['role']): AuthUser => ({
  id: 'u1',
  email: 'x@x.com',
  name: 'X',
  role,
  providerId: role === 'PROVIDER' || role === 'SUPERVISOR' ? 'A' : null,
  employments: [],
});

describe('AccessPolicy', () => {
  const policy = new AccessPolicy();
  const cases: [keyof AccessPolicy, AuthUser['role'] | null, boolean][] = [
    ['admin', 'ADMIN', true],
    ['admin', 'PROVIDER', false],
    ['admin', 'EMPLOYEE', false],
    ['admin', null, false],
    ['manage', 'ADMIN', true],
    ['manage', 'PROVIDER', true],
    ['manage', 'SUPERVISOR', true],
    ['manage', 'EMPLOYEE', false],
    ['owner', 'ADMIN', true],
    ['owner', 'PROVIDER', true],
    ['owner', 'SUPERVISOR', false],
    ['owner', 'EMPLOYEE', false],
    ['admin', 'SUPERVISOR', false],
    ['employee', 'EMPLOYEE', true],
    ['employee', 'PROVIDER', false],
    ['signedIn', 'EMPLOYEE', true],
    ['signedIn', null, false],
  ];

  it.each(cases)('%s con %s → %s', (ability, role, expected) => {
    expect(policy[ability](role ? make(role) : null)).toBe(expected);
  });
});

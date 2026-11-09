import { inject } from 'vitest';

// Antes de importar AppModule: ConfigModule no pisa variables ya definidas.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'e2e-secret-que-solo-sirve-para-las-pruebas-0123456789';
// Sin límites en las pruebas, salvo en throttle.e2e-spec.ts que los ajusta.
process.env.THROTTLE_LIMIT = '100000';
process.env.THROTTLE_AUTH_LIMIT = '100000';

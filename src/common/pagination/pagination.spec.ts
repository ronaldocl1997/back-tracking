import {
  paginated,
  paginationQuerySchema,
  toPrismaPage,
} from './pagination.js';

describe('pagination', () => {
  it('aplica valores por defecto y convierte strings de la query', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(paginationQuerySchema.parse({ page: '3', limit: '50' })).toEqual({
      page: 3,
      limit: 50,
    });
  });

  it('rechaza límites fuera de rango', () => {
    expect(paginationQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('calcula skip/take y totalPages', () => {
    expect(toPrismaPage({ page: 3, limit: 20 })).toEqual({ skip: 40, take: 20 });
    expect(paginated(['a'], 41, { page: 1, limit: 20 }).meta).toEqual({
      page: 1,
      limit: 20,
      total: 41,
      totalPages: 3,
    });
  });
});

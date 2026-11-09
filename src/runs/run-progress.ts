import type { PrismaService } from '../prisma/prisma.service.js';
import type { VisitStatus } from '../generated/prisma/enums.js';

export interface RunProgress {
  total: number;
  visited: number;
  pending: number;
  missed: number;
  skipped: number;
  /** Visitas marcadas para revisión del supervisor. */
  flagged: number;
}

const empty = (): RunProgress => ({
  total: 0,
  visited: 0,
  pending: 0,
  missed: 0,
  skipped: 0,
  flagged: 0,
});

const KEY: Record<VisitStatus, keyof RunProgress> = {
  VISITED: 'visited',
  PENDING: 'pending',
  MISSED: 'missed',
  SKIPPED: 'skipped',
};

/** Avance de varios recorridos en dos consultas agregadas (sin N+1). */
export async function runProgress(
  prisma: PrismaService,
  runIds: string[],
): Promise<Map<string, RunProgress>> {
  const result = new Map(runIds.map((id) => [id, empty()]));
  if (runIds.length === 0) return result;

  const [byStatus, flagged] = await Promise.all([
    prisma.visit.groupBy({
      by: ['routeRunId', 'status'],
      where: { routeRunId: { in: runIds } },
      _count: { _all: true },
    }),
    prisma.visit.groupBy({
      by: ['routeRunId'],
      where: { routeRunId: { in: runIds }, flagged: true },
      _count: { _all: true },
    }),
  ]);

  for (const row of byStatus) {
    const progress = result.get(row.routeRunId)!;
    progress[KEY[row.status]] += row._count._all;
    progress.total += row._count._all;
  }
  for (const row of flagged) {
    result.get(row.routeRunId)!.flagged = row._count._all;
  }
  return result;
}

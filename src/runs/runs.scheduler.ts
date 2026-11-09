import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RunGeneratorService } from './run-generator.service.js';

/**
 * Cada 15 minutos: cierra los recorridos de días pasados y genera los de hoy
 * para cada proveedor según SU zona horaria. Así un proveedor en Tijuana y otro
 * en Cancún tienen sus recorridos listos poco después de su medianoche.
 *
 * La generación es idempotente, así que correr esto en varias instancias no
 * duplica nada; si más adelante quieres que corra en una sola, usa @nestjs/locks.
 */
@Injectable()
export class RunsScheduler {
  private readonly logger = new Logger(RunsScheduler.name);
  private running = false;

  constructor(private readonly generator: RunGeneratorService) {}

  @Cron('*/15 * * * *', { name: 'daily-runs' })
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.generator.closePastRuns();
      await this.generator.generateTodayForAllProviders();
    } catch (error) {
      this.logger.error('Falló la generación de recorridos', error as Error);
    } finally {
      this.running = false;
    }
  }
}

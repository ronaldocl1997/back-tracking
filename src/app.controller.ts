import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '@nestjs/authentication';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiDoc } from './common/openapi/decorators.js';
import { PrismaService } from './prisma/prisma.service.js';
import { TAGS } from './swagger.js';

@ApiTags(TAGS.health)
@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  @ApiDoc('Estado de la API', {
    roles: ['Público'],
    description: 'Para balanceadores y monitoreo. Comprueba también la conexión a la base de datos.',
  })
  @ApiResponse({
    status: 200,
    description: 'Todo bien',
    schema: { example: { status: 'ok', database: 'up', timestamp: '2026-11-17T14:03:22.120Z' } },
  })
  @ApiResponse({ status: 503, description: 'La base de datos no responde' })
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'down' });
    }
    return { status: 'ok', database: 'up', timestamp: new Date().toISOString() };
  }
}

import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { ZodResponse } from 'nestjs-zod';
import { Publico } from '../auth/decorators';
import { DB, type Database } from '../database/database.module';
import { HealthDto } from './health.dto';

@ApiTags('health')
@Controller('health')
@Publico()
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Get()
  @ZodResponse({ status: 200, type: HealthDto })
  async check() {
    const database = await this.db
      .execute(sql`select 1`)
      .then(() => 'up' as const)
      .catch(() => 'down' as const);
    return { status: database === 'up' ? ('ok' as const) : ('degraded' as const), database };
  }
}

import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { AdministratorOnly } from '../auth/decorators';
import { DashboardDto } from './dashboard.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
@AdministratorOnly()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ZodResponse({ status: 200, type: DashboardDto })
  overview() {
    return this.dashboard.overview();
  }

  @Get('export')
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Every published Idea, as CSV', schema: { type: 'string' } })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="sim-ideas.csv"')
  export() {
    return this.dashboard.exportCsv();
  }
}

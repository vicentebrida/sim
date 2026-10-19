import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { AdministratorOnly } from '../auth/decorators';
import { AuditPageDto, ListAuditQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('audit')
@AdministratorOnly()
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ZodResponse({ status: 200, type: AuditPageDto })
  list(@Query() query: ListAuditQueryDto) {
    return this.audit.list(query);
  }
}

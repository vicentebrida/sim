import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ColaboradorAtual, SomenteAdministrador } from '../auth/decorators';
import type { Colaborador } from '../database/schema';
import {
  AtualizacaoDeCampoDto,
  CampoPersonalizadoDto,
  ListarCamposQueryDto,
  NovoCampoDto,
  OrdemDosCamposDto,
} from './campos-personalizados.dto';
import { CamposPersonalizadosService } from './campos-personalizados.service';

@ApiTags('campos-personalizados')
@Controller('campos-personalizados')
export class CamposPersonalizadosController {
  constructor(private readonly campos: CamposPersonalizadosService) {}

  @Get()
  @ZodResponse({ status: 200, type: [CampoPersonalizadoDto] })
  listar(@Query() query: ListarCamposQueryDto, @ColaboradorAtual() colaborador: Colaborador) {
    return this.campos.listar({
      incluirInativos: query.incluirInativos && colaborador.administrador,
    });
  }

  @Post()
  @SomenteAdministrador()
  @ZodResponse({ status: 201, type: CampoPersonalizadoDto })
  criar(@Body() dados: NovoCampoDto) {
    return this.campos.criar(dados);
  }

  @Put('ordem')
  @SomenteAdministrador()
  @ZodResponse({ status: 200, type: [CampoPersonalizadoDto] })
  reordenar(@Body() dados: OrdemDosCamposDto) {
    return this.campos.reordenar(dados.ids);
  }

  @Patch(':id')
  @SomenteAdministrador()
  @ZodResponse({ status: 200, type: CampoPersonalizadoDto })
  atualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dados: AtualizacaoDeCampoDto) {
    return this.campos.atualizar(id, dados);
  }

  @Delete(':id')
  @SomenteAdministrador()
  @HttpCode(204)
  @ApiNoContentResponse()
  excluir(@Param('id', ParseUUIDPipe) id: string) {
    return this.campos.excluir(id);
  }
}

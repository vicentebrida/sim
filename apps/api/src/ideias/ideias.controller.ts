import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ColaboradorAtual } from '../auth/decorators';
import type { Colaborador } from '../database/schema';
import {
  EdicaoDeIdeiaDto,
  IdeiaDto,
  ListarIdeiasQueryDto,
  MudancaDeStatusDto,
  NovaIdeiaDto,
  PaginaDeIdeiasDto,
  RecategorizacaoDto,
} from './ideias.dto';
import { IdeiasService } from './ideias.service';

@ApiTags('ideias')
@Controller('ideias')
export class IdeiasController {
  constructor(private readonly ideias: IdeiasService) {}

  @Get()
  @ZodResponse({ status: 200, type: PaginaDeIdeiasDto })
  listar(@ColaboradorAtual() colaborador: Colaborador, @Query() filtro: ListarIdeiasQueryDto) {
    return this.ideias.listar(colaborador, filtro);
  }

  @Post()
  @ZodResponse({ status: 201, type: IdeiaDto })
  criar(@ColaboradorAtual() colaborador: Colaborador, @Body() dados: NovaIdeiaDto) {
    return this.ideias.criar(colaborador, dados);
  }

  @Get(':numero')
  @ZodResponse({ status: 200, type: IdeiaDto })
  detalhar(
    @ColaboradorAtual() colaborador: Colaborador,
    @Param('numero', ParseIntPipe) numero: number,
  ) {
    return this.ideias.detalhar(colaborador, numero);
  }

  @Patch(':numero')
  @ZodResponse({ status: 200, type: IdeiaDto })
  editar(
    @ColaboradorAtual() colaborador: Colaborador,
    @Param('numero', ParseIntPipe) numero: number,
    @Body() dados: EdicaoDeIdeiaDto,
  ) {
    return this.ideias.editar(colaborador, numero, dados);
  }

  @Post(':numero/publicar')
  @ZodResponse({ status: 200, type: IdeiaDto })
  publicar(
    @ColaboradorAtual() colaborador: Colaborador,
    @Param('numero', ParseIntPipe) numero: number,
  ) {
    return this.ideias.publicar(colaborador, numero);
  }

  @Post(':numero/status')
  @ZodResponse({ status: 200, type: IdeiaDto })
  mudarStatus(
    @ColaboradorAtual() colaborador: Colaborador,
    @Param('numero', ParseIntPipe) numero: number,
    @Body() dados: MudancaDeStatusDto,
  ) {
    return this.ideias.mudarStatus(colaborador, numero, dados);
  }

  @Post(':numero/categoria')
  @ZodResponse({ status: 200, type: IdeiaDto })
  recategorizar(
    @ColaboradorAtual() colaborador: Colaborador,
    @Param('numero', ParseIntPipe) numero: number,
    @Body() dados: RecategorizacaoDto,
  ) {
    return this.ideias.recategorizar(colaborador, numero, dados);
  }

  @Delete(':numero')
  @HttpCode(204)
  @ApiNoContentResponse()
  excluir(
    @ColaboradorAtual() colaborador: Colaborador,
    @Param('numero', ParseIntPipe) numero: number,
  ) {
    return this.ideias.excluir(colaborador, numero);
  }
}

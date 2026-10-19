import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { ColaboradorAtual } from '../auth/decorators';
import type { Colaborador } from '../database/schema';
import {
  ComentarioDto,
  EdicaoDeComentarioDto,
  NovoComentarioDto,
  OcultacaoDeComentarioDto,
} from './comentarios.dto';
import { ComentariosService } from './comentarios.service';

@ApiTags('comentarios')
@Controller()
export class ComentariosController {
  constructor(private readonly comentarios: ComentariosService) {}

  @Get('ideias/:numero/comentarios')
  @ZodResponse({ status: 200, type: [ComentarioDto] })
  listar(
    @ColaboradorAtual() colaborador: Colaborador,
    @Param('numero', ParseIntPipe) numero: number,
  ) {
    return this.comentarios.listar(colaborador, numero);
  }

  @Post('ideias/:numero/comentarios')
  @ZodResponse({ status: 201, type: ComentarioDto })
  criar(
    @ColaboradorAtual() colaborador: Colaborador,
    @Param('numero', ParseIntPipe) numero: number,
    @Body() dados: NovoComentarioDto,
  ) {
    return this.comentarios.criar(colaborador, numero, dados);
  }

  @Patch('comentarios/:id')
  @ZodResponse({ status: 200, type: ComentarioDto })
  editar(
    @ColaboradorAtual() colaborador: Colaborador,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: EdicaoDeComentarioDto,
  ) {
    return this.comentarios.editar(colaborador, id, dados);
  }

  @Delete('comentarios/:id')
  @HttpCode(204)
  @ApiNoContentResponse()
  remover(@ColaboradorAtual() colaborador: Colaborador, @Param('id', ParseUUIDPipe) id: string) {
    return this.comentarios.remover(colaborador, id);
  }

  @Post('comentarios/:id/ocultar')
  @ZodResponse({ status: 200, type: ComentarioDto })
  ocultar(
    @ColaboradorAtual() colaborador: Colaborador,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dados: OcultacaoDeComentarioDto,
  ) {
    return this.comentarios.ocultar(colaborador, id, dados);
  }
}

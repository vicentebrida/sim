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
  AtualizacaoDeCategoriaDto,
  AvaliadoresDto,
  CategoriaDto,
  ListarCategoriasQueryDto,
  NovaCategoriaDto,
} from './categorias.dto';
import { CategoriasService } from './categorias.service';

@ApiTags('categorias')
@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categorias: CategoriasService) {}

  @Get()
  @ZodResponse({ status: 200, type: [CategoriaDto] })
  listar(@Query() query: ListarCategoriasQueryDto, @ColaboradorAtual() colaborador: Colaborador) {
    return this.categorias.listar({
      incluirInativas: query.incluirInativas && colaborador.administrador,
    });
  }

  @Post()
  @SomenteAdministrador()
  @ZodResponse({ status: 201, type: CategoriaDto })
  criar(@Body() dados: NovaCategoriaDto) {
    return this.categorias.criar(dados);
  }

  @Patch(':id')
  @SomenteAdministrador()
  @ZodResponse({ status: 200, type: CategoriaDto })
  atualizar(@Param('id', ParseUUIDPipe) id: string, @Body() dados: AtualizacaoDeCategoriaDto) {
    return this.categorias.atualizar(id, dados);
  }

  @Put(':id/avaliadores')
  @SomenteAdministrador()
  @ZodResponse({ status: 200, type: CategoriaDto })
  definirAvaliadores(@Param('id', ParseUUIDPipe) id: string, @Body() dados: AvaliadoresDto) {
    return this.categorias.definirAvaliadores(id, dados.colaboradorIds);
  }

  @Delete(':id')
  @SomenteAdministrador()
  @HttpCode(204)
  @ApiNoContentResponse()
  excluir(@Param('id', ParseUUIDPipe) id: string) {
    return this.categorias.excluir(id);
  }
}

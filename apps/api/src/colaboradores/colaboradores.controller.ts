import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { SomenteAdministrador } from '../auth/decorators';
import {
  BuscaDeMencionaveisDto,
  ColaboradorDto,
  ContaLocalCriadaDto,
  MencionavelDto,
  NovaContaLocalDto,
} from './colaboradores.dto';
import { ColaboradoresService } from './colaboradores.service';

/** Aberto a todos os Colaboradores: só nome e id, para sugerir Menções nos Comentários. */
@ApiTags('colaboradores')
@Controller('colaboradores/mencionaveis')
export class MencionaveisController {
  constructor(private readonly colaboradores: ColaboradoresService) {}

  @Get()
  @ZodResponse({ status: 200, type: [MencionavelDto] })
  buscar(@Query() { busca }: BuscaDeMencionaveisDto) {
    return this.colaboradores.mencionaveis(busca);
  }
}

@ApiTags('colaboradores')
@Controller('colaboradores')
@SomenteAdministrador()
export class ColaboradoresController {
  constructor(private readonly colaboradores: ColaboradoresService) {}

  @Get()
  @ZodResponse({ status: 200, type: [ColaboradorDto] })
  listar() {
    return this.colaboradores.listar();
  }

  @Post()
  @ZodResponse({ status: 201, type: ContaLocalCriadaDto })
  criarContaLocal(@Body() dados: NovaContaLocalDto) {
    return this.colaboradores.criarContaLocal(dados);
  }
}

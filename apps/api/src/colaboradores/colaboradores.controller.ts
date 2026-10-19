import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { SomenteAdministrador } from '../auth/decorators';
import { ColaboradorDto, ContaLocalCriadaDto, NovaContaLocalDto } from './colaboradores.dto';
import { ColaboradoresService } from './colaboradores.service';

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

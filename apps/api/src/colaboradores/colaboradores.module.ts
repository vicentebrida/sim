import { Module } from '@nestjs/common';
import { ColaboradoresController, MencionaveisController } from './colaboradores.controller';
import { ColaboradoresService } from './colaboradores.service';
import { ContaDeEmergenciaService } from './conta-de-emergencia.service';

@Module({
  controllers: [MencionaveisController, ColaboradoresController],
  providers: [ColaboradoresService, ContaDeEmergenciaService],
  exports: [ColaboradoresService, ContaDeEmergenciaService],
})
export class ColaboradoresModule {}

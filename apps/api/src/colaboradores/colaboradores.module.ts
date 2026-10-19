import { Module } from '@nestjs/common';
import { ColaboradoresController } from './colaboradores.controller';
import { ColaboradoresService } from './colaboradores.service';
import { ContaDeEmergenciaService } from './conta-de-emergencia.service';

@Module({
  controllers: [ColaboradoresController],
  providers: [ColaboradoresService, ContaDeEmergenciaService],
  exports: [ColaboradoresService, ContaDeEmergenciaService],
})
export class ColaboradoresModule {}

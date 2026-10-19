import { Module } from '@nestjs/common';
import { CamposPersonalizadosController } from './campos-personalizados.controller';
import { CamposPersonalizadosService } from './campos-personalizados.service';

@Module({
  controllers: [CamposPersonalizadosController],
  providers: [CamposPersonalizadosService],
  exports: [CamposPersonalizadosService],
})
export class CamposPersonalizadosModule {}

import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { CamposPersonalizadosModule } from '../campos-personalizados/campos-personalizados.module';
import { ErroDeDominioFilter } from './erro-de-dominio.filter';
import { IdeiasController } from './ideias.controller';
import { IdeiasService } from './ideias.service';

@Module({
  imports: [CamposPersonalizadosModule],
  controllers: [IdeiasController],
  providers: [IdeiasService, { provide: APP_FILTER, useClass: ErroDeDominioFilter }],
  exports: [IdeiasService],
})
export class IdeiasModule {}

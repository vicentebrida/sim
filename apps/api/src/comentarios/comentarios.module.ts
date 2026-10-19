import { Module } from '@nestjs/common';
import { IdeiasModule } from '../ideias/ideias.module';
import { ComentariosController } from './comentarios.controller';
import { ComentariosService } from './comentarios.service';

@Module({
  imports: [IdeiasModule],
  controllers: [ComentariosController],
  providers: [ComentariosService],
})
export class ComentariosModule {}

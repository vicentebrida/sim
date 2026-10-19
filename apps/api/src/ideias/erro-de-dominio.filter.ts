import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { type CodigoDeErro, ErroDeDominio } from './dominio/ideia';

const STATUS_HTTP: Record<CodigoDeErro, HttpStatus> = {
  SEM_PERMISSAO: HttpStatus.FORBIDDEN,
  TRANSICAO_INVALIDA: HttpStatus.CONFLICT,
  JUSTIFICATIVA_OBRIGATORIA: HttpStatus.BAD_REQUEST,
  IDEIA_ORIGINAL_INVALIDA: HttpStatus.BAD_REQUEST,
  CAMPOS_INVALIDOS: HttpStatus.BAD_REQUEST,
  CURTIDA_INDISPONIVEL: HttpStatus.CONFLICT,
  COMENTARIO_INDISPONIVEL: HttpStatus.CONFLICT,
};

/** Traduz violações de regras de domínio para respostas HTTP com código estável para o frontend. */
@Catch(ErroDeDominio)
export class ErroDeDominioFilter implements ExceptionFilter {
  catch(erro: ErroDeDominio, host: ArgumentsHost) {
    const statusCode = STATUS_HTTP[erro.codigo];
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, message: erro.message, codigo: erro.codigo, detalhes: erro.detalhes });
  }
}

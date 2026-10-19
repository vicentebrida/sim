import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError, ERROR_STATUS } from './domain-error';

/** Turns rule violations into HTTP responses with a stable code for the web app. */
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const statusCode = ERROR_STATUS[error.code];
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(statusCode)
      .json({ statusCode, message: error.message, code: error.code, details: error.details });
  }
}

import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('SIM — Sistema de Ideias e Melhorias')
    .setDescription('API REST do SIM')
    .setOpenAPIVersion('3.1.0')
    .setVersion('0.0.0')
    .build();
  // operationId `health_check` vira o hook `useHealthCheck` no cliente gerado pelo Orval.
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) => {
      const recurso = controllerKey.replace(/Controller$/, '');
      return `${recurso.charAt(0).toLowerCase()}${recurso.slice(1)}_${methodKey}`;
    },
  });
  return cleanupOpenApiDoc(document);
}

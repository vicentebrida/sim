import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('SIM — Sistema de Ideias e Melhorias')
    .setDescription('SIM REST API')
    .setOpenAPIVersion('3.1.0')
    .setVersion('0.0.0')
    .build();
  // operationId `health_check` becomes the `useHealthCheck` hook in the Orval-generated client.
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) => {
      const resource = controllerKey.replace(/Controller$/, '');
      return `${resource.charAt(0).toLowerCase()}${resource.slice(1)}_${methodKey}`;
    },
  });
  return cleanupOpenApiDoc(document);
}

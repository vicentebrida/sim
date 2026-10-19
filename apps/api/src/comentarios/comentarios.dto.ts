import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const Referencia = z.object({ id: z.uuid(), nome: z.string() });
// Menções vão no texto como `@[Nome](id)`.
const texto = z.string().trim().min(1).max(5000);

export class NovoComentarioDto extends createZodDto(
  z.object({
    texto,
    // Id do Comentário respondido, quando é uma Resposta.
    respostaAId: z.uuid().optional(),
  }),
) {}

export class EdicaoDeComentarioDto extends createZodDto(z.object({ texto })) {}

export class OcultacaoDeComentarioDto extends createZodDto(
  z.object({ motivo: z.string().trim().min(1).max(1000) }),
) {}

const ComentarioBaseSchema = z.object({
  id: z.uuid(),
  autor: Referencia,
  // Nulo quando removido, ou oculto para quem não escreveu nem modera.
  texto: z.string().nullable(),
  estado: z.enum(['publicado', 'removido', 'oculto']),
  criadoEm: z.iso.datetime(),
  editadoEm: z.iso.datetime().nullable(),
  ocultacao: z.object({ motivo: z.string(), por: Referencia, em: z.iso.datetime() }).nullable(),
  permissoes: z.object({
    podeResponder: z.boolean(),
    podeEditar: z.boolean(),
    podeRemover: z.boolean(),
    podeOcultar: z.boolean(),
  }),
});

export class ComentarioDto extends createZodDto(
  ComentarioBaseSchema.extend({
    // Só Comentários têm Respostas; numa Resposta a lista vem vazia.
    respostas: z.array(ComentarioBaseSchema),
  }),
) {}

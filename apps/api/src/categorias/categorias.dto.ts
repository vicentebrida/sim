import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const nome = z.string().trim().min(1).max(60);
const descricao = z.string().trim().max(280);

export class CategoriaDto extends createZodDto(
  z.object({
    id: z.uuid(),
    nome: z.string(),
    descricao: z.string(),
    ativa: z.boolean(),
    avaliadores: z.array(z.object({ id: z.uuid(), nome: z.string() })),
  }),
) {}

export class ListarCategoriasQueryDto extends createZodDto(
  z.object({
    // Só tem efeito para Administradores; os demais Colaboradores veem apenas as ativas.
    incluirInativas: z.stringbool().default(false),
  }),
) {}

export class NovaCategoriaDto extends createZodDto(
  z.object({ nome, descricao: descricao.default('') }),
) {}

export class AtualizacaoDeCategoriaDto extends createZodDto(
  z.object({
    nome: nome.optional(),
    descricao: descricao.optional(),
    ativa: z.boolean().optional(),
  }),
) {}

export class AvaliadoresDto extends createZodDto(
  z.object({
    colaboradorIds: z
      .array(z.uuid())
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'IDs repetidos'),
  }),
) {}

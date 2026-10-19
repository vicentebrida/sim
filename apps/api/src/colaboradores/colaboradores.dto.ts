import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ColaboradorSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  email: z.email(),
  departamento: z.string().nullable(),
  fotoUrl: z.string().nullable(),
  administrador: z.boolean(),
  ativo: z.boolean(),
});

export class ColaboradorDto extends createZodDto(ColaboradorSchema) {}

export class BuscaDeMencionaveisDto extends createZodDto(
  z.object({ busca: z.string().trim().max(120).default('') }),
) {}

export class MencionavelDto extends createZodDto(z.object({ id: z.uuid(), nome: z.string() })) {}

export class NovaContaLocalDto extends createZodDto(
  z.object({
    nome: z.string().trim().min(1).max(120),
    email: z.email().transform((email) => email.toLowerCase()),
    administrador: z.boolean().default(false),
  }),
) {}

export class ContaLocalCriadaDto extends createZodDto(
  z.object({
    colaborador: ColaboradorSchema,
    // Exibida uma única vez ao Administrador; o Colaborador troca no primeiro login.
    senhaTemporaria: z.string(),
  }),
) {}

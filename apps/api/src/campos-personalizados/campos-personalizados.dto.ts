import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { TIPOS_DE_CAMPO } from '../ideias/dominio/campos';

const rotulo = z.string().trim().min(1).max(80);
const ajuda = z.string().trim().max(280);
const opcoes = z
  .array(z.string().trim().min(1).max(80))
  .max(50)
  .refine((lista) => new Set(lista).size === lista.length, 'Opções repetidas');

export const CampoPersonalizadoSchema = z.object({
  id: z.uuid(),
  rotulo: z.string(),
  ajuda: z.string(),
  tipo: z.enum(TIPOS_DE_CAMPO),
  obrigatorio: z.boolean(),
  opcoes: z.array(z.string()),
  usarNaDeteccao: z.boolean(),
  ordem: z.number().int(),
  ativo: z.boolean(),
});

export class CampoPersonalizadoDto extends createZodDto(CampoPersonalizadoSchema) {}

export class ListarCamposQueryDto extends createZodDto(
  z.object({ incluirInativos: z.stringbool().default(false) }),
) {}

export class NovoCampoDto extends createZodDto(
  z.object({
    rotulo,
    ajuda: ajuda.default(''),
    tipo: z.enum(TIPOS_DE_CAMPO),
    obrigatorio: z.boolean().default(false),
    opcoes: opcoes.default([]),
    usarNaDeteccao: z.boolean().default(false),
  }),
) {}

/** O tipo não muda depois de criado: valores já gravados dependem dele. */
export class AtualizacaoDeCampoDto extends createZodDto(
  z.object({
    rotulo: rotulo.optional(),
    ajuda: ajuda.optional(),
    obrigatorio: z.boolean().optional(),
    opcoes: opcoes.optional(),
    usarNaDeteccao: z.boolean().optional(),
    ativo: z.boolean().optional(),
  }),
) {}

export class OrdemDosCamposDto extends createZodDto(z.object({ ids: z.array(z.uuid()).min(1) })) {}

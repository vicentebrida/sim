import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { TIPOS_DE_CAMPO } from './dominio/campos';
import { STATUS } from './dominio/ideia';

const ValorSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]);
const ValoresSchema = z.record(z.string(), ValorSchema);
const titulo = z.string().trim().min(1).max(120);
const justificativa = z.string().trim().min(1).max(2000);
const StatusSchema = z.enum(STATUS);
const Referencia = z.object({ id: z.uuid(), nome: z.string() });

export class NovaIdeiaDto extends createZodDto(
  z.object({
    titulo,
    categoriaId: z.uuid(),
    valores: ValoresSchema.default({}),
    // false salva como Rascunho; true publica (exige os campos obrigatórios).
    publicar: z.boolean().default(false),
  }),
) {}

export class EdicaoDeIdeiaDto extends createZodDto(
  z.object({
    titulo: titulo.optional(),
    categoriaId: z.uuid().optional(),
    valores: ValoresSchema.optional(),
  }),
) {}

export class MudancaDeStatusDto extends createZodDto(
  z.object({
    para: StatusSchema.exclude(['rascunho']),
    justificativa,
    // Obrigatório quando `para` é "duplicada".
    ideiaOriginalNumero: z.number().int().positive().optional(),
  }),
) {}

export class RecategorizacaoDto extends createZodDto(
  z.object({ categoriaId: z.uuid(), justificativa }),
) {}

export class ListarIdeiasQueryDto extends createZodDto(
  z.object({
    // Lista separada por vírgula. Sem filtro, mostra as publicadas, exceto Arquivadas.
    status: z
      .string()
      .optional()
      .transform((valor) => valor?.split(',').filter(Boolean))
      .pipe(z.array(StatusSchema).optional()),
    categoriaId: z.uuid().optional(),
    // "eu" lista as Ideias do Colaborador atual, incluindo os Rascunhos.
    autor: z.enum(['eu']).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(50).default(20),
  }),
) {}

const IdeiaResumoSchema = z.object({
  id: z.uuid(),
  numero: z.number().int(),
  titulo: z.string(),
  status: StatusSchema,
  categoria: Referencia,
  autor: Referencia,
  criadaEm: z.iso.datetime(),
  publicadaEm: z.iso.datetime().nullable(),
});

export class PaginaDeIdeiasDto extends createZodDto(
  z.object({
    itens: z.array(IdeiaResumoSchema),
    total: z.number().int(),
    pagina: z.number().int(),
    porPagina: z.number().int(),
  }),
) {}

export class IdeiaDto extends createZodDto(
  IdeiaResumoSchema.extend({
    editadaEm: z.iso.datetime().nullable(),
    valores: ValoresSchema,
    // Valores prontos para exibição, na ordem dos campos (inclui campos já desativados).
    respostas: z.array(
      z.object({
        campoId: z.uuid(),
        rotulo: z.string(),
        tipo: z.enum(TIPOS_DE_CAMPO),
        valor: ValorSchema,
      }),
    ),
    ideiaOriginal: z.object({ numero: z.number().int(), titulo: z.string() }).nullable(),
    historico: z.array(
      z.object({
        id: z.uuid(),
        tipo: z.enum(['status', 'categoria']),
        de: z.string().nullable(),
        para: z.string(),
        justificativa: z.string().nullable(),
        colaborador: Referencia,
        em: z.iso.datetime(),
      }),
    ),
    permissoes: z.object({
      podeEditar: z.boolean(),
      podeExcluir: z.boolean(),
      podePublicar: z.boolean(),
      podeAvaliar: z.boolean(),
      podeRecategorizar: z.boolean(),
      transicoes: z.array(StatusSchema),
    }),
  }),
) {}

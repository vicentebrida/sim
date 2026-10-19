import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { SENHA_MINIMA } from '../config/env';

export class ConfiguracaoDeAcessoDto extends createZodDto(
  z.object({
    loginLocal: z.boolean(),
    sso: z.object({ habilitado: z.boolean(), rotulo: z.string() }),
  }),
) {}

export class CredenciaisDto extends createZodDto(
  z.object({
    email: z.email().transform((email) => email.toLowerCase()),
    senha: z.string().min(1),
  }),
) {}

export class TrocaDeSenhaDto extends createZodDto(
  z.object({
    senhaAtual: z.string().min(1),
    novaSenha: z.string().min(SENHA_MINIMA).max(256),
  }),
) {}

export class ColaboradorAtualDto extends createZodDto(
  z.object({
    id: z.uuid(),
    nome: z.string(),
    email: z.email(),
    departamento: z.string().nullable(),
    fotoUrl: z.string().nullable(),
    administrador: z.boolean(),
    deveTrocarSenha: z.boolean(),
  }),
) {}

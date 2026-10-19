import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, ne } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { type Colaborador, colaboradores, sessoes } from '../database/schema';

export const DURACAO_SESSAO_MS = 14 * 24 * 60 * 60 * 1000;
// Sessões em uso são renovadas quando falta menos da metade da duração para expirar.
const RENOVAR_ABAIXO_DE_MS = DURACAO_SESSAO_MS / 2;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class SessoesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async criar(colaboradorId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.insert(sessoes).values({
      tokenHash: hashToken(token),
      colaboradorId,
      expiraEm: new Date(Date.now() + DURACAO_SESSAO_MS),
    });
    return token;
  }

  /** Devolve o Colaborador dono de uma sessão válida, ou `undefined`. */
  async validar(token: string): Promise<Colaborador | undefined> {
    const tokenHash = hashToken(token);
    const [linha] = await this.db
      .select({ colaborador: colaboradores, expiraEm: sessoes.expiraEm })
      .from(sessoes)
      .innerJoin(colaboradores, eq(sessoes.colaboradorId, colaboradores.id))
      .where(and(eq(sessoes.tokenHash, tokenHash), gt(sessoes.expiraEm, new Date())));

    if (!linha || !linha.colaborador.ativo) return undefined;

    if (linha.expiraEm.getTime() - Date.now() < RENOVAR_ABAIXO_DE_MS) {
      await this.db
        .update(sessoes)
        .set({ expiraEm: new Date(Date.now() + DURACAO_SESSAO_MS) })
        .where(eq(sessoes.tokenHash, tokenHash));
    }
    return linha.colaborador;
  }

  async encerrar(token: string) {
    await this.db.delete(sessoes).where(eq(sessoes.tokenHash, hashToken(token)));
  }

  /** Encerra as demais sessões do Colaborador (ex.: após trocar a senha). */
  async encerrarOutras(colaboradorId: string, tokenAtual: string) {
    await this.db
      .delete(sessoes)
      .where(
        and(eq(sessoes.colaboradorId, colaboradorId), ne(sessoes.tokenHash, hashToken(tokenAtual))),
      );
  }
}

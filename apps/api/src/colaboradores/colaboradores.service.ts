import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { gerarSenhaTemporaria, hashSenha } from '../auth/senha';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database } from '../database/database.module';
import { type Colaborador, colaboradores } from '../database/schema';

export interface PerfilSso {
  subject: string;
  email: string;
  nome: string;
  departamento?: string;
  fotoUrl?: string;
}

@Injectable()
export class ColaboradoresService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private ehAdministradorPorConfiguracao(email: string) {
    return this.env.SIM_ADMIN_EMAILS.includes(email);
  }

  async buscarPorEmail(email: string): Promise<Colaborador | undefined> {
    const [colaborador] = await this.db
      .select()
      .from(colaboradores)
      .where(eq(colaboradores.email, email.toLowerCase()));
    return colaborador;
  }

  /** Colaboradores ativos cujo nome contém a busca (sem diferenciar acentos), para Menções. */
  mencionaveis(busca: string) {
    const padrao = `%${busca.replace(/[\\%_]/g, (caractere) => `\\${caractere}`)}%`;
    return this.db
      .select({ id: colaboradores.id, nome: colaboradores.nome })
      .from(colaboradores)
      .where(
        and(
          eq(colaboradores.ativo, true),
          sql`unaccent(${colaboradores.nome}) ilike unaccent(${padrao})`,
        ),
      )
      .orderBy(asc(colaboradores.nome))
      .limit(8);
  }

  listar(): Promise<Colaborador[]> {
    return this.db.select().from(colaboradores).orderBy(asc(colaboradores.nome));
  }

  async criarContaLocal(dados: { nome: string; email: string; administrador: boolean }) {
    const senhaTemporaria = gerarSenhaTemporaria();
    const [colaborador] = await this.db
      .insert(colaboradores)
      .values({
        nome: dados.nome,
        email: dados.email,
        senhaHash: await hashSenha(senhaTemporaria),
        deveTrocarSenha: true,
        administrador: dados.administrador || this.ehAdministradorPorConfiguracao(dados.email),
      })
      .onConflictDoNothing({ target: colaboradores.email })
      .returning();
    if (!colaborador) throw new ConflictException('Já existe um Colaborador com este e-mail');
    return { colaborador, senhaTemporaria };
  }

  async definirSenha(colaboradorId: string, senha: string) {
    await this.db
      .update(colaboradores)
      .set({ senhaHash: await hashSenha(senha), deveTrocarSenha: false })
      .where(eq(colaboradores.id, colaboradorId));
  }

  async registrarLogin(colaboradorId: string) {
    await this.db
      .update(colaboradores)
      .set({ ultimoLoginEm: new Date() })
      .where(eq(colaboradores.id, colaboradorId));
  }

  /**
   * Criação just-in-time no primeiro login via SSO. Vincula pelo subject do provedor e, na falta
   * dele, pelo e-mail (ex.: conta local criada antes de o SSO ser ligado). Os dados do perfil são
   * atualizados a cada login, pois o provedor é a fonte da verdade sobre nome e departamento.
   */
  async provisionarViaSso(perfil: PerfilSso): Promise<Colaborador> {
    const email = perfil.email.toLowerCase();
    const dadosDoPerfil = {
      nome: perfil.nome,
      email,
      ssoSubject: perfil.subject,
      departamento: perfil.departamento ?? null,
      fotoUrl: perfil.fotoUrl ?? null,
      ultimoLoginEm: new Date(),
    };
    const promoverAdministrador = this.ehAdministradorPorConfiguracao(email)
      ? { administrador: true }
      : {};

    return this.db.transaction(async (tx) => {
      const [porSubject] = await tx
        .select()
        .from(colaboradores)
        .where(eq(colaboradores.ssoSubject, perfil.subject));
      const [porEmail] = porSubject
        ? []
        : await tx.select().from(colaboradores).where(eq(colaboradores.email, email));
      const existente = porSubject ?? porEmail;

      if (existente) {
        const [atualizado] = await tx
          .update(colaboradores)
          .set({ ...dadosDoPerfil, ...promoverAdministrador })
          .where(eq(colaboradores.id, existente.id))
          .returning();
        return atualizado!;
      }

      const [criado] = await tx
        .insert(colaboradores)
        .values({ ...dadosDoPerfil, ...promoverAdministrador })
        .returning();
      return criado!;
    });
  }
}

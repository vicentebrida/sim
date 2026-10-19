import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { hashSenha, verificarSenha } from '../auth/senha';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DB, type Database } from '../database/database.module';
import { colaboradores } from '../database/schema';

/**
 * Conta de emergência: primeiro Administrador da instalação e acesso garantido mesmo com o SSO
 * fora do ar. A senha vem sempre da variável de ambiente, nunca da tela.
 */
@Injectable()
export class ContaDeEmergenciaService {
  private readonly logger = new Logger(ContaDeEmergenciaService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  ehContaDeEmergencia(email: string) {
    return this.env.SIM_EMERGENCY_EMAIL === email;
  }

  async garantir() {
    const email = this.env.SIM_EMERGENCY_EMAIL;
    const senha = this.env.SIM_EMERGENCY_PASSWORD;
    if (!email || !senha) return;

    const [existente] = await this.db
      .select()
      .from(colaboradores)
      .where(eq(colaboradores.email, email));

    if (!existente) {
      await this.db.insert(colaboradores).values({
        nome: 'Administrador',
        email,
        senhaHash: await hashSenha(senha),
        administrador: true,
      });
      this.logger.log(`Conta de emergência criada: ${email}`);
      return;
    }

    const senhaMudou = !(await verificarSenha(existente.senhaHash, senha));
    await this.db
      .update(colaboradores)
      .set({
        administrador: true,
        ativo: true,
        deveTrocarSenha: false,
        ...(senhaMudou ? { senhaHash: await hashSenha(senha) } : {}),
      })
      .where(eq(colaboradores.id, existente.id));
  }
}

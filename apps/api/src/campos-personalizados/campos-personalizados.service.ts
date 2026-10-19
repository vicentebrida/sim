import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { asc, eq, max, sql } from 'drizzle-orm';
import { DB, type Database } from '../database/database.module';
import { type CampoPersonalizado, camposPersonalizados, ideias } from '../database/schema';
import type { TipoDeCampo } from '../ideias/dominio/campos';

const TIPOS_COM_OPCOES: TipoDeCampo[] = ['selecao_unica', 'selecao_multipla'];
const TIPOS_DE_TEXTO: TipoDeCampo[] = ['texto_curto', 'texto_longo'];

function validarConfiguracao(campo: {
  tipo: TipoDeCampo;
  opcoes: string[];
  usarNaDeteccao: boolean;
}) {
  if (TIPOS_COM_OPCOES.includes(campo.tipo) && campo.opcoes.length < 2) {
    throw new BadRequestException('Campos de seleção precisam de pelo menos duas opções');
  }
  if (!TIPOS_COM_OPCOES.includes(campo.tipo) && campo.opcoes.length) {
    throw new BadRequestException('Só campos de seleção têm opções');
  }
  if (campo.usarNaDeteccao && !TIPOS_DE_TEXTO.includes(campo.tipo)) {
    throw new BadRequestException('Só campos de texto entram na detecção de Ideias Semelhantes');
  }
}

@Injectable()
export class CamposPersonalizadosService {
  constructor(@Inject(DB) private readonly db: Database) {}

  listar({ incluirInativos }: { incluirInativos: boolean }): Promise<CampoPersonalizado[]> {
    return this.db
      .select()
      .from(camposPersonalizados)
      .where(incluirInativos ? undefined : eq(camposPersonalizados.ativo, true))
      .orderBy(asc(camposPersonalizados.ordem), asc(camposPersonalizados.criadoEm));
  }

  private async buscar(id: string) {
    const [campo] = await this.db
      .select()
      .from(camposPersonalizados)
      .where(eq(camposPersonalizados.id, id));
    if (!campo) throw new NotFoundException('Campo não encontrado');
    return campo;
  }

  async criar(dados: Omit<CampoPersonalizado, 'id' | 'ordem' | 'ativo' | 'criadoEm'>) {
    validarConfiguracao(dados);
    const [{ ultima }] = (await this.db
      .select({ ultima: max(camposPersonalizados.ordem) })
      .from(camposPersonalizados)) as [{ ultima: number | null }];
    const [campo] = await this.db
      .insert(camposPersonalizados)
      .values({ ...dados, ordem: (ultima ?? 0) + 1 })
      .returning();
    return campo!;
  }

  async atualizar(
    id: string,
    dados: Partial<
      Pick<
        CampoPersonalizado,
        'rotulo' | 'ajuda' | 'obrigatorio' | 'opcoes' | 'usarNaDeteccao' | 'ativo'
      >
    >,
  ) {
    const atual = await this.buscar(id);
    validarConfiguracao({ ...atual, ...dados });
    const [campo] = await this.db
      .update(camposPersonalizados)
      .set(dados)
      .where(eq(camposPersonalizados.id, id))
      .returning();
    return campo!;
  }

  /** Define a ordem de exibição; a lista deve conter todos os campos, ativos e inativos. */
  async reordenar(ids: string[]) {
    const todos = await this.listar({ incluirInativos: true });
    const esperados = new Set(todos.map((campo) => campo.id));
    if (ids.length !== esperados.size || !ids.every((id) => esperados.has(id))) {
      throw new BadRequestException('Informe todos os campos, cada um uma vez');
    }
    await this.db.transaction(async (tx) => {
      for (const [posicao, id] of ids.entries()) {
        await tx
          .update(camposPersonalizados)
          .set({ ordem: posicao + 1 })
          .where(eq(camposPersonalizados.id, id));
      }
    });
    return this.listar({ incluirInativos: true });
  }

  async excluir(id: string) {
    await this.buscar(id);
    const [emUso] = await this.db
      .select({ id: ideias.id })
      .from(ideias)
      .where(sql`jsonb_exists(${ideias.valores}, ${id})`)
      .limit(1);
    if (emUso) {
      throw new ConflictException(
        'Este campo já foi preenchido em Ideias; desative-o em vez de excluir',
      );
    }
    await this.db.delete(camposPersonalizados).where(eq(camposPersonalizados.id, id));
  }
}

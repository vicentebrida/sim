import {
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ColaboradoresService } from '../../colaboradores/colaboradores.service';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { COOKIE_SESSAO, COOKIE_SSO, opcoesCookie } from '../cookies';
import { Publico } from '../decorators';
import { DURACAO_SESSAO_MS, SessoesService } from '../sessoes.service';
import { SsoService, type TransacaoSso } from './sso.service';

const CAMINHO_COOKIE_SSO = '/api/auth/sso';
const VALIDADE_TRANSACAO_MS = 10 * 60 * 1000;

/** Só aceita caminhos internos, para o retorno pós-login não virar um open redirect. */
export function retornoSeguro(retorno: unknown): string {
  if (typeof retorno !== 'string' || !retorno.startsWith('/') || retorno.startsWith('//')) {
    return '/';
  }
  return retorno.includes('\\') ? '/' : retorno;
}

function lerTransacao(valor: unknown): TransacaoSso | undefined {
  if (typeof valor !== 'string') return undefined;
  try {
    return JSON.parse(Buffer.from(valor, 'base64url').toString('utf8')) as TransacaoSso;
  } catch {
    return undefined;
  }
}

/** Fluxo de navegação (redirecionamentos), não faz parte da API REST documentada. */
@ApiExcludeController()
@Controller('auth/sso')
@Publico()
export class SsoController {
  private readonly logger = new Logger(SsoController.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly sso: SsoService,
    private readonly colaboradores: ColaboradoresService,
    private readonly sessoes: SessoesService,
  ) {}

  @Get('entrar')
  async entrar(@Query('retorno') retorno: unknown, @Res() res: Response) {
    if (!this.sso.habilitado) throw new NotFoundException();
    try {
      const { url, transacao } = await this.sso.iniciar(retornoSeguro(retorno));
      res.cookie(
        COOKIE_SSO,
        Buffer.from(JSON.stringify(transacao)).toString('base64url'),
        opcoesCookie(this.env, VALIDADE_TRANSACAO_MS, CAMINHO_COOKIE_SSO),
      );
      res.redirect(url.toString());
    } catch (erro) {
      this.logger.error('Não foi possível iniciar o login via SSO', erro as Error);
      res.redirect('/entrar?erro=sso');
    }
  }

  @Get('retorno')
  async retorno(@Req() req: Request, @Res() res: Response) {
    if (!this.sso.habilitado) throw new NotFoundException();
    const transacao = lerTransacao(req.cookies?.[COOKIE_SSO]);
    res.clearCookie(COOKIE_SSO, { path: CAMINHO_COOKIE_SSO });
    if (!transacao) return res.redirect('/entrar?erro=sso');

    try {
      const urlAtual = new URL(req.originalUrl, this.env.SIM_PUBLIC_URL);
      const perfil = await this.sso.concluir(urlAtual, transacao);
      const colaborador = await this.colaboradores.provisionarViaSso(perfil);
      if (!colaborador.ativo) return res.redirect('/entrar?erro=inativo');

      const token = await this.sessoes.criar(colaborador.id);
      res.cookie(COOKIE_SESSAO, token, opcoesCookie(this.env, DURACAO_SESSAO_MS));
      return res.redirect(retornoSeguro(transacao.retorno));
    } catch (erro) {
      this.logger.error('Falha no retorno do SSO', erro as Error);
      return res.redirect('/entrar?erro=sso');
    }
  }
}

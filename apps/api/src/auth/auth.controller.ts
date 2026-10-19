import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiTags, ApiTooManyRequestsResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ZodResponse } from 'nestjs-zod';
import { ColaboradoresService } from '../colaboradores/colaboradores.service';
import { ContaDeEmergenciaService } from '../colaboradores/conta-de-emergencia.service';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import type { Colaborador } from '../database/schema';
import {
  ColaboradorAtualDto,
  ConfiguracaoDeAcessoDto,
  CredenciaisDto,
  TrocaDeSenhaDto,
} from './auth.dto';
import { COOKIE_SESSAO, opcoesCookie } from './cookies';
import { ColaboradorAtual, PermiteSenhaTemporaria, Publico } from './decorators';
import { verificarSenha } from './senha';
import { DURACAO_SESSAO_MS, SessoesService } from './sessoes.service';
import { SsoService } from './sso/sso.service';
import { MuitasTentativasException, TentativasDeLoginService } from './tentativas-de-login';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly colaboradores: ColaboradoresService,
    private readonly contaDeEmergencia: ContaDeEmergenciaService,
    private readonly sessoes: SessoesService,
    private readonly sso: SsoService,
    private readonly tentativas: TentativasDeLoginService,
  ) {}

  @Get('configuracao')
  @Publico()
  @ZodResponse({ status: 200, type: ConfiguracaoDeAcessoDto })
  configuracao() {
    return {
      loginLocal: true,
      sso: { habilitado: this.sso.habilitado, rotulo: this.sso.rotulo },
    };
  }

  @Post('login')
  @Publico()
  @ApiTooManyRequestsResponse({ description: 'Muitas tentativas; aguarde e tente novamente' })
  @ZodResponse({ status: 200, type: ColaboradorAtualDto })
  async login(
    @Body() credenciais: CredenciaisDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip ?? 'desconhecido';
    try {
      this.tentativas.verificar(ip, credenciais.email);
    } catch (erro) {
      if (erro instanceof MuitasTentativasException) {
        res.setHeader('Retry-After', String(erro.retryAfterSegundos));
      }
      throw erro;
    }

    const colaborador = await this.colaboradores.buscarPorEmail(credenciais.email);
    const senhaConfere = await verificarSenha(colaborador?.senhaHash, credenciais.senha);
    // Mesma resposta para e-mail inexistente, senha errada e Colaborador Inativo.
    if (!colaborador || !senhaConfere || !colaborador.ativo) {
      this.tentativas.registrarFalha(ip, credenciais.email);
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    this.tentativas.registrarSucesso(ip, credenciais.email);
    await this.iniciarSessao(colaborador.id, res);
    return colaborador;
  }

  @Post('logout')
  @PermiteSenhaTemporaria()
  @HttpCode(204)
  @ApiNoContentResponse()
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: unknown = req.cookies?.[COOKIE_SESSAO];
    if (typeof token === 'string') await this.sessoes.encerrar(token);
    res.clearCookie(COOKIE_SESSAO, { ...opcoesCookie(this.env, 0), maxAge: undefined });
  }

  @Get('me')
  @PermiteSenhaTemporaria()
  @ZodResponse({ status: 200, type: ColaboradorAtualDto })
  me(@ColaboradorAtual() colaborador: Colaborador) {
    return colaborador;
  }

  @Post('trocar-senha')
  @PermiteSenhaTemporaria()
  @HttpCode(204)
  @ApiNoContentResponse()
  async trocarSenha(
    @ColaboradorAtual() colaborador: Colaborador,
    @Body() dados: TrocaDeSenhaDto,
    @Req() req: Request,
  ) {
    if (this.contaDeEmergencia.ehContaDeEmergencia(colaborador.email)) {
      throw new BadRequestException(
        'A senha da conta de emergência é definida por SIM_EMERGENCY_PASSWORD',
      );
    }
    if (!colaborador.senhaHash) {
      throw new BadRequestException('Este Colaborador entra pelo SSO e não tem senha local');
    }
    if (!(await verificarSenha(colaborador.senhaHash, dados.senhaAtual))) {
      throw new BadRequestException('Senha atual incorreta');
    }
    if (dados.novaSenha === dados.senhaAtual) {
      throw new BadRequestException('A nova senha deve ser diferente da atual');
    }
    await this.colaboradores.definirSenha(colaborador.id, dados.novaSenha);
    await this.sessoes.encerrarOutras(colaborador.id, req.cookies[COOKIE_SESSAO] as string);
  }

  async iniciarSessao(colaboradorId: string, res: Response) {
    const token = await this.sessoes.criar(colaboradorId);
    await this.colaboradores.registrarLogin(colaboradorId);
    res.cookie(COOKIE_SESSAO, token, opcoesCookie(this.env, DURACAO_SESSAO_MS));
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import * as client from 'openid-client';
import type { PerfilSso } from '../../colaboradores/colaboradores.service';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';

/** O que precisa sobreviver entre o redirecionamento ao provedor e o retorno (cookie httpOnly). */
export interface TransacaoSso {
  estado: string;
  verificador: string;
  nonce?: string;
  retorno: string;
}

export class FalhaSso extends Error {}

const ESCOPOS_OIDC_PADRAO = 'openid profile email';

/** Lê um claim que pode estar aninhado, ex.: `profile.department`. */
function lerClaim(
  claims: Record<string, unknown>,
  caminho: string | undefined,
): string | undefined {
  if (!caminho) return undefined;
  let valor: unknown = claims;
  for (const parte of caminho.split('.')) {
    if (typeof valor !== 'object' || valor === null) return undefined;
    valor = (valor as Record<string, unknown>)[parte];
  }
  if (typeof valor === 'string' && valor.trim()) return valor.trim();
  if (typeof valor === 'number') return String(valor);
  return undefined;
}

/**
 * Um único provedor OAuth2/OIDC (ADR-0003). Em modo `oidc` os endpoints vêm do discovery; em modo
 * `oauth2` são informados manualmente e a identidade vem só do endpoint userinfo.
 */
@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);
  private configuracao?: Promise<client.Configuration>;

  constructor(@Inject(ENV) private readonly env: Env) {}

  get habilitado() {
    return this.env.SIM_SSO_MODE !== 'off';
  }

  get rotulo() {
    return this.env.SIM_SSO_BUTTON_LABEL;
  }

  get urlDeRetorno() {
    return new URL('/api/auth/sso/retorno', this.env.SIM_PUBLIC_URL).toString();
  }

  private autenticacaoDoCliente(): client.ClientAuth {
    const segredo = this.env.SIM_SSO_CLIENT_SECRET;
    if (!segredo) return client.None();
    return this.env.SIM_SSO_TOKEN_AUTH_METHOD === 'client_secret_post'
      ? client.ClientSecretPost(segredo)
      : client.ClientSecretBasic(segredo);
  }

  private permitirHttpSeNecessario(url: string, configuracao?: client.Configuration) {
    if (!url.startsWith('http://')) return [];
    this.logger.warn(
      `Provedor SSO sem HTTPS (${url}); use apenas em desenvolvimento ou rede confiável`,
    );
    if (configuracao) client.allowInsecureRequests(configuracao);
    return [client.allowInsecureRequests];
  }

  private async criarConfiguracao(): Promise<client.Configuration> {
    const env = this.env;
    const clientId = env.SIM_SSO_CLIENT_ID!;

    if (env.SIM_SSO_MODE === 'oidc') {
      const issuer = env.SIM_SSO_ISSUER!;
      return client.discovery(new URL(issuer), clientId, undefined, this.autenticacaoDoCliente(), {
        execute: this.permitirHttpSeNecessario(issuer),
      });
    }

    const authorizationUrl = env.SIM_SSO_AUTHORIZATION_URL!;
    const configuracao = new client.Configuration(
      {
        issuer: new URL(authorizationUrl).origin,
        authorization_endpoint: authorizationUrl,
        token_endpoint: env.SIM_SSO_TOKEN_URL!,
        userinfo_endpoint: env.SIM_SSO_USERINFO_URL!,
      },
      clientId,
      undefined,
      this.autenticacaoDoCliente(),
    );
    this.permitirHttpSeNecessario(authorizationUrl, configuracao);
    return configuracao;
  }

  private obterConfiguracao() {
    this.configuracao ??= this.criarConfiguracao().catch((erro: unknown) => {
      this.configuracao = undefined; // tenta de novo no próximo login
      throw erro;
    });
    return this.configuracao;
  }

  async iniciar(retorno: string): Promise<{ url: URL; transacao: TransacaoSso }> {
    const configuracao = await this.obterConfiguracao();
    const oidc = this.env.SIM_SSO_MODE === 'oidc';
    const transacao: TransacaoSso = {
      estado: client.randomState(),
      verificador: client.randomPKCECodeVerifier(),
      nonce: oidc ? client.randomNonce() : undefined,
      retorno,
    };
    const parametros: Record<string, string> = {
      redirect_uri: this.urlDeRetorno,
      scope: this.env.SIM_SSO_SCOPES ?? ESCOPOS_OIDC_PADRAO,
      state: transacao.estado,
      code_challenge: await client.calculatePKCECodeChallenge(transacao.verificador),
      code_challenge_method: 'S256',
    };
    if (transacao.nonce) parametros.nonce = transacao.nonce;
    return { url: client.buildAuthorizationUrl(configuracao, parametros), transacao };
  }

  async concluir(urlAtual: URL, transacao: TransacaoSso): Promise<PerfilSso> {
    const configuracao = await this.obterConfiguracao();
    const tokens = await client.authorizationCodeGrant(configuracao, urlAtual, {
      pkceCodeVerifier: transacao.verificador,
      expectedState: transacao.estado,
      expectedNonce: transacao.nonce,
      idTokenExpected: this.env.SIM_SSO_MODE === 'oidc',
    });

    const claims = await this.lerClaims(configuracao, tokens);
    const subject = lerClaim(claims, this.env.SIM_SSO_CLAIM_ID);
    const email = lerClaim(claims, this.env.SIM_SSO_CLAIM_EMAIL);
    if (!subject || !email) {
      throw new FalhaSso(
        `O provedor não enviou os claims "${this.env.SIM_SSO_CLAIM_ID}" e "${this.env.SIM_SSO_CLAIM_EMAIL}"`,
      );
    }
    return {
      subject,
      email,
      nome: lerClaim(claims, this.env.SIM_SSO_CLAIM_NAME) ?? email,
      departamento: lerClaim(claims, this.env.SIM_SSO_CLAIM_DEPARTMENT),
      fotoUrl: lerClaim(claims, this.env.SIM_SSO_CLAIM_PICTURE),
    };
  }

  private async lerClaims(
    configuracao: client.Configuration,
    tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>,
  ): Promise<Record<string, unknown>> {
    if (this.env.SIM_SSO_MODE === 'oidc') {
      const doIdToken = tokens.claims();
      if (!doIdToken) throw new FalhaSso('O provedor não devolveu id_token');
      if (!configuracao.serverMetadata().userinfo_endpoint) return { ...doIdToken };
      const userinfo = await client.fetchUserInfo(configuracao, tokens.access_token, doIdToken.sub);
      return { ...doIdToken, ...userinfo };
    }

    const resposta = await client.fetchProtectedResource(
      configuracao,
      tokens.access_token,
      new URL(this.env.SIM_SSO_USERINFO_URL!),
      'GET',
    );
    if (!resposta.ok) throw new FalhaSso(`userinfo respondeu ${resposta.status}`);
    return (await resposta.json()) as Record<string, unknown>;
  }
}

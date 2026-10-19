import { Inject, Injectable, Logger } from '@nestjs/common';
import * as client from 'openid-client';
import type { SsoProfile } from '../../collaborators/collaborators.service';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';

/** What must survive between the redirect to the provider and the callback (httpOnly cookie). */
export interface SsoTransaction {
  state: string;
  verifier: string;
  nonce?: string;
  returnTo: string;
}

export class SsoFailure extends Error {}

const DEFAULT_OIDC_SCOPES = 'openid profile email';

/** Reads a claim that may be nested, e.g. `profile.department`. */
function readClaim(claims: Record<string, unknown>, path: string | undefined): string | undefined {
  if (!path) return undefined;
  let value: unknown = claims;
  for (const part of path.split('.')) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return undefined;
}

/**
 * A single OAuth2/OIDC provider (ADR-0003). In `oidc` mode the endpoints come from discovery; in
 * `oauth2` mode they are set manually and the identity comes only from the userinfo endpoint.
 */
@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);
  private configuration?: Promise<client.Configuration>;

  constructor(@Inject(ENV) private readonly env: Env) {}

  get enabled() {
    return this.env.SIM_SSO_MODE !== 'off';
  }

  get label() {
    return this.env.SIM_SSO_BUTTON_LABEL;
  }

  get callbackUrl() {
    return new URL('/api/auth/sso/callback', this.env.SIM_PUBLIC_URL).toString();
  }

  private clientAuthentication(): client.ClientAuth {
    const secret = this.env.SIM_SSO_CLIENT_SECRET;
    if (!secret) return client.None();
    return this.env.SIM_SSO_TOKEN_AUTH_METHOD === 'client_secret_post'
      ? client.ClientSecretPost(secret)
      : client.ClientSecretBasic(secret);
  }

  private allowHttpIfNeeded(url: string, configuration?: client.Configuration) {
    if (!url.startsWith('http://')) return [];
    this.logger.warn(
      `SSO provider without HTTPS (${url}); use only in development or trusted networks`,
    );
    if (configuration) client.allowInsecureRequests(configuration);
    return [client.allowInsecureRequests];
  }

  private async createConfiguration(): Promise<client.Configuration> {
    const env = this.env;
    const clientId = env.SIM_SSO_CLIENT_ID!;

    if (env.SIM_SSO_MODE === 'oidc') {
      const issuer = env.SIM_SSO_ISSUER!;
      return client.discovery(new URL(issuer), clientId, undefined, this.clientAuthentication(), {
        execute: this.allowHttpIfNeeded(issuer),
      });
    }

    const authorizationUrl = env.SIM_SSO_AUTHORIZATION_URL!;
    const configuration = new client.Configuration(
      {
        issuer: new URL(authorizationUrl).origin,
        authorization_endpoint: authorizationUrl,
        token_endpoint: env.SIM_SSO_TOKEN_URL!,
        userinfo_endpoint: env.SIM_SSO_USERINFO_URL!,
      },
      clientId,
      undefined,
      this.clientAuthentication(),
    );
    this.allowHttpIfNeeded(authorizationUrl, configuration);
    return configuration;
  }

  private getConfiguration() {
    this.configuration ??= this.createConfiguration().catch((error: unknown) => {
      this.configuration = undefined; // try again on the next login
      throw error;
    });
    return this.configuration;
  }

  async start(returnTo: string): Promise<{ url: URL; transaction: SsoTransaction }> {
    const configuration = await this.getConfiguration();
    const oidc = this.env.SIM_SSO_MODE === 'oidc';
    const transaction: SsoTransaction = {
      state: client.randomState(),
      verifier: client.randomPKCECodeVerifier(),
      nonce: oidc ? client.randomNonce() : undefined,
      returnTo,
    };
    const parameters: Record<string, string> = {
      redirect_uri: this.callbackUrl,
      scope: this.env.SIM_SSO_SCOPES ?? DEFAULT_OIDC_SCOPES,
      state: transaction.state,
      code_challenge: await client.calculatePKCECodeChallenge(transaction.verifier),
      code_challenge_method: 'S256',
    };
    if (transaction.nonce) parameters.nonce = transaction.nonce;
    return { url: client.buildAuthorizationUrl(configuration, parameters), transaction };
  }

  async finish(currentUrl: URL, transaction: SsoTransaction): Promise<SsoProfile> {
    const configuration = await this.getConfiguration();
    const tokens = await client.authorizationCodeGrant(configuration, currentUrl, {
      pkceCodeVerifier: transaction.verifier,
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      idTokenExpected: this.env.SIM_SSO_MODE === 'oidc',
    });

    const claims = await this.readClaims(configuration, tokens);
    const subject = readClaim(claims, this.env.SIM_SSO_CLAIM_ID);
    const email = readClaim(claims, this.env.SIM_SSO_CLAIM_EMAIL);
    if (!subject || !email) {
      throw new SsoFailure(
        `The provider did not send the "${this.env.SIM_SSO_CLAIM_ID}" and "${this.env.SIM_SSO_CLAIM_EMAIL}" claims`,
      );
    }
    return {
      subject,
      email,
      name: readClaim(claims, this.env.SIM_SSO_CLAIM_NAME) ?? email,
      department: readClaim(claims, this.env.SIM_SSO_CLAIM_DEPARTMENT),
      pictureUrl: readClaim(claims, this.env.SIM_SSO_CLAIM_PICTURE),
    };
  }

  private async readClaims(
    configuration: client.Configuration,
    tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>,
  ): Promise<Record<string, unknown>> {
    if (this.env.SIM_SSO_MODE === 'oidc') {
      const fromIdToken = tokens.claims();
      if (!fromIdToken) throw new SsoFailure('The provider did not return an id_token');
      if (!configuration.serverMetadata().userinfo_endpoint) return { ...fromIdToken };
      const userinfo = await client.fetchUserInfo(
        configuration,
        tokens.access_token,
        fromIdToken.sub,
      );
      return { ...fromIdToken, ...userinfo };
    }

    const response = await client.fetchProtectedResource(
      configuration,
      tokens.access_token,
      new URL(this.env.SIM_SSO_USERINFO_URL!),
      'GET',
    );
    if (!response.ok) throw new SsoFailure(`userinfo answered ${response.status}`);
    return (await response.json()) as Record<string, unknown>;
  }
}

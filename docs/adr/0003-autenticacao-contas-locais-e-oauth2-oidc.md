# Autenticação: contas locais + um provedor OAuth2/OIDC configurável; sem LDAP/SAML diretos

O SIM funciona sozinho com contas locais (e-mail + senha) e opcionalmente se conecta ao SSO da empresa por um único provedor OAuth2/OIDC, com dois modos: OIDC (configurado só pela issuer URL via discovery) e OAuth2 genérico (endpoints authorize/token/userinfo e mapeamento de campos informados manualmente), ambos com authorization code + PKCE. Colaboradores são criados just-in-time no primeiro login. Com SSO ativo, o login local pode ser desligado, restando uma conta de emergência definida por variável de ambiente.

## Considered Options

- LDAP/AD direto e SAML 2.0: adiados. Para AD on-premise sem ADFS, a documentação recomenda o Keycloak como ponte (federa o LDAP e expõe OIDC), evitando que o SIM mantenha integrações de diretório próprias.
- Só OIDC: descartado porque há SSOs corporativos que expõem apenas OAuth2 sem OIDC.

## Consequences

No modo OAuth2 genérico o SIM confia que o e-mail retornado pelo userinfo é verificado; isso é responsabilidade de quem configura e precisa estar documentado.

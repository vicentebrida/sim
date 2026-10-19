import { OAuth2Server } from 'oauth2-mock-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type AppDeTeste, criarApp } from './support/app';

type Navegador = ReturnType<AppDeTeste['navegador']>;
type Claims = Record<string, unknown>;

/** Provedor de identidade de mentira; cada teste define quem "está logado" nele. */
async function iniciarProvedor() {
  const provedor = new OAuth2Server();
  await provedor.issuer.keys.generate('RS256');
  await provedor.start(0, '127.0.0.1');
  let idToken: Claims = {};
  let userinfo: Claims = {};
  provedor.service.on('beforeTokenSigning', (token) => Object.assign(token.payload, idToken));
  provedor.service.on('beforeUserinfo', (resposta) => {
    resposta.body = userinfo;
  });
  return {
    provedor,
    url: provedor.issuer.url!,
    identidade(claims: { idToken?: Claims; userinfo?: Claims }) {
      idToken = claims.idToken ?? {};
      userinfo = claims.userinfo ?? {};
    },
  };
}

/** Faz o caminho do navegador: SIM → provedor → retorno ao SIM. Devolve o destino final. */
async function entrarViaSso(navegador: Navegador, retorno = '/') {
  const inicio = await navegador.get('/api/auth/sso/entrar').query({ retorno }).expect(302);
  const noProvedor = await fetch(inicio.headers.location!, { redirect: 'manual' });
  const deVolta = new URL(noProvedor.headers.get('location')!);
  const final = await navegador.get(deVolta.pathname + deVolta.search).expect(302);
  return final.headers.location as string;
}

describe('SSO em modo OIDC', () => {
  let sim: AppDeTeste;
  let idp: Awaited<ReturnType<typeof iniciarProvedor>>;

  beforeAll(async () => {
    idp = await iniciarProvedor();
    sim = await criarApp({
      SIM_SSO_MODE: 'oidc',
      SIM_SSO_ISSUER: idp.url,
      SIM_SSO_CLIENT_ID: 'sim',
      SIM_SSO_CLIENT_SECRET: 'segredo',
      SIM_SSO_CLAIM_DEPARTMENT: 'department',
      SIM_SSO_BUTTON_LABEL: 'Entrar com a conta Acme',
      SIM_ADMIN_EMAILS: 'diretora@acme.test',
    });
  });

  afterAll(async () => {
    await sim.fechar();
    await idp.provedor.stop();
  });

  beforeEach(() => {
    const claims = {
      sub: 'func-001',
      email: 'Maria@Acme.test',
      name: 'Maria Silva',
      department: 'Financeiro',
    };
    idp.identidade({ idToken: claims, userinfo: claims });
  });

  it('anuncia o botão de SSO ao frontend', async () => {
    const response = await sim.http().get('/api/auth/configuracao').expect(200);
    expect(response.body.sso).toEqual({ habilitado: true, rotulo: 'Entrar com a conta Acme' });
  });

  it('cria o Colaborador no primeiro login e volta para a página pedida', async () => {
    const navegador = sim.navegador();
    expect(await entrarViaSso(navegador, '/ideias/123')).toBe('/ideias/123');

    const me = await navegador.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({
      nome: 'Maria Silva',
      email: 'maria@acme.test',
      departamento: 'Financeiro',
      administrador: false,
      deveTrocarSenha: false,
    });
  });

  it('atualiza os dados do Colaborador a cada login, sem duplicá-lo', async () => {
    await entrarViaSso(sim.navegador());
    idp.identidade({
      idToken: { sub: 'func-001', email: 'maria@acme.test', name: 'Maria S. Souza' },
      userinfo: { sub: 'func-001', email: 'maria@acme.test', name: 'Maria S. Souza' },
    });
    const navegador = sim.navegador();
    await entrarViaSso(navegador);

    const me = await navegador.get('/api/auth/me').expect(200);
    expect(me.body.nome).toBe('Maria S. Souza');
    const { rows } = await sim.pool.query(
      `select 1 from colaboradores where sso_subject = 'func-001'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('promove a Administrador quem está em SIM_ADMIN_EMAILS', async () => {
    const claims = { sub: 'func-002', email: 'diretora@acme.test', name: 'Diretora' };
    idp.identidade({ idToken: claims, userinfo: claims });
    const navegador = sim.navegador();
    await entrarViaSso(navegador);
    const me = await navegador.get('/api/auth/me').expect(200);
    expect(me.body.administrador).toBe(true);
  });

  it('vincula ao Colaborador local que já tinha o mesmo e-mail', async () => {
    const admin = sim.navegador();
    await admin
      .post('/api/auth/login')
      .send({ email: 'emergencia@sim.test', senha: 'senha-de-emergencia-123' });
    const criado = await admin
      .post('/api/colaboradores')
      .send({ nome: 'João', email: 'joao@acme.test' })
      .expect(201);

    const claims = { sub: 'func-003', email: 'joao@acme.test', name: 'João Pereira' };
    idp.identidade({ idToken: claims, userinfo: claims });
    const navegador = sim.navegador();
    await entrarViaSso(navegador);

    const me = await navegador.get('/api/auth/me').expect(200);
    expect(me.body.id).toBe(criado.body.colaborador.id);
  });

  it('não redireciona para fora do SIM depois do login', async () => {
    expect(await entrarViaSso(sim.navegador(), '//site-malicioso.test')).toBe('/');
    expect(await entrarViaSso(sim.navegador(), 'https://site-malicioso.test')).toBe('/');
  });

  it('recusa um retorno sem a transação iniciada pelo SIM', async () => {
    const response = await sim
      .http()
      .get('/api/auth/sso/retorno?code=qualquer&state=forjado')
      .expect(302);
    expect(response.headers.location).toBe('/entrar?erro=sso');
  });

  it('não deixa Colaborador Inativo entrar', async () => {
    await entrarViaSso(sim.navegador());
    await sim.pool.query(`update colaboradores set ativo = false where sso_subject = 'func-001'`);
    expect(await entrarViaSso(sim.navegador())).toBe('/entrar?erro=inativo');
  });
});

describe('SSO em modo OAuth2 genérico', () => {
  let sim: AppDeTeste;
  let idp: Awaited<ReturnType<typeof iniciarProvedor>>;

  beforeAll(async () => {
    idp = await iniciarProvedor();
    sim = await criarApp({
      SIM_SSO_MODE: 'oauth2',
      SIM_SSO_CLIENT_ID: 'sim',
      SIM_SSO_CLIENT_SECRET: 'segredo',
      SIM_SSO_TOKEN_AUTH_METHOD: 'client_secret_post',
      SIM_SSO_AUTHORIZATION_URL: `${idp.url}/authorize`,
      SIM_SSO_TOKEN_URL: `${idp.url}/token`,
      SIM_SSO_USERINFO_URL: `${idp.url}/userinfo`,
      SIM_SSO_SCOPES: 'perfil',
      // Provedor corporativo com nomes de campo próprios e departamento aninhado.
      SIM_SSO_CLAIM_ID: 'id',
      SIM_SSO_CLAIM_EMAIL: 'mail',
      SIM_SSO_CLAIM_NAME: 'displayName',
      SIM_SSO_CLAIM_DEPARTMENT: 'org.unidade',
    });
  });

  afterAll(async () => {
    await sim.fechar();
    await idp.provedor.stop();
  });

  it('lê a identidade do userinfo usando o mapeamento de campos', async () => {
    idp.identidade({
      userinfo: {
        id: 48151623,
        mail: 'pedro@acme.test',
        displayName: 'Pedro Santos',
        org: { unidade: 'Logística' },
      },
    });
    const navegador = sim.navegador();
    expect(await entrarViaSso(navegador)).toBe('/');

    const me = await navegador.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({
      nome: 'Pedro Santos',
      email: 'pedro@acme.test',
      departamento: 'Logística',
    });
  });

  it('falha de forma controlada quando o provedor não envia o e-mail', async () => {
    idp.identidade({ userinfo: { id: 1, displayName: 'Sem E-mail' } });
    expect(await entrarViaSso(sim.navegador())).toBe('/entrar?erro=sso');
  });
});

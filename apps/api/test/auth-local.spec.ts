import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AppDeTeste, criarApp, EMERGENCIA } from './support/app';

describe('autenticação com contas locais', () => {
  let sim: AppDeTeste;

  beforeAll(async () => {
    sim = await criarApp({ SIM_ADMIN_EMAILS: 'chefe@empresa.test' });
  });

  afterAll(() => sim.fechar());

  async function entrarComoEmergencia() {
    const navegador = sim.navegador();
    await navegador
      .post('/api/auth/login')
      .send({ email: EMERGENCIA.email, senha: EMERGENCIA.senha })
      .expect(200);
    return navegador;
  }

  async function criarConta(dados: { nome: string; email: string; administrador?: boolean }) {
    const admin = await entrarComoEmergencia();
    const response = await admin.post('/api/colaboradores').send(dados).expect(201);
    return response.body as { colaborador: { id: string }; senhaTemporaria: string };
  }

  it('exige sessão nas rotas protegidas', async () => {
    await sim.http().get('/api/auth/me').expect(401);
  });

  it('a conta de emergência entra como Administrador', async () => {
    const navegador = await entrarComoEmergencia();
    const me = await navegador.get('/api/auth/me').expect(200);
    expect(me.body).toMatchObject({
      email: EMERGENCIA.email,
      administrador: true,
      deveTrocarSenha: false,
    });
  });

  it('responde igual para e-mail inexistente e senha errada', async () => {
    const senhaErrada = await sim
      .http()
      .post('/api/auth/login')
      .send({ email: EMERGENCIA.email, senha: 'errada' })
      .expect(401);
    const emailInexistente = await sim
      .http()
      .post('/api/auth/login')
      .send({ email: 'ninguem@empresa.test', senha: 'errada' })
      .expect(401);
    expect(senhaErrada.body.message).toBe(emailInexistente.body.message);
  });

  it('Colaborador com senha temporária só acessa o necessário até trocá-la', async () => {
    const { senhaTemporaria } = await criarConta({ nome: 'Ana', email: 'Ana@Empresa.test' });

    const ana = sim.navegador();
    const login = await ana
      .post('/api/auth/login')
      .send({ email: 'ana@empresa.test', senha: senhaTemporaria })
      .expect(200);
    expect(login.body).toMatchObject({ email: 'ana@empresa.test', deveTrocarSenha: true });

    const bloqueado = await ana.get('/api/colaboradores').expect(403);
    expect(bloqueado.body.codigo).toBe('TROCA_DE_SENHA_PENDENTE');

    await ana
      .post('/api/auth/trocar-senha')
      .send({ senhaAtual: senhaTemporaria, novaSenha: 'curta' })
      .expect(400);
    await ana
      .post('/api/auth/trocar-senha')
      .send({ senhaAtual: senhaTemporaria, novaSenha: 'uma-senha-bem-longa' })
      .expect(204);

    const me = await ana.get('/api/auth/me').expect(200);
    expect(me.body.deveTrocarSenha).toBe(false);
    // Ana não é Administradora: a rota agora responde 403 por papel, não por senha pendente.
    const semPapel = await ana.get('/api/colaboradores').expect(403);
    expect(semPapel.body.codigo).toBeUndefined();

    await sim
      .http()
      .post('/api/auth/login')
      .send({ email: 'ana@empresa.test', senha: 'uma-senha-bem-longa' })
      .expect(200);
  });

  it('trocar a senha encerra as outras sessões do Colaborador', async () => {
    const { senhaTemporaria } = await criarConta({ nome: 'Bruno', email: 'bruno@empresa.test' });
    const credenciais = { email: 'bruno@empresa.test', senha: senhaTemporaria };
    const notebook = sim.navegador();
    const celular = sim.navegador();
    await notebook.post('/api/auth/login').send(credenciais).expect(200);
    await celular.post('/api/auth/login').send(credenciais).expect(200);

    await notebook
      .post('/api/auth/trocar-senha')
      .send({ senhaAtual: senhaTemporaria, novaSenha: 'outra-senha-bem-longa' })
      .expect(204);

    await notebook.get('/api/auth/me').expect(200);
    await celular.get('/api/auth/me').expect(401);
  });

  it('não permite e-mail duplicado', async () => {
    await criarConta({ nome: 'Carla', email: 'carla@empresa.test' });
    const admin = await entrarComoEmergencia();
    await admin
      .post('/api/colaboradores')
      .send({ nome: 'Carla 2', email: 'CARLA@empresa.test' })
      .expect(409);
  });

  it('e-mail listado em SIM_ADMIN_EMAILS já nasce Administrador', async () => {
    const { colaborador } = await criarConta({ nome: 'Chefe', email: 'chefe@empresa.test' });
    expect(colaborador).toMatchObject({ administrador: true });
  });

  it('Colaborador Inativo não consegue entrar nem usar sessões abertas', async () => {
    const { senhaTemporaria } = await criarConta({ nome: 'Davi', email: 'davi@empresa.test' });
    const davi = sim.navegador();
    await davi
      .post('/api/auth/login')
      .send({ email: 'davi@empresa.test', senha: senhaTemporaria })
      .expect(200);

    await sim.pool.query(`update colaboradores set ativo = false where email = $1`, [
      'davi@empresa.test',
    ]);

    await davi.get('/api/auth/me').expect(401);
    await sim
      .http()
      .post('/api/auth/login')
      .send({ email: 'davi@empresa.test', senha: senhaTemporaria })
      .expect(401);
  });

  it('logout encerra a sessão', async () => {
    const navegador = await entrarComoEmergencia();
    await navegador.post('/api/auth/logout').expect(204);
    await navegador.get('/api/auth/me').expect(401);
  });

  it('a senha da conta de emergência não pode ser trocada pela API', async () => {
    const navegador = await entrarComoEmergencia();
    await navegador
      .post('/api/auth/trocar-senha')
      .send({ senhaAtual: EMERGENCIA.senha, novaSenha: 'nova-senha-bem-longa' })
      .expect(400);
  });

  it('informa ao frontend quais formas de login estão disponíveis', async () => {
    const response = await sim.http().get('/api/auth/configuracao').expect(200);
    expect(response.body).toEqual({
      loginLocal: true,
      sso: { habilitado: false, rotulo: 'Entrar com SSO' },
    });
  });

  it('bloqueia tentativas repetidas de senha numa conta, sem afetar as demais', async () => {
    const alvo = { email: 'alvo@empresa.test', senha: 'chute' };
    for (let tentativa = 0; tentativa < 10; tentativa++) {
      await sim.http().post('/api/auth/login').send(alvo).expect(401);
    }
    const bloqueado = await sim.http().post('/api/auth/login').send(alvo).expect(429);
    expect(Number(bloqueado.headers['retry-after'])).toBeGreaterThan(0);

    // Outra conta, do mesmo IP, continua podendo entrar.
    await sim
      .http()
      .post('/api/auth/login')
      .send({ email: EMERGENCIA.email, senha: EMERGENCIA.senha })
      .expect(200);
  });
});

import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client, type Pool } from 'pg';
import request from 'supertest';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module';
import { ContaDeEmergenciaService } from '../../src/colaboradores/conta-de-emergencia.service';
import { PG_POOL } from '../../src/database/database.module';
import { runMigrations } from '../../src/database/migrate';
import { configureApp } from '../../src/configure-app';

export const EMERGENCIA = { email: 'emergencia@sim.test', senha: 'senha-de-emergencia-123' };

export interface AppDeTeste {
  app: INestApplication;
  pool: Pool;
  http: () => ReturnType<typeof request>;
  /** Cliente HTTP que guarda cookies entre requisições, como um navegador. */
  navegador: () => ReturnType<typeof request.agent>;
  fechar: () => Promise<void>;
}

async function criarBanco(): Promise<string> {
  const base = new URL(inject('postgresUri'));
  const nome = `teste_${randomUUID().replaceAll('-', '')}`;
  const client = new Client({ connectionString: base.toString() });
  await client.connect();
  await client.query(`CREATE DATABASE ${nome}`);
  await client.end();
  base.pathname = `/${nome}`;
  return base.toString();
}

/** Sobe o SIM completo contra um banco novo, com a conta de emergência configurada. */
export async function criarApp(env: Record<string, string> = {}): Promise<AppDeTeste> {
  const envOriginal = { ...process.env };
  Object.assign(process.env, {
    DATABASE_URL: await criarBanco(),
    SIM_PUBLIC_URL: 'http://localhost:3000',
    SIM_EMERGENCY_EMAIL: EMERGENCIA.email,
    SIM_EMERGENCY_PASSWORD: EMERGENCIA.senha,
    ...env,
  });

  try {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    const pool = app.get<Pool>(PG_POOL);
    await runMigrations(pool);
    await app.get(ContaDeEmergenciaService).garantir();
    await app.init();

    return {
      app,
      pool,
      http: () => request(app.getHttpServer()),
      navegador: () => request.agent(app.getHttpServer()),
      fechar: () => app.close(),
    };
  } finally {
    process.env = envOriginal;
  }
}

/** Navegador com sessão da conta de emergência (Administrador). */
export async function entrarComoAdministrador(sim: AppDeTeste) {
  const navegador = sim.navegador();
  await navegador
    .post('/api/auth/login')
    .send({ email: EMERGENCIA.email, senha: EMERGENCIA.senha })
    .expect(200);
  return navegador;
}

/** Cria uma conta local pelo Administrador e devolve um navegador já logado com senha definitiva. */
export async function criarColaborador(
  sim: AppDeTeste,
  admin: ReturnType<AppDeTeste['navegador']>,
  nome: string,
) {
  const usuario = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '.');
  const email = `${usuario}@empresa.test`;
  const conta = await admin.post('/api/colaboradores').send({ nome, email }).expect(201);
  const navegador = sim.navegador();
  await navegador
    .post('/api/auth/login')
    .send({ email, senha: conta.body.senhaTemporaria })
    .expect(200);
  await navegador
    .post('/api/auth/trocar-senha')
    .send({ senhaAtual: conta.body.senhaTemporaria, novaSenha: `senha-de-${nome}-123` })
    .expect(204);
  return { navegador, id: conta.body.colaborador.id as string };
}

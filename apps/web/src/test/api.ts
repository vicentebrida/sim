import type { ColaboradorAtualDtoOutput } from '@sim/api-client';
import { http, HttpResponse } from 'msw';
import { server } from './server';

export const ana: ColaboradorAtualDtoOutput = {
  id: '6f1c2a4e-0d7b-4f5e-9a51-3c2b1d0e9f8a',
  nome: 'Ana Souza',
  email: 'ana@empresa.test',
  departamento: null,
  fotoUrl: null,
  administrador: false,
  deveTrocarSenha: false,
};

/** API de autenticação simulada, com sessão em memória. */
export function simularAuth(opcoes: {
  sessao?: ColaboradorAtualDtoOutput;
  sso?: { habilitado: boolean; rotulo: string };
  aoEntrar?: ColaboradorAtualDtoOutput;
  bloqueado?: boolean;
}) {
  let sessao = opcoes.sessao;
  server.use(
    http.get('*/api/health', () => HttpResponse.json({ status: 'ok', database: 'up' })),
    http.get('*/api/auth/configuracao', () =>
      HttpResponse.json({
        loginLocal: true,
        sso: opcoes.sso ?? { habilitado: false, rotulo: 'Entrar com SSO' },
      }),
    ),
    http.get('*/api/auth/me', () =>
      sessao ? HttpResponse.json(sessao) : HttpResponse.json({}, { status: 401 }),
    ),
    http.post('*/api/auth/login', async ({ request }) => {
      if (opcoes.bloqueado) {
        return HttpResponse.json({ message: 'Muitas tentativas' }, { status: 429 });
      }
      const { senha } = (await request.json()) as { senha: string };
      if (!opcoes.aoEntrar || senha !== 'senha-correta') {
        return HttpResponse.json({ message: 'E-mail ou senha inválidos' }, { status: 401 });
      }
      sessao = opcoes.aoEntrar;
      return HttpResponse.json(sessao);
    }),
    http.post('*/api/auth/trocar-senha', () => {
      if (sessao) sessao = { ...sessao, deveTrocarSenha: false };
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('*/api/auth/logout', () => {
      sessao = undefined;
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

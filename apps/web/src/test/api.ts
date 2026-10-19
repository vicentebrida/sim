import type { CurrentCollaboratorDtoOutput } from '@sim/api-client';
import { http, HttpResponse } from 'msw';
import { server } from './server';

export const ana: CurrentCollaboratorDtoOutput = {
  id: '6f1c2a4e-0d7b-4f5e-9a51-3c2b1d0e9f8a',
  name: 'Ana Souza',
  email: 'ana@company.test',
  department: null,
  pictureUrl: null,
  administrator: false,
  mustChangePassword: false,
};

/** Simulated authentication API, with an in-memory session. */
export function simulateAuth(options: {
  session?: CurrentCollaboratorDtoOutput;
  sso?: { enabled: boolean; label: string | null };
  onLogin?: CurrentCollaboratorDtoOutput;
  locked?: boolean;
}) {
  let session = options.session;
  server.use(
    http.get('*/api/health', () => HttpResponse.json({ status: 'ok', database: 'up' })),
    // The bell polls this on every page; tests about Notifications override it.
    http.get('*/api/notifications/unread-count', () => HttpResponse.json({ unread: 0 })),
    http.get('*/api/settings', () => HttpResponse.json({ hiddenAuthorshipEnabled: false })),
    http.get('*/api/statuses', () => HttpResponse.json([])),
    http.get('*/api/branding', () =>
      HttpResponse.json({
        name: 'SIM',
        primaryColor: null,
        loginTitle: '',
        loginText: '',
        logoLight: null,
        logoDark: null,
        favicon: null,
        loginImage: null,
      }),
    ),
    http.get('*/api/auth/configuration', () =>
      HttpResponse.json({
        localLogin: true,
        sso: options.sso ?? { enabled: false, label: null },
        attachments: {
          maxBytes: 10 * 1024 * 1024,
          maxCount: 5,
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'docx', 'xlsx', 'pptx', 'txt'],
        },
      }),
    ),
    http.get('*/api/auth/me', () =>
      session ? HttpResponse.json(session) : HttpResponse.json({}, { status: 401 }),
    ),
    http.post('*/api/auth/login', async ({ request }) => {
      if (options.locked) {
        return HttpResponse.json(
          { message: 'Too many attempts', code: 'TOO_MANY_ATTEMPTS' },
          { status: 429 },
        );
      }
      const { password } = (await request.json()) as { password: string };
      if (!options.onLogin || password !== 'right-password') {
        return HttpResponse.json(
          { message: 'Invalid e-mail or password', code: 'INVALID_CREDENTIALS' },
          { status: 401 },
        );
      }
      session = options.onLogin;
      return HttpResponse.json(session);
    }),
    http.post('*/api/auth/change-password', () => {
      if (session) session = { ...session, mustChangePassword: false };
      return new HttpResponse(null, { status: 204 });
    }),
    http.post('*/api/auth/logout', () => {
      session = undefined;
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

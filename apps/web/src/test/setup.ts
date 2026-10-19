import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import i18n from '../i18n';
import { server } from './server';

// The first load of a route (code splitting) may take over 1s on slower CI machines.
configure({ asyncUtilTimeout: 5000 });

beforeAll(async () => {
  server.listen({ onUnhandledFrame: 'error' });
  await i18n.changeLanguage('pt-BR');
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

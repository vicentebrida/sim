import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import i18n from '../i18n';
import { server } from './server';

// A primeira carga de uma rota (code splitting) pode passar de 1s em máquinas de CI mais lentas.
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

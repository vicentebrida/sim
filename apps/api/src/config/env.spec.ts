import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  const base = { DATABASE_URL: 'postgres://u:p@localhost/db' };

  it('takes empty variables as unset, like the blanks of .env.example', () => {
    const env = loadEnv({
      ...base,
      SMTP_URL: '',
      SIM_EMBEDDINGS_URL: '',
      SIM_INACTIVITY_DAYS: '',
      SIM_EMERGENCY_EMAIL: '',
      SIM_EMERGENCY_PASSWORD: '',
      SIM_WEBHOOK_EVENTS: '',
    });
    expect(env).toMatchObject({ SIM_LOCALE: 'pt-BR', SIM_WEBHOOK_EVENTS: ['published', 'status'] });
    expect(env.SMTP_URL).toBeUndefined();
    expect(env.SIM_INACTIVITY_DAYS).toBeUndefined();
    expect(env.SIM_EMERGENCY_EMAIL).toBeUndefined();
  });

  it('still refuses a filled value that is wrong', () => {
    expect(() => loadEnv({ ...base, SMTP_URL: 'not a url' })).toThrow(/SMTP_URL/);
  });
});

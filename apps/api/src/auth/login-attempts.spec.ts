import { describe, expect, it } from 'vitest';
import { LoginAttemptsService, TooManyAttemptsException } from './login-attempts';

function clock() {
  let moment = 1_000_000;
  return { now: () => moment, advance: (ms: number) => (moment += ms) };
}

describe('LoginAttemptsService', () => {
  it('locks the account after 10 failures and releases it when the window passes', () => {
    const time = clock();
    const attempts = new LoginAttemptsService(time.now);
    for (let i = 0; i < 10; i++) attempts.recordFailure('1.1.1.1', 'ana@x.test');

    expect(() => attempts.check('1.1.1.1', 'ana@x.test')).toThrow(TooManyAttemptsException);
    expect(() => attempts.check('1.1.1.1', 'bia@x.test')).not.toThrow();
    expect(() => attempts.check('2.2.2.2', 'ana@x.test')).not.toThrow();

    time.advance(15 * 60 * 1000 + 1);
    expect(() => attempts.check('1.1.1.1', 'ana@x.test')).not.toThrow();
  });

  it('tells how long until it is released', () => {
    const time = clock();
    const attempts = new LoginAttemptsService(time.now);
    for (let i = 0; i < 10; i++) attempts.recordFailure('1.1.1.1', 'ana@x.test');
    time.advance(5 * 60 * 1000);
    try {
      attempts.check('1.1.1.1', 'ana@x.test');
      expect.unreachable();
    } catch (error) {
      expect((error as TooManyAttemptsException).retryAfterSeconds).toBe(10 * 60);
    }
  });

  it('a successful login resets the account count', () => {
    const attempts = new LoginAttemptsService();
    for (let i = 0; i < 9; i++) attempts.recordFailure('1.1.1.1', 'ana@x.test');
    attempts.recordSuccess('1.1.1.1', 'ana@x.test');
    for (let i = 0; i < 9; i++) attempts.recordFailure('1.1.1.1', 'ana@x.test');
    expect(() => attempts.check('1.1.1.1', 'ana@x.test')).not.toThrow();
  });

  it('locks an IP that sweeps many different accounts', () => {
    const attempts = new LoginAttemptsService();
    for (let i = 0; i < 100; i++) attempts.recordFailure('1.1.1.1', `person${i}@x.test`);
    expect(() => attempts.check('1.1.1.1', 'new@x.test')).toThrow(TooManyAttemptsException);
  });
});

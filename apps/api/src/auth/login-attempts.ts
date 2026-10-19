import { HttpException, HttpStatus, Inject, Injectable, Optional } from '@nestjs/common';

interface Rule {
  max: number;
  windowMs: number;
}

/** Lets tests control time. */
export const CLOCK = Symbol('CLOCK');

const FIFTEEN_MINUTES = 15 * 60 * 1000;
// Attack on a specific account.
const PER_ACCOUNT: Rule = { max: 10, windowMs: FIFTEEN_MINUTES };
// Sweep across many accounts from the same IP.
const PER_IP: Rule = { max: 100, windowMs: FIFTEEN_MINUTES };

export class TooManyAttemptsException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many login attempts. Wait a few minutes and try again.',
        code: 'TOO_MANY_ATTEMPTS',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Counts only failed login attempts; a successful login resets the account count. Kept in memory
 * per instance; with Redis (Milestone 2) it becomes shared across replicas. Behind a reverse proxy,
 * set SIM_TRUST_PROXY, otherwise every request seems to come from the same IP.
 */
@Injectable()
export class LoginAttemptsService {
  private readonly failures = new Map<string, number[]>();
  private readonly now: () => number;

  constructor(@Optional() @Inject(CLOCK) now?: () => number) {
    this.now = now ?? Date.now;
  }

  private keys(ip: string, email: string) {
    return [
      { key: `account:${ip}|${email}`, rule: PER_ACCOUNT },
      { key: `ip:${ip}`, rule: PER_IP },
    ];
  }

  private recent(key: string, rule: Rule) {
    const limit = this.now() - rule.windowMs;
    const recent = (this.failures.get(key) ?? []).filter((moment) => moment > limit);
    if (recent.length) this.failures.set(key, recent);
    else this.failures.delete(key);
    return recent;
  }

  /** Throws 429 if the account or the IP exceeded the failure limit within the window. */
  check(ip: string, email: string) {
    for (const { key, rule } of this.keys(ip, email)) {
      const recent = this.recent(key, rule);
      if (recent.length >= rule.max) {
        const releasedAt = recent[0]! + rule.windowMs;
        throw new TooManyAttemptsException(Math.ceil((releasedAt - this.now()) / 1000));
      }
    }
  }

  recordFailure(ip: string, email: string) {
    for (const { key, rule } of this.keys(ip, email)) {
      this.failures.set(key, [...this.recent(key, rule), this.now()]);
    }
  }

  recordSuccess(ip: string, email: string) {
    this.failures.delete(`account:${ip}|${email}`);
  }
}

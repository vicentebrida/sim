import { Controller, Inject, type MessageEvent, Req, Sse } from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  catchError,
  filter,
  from,
  interval,
  map,
  merge,
  type Observable,
  of,
  share,
  switchMap,
  takeUntil,
} from 'rxjs';
import { CurrentCollaborator } from '../auth/decorators';
import { SESSION_COOKIE } from '../auth/cookies';
import { SessionsService } from '../auth/sessions.service';
import type { Collaborator } from '../database/schema';
import { RealtimeService } from './realtime.service';

/** How often the stream pings (so proxies keep a quiet connection) and checks the session. */
export const HEARTBEAT_MS = Symbol('HEARTBEAT_MS');

@ApiTags('realtime')
@Controller('events')
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly sessions: SessionsService,
    @Inject(HEARTBEAT_MS) private readonly heartbeatMs: number,
  ) {}

  /**
   * Server-Sent Events telling the browser what to fetch again: an Idea (`idea`, by number) or
   * the bell (`notifications`). They carry no content.
   */
  @Sse()
  @ApiProduces('text/event-stream')
  @ApiOkResponse({ description: 'Stream of `idea`, `notifications`, `resync` and `ping` events' })
  stream(
    @CurrentCollaborator() collaborator: Collaborator,
    @Req() request: Request,
  ): Observable<MessageEvent> {
    const token = String(request.cookies?.[SESSION_COOKIE]);
    const events = this.realtime.events.pipe(
      filter((event) => event.type !== 'notifications' || event.collaboratorId === collaborator.id),
      map((event): MessageEvent => {
        if (event.type === 'idea') return { type: 'idea', data: { number: event.number } };
        return { type: event.type, data: {} };
      }),
    );
    // A session that ended (logout, deactivation, expiry) ends the stream.
    const checks = interval(this.heartbeatMs).pipe(
      switchMap(() => from(this.sessions.validate(token)).pipe(catchError(() => of(undefined)))),
      map((owner) => owner?.id === collaborator.id),
      share(),
    );
    const pings = checks.pipe(
      filter(Boolean),
      map((): MessageEvent => ({ type: 'ping', data: {} })),
    );
    return merge(events, pings).pipe(takeUntil(checks.pipe(filter((valid) => !valid))));
  }
}

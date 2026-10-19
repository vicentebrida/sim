import type {
  CategoryDtoOutput,
  CommentDtoOutput,
  CommentDtoOutputRepliesItem,
  CustomFieldDtoOutput,
  IdeaDtoOutput,
  LikeDtoOutput,
} from '@sim/api-client';
import { http, HttpResponse } from 'msw';
import { ana } from './api';
import { server } from './server';

export const TI: CategoryDtoOutput = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'TI',
  description: 'Sistemas, equipamentos e acessos',
  active: true,
  reviewers: [],
};

export const FIELDS: CustomFieldDtoOutput[] = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    label: 'Situação atual',
    help: 'Como é hoje?',
    type: 'long_text',
    required: true,
    options: [],
    useForDetection: true,
    position: 1,
    active: true,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    label: 'Urgente',
    help: '',
    type: 'yes_no',
    required: false,
    options: [],
    useForDetection: false,
    position: 2,
    active: true,
  },
];

export const BRUNO = { id: '7a2d3b5f-1e8c-4a6f-8b62-4d3c2e1f0a9b', name: 'Bruno Lima' };

export function sampleIdea(partial: Partial<IdeaDtoOutput> = {}): IdeaDtoOutput {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    number: 7,
    title: 'Relatório mais rápido',
    status: 'open',
    category: { id: TI.id, name: TI.name },
    author: { id: ana.id, name: ana.name },
    likes: { total: 0, liked: false },
    following: false,
    createdAt: '2026-10-01T12:00:00.000Z',
    publishedAt: '2026-10-01T12:00:00.000Z',
    editedAt: null,
    values: { [FIELDS[0]!.id]: 'Leva 2 horas' },
    answers: [
      { fieldId: FIELDS[0]!.id, label: 'Situação atual', type: 'long_text', value: 'Leva 2 horas' },
    ],
    originalIdea: null,
    history: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        type: 'status',
        from: null,
        to: 'open',
        justification: null,
        collaborator: { id: ana.id, name: ana.name },
        createdAt: '2026-10-01T12:00:00.000Z',
      },
    ],
    permissions: {
      canEdit: false,
      canDelete: false,
      canPublish: false,
      canLike: false,
      canReview: false,
      canRecategorize: false,
      transitions: [],
    },
    ...partial,
  };
}

export function sampleComment(partial: Partial<CommentDtoOutput> = {}): CommentDtoOutput {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    author: BRUNO,
    text: 'Comentário de exemplo',
    state: 'published',
    createdAt: '2026-10-02T10:00:00.000Z',
    editedAt: null,
    hiding: null,
    permissions: { canReply: true, canEdit: false, canRemove: false, canHide: false },
    replies: [],
    ...partial,
  };
}

/** Simulated Ideas API; returns the requests received so tests can inspect them. */
export function simulateIdeas(
  options: {
    idea?: IdeaDtoOutput;
    /** Who likes in this simulation (the session Collaborator) and who had already liked. */
    likes?: { me: LikeDtoOutput['collaborator']; others?: LikeDtoOutput[] };
    comments?: CommentDtoOutput[];
    /** Who comments in this simulation (the session Collaborator). */
    me?: { id: string; name: string };
    mentionable?: { id: string; name: string }[];
  } = {},
) {
  let idea = options.idea ?? sampleIdea();
  let likes = options.likes?.others ?? [];
  let comments = options.comments ?? [];
  let sequence = 0;
  const received: { method: string; url: URL; body?: unknown }[] = [];

  const record = async (request: Request) => {
    const body =
      request.method === 'GET'
        ? undefined
        : await request
            .clone()
            .json()
            .catch(() => undefined);
    received.push({ method: request.method, url: new URL(request.url), body });
  };

  const setLike = (liked: boolean) => {
    const me = options.likes?.me;
    if (!me) throw new Error('Pass `likes.me` to simulate Likes');
    likes = likes.filter((l) => l.collaborator.id !== me.id);
    if (liked) likes = [{ collaborator: me, createdAt: '2026-10-03T10:00:00.000Z' }, ...likes];
    idea = { ...idea, likes: { total: likes.length, liked } };
    return HttpResponse.json(idea.likes);
  };

  type Change = (comment: CommentDtoOutputRepliesItem) => Partial<CommentDtoOutputRepliesItem>;
  // Works for Comments and Replies.
  const changeComment = (id: string, change: Change) => {
    comments = comments.map((c) => ({
      ...c,
      ...(c.id === id ? change(c) : {}),
      replies: c.replies.map((r) => (r.id === id ? { ...r, ...change(r) } : r)),
    }));
  };

  server.use(
    http.get('*/api/categories', () => HttpResponse.json([TI])),
    http.get('*/api/custom-fields', () => HttpResponse.json(FIELDS)),
    http.get('*/api/ideas', async ({ request }) => {
      await record(request);
      const {
        values: _v,
        answers: _a,
        history: _h,
        permissions: _p,
        originalIdea: _o,
        editedAt: _e,
        ...summary
      } = idea;
      return HttpResponse.json({ items: [summary], total: 1, page: 1, pageSize: 20 });
    }),
    http.post('*/api/ideas', async ({ request }) => {
      await record(request);
      const body = (await request.json()) as { title: string; publish: boolean };
      idea = { ...idea, title: body.title, status: body.publish ? 'open' : 'draft' };
      return HttpResponse.json(idea, { status: 201 });
    }),
    http.get('*/api/ideas/:number', () => HttpResponse.json(idea)),
    http.post('*/api/ideas/:number/status', async ({ request }) => {
      await record(request);
      const body = (await request.json()) as { to: IdeaDtoOutput['status']; justification: string };
      idea = {
        ...idea,
        status: body.to,
        history: [
          ...idea.history,
          {
            id: '66666666-6666-4666-8666-666666666666',
            type: 'status',
            from: idea.status,
            to: body.to,
            justification: body.justification,
            collaborator: { id: 'reviewer', name: 'Bruno' },
            createdAt: '2026-10-02T09:00:00.000Z',
          },
        ],
        permissions: { ...idea.permissions, transitions: [] },
      };
      return HttpResponse.json(idea);
    }),
    http.put('*/api/ideas/:number/follow', async ({ request }) => {
      await record(request);
      idea = { ...idea, following: true };
      return HttpResponse.json({ following: true });
    }),
    http.delete('*/api/ideas/:number/follow', async ({ request }) => {
      await record(request);
      idea = { ...idea, following: false };
      return HttpResponse.json({ following: false });
    }),
    http.get('*/api/ideas/:number/likes', () => HttpResponse.json(likes)),
    http.put('*/api/ideas/:number/like', async ({ request }) => {
      await record(request);
      return setLike(true);
    }),
    http.delete('*/api/ideas/:number/like', async ({ request }) => {
      await record(request);
      return setLike(false);
    }),
    http.get('*/api/ideas/:number/comments', () => HttpResponse.json(comments)),
    http.post('*/api/ideas/:number/comments', async ({ request }) => {
      await record(request);
      const body = (await request.json()) as { text: string; replyToId?: string };
      sequence += 1;
      const created = sampleComment({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(sequence).padStart(12, '0')}`,
        author: options.me ?? { id: ana.id, name: ana.name },
        text: body.text,
        createdAt: `2026-10-05T10:00:0${sequence}.000Z`,
        permissions: {
          canReply: !body.replyToId,
          canEdit: true,
          canRemove: true,
          canHide: false,
        },
      });
      comments = body.replyToId
        ? comments.map((c) =>
            c.id === body.replyToId ? { ...c, replies: [...c.replies, created] } : c,
          )
        : [...comments, created];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.post('*/api/comments/:id/hide', async ({ request, params }) => {
      await record(request);
      const { reason } = (await request.json()) as { reason: string };
      changeComment(String(params.id), (c) => ({
        state: 'hidden',
        hiding: { reason, by: options.me ?? BRUNO, at: '2026-10-06T10:00:00.000Z' },
        permissions: { ...c.permissions, canHide: false, canReply: false },
      }));
      return HttpResponse.json(comments[0]);
    }),
    http.delete('*/api/comments/:id', async ({ request, params }) => {
      await record(request);
      changeComment(String(params.id), () => ({
        state: 'removed',
        text: null,
        permissions: { canReply: false, canEdit: false, canRemove: false, canHide: false },
      }));
      return new HttpResponse(null, { status: 204 });
    }),
    http.get('*/api/collaborators/mentionable', ({ request }) => {
      const search = new URL(request.url).searchParams.get('search')?.toLowerCase() ?? '';
      return HttpResponse.json(
        (options.mentionable ?? []).filter((p) => p.name.toLowerCase().includes(search)),
      );
    }),
  );
  return { received };
}

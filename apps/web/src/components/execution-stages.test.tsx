import type { ExecutionStageDtoOutput } from '@sim/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { sampleIdea, simulateIdeas } from '@/test/ideas';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const admin = { ...ana, name: 'Admin', administrator: true };
const PLANNING = { id: '77777777-7777-4777-8777-777777777771', name: 'Planejamento' };
const BUILDING = { id: '77777777-7777-4777-8777-777777777772', name: 'Desenvolvimento' };

/** Simulated steps API with an in-memory list. */
function simulateStages(initial: ExecutionStageDtoOutput[]) {
  let stages = initial;
  const received: { method: string; body?: unknown }[] = [];
  server.use(
    http.get('*/api/execution-stages', () => HttpResponse.json(stages)),
    http.post('*/api/execution-stages', async ({ request }) => {
      const { name } = (await request.json()) as { name: string };
      received.push({ method: 'POST', body: { name } });
      const created = { id: `77777777-7777-4777-8777-77777777777${stages.length + 1}`, name };
      stages = [...stages, created];
      return HttpResponse.json(created, { status: 201 });
    }),
    http.put('*/api/execution-stages/order', async ({ request }) => {
      const { ids } = (await request.json()) as { ids: string[] };
      received.push({ method: 'PUT', body: { ids } });
      stages = ids.map((id) => stages.find((stage) => stage.id === id)!);
      return HttpResponse.json(stages);
    }),
    http.delete('*/api/execution-stages/:id', ({ params }) => {
      received.push({ method: 'DELETE', body: params.id });
      stages = stages.filter((stage) => stage.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { received };
}

describe('Execution steps', () => {
  it('the Administrator creates, orders and deletes the steps on the Statuses page', async () => {
    simulateAuth({ session: admin });
    server.use(http.get('*/api/statuses', () => HttpResponse.json([])));
    const { received } = simulateStages([PLANNING]);
    renderApp('/admin/statuses');
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Etapas de Em execução' })).toBeVisible();
    await user.type(screen.getByLabelText('Nova etapa'), 'Desenvolvimento');
    await user.click(screen.getByRole('button', { name: 'Criar etapa' }));
    const list = await screen.findByRole('list', { name: 'Etapas' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));

    await user.click(screen.getByRole('button', { name: 'Subir Desenvolvimento' }));
    await waitFor(() =>
      expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Desenvolvimento'),
    );

    await user.click(screen.getByRole('button', { name: 'Excluir Planejamento' }));
    await user.click(screen.getByRole('button', { name: 'Excluir etapa' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
    expect(received.map(({ method }) => method)).toEqual(['POST', 'PUT', 'DELETE']);
    expect(received[1]!.body).toEqual({ ids: [BUILDING.id, PLANNING.id] });
  });

  it('a Reviewer moves an In progress Idea to a step, shown next to the Status', async () => {
    simulateAuth({ session: ana });
    simulateStages([PLANNING, BUILDING]);
    let idea = sampleIdea({
      status: 'in_progress',
      permissions: { ...sampleIdea().permissions, canReview: true, canSetStage: true },
    });
    simulateIdeas({ idea });
    const changes: unknown[] = [];
    server.use(
      http.get('*/api/ideas/:number', () => HttpResponse.json(idea)),
      http.put('*/api/ideas/:number/stage', async ({ request }) => {
        const body = (await request.json()) as { stageId: string; justification?: string };
        changes.push(body);
        idea = { ...idea, stage: [PLANNING, BUILDING].find((s) => s.id === body.stageId)! };
        return HttpResponse.json(idea);
      }),
    );
    renderApp('/ideas/7');
    const user = userEvent.setup();

    await user.selectOptions(await screen.findByLabelText('Etapa'), 'Desenvolvimento');
    await user.type(screen.getByLabelText('Comentário (opcional)'), 'Começou');
    await user.click(screen.getByRole('button', { name: 'Mudar etapa' }));

    expect(await screen.findByText('Em execução · Desenvolvimento')).toBeInTheDocument();
    expect(changes).toEqual([{ stageId: BUILDING.id, justification: 'Começou' }]);
    // The current step is not offered again.
    expect(
      within(screen.getByLabelText('Etapa')).queryByRole('option', { name: 'Desenvolvimento' }),
    ).not.toBeInTheDocument();
  });
});

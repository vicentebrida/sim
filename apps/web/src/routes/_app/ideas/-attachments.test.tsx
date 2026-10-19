import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { ana, simulateAuth } from '@/test/api';
import { sampleComment, sampleIdea, simulateIdeas, TI } from '@/test/ideas';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const PHOTO = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  filename: 'tela.png',
  contentType: 'image/png',
  size: 2048,
  image: true,
};
const REPORT = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  filename: 'relatorio.pdf',
  contentType: 'application/pdf',
  size: 300_000,
  image: false,
};

/** Records the files that reach the API. */
function simulateUploads() {
  const uploaded: { url: string; multipart: boolean }[] = [];
  server.use(
    http.post('*/api/ideas/:number/attachments', ({ request }) => {
      // The body is not read: multipart parsing differs between environments.
      uploaded.push({
        url: new URL(request.url).pathname,
        multipart: Boolean(request.headers.get('content-type')?.startsWith('multipart/form-data')),
      });
      return HttpResponse.json(PHOTO, { status: 201 });
    }),
    http.post('*/api/comments/:id/attachments', ({ request }) => {
      // The body is not read: multipart parsing differs between environments.
      uploaded.push({
        url: new URL(request.url).pathname,
        multipart: Boolean(request.headers.get('content-type')?.startsWith('multipart/form-data')),
      });
      return HttpResponse.json(PHOTO, { status: 201 });
    }),
  );
  return uploaded;
}

describe('Attachments', () => {
  it('sends the chosen files after creating the Idea', async () => {
    simulateAuth({ session: ana });
    simulateIdeas();
    const uploaded = simulateUploads();
    const { router } = renderApp('/ideas/new');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Título'), 'Com anexo');
    await user.selectOptions(screen.getByLabelText('Categoria'), TI.id);
    await user.upload(
      screen.getByLabelText('Escolher arquivos'),
      new File(['x'], 'tela.png', { type: 'image/png' }),
    );
    expect(screen.getByText('tela.png')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/ideas/7'));
    expect(uploaded).toEqual([{ url: '/api/ideas/7/attachments', multipart: true }]);
  });

  it('warns about files that are not accepted, and does not save', async () => {
    simulateAuth({ session: ana });
    const { received } = simulateIdeas();
    renderApp('/ideas/new');
    // The file input filters by extension; the check must also hold for what gets through.
    const user = userEvent.setup({ applyAccept: false });

    await user.type(await screen.findByLabelText('Título'), 'Com anexo ruim');
    await user.selectOptions(screen.getByLabelText('Categoria'), TI.id);
    await user.upload(screen.getByLabelText('Escolher arquivos'), new File(['x'], 'virus.exe'));
    await waitFor(() => expect(screen.queryByText('virus.exe')).toBeInTheDocument());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '"virus.exe" não é de um tipo aceito',
    );
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    expect(received.filter((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('shows the files of an Idea: thumbnail for images, download for documents', async () => {
    simulateAuth({ session: ana });
    simulateIdeas({ idea: sampleIdea({ attachments: [PHOTO, REPORT] }) });
    renderApp('/ideas/7');

    const list = await screen.findByRole('list', { name: 'Anexos' });
    const image = within(list).getByRole('img', { name: 'tela.png' });
    expect(image).toHaveAttribute('src', `/api/attachments/${PHOTO.id}`);
    const download = within(list).getByRole('link', { name: /relatorio\.pdf/ });
    expect(download).toHaveAttribute('href', `/api/attachments/${REPORT.id}`);
    expect(download).toHaveTextContent('293 KB');
  });

  it('attaches a file to a Comment right after sending it', async () => {
    simulateAuth({ session: ana });
    simulateIdeas({ comments: [sampleComment({ attachments: [REPORT] })] });
    const uploaded = simulateUploads();
    renderApp('/ideas/7');
    const user = userEvent.setup();

    expect(await screen.findByRole('link', { name: /relatorio\.pdf/ })).toBeInTheDocument();

    await user.type(
      await screen.findByRole('combobox', { name: 'Escreva um comentário' }),
      'Segue a imagem',
    );
    const pickers = screen.getAllByLabelText('Escolher arquivos');
    await user.upload(pickers.at(-1)!, new File(['x'], 'prova.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Comentar' }));

    await waitFor(() => expect(uploaded).toHaveLength(1));
    expect(uploaded[0]!.url).toMatch(/^\/api\/comments\/.+\/attachments$/);
  });
});

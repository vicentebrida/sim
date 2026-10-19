import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { routeTree } from '@/routeTree.gen';

function novoQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

export function renderWithProviders(ui: ReactElement) {
  return render(<QueryClientProvider client={novoQueryClient()}>{ui}</QueryClientProvider>);
}

/** Renderiza o app inteiro, com roteador em memória, a partir de uma URL. */
export function renderApp(url: string) {
  const queryClient = novoQueryClient();
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
    context: { queryClient },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { routeTree } from '@/routeTree.gen';

function newQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

export function renderWithProviders(ui: ReactElement) {
  return render(<QueryClientProvider client={newQueryClient()}>{ui}</QueryClientProvider>);
}

/** Renders the whole app, with an in-memory router, starting at a URL. */
export function renderApp(url: string) {
  const queryClient = newQueryClient();
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

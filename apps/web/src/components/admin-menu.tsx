import { Link, useRouterState } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PAGES = [
  { to: '/admin/dashboard', label: 'nav.dashboard' },
  { to: '/admin/categories', label: 'nav.categories' },
  { to: '/admin/custom-fields', label: 'nav.fields' },
  { to: '/admin/tags', label: 'nav.tags' },
  { to: '/admin/statuses', label: 'nav.statuses' },
  { to: '/admin/branding', label: 'nav.branding' },
  { to: '/admin/collaborators', label: 'nav.collaborators' },
  { to: '/admin/integrations', label: 'nav.integrations' },
  { to: '/admin/settings', label: 'nav.settings' },
  { to: '/admin/audit', label: 'nav.audit' },
] as const;

/** The Administrator pages, in one menu so the header fits on any screen. */
export function AdminMenu() {
  const { t } = useTranslation();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const active = path.startsWith('/admin');

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('px-2 font-normal', active ? 'text-foreground' : 'text-muted-foreground')}
        >
          {t('nav.admin')}
          <ChevronDown />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-48 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md"
        >
          {PAGES.map(({ to, label }) => (
            <DropdownMenu.Item key={to} asChild>
              <Link
                to={to}
                className="block rounded-sm px-2 py-1.5 outline-hidden data-highlighted:bg-accent [&.active]:font-medium"
              >
                {t(label)}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

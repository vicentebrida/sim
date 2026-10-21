import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { applyIdentity } from '@/lib/branding';
import { useIdentity } from '@/lib/use-identity';
import { cn } from '@/lib/utils';

/** Applies the installation color, title and icon to the page. Renders nothing. */
export function IdentityEffects() {
  const identity = useIdentity();
  useEffect(() => {
    if (identity) applyIdentity(identity);
  }, [identity]);
  return null;
}

/**
 * Logo (light or dark, by theme) or, without one, the installation name. `compact` (the header)
 * shows the SIM full name only on wide screens.
 */
export function BrandMark({ className, compact }: { className?: string; compact?: boolean }) {
  const { t } = useTranslation();
  const identity = useIdentity();
  const name = identity?.name ?? 'SIM';
  const light = identity?.logoLight;
  const dark = identity?.logoDark;

  if (light || dark) {
    return (
      <>
        {(light ?? dark) && (
          <img
            src={(light ?? dark)!}
            alt={name}
            className={cn('max-h-8 w-auto', dark && 'dark:hidden', className)}
          />
        )}
        {dark && (
          <img
            src={dark}
            alt={name}
            className={cn('hidden max-h-8 w-auto dark:block', className)}
          />
        )}
      </>
    );
  }
  return (
    <span className={cn('flex items-baseline gap-2', className)}>
      <span className="text-lg font-bold text-primary">{name}</span>
      {name === 'SIM' && (
        <span
          className={cn(
            'hidden text-sm text-muted-foreground',
            compact ? 'lg:inline' : 'md:inline',
          )}
        >
          {t('app.fullName')}
        </span>
      )}
    </span>
  );
}

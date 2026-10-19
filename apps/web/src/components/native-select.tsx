import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** <select> nativo com o visual dos campos shadcn: acessível e sem dependências extras. */
export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}

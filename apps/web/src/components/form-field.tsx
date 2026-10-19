import type { ComponentProps } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type FormFieldProps = ComponentProps<typeof Input> & { id: string; label: string; error?: string };

export function FormField({ id, label, error, ...input }: FormFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-erro` : undefined}
        {...input}
      />
      {error && (
        <p id={`${id}-erro`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

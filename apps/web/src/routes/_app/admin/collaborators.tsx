import { zodResolver } from '@hookform/resolvers/zod';
import {
  getCollaboratorsListQueryKey,
  type LocalAccountCreatedDtoOutput,
  useCollaboratorsCreateLocalAccount,
  useCollaboratorsList,
} from '@sim/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Check, Copy, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { FormField } from '@/components/form-field';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiErrorMessage } from '@/lib/errors';

export const Route = createFileRoute('/_app/admin/collaborators')({
  component: CollaboratorsPage,
});

const newAccountSchema = z.object({
  name: z.string().trim().min(1, { error: 'errors.required' }),
  email: z.email({ error: 'errors.invalidEmail' }),
  administrator: z.boolean(),
});

function CollaboratorsPage() {
  const { t } = useTranslation();
  const { data } = useCollaboratorsList();
  const collaborators = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('collaborators.title')}</h1>
        <p className="text-muted-foreground">{t('collaborators.subtitle')}</p>
      </div>
      <NewLocalAccount />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('collaborators.columns.name')}</TableHead>
                <TableHead>{t('collaborators.columns.email')}</TableHead>
                <TableHead>{t('collaborators.columns.role')}</TableHead>
                <TableHead>{t('collaborators.columns.state')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {collaborators.map((collaborator) => (
                <TableRow key={collaborator.id}>
                  <TableCell className="font-medium">{collaborator.name}</TableCell>
                  <TableCell>{collaborator.email}</TableCell>
                  <TableCell>
                    {collaborator.administrator
                      ? t('collaborators.role.administrator')
                      : t('collaborators.role.collaborator')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={collaborator.active ? 'secondary' : 'outline'}>
                      {collaborator.active
                        ? t('collaborators.state.active')
                        : t('collaborators.state.inactive')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function NewLocalAccount() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<LocalAccountCreatedDtoOutput>();
  const form = useForm({
    resolver: zodResolver(newAccountSchema),
    defaultValues: { name: '', email: '', administrator: false },
  });
  const create = useCollaboratorsCreateLocalAccount({
    mutation: {
      onSuccess: async (response) => {
        setCreated(response.data);
        form.reset();
        await queryClient.invalidateQueries({ queryKey: getCollaboratorsListQueryKey() });
      },
    },
  });
  const fieldError = (field: 'name' | 'email') => {
    const message = form.formState.errors[field]?.message;
    return message && t(message);
  };
  const failure = apiErrorMessage(create.error, t);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('collaborators.newAccount')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          noValidate
          onSubmit={form.handleSubmit((data) => {
            setCreated(undefined);
            create.mutate({ data });
          })}
        >
          <FormField
            id="name"
            label={t('collaborators.name')}
            error={fieldError('name')}
            {...form.register('name')}
          />
          <FormField
            id="email"
            type="email"
            label={t('collaborators.email')}
            error={fieldError('email')}
            {...form.register('email')}
          />
          <Button type="submit" disabled={create.isPending}>
            <UserPlus />
            {t('collaborators.create')}
          </Button>
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input type="checkbox" className="size-4" {...form.register('administrator')} />
            {t('collaborators.administrator')}
          </label>
        </form>
        {failure && (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        )}
        {created && <TemporaryPassword account={created} />}
      </CardContent>
    </Card>
  );
}

function TemporaryPassword({ account }: { account: LocalAccountCreatedDtoOutput }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <Alert>
      <AlertTitle>{t('collaborators.created', { name: account.collaborator.name })}</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{t('collaborators.temporaryPassword')}</p>
        <div className="flex items-center gap-2">
          <code className="rounded bg-muted px-2 py-1 font-mono text-foreground">
            {account.temporaryPassword}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(account.temporaryPassword);
              setCopied(true);
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? t('collaborators.copied') : t('collaborators.copy')}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Frame of the access screens (login, password change). */
export function AuthCard(props: { title: string; description?: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <div className="text-center">
        <p className="text-3xl font-bold text-primary">{t('app.name')}</p>
        <p className="text-sm text-muted-foreground">{t('app.fullName')}</p>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1>{props.title}</h1>
          </CardTitle>
          {props.description && <CardDescription>{props.description}</CardDescription>}
        </CardHeader>
        <CardContent>{props.children}</CardContent>
      </Card>
    </div>
  );
}

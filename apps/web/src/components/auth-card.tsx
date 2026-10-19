import type { ReactNode } from 'react';
import { BrandMark } from '@/components/brand';
import { useIdentity } from '@/lib/use-identity';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Frame of the access screens (login, password change), wearing the installation identity. */
export function AuthCard(props: { title: string; description?: string; children: ReactNode }) {
  const identity = useIdentity();
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <BrandMark className="text-3xl [&_span]:text-3xl" />
        {identity?.loginImage && (
          <img src={identity.loginImage} alt="" className="max-h-40 w-auto rounded-lg" />
        )}
        {identity?.loginTitle && <p className="text-xl font-semibold">{identity.loginTitle}</p>}
        {identity?.loginText && (
          <p className="max-w-sm text-sm whitespace-pre-line text-muted-foreground">
            {identity.loginText}
          </p>
        )}
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

CREATE TABLE "colaboradores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text,
	"deve_trocar_senha" boolean DEFAULT false NOT NULL,
	"sso_subject" text,
	"departamento" text,
	"foto_url" text,
	"administrador" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_login_em" timestamp with time zone,
	CONSTRAINT "colaboradores_email_unique" UNIQUE("email"),
	CONSTRAINT "colaboradores_ssoSubject_unique" UNIQUE("sso_subject")
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"colaborador_id" uuid NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessoes_colaborador_id_index" ON "sessoes" USING btree ("colaborador_id");
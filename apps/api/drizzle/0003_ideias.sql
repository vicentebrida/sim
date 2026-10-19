CREATE TABLE "campos_personalizados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rotulo" text NOT NULL,
	"ajuda" text DEFAULT '' NOT NULL,
	"tipo" text NOT NULL,
	"obrigatorio" boolean DEFAULT false NOT NULL,
	"opcoes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"usar_na_deteccao" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historico_de_ideias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ideia_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"de" text,
	"para" text NOT NULL,
	"justificativa" text,
	"colaborador_id" uuid NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"numero" integer GENERATED ALWAYS AS IDENTITY (sequence name "ideias_numero_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"titulo" text NOT NULL,
	"categoria_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"status" text NOT NULL,
	"valores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ideia_original_id" uuid,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"publicada_em" timestamp with time zone,
	"editada_em" timestamp with time zone,
	"status_alterado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ideias_numero_unique" UNIQUE("numero"),
	CONSTRAINT "ideias_status_valido" CHECK ("ideias"."status" in ('rascunho','aberta','em_analise','aprovada','em_execucao','concluida','recusada','duplicada','arquivada')),
	CONSTRAINT "ideias_duplicada_tem_original" CHECK (("ideias"."status" = 'duplicada') = ("ideias"."ideia_original_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "historico_de_ideias" ADD CONSTRAINT "historico_de_ideias_ideia_id_ideias_id_fk" FOREIGN KEY ("ideia_id") REFERENCES "public"."ideias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico_de_ideias" ADD CONSTRAINT "historico_de_ideias_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideias" ADD CONSTRAINT "ideias_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideias" ADD CONSTRAINT "ideias_autor_id_colaboradores_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideias" ADD CONSTRAINT "ideias_ideia_original_id_ideias_id_fk" FOREIGN KEY ("ideia_original_id") REFERENCES "public"."ideias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "historico_de_ideias_ideia_id_em_index" ON "historico_de_ideias" USING btree ("ideia_id","em");--> statement-breakpoint
CREATE INDEX "ideias_status_index" ON "ideias" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ideias_categoria_id_index" ON "ideias" USING btree ("categoria_id");--> statement-breakpoint
CREATE INDEX "ideias_autor_id_index" ON "ideias" USING btree ("autor_id");--> statement-breakpoint
CREATE INDEX "ideias_publicada_em_index" ON "ideias" USING btree ("publicada_em");
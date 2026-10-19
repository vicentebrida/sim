CREATE TABLE "avaliadores" (
	"categoria_id" uuid NOT NULL,
	"colaborador_id" uuid NOT NULL,
	"designado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avaliadores_categoria_id_colaborador_id_pk" PRIMARY KEY("categoria_id","colaborador_id")
);
--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"descricao" text DEFAULT '' NOT NULL,
	"ativa" boolean DEFAULT true NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "avaliadores" ADD CONSTRAINT "avaliadores_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avaliadores" ADD CONSTRAINT "avaliadores_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "avaliadores_colaborador_id_index" ON "avaliadores" USING btree ("colaborador_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_nome_unico" ON "categorias" USING btree (lower("nome"));
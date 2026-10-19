CREATE TABLE "comentarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ideia_id" uuid NOT NULL,
	"autor_id" uuid NOT NULL,
	"resposta_a_id" uuid,
	"texto" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"editado_em" timestamp with time zone,
	"removido_em" timestamp with time zone,
	"ocultado_em" timestamp with time zone,
	"ocultado_por_id" uuid,
	"motivo_da_ocultacao" text,
	CONSTRAINT "comentarios_ocultacao_completa" CHECK (("comentarios"."ocultado_em" is null) = ("comentarios"."ocultado_por_id" is null) and ("comentarios"."ocultado_em" is null) = ("comentarios"."motivo_da_ocultacao" is null))
);
--> statement-breakpoint
CREATE TABLE "mencoes" (
	"comentario_id" uuid NOT NULL,
	"colaborador_id" uuid NOT NULL,
	CONSTRAINT "mencoes_comentario_id_colaborador_id_pk" PRIMARY KEY("comentario_id","colaborador_id")
);
--> statement-breakpoint
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_ideia_id_ideias_id_fk" FOREIGN KEY ("ideia_id") REFERENCES "public"."ideias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_autor_id_colaboradores_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_resposta_a_id_comentarios_id_fk" FOREIGN KEY ("resposta_a_id") REFERENCES "public"."comentarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_ocultado_por_id_colaboradores_id_fk" FOREIGN KEY ("ocultado_por_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mencoes" ADD CONSTRAINT "mencoes_comentario_id_comentarios_id_fk" FOREIGN KEY ("comentario_id") REFERENCES "public"."comentarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mencoes" ADD CONSTRAINT "mencoes_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comentarios_ideia_id_criado_em_index" ON "comentarios" USING btree ("ideia_id","criado_em");--> statement-breakpoint
CREATE INDEX "comentarios_resposta_a_id_index" ON "comentarios" USING btree ("resposta_a_id");--> statement-breakpoint
CREATE INDEX "mencoes_colaborador_id_index" ON "mencoes" USING btree ("colaborador_id");
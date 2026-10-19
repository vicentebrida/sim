CREATE TABLE "curtidas" (
	"ideia_id" uuid NOT NULL,
	"colaborador_id" uuid NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curtidas_ideia_id_colaborador_id_pk" PRIMARY KEY("ideia_id","colaborador_id")
);
--> statement-breakpoint
ALTER TABLE "curtidas" ADD CONSTRAINT "curtidas_ideia_id_ideias_id_fk" FOREIGN KEY ("ideia_id") REFERENCES "public"."ideias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curtidas" ADD CONSTRAINT "curtidas_colaborador_id_colaboradores_id_fk" FOREIGN KEY ("colaborador_id") REFERENCES "public"."colaboradores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "curtidas_colaborador_id_index" ON "curtidas" USING btree ("colaborador_id");
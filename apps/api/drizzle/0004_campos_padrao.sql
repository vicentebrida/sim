-- Campos Personalizados com que toda instalação começa (PRD §3.2). O Administrador pode editar,
-- reordenar, desativar ou acrescentar outros.
INSERT INTO "campos_personalizados" ("rotulo", "ajuda", "tipo", "obrigatorio", "usar_na_deteccao", "ordem") VALUES
  ('Situação atual', 'Como é hoje? Qual problema ou oportunidade você percebe?', 'texto_longo', true, true, 1),
  ('Proposta', 'O que você sugere fazer?', 'texto_longo', true, true, 2),
  ('Benefício esperado', 'O que melhora se a ideia for realizada? (tempo, custo, segurança, satisfação...)', 'texto_longo', false, false, 3);

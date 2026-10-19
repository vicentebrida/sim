-- Custom Fields every installation starts with (PRD §3.2). They are user-facing content, so they
-- are in Portuguese; the Administrator can edit, reorder, deactivate or add others.
INSERT INTO "custom_fields" ("label", "help", "type", "required", "use_for_detection", "position") VALUES
  ('Situação atual', 'Como é hoje? Qual problema ou oportunidade você percebe?', 'long_text', true, true, 1),
  ('Proposta', 'O que você sugere fazer?', 'long_text', true, true, 2),
  ('Benefício esperado', 'O que melhora se a ideia for realizada? (tempo, custo, segurança, satisfação...)', 'long_text', false, false, 3);

-- `unaccent` is not IMMUTABLE (it depends on the dictionary), so it cannot be used in indexes or
-- generated columns. This wrapper pins the dictionary, which makes it safe to mark as IMMUTABLE.
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

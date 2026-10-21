-- Real time (ADR-0009): changes are announced on the `sim_events` channel and reach the browsers
-- through the API (SSE). The payload says only what changed, never the content; the browser
-- fetches it again through the API, with the usual permission checks. NOTIFY is delivered on
-- commit, and repeated payloads in one transaction are sent once.
CREATE FUNCTION "sim_notify_idea_changed"() RETURNS trigger AS $$
DECLARE
  changed record;
BEGIN
  IF TG_TABLE_NAME = 'ideas' THEN
    IF TG_OP = 'DELETE' THEN
      SELECT OLD.number AS number, OLD.status AS status INTO changed;
    ELSE
      SELECT NEW.number AS number, NEW.status AS status INTO changed;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT number, status INTO changed FROM ideas WHERE id = OLD.idea_id;
  ELSE
    SELECT number, status INTO changed FROM ideas WHERE id = NEW.idea_id;
  END IF;
  -- Drafts are seen only by their Authors; their numbers are not announced.
  IF changed.number IS NOT NULL AND changed.status <> 'draft' THEN
    PERFORM pg_notify('sim_events', json_build_object('type', 'idea', 'number', changed.number)::text);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Not the columns the background jobs update (Stalled Idea notices).
CREATE TRIGGER "ideas_realtime" AFTER UPDATE OF "title", "values", "status", "category_id", "hidden_authorship", "original_idea_id", "published_at", "edited_at" OR DELETE ON "ideas"
  FOR EACH ROW EXECUTE FUNCTION "sim_notify_idea_changed"();
--> statement-breakpoint
CREATE TRIGGER "comments_realtime" AFTER INSERT OR UPDATE OR DELETE ON "comments"
  FOR EACH ROW EXECUTE FUNCTION "sim_notify_idea_changed"();
--> statement-breakpoint
CREATE TRIGGER "likes_realtime" AFTER INSERT OR DELETE ON "likes"
  FOR EACH ROW EXECUTE FUNCTION "sim_notify_idea_changed"();
--> statement-breakpoint
CREATE TRIGGER "attachments_realtime" AFTER INSERT OR DELETE ON "attachments"
  FOR EACH ROW EXECUTE FUNCTION "sim_notify_idea_changed"();
--> statement-breakpoint
CREATE TRIGGER "idea_tags_realtime" AFTER INSERT OR DELETE ON "idea_tags"
  FOR EACH ROW EXECUTE FUNCTION "sim_notify_idea_changed"();
--> statement-breakpoint
CREATE FUNCTION "sim_notify_notifications_changed"() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'sim_events',
    json_build_object(
      'type', 'notifications',
      'collaboratorId', CASE WHEN TG_OP = 'DELETE' THEN OLD.recipient_id ELSE NEW.recipient_id END
    )::text
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Not the e-mail columns, which the background jobs update.
CREATE TRIGGER "notifications_realtime" AFTER INSERT OR UPDATE OF "read_at" OR DELETE ON "notifications"
  FOR EACH ROW EXECUTE FUNCTION "sim_notify_notifications_changed"();

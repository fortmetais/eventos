-- Business data is exposed only through the Express API, never the browser Data API.
DO $$
DECLARE table_name text; role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['Account','Organization','Membership','Invitation','EventType','Event','Campaign','FormVersion','Draft','DraftHealth','Person','Registration','HealthSubmission','Consent','StatusHistory','Team','MediaAsset','AuditLog'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
      END IF;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_valid_period" CHECK ("closesAt" > "opensAt");
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_positive_capacity" CHECK (capacity IS NULL OR capacity > 0);
ALTER TABLE "Event" ADD CONSTRAINT "Event_valid_period" CHECK ("endsAt" >= "startsAt");
ALTER TABLE "FormVersion" ADD CONSTRAINT "FormVersion_positive_version" CHECK (version > 0);

CREATE FUNCTION protect_published_form() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."publishedAt" IS NOT NULL AND (NEW.config IS DISTINCT FROM OLD.config OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt" OR NEW."campaignId" IS DISTINCT FROM OLD."campaignId" OR NEW.version IS DISTINCT FROM OLD.version) THEN
    RAISE EXCEPTION 'Published form versions are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_published_form BEFORE UPDATE ON "FormVersion" FOR EACH ROW EXECUTE FUNCTION protect_published_form();

CREATE FUNCTION protect_registration_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW."formVersionId" IS DISTINCT FROM OLD."formVersionId" OR NEW."campaignId" IS DISTINCT FROM OLD."campaignId" OR NEW."personId" IS DISTINCT FROM OLD."personId" OR NEW."draftId" IS DISTINCT FROM OLD."draftId" THEN
    RAISE EXCEPTION 'Registration snapshots and origin are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER immutable_registration_snapshot BEFORE UPDATE ON "Registration" FOR EACH ROW EXECUTE FUNCTION protect_registration_snapshot();

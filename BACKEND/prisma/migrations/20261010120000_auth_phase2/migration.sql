-- Permit platform administrators to exist without being assigned to a tenant.
-- Existing schoolId values are preserved. Non-platform roles remain required
-- to belong to a school through the check constraint below.
ALTER TABLE "users" ALTER COLUMN "schoolId" DROP NOT NULL;

ALTER TABLE "users" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "users"
  ADD CONSTRAINT "users_schoolId_role_check"
  CHECK ("role" = 'SUPER_ADMIN' OR "schoolId" IS NOT NULL);

-- Add profile/contact fields without changing existing student records.
ALTER TABLE "students"
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "bloodGroup" TEXT,
  ADD COLUMN "guardianAddress" TEXT;

-- Academic placement now belongs to the Phase 4 enrollment models. Keep any
-- historical snapshots but allow new student profiles to omit them.
ALTER TABLE "students"
  ALTER COLUMN "className" DROP NOT NULL,
  ALTER COLUMN "section" DROP NOT NULL,
  ALTER COLUMN "academicYear" DROP NOT NULL;

ALTER TYPE "StudentStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';

-- Enforce that a linked portal user belongs to the same institution.
CREATE UNIQUE INDEX "users_schoolId_id_key" ON "users"("schoolId", "id");
CREATE UNIQUE INDEX "students_schoolId_portalUserId_key" ON "students"("schoolId", "portalUserId");
ALTER TABLE "students" DROP CONSTRAINT "students_portalUserId_fkey";
ALTER TABLE "students" ADD CONSTRAINT "students_schoolId_portalUserId_fkey"
  FOREIGN KEY ("schoolId", "portalUserId")
  REFERENCES "users"("schoolId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

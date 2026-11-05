-- Preserve historical placement changes while keeping one ACTIVE placement
-- per student and academic year. Existing rows remain unchanged.
DROP INDEX "student_academic_enrollments_studentId_academicYearId_key";
CREATE UNIQUE INDEX "student_academic_enrollments_one_active_year_key"
  ON "student_academic_enrollments"("studentId", "academicYearId")
  WHERE "status" = 'ACTIVE';

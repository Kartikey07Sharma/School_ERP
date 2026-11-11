-- Ensure a school attendance row cannot pair one student's ID with another
-- student's enrollment, even through direct database writes.
ALTER TABLE "student_academic_enrollments"
  ADD CONSTRAINT "student_academic_enrollments_schoolId_id_studentId_key"
  UNIQUE ("schoolId", "id", "studentId");

ALTER TABLE "school_student_attendance"
  DROP CONSTRAINT "school_student_attendance_enrollment_fkey";

ALTER TABLE "school_student_attendance"
  ADD CONSTRAINT "school_student_attendance_enrollment_fkey"
  FOREIGN KEY ("schoolId", "enrollmentId", "studentId")
  REFERENCES "student_academic_enrollments"("schoolId", "id", "studentId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

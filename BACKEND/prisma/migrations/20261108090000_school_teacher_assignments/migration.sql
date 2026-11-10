-- Add school teacher assignments using existing employee and academic records.
CREATE TABLE "school_teacher_assignments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "teacherProfileId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "status" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "school_teacher_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "school_teacher_assignments_schoolId_academicYearId_gradeId__idx"
    ON "school_teacher_assignments"("schoolId", "academicYearId", "gradeId", "sectionId", "status");
CREATE INDEX "school_teacher_assignments_schoolId_teacherProfileId_status_idx"
    ON "school_teacher_assignments"("schoolId", "teacherProfileId", "status");
CREATE INDEX "school_teacher_assignments_schoolId_subjectId_status_idx"
    ON "school_teacher_assignments"("schoolId", "subjectId", "status");
CREATE UNIQUE INDEX "school_teacher_assignments_schoolId_id_key"
    ON "school_teacher_assignments"("schoolId", "id");
-- Prisma does not model partial unique indexes. This protects concurrent writes
-- while allowing inactive historical assignments to be retained or reassigned.
CREATE UNIQUE INDEX "school_teacher_assignments_active_natural_key"
    ON "school_teacher_assignments"("schoolId", "teacherProfileId", "academicYearId", "gradeId", "sectionId", "subjectId")
    WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "academic_years_schoolId_id_key" ON "academic_years"("schoolId", "id");
CREATE UNIQUE INDEX "grades_schoolId_id_key" ON "grades"("schoolId", "id");
CREATE UNIQUE INDEX "sections_schoolId_gradeId_academicYearId_id_key" ON "sections"("schoolId", "gradeId", "academicYearId", "id");
CREATE UNIQUE INDEX "subjects_schoolId_id_key" ON "subjects"("schoolId", "id");

ALTER TABLE "school_teacher_assignments"
    ADD CONSTRAINT "school_teacher_assignments_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "school_teacher_assignments"
    ADD CONSTRAINT "school_teacher_assignments_schoolId_teacherProfileId_fkey"
    FOREIGN KEY ("schoolId", "teacherProfileId") REFERENCES "teacher_profiles"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "school_teacher_assignments"
    ADD CONSTRAINT "school_teacher_assignments_schoolId_academicYearId_fkey"
    FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "school_teacher_assignments"
    ADD CONSTRAINT "school_teacher_assignments_schoolId_gradeId_fkey"
    FOREIGN KEY ("schoolId", "gradeId") REFERENCES "grades"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "school_teacher_assignments"
    ADD CONSTRAINT "school_teacher_assignments_schoolId_gradeId_academicYearId_fkey"
    FOREIGN KEY ("schoolId", "gradeId", "academicYearId", "sectionId")
    REFERENCES "sections"("schoolId", "gradeId", "academicYearId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "school_teacher_assignments"
    ADD CONSTRAINT "school_teacher_assignments_schoolId_subjectId_fkey"
    FOREIGN KEY ("schoolId", "subjectId") REFERENCES "subjects"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

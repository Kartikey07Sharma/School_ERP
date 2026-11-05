CREATE TYPE "AcademicStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'WITHDRAWN', 'COMPLETED');
CREATE TYPE "AcademicPeriodType" AS ENUM ('TERM', 'QUARTER', 'TRIMESTER', 'OTHER');
CREATE TYPE "SubjectType" AS ENUM ('CORE', 'ELECTIVE', 'OPTIONAL', 'PRACTICAL', 'OTHER');

CREATE TABLE "academic_years" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "startDate" DATE NOT NULL, "endDate" DATE NOT NULL,
  "status" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE', "isCurrent" BOOLEAN NOT NULL DEFAULT false,
  "schoolId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_years_dates_check" CHECK ("startDate" < "endDate")
);
CREATE UNIQUE INDEX "academic_years_schoolId_name_key" ON "academic_years"("schoolId", "name");
CREATE UNIQUE INDEX "academic_years_one_current_per_school" ON "academic_years"("schoolId") WHERE "isCurrent" = true;
CREATE INDEX "academic_years_schoolId_status_idx" ON "academic_years"("schoolId", "status");
CREATE INDEX "academic_years_schoolId_isCurrent_idx" ON "academic_years"("schoolId", "isCurrent");
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "academic_periods" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "code" TEXT NOT NULL, "periodType" "AcademicPeriodType" NOT NULL DEFAULT 'TERM',
  "sequence" INTEGER NOT NULL, "startDate" DATE NOT NULL, "endDate" DATE NOT NULL, "status" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE',
  "schoolId" TEXT NOT NULL, "academicYearId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "academic_periods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_periods_dates_check" CHECK ("startDate" < "endDate")
);
CREATE UNIQUE INDEX "academic_periods_academicYearId_name_key" ON "academic_periods"("academicYearId", "name");
CREATE UNIQUE INDEX "academic_periods_academicYearId_code_key" ON "academic_periods"("academicYearId", "code");
CREATE UNIQUE INDEX "academic_periods_academicYearId_sequence_key" ON "academic_periods"("academicYearId", "sequence");
CREATE INDEX "academic_periods_schoolId_academicYearId_idx" ON "academic_periods"("schoolId", "academicYearId");
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academic_periods" ADD CONSTRAINT "academic_periods_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "grades" (
  "id" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL, "sequence" INTEGER NOT NULL, "description" TEXT,
  "status" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE', "schoolId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "grades_schoolId_code_key" ON "grades"("schoolId", "code");
CREATE UNIQUE INDEX "grades_schoolId_sequence_key" ON "grades"("schoolId", "sequence");
CREATE INDEX "grades_schoolId_status_idx" ON "grades"("schoolId", "status");
ALTER TABLE "grades" ADD CONSTRAINT "grades_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "sections" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "code" TEXT NOT NULL, "capacity" INTEGER, "roomNumber" TEXT,
  "status" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE', "schoolId" TEXT NOT NULL, "gradeId" TEXT NOT NULL, "academicYearId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "sections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sections_capacity_check" CHECK ("capacity" IS NULL OR "capacity" > 0)
);
CREATE UNIQUE INDEX "sections_gradeId_academicYearId_name_key" ON "sections"("gradeId", "academicYearId", "name");
CREATE UNIQUE INDEX "sections_gradeId_academicYearId_code_key" ON "sections"("gradeId", "academicYearId", "code");
CREATE INDEX "sections_schoolId_year_grade_status_idx" ON "sections"("schoolId", "academicYearId", "gradeId", "status");
ALTER TABLE "sections" ADD CONSTRAINT "sections_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sections" ADD CONSTRAINT "sections_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sections" ADD CONSTRAINT "sections_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "subjects" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "code" TEXT NOT NULL, "description" TEXT, "subjectType" "SubjectType" NOT NULL DEFAULT 'CORE',
  "status" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE', "schoolId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subjects_schoolId_code_key" ON "subjects"("schoolId", "code");
CREATE INDEX "subjects_schoolId_status_type_idx" ON "subjects"("schoolId", "status", "subjectType");
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "class_subjects" (
  "id" TEXT NOT NULL, "schoolId" TEXT NOT NULL, "gradeId" TEXT NOT NULL, "subjectId" TEXT NOT NULL,
  "isMandatory" BOOLEAN NOT NULL DEFAULT true, "weeklyPeriods" INTEGER, "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "class_subjects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "class_subjects_weekly_periods_check" CHECK ("weeklyPeriods" IS NULL OR "weeklyPeriods" > 0)
);
CREATE UNIQUE INDEX "class_subjects_gradeId_subjectId_key" ON "class_subjects"("gradeId", "subjectId");
CREATE INDEX "class_subjects_school_grade_status_idx" ON "class_subjects"("schoolId", "gradeId", "status");
CREATE INDEX "class_subjects_school_subject_status_idx" ON "class_subjects"("schoolId", "subjectId", "status");
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "student_academic_enrollments" (
  "id" TEXT NOT NULL, "schoolId" TEXT NOT NULL, "studentId" TEXT NOT NULL, "academicYearId" TEXT NOT NULL,
  "gradeId" TEXT NOT NULL, "sectionId" TEXT NOT NULL, "rollNumber" TEXT, "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "enrollmentDate" DATE NOT NULL, "leavingDate" DATE, "remarks" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "student_academic_enrollments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_enrollment_dates_check" CHECK ("leavingDate" IS NULL OR "leavingDate" >= "enrollmentDate")
);
CREATE UNIQUE INDEX "student_academic_enrollments_studentId_academicYearId_key" ON "student_academic_enrollments"("studentId", "academicYearId");
CREATE UNIQUE INDEX "student_academic_enrollments_sectionId_rollNumber_key" ON "student_academic_enrollments"("sectionId", "rollNumber");
CREATE INDEX "student_academic_enrollments_school_year_grade_section_status_idx" ON "student_academic_enrollments"("schoolId", "academicYearId", "gradeId", "sectionId", "status");
CREATE INDEX "student_academic_enrollments_student_enrollmentDate_idx" ON "student_academic_enrollments"("studentId", "enrollmentDate");
ALTER TABLE "student_academic_enrollments" ADD CONSTRAINT "student_academic_enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_academic_enrollments" ADD CONSTRAINT "student_academic_enrollments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_academic_enrollments" ADD CONSTRAINT "student_academic_enrollments_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_academic_enrollments" ADD CONSTRAINT "student_academic_enrollments_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_academic_enrollments" ADD CONSTRAINT "student_academic_enrollments_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "DegreeType" AS ENUM ('UNDERGRADUATE', 'POSTGRADUATE', 'DIPLOMA', 'DOCTORAL', 'OTHER');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('REGULAR', 'LATERAL_ENTRY', 'OTHER');

-- CreateEnum
CREATE TYPE "ProgrammeTermMode" AS ENUM ('SEMESTER', 'YEAR');

-- CreateEnum
CREATE TYPE "CollegeCourseType" AS ENUM ('CORE', 'ELECTIVE', 'OPEN_ELECTIVE', 'PROFESSIONAL_ELECTIVE', 'PRACTICAL', 'LAB', 'PROJECT', 'INTERNSHIP', 'OTHER');

-- CreateEnum
CREATE TYPE "ProgrammeEnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'WITHDRAWN', 'SUSPENDED', 'TRANSFERRED', 'OTHER');

-- CreateEnum
CREATE TYPE "AcademicRecordStatus" AS ENUM ('ACTIVE', 'WITHDRAWN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CourseRegistrationStatus" AS ENUM ('REGISTERED', 'WITHDRAWN', 'COMPLETED');

-- CreateTable
CREATE TABLE "college_departments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "status" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE',
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "college_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "college_programmes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "degreeType" "DegreeType" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "durationYears" INTEGER NOT NULL,
    "semestersPerYear" INTEGER,
    "totalSemesters" INTEGER,
    "totalCredits" DECIMAL(7,2),
    "entryType" "EntryType" NOT NULL DEFAULT 'REGULAR',
    "termMode" "ProgrammeTermMode" NOT NULL DEFAULT 'SEMESTER',
    "status" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE',
    "schoolId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "college_programmes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_versions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "versionCode" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "durationYears" INTEGER NOT NULL,
    "semestersPerYear" INTEGER,
    "totalSemesters" INTEGER,
    "termMode" "ProgrammeTermMode" NOT NULL DEFAULT 'SEMESTER',
    "status" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE',
    "schoolId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programme_terms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "academicYearNumber" INTEGER NOT NULL,
    "semesterNumber" INTEGER,
    "startMonth" INTEGER,
    "endMonth" INTEGER,
    "totalCredits" DECIMAL(7,2),
    "status" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE',
    "schoolId" TEXT NOT NULL,
    "curriculumVersionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programme_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "college_courses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "courseType" "CollegeCourseType" NOT NULL DEFAULT 'CORE',
    "credits" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "lectureHours" INTEGER NOT NULL DEFAULT 0,
    "tutorialHours" INTEGER NOT NULL DEFAULT 0,
    "practicalHours" INTEGER NOT NULL DEFAULT 0,
    "status" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE',
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "college_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curriculum_courses" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "curriculumVersionId" TEXT NOT NULL,
    "programmeTermId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "courseType" "CollegeCourseType" NOT NULL DEFAULT 'CORE',
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "credits" DECIMAL(7,2),
    "lectureHours" INTEGER,
    "tutorialHours" INTEGER,
    "practicalHours" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "college_batches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "admissionYear" INTEGER NOT NULL,
    "expectedGraduationYear" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE',
    "schoolId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "curriculumVersionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "college_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_programme_enrollments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "curriculumVersionId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "admissionDate" DATE NOT NULL,
    "expectedCompletionDate" DATE NOT NULL,
    "actualCompletionDate" DATE,
    "status" "ProgrammeEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_programme_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_semester_enrollments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "programmeEnrollmentId" TEXT NOT NULL,
    "programmeTermId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrollmentDate" DATE NOT NULL,
    "completionDate" DATE,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_semester_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_offerings" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "capacity" INTEGER,
    "status" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE',
    "schoolId" TEXT NOT NULL,
    "curriculumCourseId" TEXT NOT NULL,
    "programmeTermId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_course_registrations" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentSemesterEnrollmentId" TEXT NOT NULL,
    "courseOfferingId" TEXT NOT NULL,
    "status" "CourseRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "registrationDate" DATE NOT NULL,
    "withdrawalDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_course_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faculty_course_assignments" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "courseOfferingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AcademicStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faculty_course_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "college_departments_schoolId_status_idx" ON "college_departments"("schoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "college_departments_schoolId_code_key" ON "college_departments"("schoolId", "code");

-- CreateIndex
CREATE INDEX "college_programmes_schoolId_departmentId_status_idx" ON "college_programmes"("schoolId", "departmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "college_programmes_schoolId_code_key" ON "college_programmes"("schoolId", "code");

-- CreateIndex
CREATE INDEX "curriculum_versions_schoolId_programmeId_status_idx" ON "curriculum_versions"("schoolId", "programmeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_versions_programmeId_versionCode_key" ON "curriculum_versions"("programmeId", "versionCode");

-- CreateIndex
CREATE INDEX "programme_terms_schoolId_curriculumVersionId_status_idx" ON "programme_terms"("schoolId", "curriculumVersionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "programme_terms_curriculumVersionId_sequence_key" ON "programme_terms"("curriculumVersionId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "programme_terms_curriculumVersionId_semesterNumber_key" ON "programme_terms"("curriculumVersionId", "semesterNumber");

-- CreateIndex
CREATE UNIQUE INDEX "programme_terms_curriculumVersionId_code_key" ON "programme_terms"("curriculumVersionId", "code");

-- CreateIndex
CREATE INDEX "college_courses_schoolId_status_courseType_idx" ON "college_courses"("schoolId", "status", "courseType");

-- CreateIndex
CREATE UNIQUE INDEX "college_courses_schoolId_code_key" ON "college_courses"("schoolId", "code");

-- CreateIndex
CREATE INDEX "curriculum_courses_schoolId_curriculumVersionId_programmeTe_idx" ON "curriculum_courses"("schoolId", "curriculumVersionId", "programmeTermId", "status");

-- CreateIndex
CREATE INDEX "curriculum_courses_schoolId_courseId_status_idx" ON "curriculum_courses"("schoolId", "courseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_courses_programmeTermId_courseId_key" ON "curriculum_courses"("programmeTermId", "courseId");

-- CreateIndex
CREATE INDEX "college_batches_schoolId_programmeId_admissionYear_status_idx" ON "college_batches"("schoolId", "programmeId", "admissionYear", "status");

-- CreateIndex
CREATE UNIQUE INDEX "college_batches_schoolId_code_key" ON "college_batches"("schoolId", "code");

-- CreateIndex
CREATE INDEX "student_programme_enrollments_schoolId_programmeId_batchId__idx" ON "student_programme_enrollments"("schoolId", "programmeId", "batchId", "status");

-- CreateIndex
CREATE INDEX "student_programme_enrollments_studentId_admissionDate_idx" ON "student_programme_enrollments"("studentId", "admissionDate");

-- CreateIndex
CREATE UNIQUE INDEX "student_programme_enrollments_schoolId_registrationNumber_key" ON "student_programme_enrollments"("schoolId", "registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "student_programme_enrollments_studentId_programmeId_batchId_key" ON "student_programme_enrollments"("studentId", "programmeId", "batchId");

-- CreateIndex
CREATE INDEX "student_semester_enrollments_schoolId_academicYearId_progra_idx" ON "student_semester_enrollments"("schoolId", "academicYearId", "programmeTermId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_semester_enrollments_programmeEnrollmentId_programm_key" ON "student_semester_enrollments"("programmeEnrollmentId", "programmeTermId");

-- CreateIndex
CREATE INDEX "course_offerings_schoolId_academicYearId_programmeTermId_st_idx" ON "course_offerings"("schoolId", "academicYearId", "programmeTermId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "course_offerings_academicYearId_programmeTermId_curriculumC_key" ON "course_offerings"("academicYearId", "programmeTermId", "curriculumCourseId", "code");

-- CreateIndex
CREATE INDEX "student_course_registrations_schoolId_courseOfferingId_stat_idx" ON "student_course_registrations"("schoolId", "courseOfferingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_course_registrations_studentSemesterEnrollmentId_co_key" ON "student_course_registrations"("studentSemesterEnrollmentId", "courseOfferingId");

-- CreateIndex
CREATE INDEX "faculty_course_assignments_schoolId_userId_status_idx" ON "faculty_course_assignments"("schoolId", "userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "faculty_course_assignments_courseOfferingId_userId_key" ON "faculty_course_assignments"("courseOfferingId", "userId");

-- AddForeignKey
ALTER TABLE "college_departments" ADD CONSTRAINT "college_departments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_programmes" ADD CONSTRAINT "college_programmes_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_programmes" ADD CONSTRAINT "college_programmes_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "college_departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "college_programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programme_terms" ADD CONSTRAINT "programme_terms_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programme_terms" ADD CONSTRAINT "programme_terms_curriculumVersionId_fkey" FOREIGN KEY ("curriculumVersionId") REFERENCES "curriculum_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_courses" ADD CONSTRAINT "college_courses_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_courses" ADD CONSTRAINT "curriculum_courses_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_courses" ADD CONSTRAINT "curriculum_courses_curriculumVersionId_fkey" FOREIGN KEY ("curriculumVersionId") REFERENCES "curriculum_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_courses" ADD CONSTRAINT "curriculum_courses_programmeTermId_fkey" FOREIGN KEY ("programmeTermId") REFERENCES "programme_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_courses" ADD CONSTRAINT "curriculum_courses_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "college_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_batches" ADD CONSTRAINT "college_batches_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_batches" ADD CONSTRAINT "college_batches_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "college_programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "college_batches" ADD CONSTRAINT "college_batches_curriculumVersionId_fkey" FOREIGN KEY ("curriculumVersionId") REFERENCES "curriculum_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_programme_enrollments" ADD CONSTRAINT "student_programme_enrollments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_programme_enrollments" ADD CONSTRAINT "student_programme_enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_programme_enrollments" ADD CONSTRAINT "student_programme_enrollments_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "college_programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_programme_enrollments" ADD CONSTRAINT "student_programme_enrollments_curriculumVersionId_fkey" FOREIGN KEY ("curriculumVersionId") REFERENCES "curriculum_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_programme_enrollments" ADD CONSTRAINT "student_programme_enrollments_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "college_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_semester_enrollments" ADD CONSTRAINT "student_semester_enrollments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_semester_enrollments" ADD CONSTRAINT "student_semester_enrollments_programmeEnrollmentId_fkey" FOREIGN KEY ("programmeEnrollmentId") REFERENCES "student_programme_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_semester_enrollments" ADD CONSTRAINT "student_semester_enrollments_programmeTermId_fkey" FOREIGN KEY ("programmeTermId") REFERENCES "programme_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_semester_enrollments" ADD CONSTRAINT "student_semester_enrollments_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_curriculumCourseId_fkey" FOREIGN KEY ("curriculumCourseId") REFERENCES "curriculum_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_programmeTermId_fkey" FOREIGN KEY ("programmeTermId") REFERENCES "programme_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_course_registrations" ADD CONSTRAINT "student_course_registrations_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_course_registrations" ADD CONSTRAINT "student_course_registrations_studentSemesterEnrollmentId_fkey" FOREIGN KEY ("studentSemesterEnrollmentId") REFERENCES "student_semester_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_course_registrations" ADD CONSTRAINT "student_course_registrations_courseOfferingId_fkey" FOREIGN KEY ("courseOfferingId") REFERENCES "course_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_course_assignments" ADD CONSTRAINT "faculty_course_assignments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_course_assignments" ADD CONSTRAINT "faculty_course_assignments_courseOfferingId_fkey" FOREIGN KEY ("courseOfferingId") REFERENCES "course_offerings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faculty_course_assignments" ADD CONSTRAINT "faculty_course_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain checks not expressible in the Prisma schema DSL.
ALTER TABLE "college_programmes" ADD CONSTRAINT "college_programmes_structure_check" CHECK (
  "durationYears" BETWEEN 1 AND 12 AND
  (("termMode" = 'YEAR' AND "totalSemesters" IS NULL AND "semestersPerYear" IS NULL) OR
   ("termMode" = 'SEMESTER' AND "semestersPerYear" > 0 AND "totalSemesters" = "durationYears" * "semestersPerYear")) AND
  ("totalCredits" IS NULL OR "totalCredits" >= 0)
);
ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_structure_check" CHECK (
  "durationYears" BETWEEN 1 AND 12 AND
  (("termMode" = 'YEAR' AND "totalSemesters" IS NULL AND "semestersPerYear" IS NULL) OR
   ("termMode" = 'SEMESTER' AND "semestersPerYear" > 0 AND "totalSemesters" = "durationYears" * "semestersPerYear")) AND
  ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom")
);
ALTER TABLE "programme_terms" ADD CONSTRAINT "programme_terms_range_check" CHECK (
  "sequence" > 0 AND "academicYearNumber" > 0 AND
  ("semesterNumber" IS NULL OR "semesterNumber" > 0) AND
  ("startMonth" IS NULL OR "startMonth" BETWEEN 1 AND 12) AND
  ("endMonth" IS NULL OR "endMonth" BETWEEN 1 AND 12) AND
  ("totalCredits" IS NULL OR "totalCredits" >= 0)
);
ALTER TABLE "college_courses" ADD CONSTRAINT "college_courses_hours_credits_check" CHECK (
  "credits" >= 0 AND "lectureHours" >= 0 AND "tutorialHours" >= 0 AND "practicalHours" >= 0
);
ALTER TABLE "curriculum_courses" ADD CONSTRAINT "curriculum_courses_hours_credits_check" CHECK (
  ("credits" IS NULL OR "credits" >= 0) AND
  ("lectureHours" IS NULL OR "lectureHours" >= 0) AND
  ("tutorialHours" IS NULL OR "tutorialHours" >= 0) AND
  ("practicalHours" IS NULL OR "practicalHours" >= 0)
);
ALTER TABLE "college_batches" ADD CONSTRAINT "college_batches_year_dates_check" CHECK (
  "expectedGraduationYear" >= "admissionYear" AND "endDate" >= "startDate"
);
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_capacity_check" CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "student_programme_enrollments" ADD CONSTRAINT "student_programme_enrollments_dates_check" CHECK (
  "expectedCompletionDate" >= "admissionDate" AND ("actualCompletionDate" IS NULL OR "actualCompletionDate" >= "admissionDate")
);
ALTER TABLE "student_semester_enrollments" ADD CONSTRAINT "student_semester_enrollments_dates_check" CHECK (
  "completionDate" IS NULL OR "completionDate" >= "enrollmentDate"
);
ALTER TABLE "student_course_registrations" ADD CONSTRAINT "student_course_registrations_dates_check" CHECK (
  "withdrawalDate" IS NULL OR "withdrawalDate" >= "registrationDate"
);
CREATE UNIQUE INDEX "student_programme_enrollments_one_active_programme_idx"
  ON "student_programme_enrollments"("studentId", "programmeId") WHERE "status" = 'ACTIVE';

CREATE TYPE "StudentAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'LEAVE');
CREATE TYPE "CollegeAttendanceSessionType" AS ENUM ('THEORY', 'PRACTICAL', 'LAB', 'OTHER');
CREATE TYPE "CollegeAttendanceSessionStatus" AS ENUM ('CONDUCTED', 'CANCELLED');

ALTER TABLE "students" ADD CONSTRAINT "students_schoolId_id_key" UNIQUE ("schoolId", "id");
ALTER TABLE "student_academic_enrollments" ADD CONSTRAINT "student_academic_enrollments_schoolId_id_key" UNIQUE ("schoolId", "id");
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_schoolId_id_key" UNIQUE ("schoolId", "id");
ALTER TABLE "student_course_registrations" ADD CONSTRAINT "student_course_registrations_schoolId_id_key" UNIQUE ("schoolId", "id");
ALTER TABLE "student_course_registrations" ADD CONSTRAINT "student_course_registrations_schoolId_courseOfferingId_id_key" UNIQUE ("schoolId", "courseOfferingId", "id");

CREATE TABLE "school_student_attendance" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "gradeId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "attendanceDate" DATE NOT NULL,
  "status" "StudentAttendanceStatus" NOT NULL,
  "remarks" TEXT,
  "markedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "school_student_attendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "school_student_attendance_schoolId_studentId_attendanceDate_key" UNIQUE ("schoolId", "studentId", "attendanceDate"),
  CONSTRAINT "school_student_attendance_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "school_student_attendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "school_student_attendance_year_fkey" FOREIGN KEY ("schoolId", "academicYearId") REFERENCES "academic_years"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "school_student_attendance_student_fkey" FOREIGN KEY ("schoolId", "studentId") REFERENCES "students"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "school_student_attendance_enrollment_fkey" FOREIGN KEY ("schoolId", "enrollmentId") REFERENCES "student_academic_enrollments"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "school_student_attendance_grade_fkey" FOREIGN KEY ("schoolId", "gradeId") REFERENCES "grades"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "school_student_attendance_section_fkey" FOREIGN KEY ("schoolId", "gradeId", "academicYearId", "sectionId") REFERENCES "sections"("schoolId", "gradeId", "academicYearId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "school_student_attendance_marker_fkey" FOREIGN KEY ("markedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "school_student_attendance_schoolId_academicYearId_gradeId_sectionId_attendanceDate_idx" ON "school_student_attendance"("schoolId", "academicYearId", "gradeId", "sectionId", "attendanceDate");
CREATE INDEX "school_student_attendance_schoolId_studentId_attendanceDate_idx" ON "school_student_attendance"("schoolId", "studentId", "attendanceDate");

CREATE TABLE "college_attendance_sessions" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "courseOfferingId" TEXT NOT NULL,
  "sessionDate" DATE NOT NULL,
  "startTime" TIME(0),
  "endTime" TIME(0),
  "sessionType" "CollegeAttendanceSessionType" NOT NULL DEFAULT 'THEORY',
  "sessionNumber" INTEGER,
  "remarks" TEXT,
  "status" "CollegeAttendanceSessionStatus" NOT NULL DEFAULT 'CONDUCTED',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "college_attendance_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "college_attendance_sessions_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "college_attendance_sessions_schoolId_courseOfferingId_id_key" UNIQUE ("schoolId", "courseOfferingId", "id"),
  CONSTRAINT "college_attendance_sessions_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "college_attendance_sessions_offering_fkey" FOREIGN KEY ("schoolId", "courseOfferingId") REFERENCES "course_offerings"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "college_attendance_sessions_creator_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "college_attendance_sessions_schoolId_courseOfferingId_sessionDate_idx" ON "college_attendance_sessions"("schoolId", "courseOfferingId", "sessionDate");

CREATE TABLE "college_student_attendance" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "courseOfferingId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "status" "StudentAttendanceStatus" NOT NULL,
  "remarks" TEXT,
  "markedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "college_student_attendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "college_student_attendance_schoolId_sessionId_studentId_key" UNIQUE ("schoolId", "sessionId", "studentId"),
  CONSTRAINT "college_student_attendance_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "college_student_attendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "college_student_attendance_session_fkey" FOREIGN KEY ("schoolId", "courseOfferingId", "sessionId") REFERENCES "college_attendance_sessions"("schoolId", "courseOfferingId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "college_student_attendance_student_fkey" FOREIGN KEY ("schoolId", "studentId") REFERENCES "students"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "college_student_attendance_registration_fkey" FOREIGN KEY ("schoolId", "courseOfferingId", "registrationId") REFERENCES "student_course_registrations"("schoolId", "courseOfferingId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "college_student_attendance_marker_fkey" FOREIGN KEY ("markedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "college_student_attendance_schoolId_studentId_createdAt_idx" ON "college_student_attendance"("schoolId", "studentId", "createdAt");

CREATE TABLE "student_attendance_corrections" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "schoolAttendanceId" TEXT,
  "collegeAttendanceId" TEXT,
  "previousStatus" "StudentAttendanceStatus" NOT NULL,
  "newStatus" "StudentAttendanceStatus" NOT NULL,
  "reason" TEXT NOT NULL,
  "correctedById" TEXT NOT NULL,
  "correctedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "student_attendance_corrections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_attendance_corrections_exactly_one_record_check" CHECK (num_nonnulls("schoolAttendanceId", "collegeAttendanceId") = 1),
  CONSTRAINT "student_attendance_corrections_school_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "student_attendance_corrections_school_attendance_fkey" FOREIGN KEY ("schoolId", "schoolAttendanceId") REFERENCES "school_student_attendance"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "student_attendance_corrections_college_attendance_fkey" FOREIGN KEY ("schoolId", "collegeAttendanceId") REFERENCES "college_student_attendance"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "student_attendance_corrections_user_fkey" FOREIGN KEY ("correctedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "student_attendance_corrections_schoolId_schoolAttendanceId_correctedAt_idx" ON "student_attendance_corrections"("schoolId", "schoolAttendanceId", "correctedAt");
CREATE INDEX "student_attendance_corrections_schoolId_collegeAttendanceId_correctedAt_idx" ON "student_attendance_corrections"("schoolId", "collegeAttendanceId", "correctedAt");

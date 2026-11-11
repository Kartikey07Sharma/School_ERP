CREATE TABLE "staff_attendance" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "attendanceDate" DATE NOT NULL,
  "category" "EmployeeCategory" NOT NULL,
  "departmentId" TEXT,
  "designationId" TEXT NOT NULL,
  "status" "StudentAttendanceStatus" NOT NULL,
  "checkInAt" TIMESTAMPTZ(3),
  "checkOutAt" TIMESTAMPTZ(3),
  "checkInRecordedById" TEXT,
  "checkOutRecordedById" TEXT,
  "remarks" TEXT,
  "markedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_attendance_schoolId_employeeId_attendanceDate_key" UNIQUE ("schoolId", "employeeId", "attendanceDate"),
  CONSTRAINT "staff_attendance_schoolId_id_key" UNIQUE ("schoolId", "id"),
  CONSTRAINT "staff_attendance_checkout_after_checkin_check" CHECK ("checkOutAt" IS NULL OR ("checkInAt" IS NOT NULL AND "checkOutAt" >= "checkInAt")),
  CONSTRAINT "staff_attendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "staff_attendance_employee_fkey" FOREIGN KEY ("schoolId", "employeeId") REFERENCES "employees"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "staff_attendance_department_fkey" FOREIGN KEY ("schoolId", "departmentId") REFERENCES "employee_departments"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "staff_attendance_designation_fkey" FOREIGN KEY ("schoolId", "designationId") REFERENCES "employee_designations"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "staff_attendance_marker_fkey" FOREIGN KEY ("markedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "staff_attendance_checkin_recorder_fkey" FOREIGN KEY ("checkInRecordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "staff_attendance_checkout_recorder_fkey" FOREIGN KEY ("checkOutRecordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "staff_attendance_schoolId_attendanceDate_status_idx" ON "staff_attendance"("schoolId", "attendanceDate", "status");
CREATE INDEX "staff_attendance_schoolId_departmentId_attendanceDate_idx" ON "staff_attendance"("schoolId", "departmentId", "attendanceDate");
CREATE INDEX "staff_attendance_schoolId_category_attendanceDate_idx" ON "staff_attendance"("schoolId", "category", "attendanceDate");

CREATE TABLE "staff_attendance_corrections" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "attendanceId" TEXT NOT NULL,
  "previousStatus" "StudentAttendanceStatus",
  "newStatus" "StudentAttendanceStatus",
  "previousCheckInAt" TIMESTAMPTZ(3),
  "newCheckInAt" TIMESTAMPTZ(3),
  "previousCheckOutAt" TIMESTAMPTZ(3),
  "newCheckOutAt" TIMESTAMPTZ(3),
  "changedFields" TEXT[] NOT NULL,
  "reason" TEXT NOT NULL,
  "correctedById" TEXT NOT NULL,
  "correctedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_attendance_corrections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_attendance_corrections_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "staff_attendance_corrections_attendance_fkey" FOREIGN KEY ("schoolId", "attendanceId") REFERENCES "staff_attendance"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "staff_attendance_corrections_user_fkey" FOREIGN KEY ("correctedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "staff_attendance_corrections_schoolId_attendanceId_correctedAt_idx" ON "staff_attendance_corrections"("schoolId", "attendanceId", "correctedAt");

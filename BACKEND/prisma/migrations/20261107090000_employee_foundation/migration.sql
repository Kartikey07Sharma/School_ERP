CREATE TYPE "EmployeeCategory" AS ENUM ('TEACHING', 'NON_TEACHING');
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED', 'RESIGNED');
CREATE TYPE "EmployeeRecordStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "employee_departments" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "status" "EmployeeRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "employee_departments_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "employee_designations" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "category" "EmployeeCategory",
  "status" "EmployeeRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "employee_designations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "employees" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "category" "EmployeeCategory" NOT NULL,
  "status" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
  "firstName" TEXT NOT NULL,
  "middleName" TEXT,
  "lastName" TEXT NOT NULL,
  "dateOfBirth" DATE,
  "gender" TEXT,
  "email" TEXT,
  "phone" TEXT NOT NULL,
  "alternatePhone" TEXT,
  "address" TEXT,
  "city" TEXT,
  "state" TEXT,
  "postalCode" TEXT,
  "emergencyContactName" TEXT,
  "emergencyContactRelationship" TEXT,
  "emergencyContactPhone" TEXT,
  "joiningDate" DATE NOT NULL,
  "relievingDate" DATE,
  "departmentId" TEXT,
  "designationId" TEXT NOT NULL,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "teacher_profiles" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "qualifications" TEXT,
  "specialization" TEXT,
  "experienceYears" INTEGER,
  "status" "EmployeeRecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_departments_schoolId_code_key" ON "employee_departments"("schoolId", "code");
CREATE UNIQUE INDEX "employee_departments_schoolId_name_key" ON "employee_departments"("schoolId", "name");
CREATE UNIQUE INDEX "employee_departments_schoolId_id_key" ON "employee_departments"("schoolId", "id");
CREATE INDEX "employee_departments_schoolId_status_idx" ON "employee_departments"("schoolId", "status");
CREATE UNIQUE INDEX "employee_designations_schoolId_code_key" ON "employee_designations"("schoolId", "code");
CREATE UNIQUE INDEX "employee_designations_schoolId_name_key" ON "employee_designations"("schoolId", "name");
CREATE UNIQUE INDEX "employee_designations_schoolId_id_key" ON "employee_designations"("schoolId", "id");
CREATE INDEX "employee_designations_schoolId_status_category_idx" ON "employee_designations"("schoolId", "status", "category");
CREATE UNIQUE INDEX "employees_schoolId_employeeId_key" ON "employees"("schoolId", "employeeId");
CREATE UNIQUE INDEX "employees_schoolId_id_key" ON "employees"("schoolId", "id");
CREATE UNIQUE INDEX "employees_schoolId_userId_key" ON "employees"("schoolId", "userId");
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");
CREATE INDEX "employees_schoolId_status_category_idx" ON "employees"("schoolId", "status", "category");
CREATE INDEX "employees_schoolId_departmentId_designationId_idx" ON "employees"("schoolId", "departmentId", "designationId");
CREATE INDEX "employees_schoolId_lastName_firstName_idx" ON "employees"("schoolId", "lastName", "firstName");
CREATE UNIQUE INDEX "teacher_profiles_employeeId_key" ON "teacher_profiles"("employeeId");
CREATE UNIQUE INDEX "teacher_profiles_schoolId_id_key" ON "teacher_profiles"("schoolId", "id");
CREATE UNIQUE INDEX "teacher_profiles_schoolId_employeeId_key" ON "teacher_profiles"("schoolId", "employeeId");
CREATE INDEX "teacher_profiles_schoolId_status_idx" ON "teacher_profiles"("schoolId", "status");

ALTER TABLE "employee_departments" ADD CONSTRAINT "employee_departments_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_designations" ADD CONSTRAINT "employee_designations_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_schoolId_departmentId_fkey" FOREIGN KEY ("schoolId", "departmentId") REFERENCES "employee_departments"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_schoolId_designationId_fkey" FOREIGN KEY ("schoolId", "designationId") REFERENCES "employee_designations"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_schoolId_userId_fkey" FOREIGN KEY ("schoolId", "userId") REFERENCES "users"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_schoolId_employeeId_fkey" FOREIGN KEY ("schoolId", "employeeId") REFERENCES "employees"("schoolId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

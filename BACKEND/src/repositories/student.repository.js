const prisma = require("../database/prisma");

const studentSelect = {
  id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true,
  dateOfBirth: true, gender: true, admissionDate: true, className: true, section: true,
  academicYear: true, email: true, phone: true, address: true, city: true, state: true,
  postalCode: true, bloodGroup: true, guardianName: true, guardianRelationship: true,
  guardianPhone: true, guardianEmail: true, guardianAddress: true, status: true,
  schoolId: true, createdAt: true, updatedAt: true,
};

const PROFILE_FIELDS = new Set([
  "admissionNumber", "firstName", "middleName", "lastName", "dateOfBirth", "gender",
  "admissionDate", "className", "section", "academicYear", "email", "phone", "address",
  "city", "state", "postalCode", "bloodGroup", "guardianName", "guardianRelationship",
  "guardianPhone", "guardianEmail", "guardianAddress",
]);
const createStudent = (schoolId, data) => {
  const profile = Object.fromEntries(Object.entries(data).filter(([field]) => PROFILE_FIELDS.has(field)));
  return prisma.student.create({ data: { ...profile, schoolId }, select: studentSelect });
};
const findStudentById = (id, schoolId) => prisma.student.findFirst({ where: { id, schoolId }, select: studentSelect });
const findStudentByAdmissionNumber = (admissionNumber, schoolId) => prisma.student.findUnique({ where: { schoolId_admissionNumber: { schoolId, admissionNumber } }, select: { id: true } });
const findExistingAdmissionNumbers = async (schoolId, admissionNumbers) => {
  const existing = new Set();
  for (let index = 0; index < admissionNumbers.length; index += 500) {
    const batch = admissionNumbers.slice(index, index + 500);
    const rows = await prisma.student.findMany({
      where: { schoolId, admissionNumber: { in: batch } },
      select: { admissionNumber: true },
    });
    for (const row of rows) existing.add(row.admissionNumber);
  }
  return existing;
};
const createManyStudents = (schoolId, students) => prisma.student.createMany({
  data: students.map((student) => ({ ...student, schoolId })),
});
const findStudents = async (schoolId, filters) => {
  const where = { schoolId };
  if (filters.status) where.status = filters.status;
  if (filters.className) where.className = filters.className;
  if (filters.section) where.section = filters.section;
  if (filters.academicYear) where.academicYear = filters.academicYear;
  if (filters.search) where.OR = ["admissionNumber", "firstName", "middleName", "lastName"].map((field) => ({ [field]: { contains: filters.search, mode: "insensitive" } }));
  const [total, records] = await prisma.$transaction([
    prisma.student.count({ where }),
    prisma.student.findMany({ where, select: studentSelect, orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }], skip: (filters.page - 1) * filters.limit, take: filters.limit }),
  ]);
  return { total, page: filters.page, pageSize: filters.limit, totalPages: Math.ceil(total / filters.limit), records };
};
const updateScopedStudent = async (id, schoolId, data) => {
  const result = await prisma.student.updateMany({ where: { id, schoolId }, data });
  if (!result.count) return null;
  return findStudentById(id, schoolId);
};
const updateStudent = (id, schoolId, data) => {
  const profile = Object.fromEntries(Object.entries(data).filter(([field]) => PROFILE_FIELDS.has(field)));
  return updateScopedStudent(id, schoolId, profile);
};
const updateStudentStatus = (id, schoolId, status) => updateScopedStudent(id, schoolId, { status });
const deactivateStudent = (id, schoolId) => updateStudentStatus(id, schoolId, "INACTIVE");
const findStudentByPortalUserId = (portalUserId, schoolId) => prisma.student.findFirst({ where: { portalUserId, schoolId }, select: studentSelect });

const portalProfileSelect = {
  ...studentSelect,
  school: { select: { id: true, name: true, institutionType: true } },
};
const findPortalProfile = (portalUserId, schoolId) => prisma.student.findFirst({ where: { portalUserId, schoolId }, select: portalProfileSelect });
const updatePortalProfile = async (portalUserId, schoolId, data) => {
  const profile = Object.fromEntries(Object.entries(data).filter(([field]) => [
    "email", "phone", "address", "city", "state", "postalCode", "guardianName",
    "guardianRelationship", "guardianPhone", "guardianEmail", "guardianAddress",
  ].includes(field)));
  const result = await prisma.student.updateMany({ where: { portalUserId, schoolId }, data: profile });
  if (!result.count) return null;
  return findPortalProfile(portalUserId, schoolId);
};

const schoolEnrollmentSelect = (schoolId) => ({
  id: true,
  status: true,
  rollNumber: true,
  enrollmentDate: true,
  leavingDate: true,
  remarks: true,
  academicYear: { select: { id: true, name: true, startDate: true, endDate: true, isCurrent: true, status: true } },
  grade: { select: { id: true, name: true, code: true, sequence: true, subjectMappings: {
    where: { schoolId, status: "ACTIVE", subject: { is: { schoolId } } },
    orderBy: { displayOrder: "asc" },
    select: { id: true, isMandatory: true, weeklyPeriods: true, displayOrder: true, subject: { select: { id: true, name: true, code: true, subjectType: true, status: true } } },
  } } },
  section: { select: { id: true, name: true, code: true, status: true } },
});
const schoolEnrollmentOrder = [{ academicYear: { isCurrent: "desc" } }, { academicYear: { startDate: "desc" } }, { enrollmentDate: "desc" }, { createdAt: "desc" }];
const findSchoolAcademicData = async (studentId, schoolId, page, limit) => {
  const where = { studentId, schoolId, academicYear: { schoolId }, grade: { schoolId }, section: { schoolId } };
  const [total, records] = await prisma.$transaction([
    prisma.studentAcademicEnrollment.count({ where }),
    prisma.studentAcademicEnrollment.findMany({ where, select: schoolEnrollmentSelect(schoolId), orderBy: schoolEnrollmentOrder, skip: (page - 1) * limit, take: limit }),
  ]);
  const currentWhere = { studentId, schoolId, academicYear: { schoolId, isCurrent: true }, grade: { schoolId }, section: { schoolId } };
  let current = await prisma.studentAcademicEnrollment.findFirst({ where: currentWhere, select: schoolEnrollmentSelect(schoolId), orderBy: [{ enrollmentDate: "desc" }, { createdAt: "desc" }] });
  if (!current) current = await prisma.studentAcademicEnrollment.findFirst({ where: { studentId, schoolId, status: "ACTIVE", academicYear: { schoolId }, grade: { schoolId }, section: { schoolId } }, select: schoolEnrollmentSelect(schoolId), orderBy: [{ academicYear: { startDate: "desc" } }, { enrollmentDate: "desc" }] });
  if (!current) current = await prisma.studentAcademicEnrollment.findFirst({ where, select: schoolEnrollmentSelect(schoolId), orderBy: schoolEnrollmentOrder });
  return { current, records, total, page, pageSize: limit, totalPages: Math.ceil(total / limit) };
};

const programmeEnrollmentSelect = {
  id: true,
  registrationNumber: true,
  admissionDate: true,
  expectedCompletionDate: true,
  actualCompletionDate: true,
  status: true,
  programme: { select: { id: true, name: true, code: true, degreeType: true, durationYears: true, semestersPerYear: true, totalSemesters: true, termMode: true, department: { select: { id: true, name: true, code: true } } } },
  curriculumVersion: { select: { id: true, name: true, versionCode: true, durationYears: true, semestersPerYear: true, totalSemesters: true, termMode: true, status: true } },
  batch: { select: { id: true, name: true, code: true, admissionYear: true, expectedGraduationYear: true, startDate: true, endDate: true, status: true } },
};
const collegeProgrammeSelect = (schoolId) => ({
  ...programmeEnrollmentSelect,
  semesterEnrollments: {
    where: { schoolId, academicYear: { schoolId }, programmeTerm: { schoolId } },
    orderBy: [{ academicYear: { startDate: "desc" } }, { enrollmentDate: "desc" }, { createdAt: "desc" }],
    select: {
      id: true, status: true, enrollmentDate: true, completionDate: true,
      academicYear: { select: { id: true, name: true, startDate: true, endDate: true, isCurrent: true, status: true } },
      programmeTerm: { select: { id: true, name: true, code: true, sequence: true, academicYearNumber: true, semesterNumber: true, totalCredits: true, status: true } },
    },
  },
});
const collegeProgrammeWhere = (studentId, schoolId) => ({ studentId, schoolId, programme: { is: { schoolId, department: { is: { schoolId } } } }, curriculumVersion: { is: { schoolId, programme: { is: { schoolId } } } }, batch: { is: { schoolId, programme: { is: { schoolId } }, curriculumVersion: { is: { schoolId } } } } });
const findCollegeAcademicData = async (studentId, schoolId, page, limit) => {
  const where = collegeProgrammeWhere(studentId, schoolId);
  const select = collegeProgrammeSelect(schoolId);
  const [total, records] = await prisma.$transaction([
    prisma.studentProgrammeEnrollment.count({ where }),
    prisma.studentProgrammeEnrollment.findMany({ where, select, orderBy: [{ admissionDate: "desc" }, { createdAt: "desc" }], skip: (page - 1) * limit, take: limit }),
  ]);
  let current = await prisma.studentProgrammeEnrollment.findFirst({ where: { ...where, status: "ACTIVE" }, select, orderBy: [{ admissionDate: "desc" }, { createdAt: "desc" }] });
  if (!current) current = await prisma.studentProgrammeEnrollment.findFirst({ where, select, orderBy: [{ admissionDate: "desc" }, { createdAt: "desc" }] });
  return { current, records, total, page, pageSize: limit, totalPages: Math.ceil(total / limit) };
};
const findCollegeCourseRegistrations = async (studentId, schoolId, semesterEnrollmentId, page, limit) => {
  const where = {
    schoolId,
    studentSemesterEnrollmentId: semesterEnrollmentId,
    semesterEnrollment: { is: { schoolId, programmeEnrollment: { is: { schoolId, studentId } } } },
    courseOffering: { is: { schoolId, curriculumCourse: { is: { schoolId, course: { is: { schoolId } } } }, programmeTerm: { is: { schoolId } }, academicYear: { is: { schoolId } } } },
  };
  const [total, records] = await prisma.$transaction([
    prisma.studentCourseRegistration.count({ where }),
    prisma.studentCourseRegistration.findMany({
      where,
      orderBy: [{ registrationDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, status: true, registrationDate: true, withdrawalDate: true, courseOffering: { select: {
        id: true, code: true, status: true, academicYear: { select: { id: true, name: true } },
        curriculumCourse: { select: { id: true, courseType: true, isMandatory: true, credits: true, course: { select: { id: true, name: true, code: true, courseType: true, credits: true } } } },
      } } },
    }),
  ]);
  return { records: records.map((record) => ({ ...record, course: { ...record.courseOffering.curriculumCourse.course, offeringId: record.courseOffering.id, offeringCode: record.courseOffering.code, offeringStatus: record.courseOffering.status, academicYear: record.courseOffering.academicYear, curriculumCourseId: record.courseOffering.curriculumCourse.id, courseType: record.courseOffering.curriculumCourse.courseType, isMandatory: record.courseOffering.curriculumCourse.isMandatory, credits: record.courseOffering.curriculumCourse.credits ?? record.courseOffering.curriculumCourse.course.credits } })), total, page, pageSize: limit, totalPages: Math.ceil(total / limit) };
};

const PORTAL_USER_SELECT = { id: true, firstName: true, lastName: true, email: true, phone: true, role: true, status: true, schoolId: true, createdAt: true, updatedAt: true };
const findStudentPortalAccount = (studentId, schoolId) => prisma.student.findFirst({
  where: { id: studentId, schoolId },
  select: { id: true, status: true, portalUser: { select: PORTAL_USER_SELECT } },
});

const createPortalAccountAndLink = (studentId, schoolId, userData) => prisma.$transaction(async (tx) => {
  const student = await tx.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true, status: true, portalUserId: true, firstName: true, lastName: true } });
  if (!student) return { state: "STUDENT_NOT_FOUND" };
  if (student.status !== "ACTIVE") return { state: "STUDENT_INACTIVE" };
  if (student.portalUserId) return { state: "PORTAL_ACCOUNT_EXISTS" };
  const user = await tx.user.create({ data: { ...userData, firstName: student.firstName, lastName: student.lastName, role: "STUDENT", schoolId }, select: PORTAL_USER_SELECT });
  const linked = await tx.student.updateMany({ where: { id: studentId, schoolId, portalUserId: null }, data: { portalUserId: user.id } });
  if (linked.count !== 1) throw Object.assign(new Error("Student portal account was linked concurrently"), { code: "PORTAL_ACCOUNT_CONFLICT" });
  return { state: "LINKED", user };
});

const linkPortalUser = (studentId, schoolId, userId) => prisma.$transaction(async (tx) => {
  const student = await tx.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true, status: true, portalUserId: true } });
  if (!student) return { state: "STUDENT_NOT_FOUND" };
  if (student.status !== "ACTIVE") return { state: "STUDENT_INACTIVE" };
  if (student.portalUserId) return { state: "PORTAL_ACCOUNT_EXISTS" };
  const user = await tx.user.findFirst({ where: { id: userId, schoolId }, select: PORTAL_USER_SELECT });
  if (!user) return { state: "USER_NOT_FOUND" };
  if (user.role !== "STUDENT" || user.status !== "ACTIVE") return { state: "USER_INELIGIBLE" };
  const existingLink = await tx.student.findFirst({ where: { portalUserId: userId }, select: { id: true } });
  if (existingLink) return { state: "USER_ALREADY_LINKED" };
  const linked = await tx.student.updateMany({ where: { id: studentId, schoolId, portalUserId: null }, data: { portalUserId: userId } });
  if (linked.count !== 1) throw Object.assign(new Error("Student portal account was linked concurrently"), { code: "PORTAL_ACCOUNT_CONFLICT" });
  return { state: "LINKED", user };
});

const updatePortalAccountStatus = (studentId, schoolId, status) => prisma.$transaction(async (tx) => {
  const student = await tx.student.findFirst({ where: { id: studentId, schoolId }, select: { portalUserId: true, status: true } });
  if (!student) return { state: "STUDENT_NOT_FOUND" };
  if (!student.portalUserId) return { state: "PORTAL_ACCOUNT_NOT_FOUND" };
  if (status === "ACTIVE" && student.status !== "ACTIVE") return { state: "STUDENT_INACTIVE" };
  const user = await tx.user.findFirst({ where: { id: student.portalUserId, schoolId, role: "STUDENT" }, select: { id: true } });
  if (!user) return { state: "PORTAL_ACCOUNT_NOT_FOUND" };
  const updated = await tx.user.update({ where: { id: user.id }, data: { status, authVersion: { increment: 1 } }, select: PORTAL_USER_SELECT });
  return { state: "UPDATED", user: updated };
});

module.exports = {
  createStudent,
  findStudentById,
  findStudentByAdmissionNumber,
  findExistingAdmissionNumbers,
  createManyStudents,
  findStudents,
  updateStudent,
  updateStudentStatus,
  deactivateStudent,
  findStudentByPortalUserId,
  findStudentPortalAccount,
  createPortalAccountAndLink,
  linkPortalUser,
  updatePortalAccountStatus,
  findPortalProfile,
  updatePortalProfile,
  findSchoolAcademicData,
  findCollegeAcademicData,
  findCollegeCourseRegistrations,
};

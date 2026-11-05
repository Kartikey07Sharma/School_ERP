const prisma = require("../database/prisma");

const studentSelect = {
  id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true,
  dateOfBirth: true, gender: true, admissionDate: true, className: true, section: true,
  academicYear: true, email: true, phone: true, address: true, guardianName: true,
  guardianRelationship: true, guardianPhone: true, guardianEmail: true, status: true,
  schoolId: true, createdAt: true, updatedAt: true,
};

const PROFILE_FIELDS = new Set([
  "admissionNumber", "firstName", "middleName", "lastName", "dateOfBirth", "gender",
  "admissionDate", "className", "section", "academicYear", "email", "phone", "address",
  "guardianName", "guardianRelationship", "guardianPhone", "guardianEmail",
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
};

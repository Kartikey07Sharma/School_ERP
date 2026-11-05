const AppError = require("../utils/AppError");
const { ROLE, hasPermission } = require("../constants/permissions");

function createStudentService({ students: suppliedStudents, schools: suppliedSchools } = {}) {
  const students = () => suppliedStudents || require("../repositories/student.repository");
  const schools = () => suppliedSchools || require("../repositories/school.repository");

  function requireManager(actor, permission = "students:manage") {
    if (!actor) throw new AppError("Authentication required", 401, "UNAUTHENTICATED");
    const allowed = actor.role === ROLE.SUPER_ADMIN
      ? hasPermission(actor.role, `${permission}:any`)
      : actor.role === ROLE.SCHOOL_ADMIN && hasPermission(actor.role, `${permission}:school`);
    if (!allowed) throw new AppError("You do not have permission to manage students", 403, "FORBIDDEN");
  }

  function resolveSchoolId(actor, requestedSchoolId) {
    if (actor.role === ROLE.SUPER_ADMIN) {
      if (!requestedSchoolId) throw new AppError("schoolId is required for platform administrators", 400, "SCHOOL_REQUIRED");
      return requestedSchoolId;
    }
    if (!actor.schoolId) throw new AppError("Your account is not assigned to a school", 403, "TENANT_REQUIRED");
    if (requestedSchoolId !== undefined) throw new AppError("School administrators cannot supply schoolId", 400, "SCHOOL_ID_FORBIDDEN");
    return actor.schoolId;
  }

  async function getActiveSchool(schoolId, requireActive = false) {
    const school = await schools().findSchoolById(schoolId);
    if (!school) throw new AppError("School not found", 404, "NOT_FOUND");
    if (requireActive && school.status !== "ACTIVE") throw new AppError("Students cannot be admitted to an inactive school", 409, "SCHOOL_INACTIVE");
    return school;
  }

  function isAdmissionNumberConstraint(error) {
    if (error?.code !== "P2002") return false;
    const target = error.meta?.target;
    if (typeof target === "string") return target === "students_schoolId_admissionNumber_key";
    return Array.isArray(target)
      && target.length === 2
      && new Set(target).size === 2
      && target.includes("schoolId")
      && target.includes("admissionNumber");
  }

  function validateDateRelationship(dateOfBirth, admissionDate) {
    const today = new Date().toISOString().slice(0, 10);
    if (dateOfBirth.toISOString().slice(0, 10) > today) {
      throw new AppError("Date of birth cannot be in the future", 400, "VALIDATION_ERROR");
    }
    if (admissionDate < dateOfBirth) {
      throw new AppError("Admission date cannot be earlier than date of birth", 400, "VALIDATION_ERROR");
    }
  }

  async function createStudent(input, actor) {
    requireManager(actor);
    const schoolId = resolveSchoolId(actor, input.schoolId);
    await getActiveSchool(schoolId, true);
    const { schoolId: ignored, ...studentData } = input;
    if (await students().findStudentByAdmissionNumber(studentData.admissionNumber, schoolId)) {
      throw new AppError("Admission number already exists in this school", 409, "DUPLICATE_ADMISSION_NUMBER");
    }
    try {
      validateDateRelationship(studentData.dateOfBirth, studentData.admissionDate);
      return await students().createStudent(schoolId, studentData);
    } catch (error) {
      if (isAdmissionNumberConstraint(error)) {
        throw new AppError("Admission number already exists in this school", 409, "DUPLICATE_ADMISSION_NUMBER");
      }
      throw error;
    }
  }

  async function getStudents(filters, actor) {
    requireManager(actor, "students:read");
    const schoolId = resolveSchoolId(actor, filters.schoolId);
    await getActiveSchool(schoolId);
    return students().findStudents(schoolId, filters);
  }

  async function getStudentById(id, requestedSchoolId, actor) {
    requireManager(actor, "students:read");
    const schoolId = resolveSchoolId(actor, requestedSchoolId);
    await getActiveSchool(schoolId);
    const student = await students().findStudentById(id, schoolId);
    if (!student) throw new AppError("Student not found", 404, "NOT_FOUND");
    return student;
  }

  async function updateStudent(id, input, requestedSchoolId, actor) {
    requireManager(actor);
    const schoolId = resolveSchoolId(actor, requestedSchoolId);
    await getActiveSchool(schoolId);
    const existing = await students().findStudentById(id, schoolId);
    if (!existing) throw new AppError("Student not found", 404, "NOT_FOUND");
    if (input.admissionNumber && input.admissionNumber !== existing.admissionNumber
      && await students().findStudentByAdmissionNumber(input.admissionNumber, schoolId)) {
      throw new AppError("Admission number already exists in this school", 409, "DUPLICATE_ADMISSION_NUMBER");
    }
    validateDateRelationship(input.dateOfBirth || existing.dateOfBirth, input.admissionDate || existing.admissionDate);
    try {
      const updated = await students().updateStudent(id, schoolId, input);
      if (!updated) throw new AppError("Student not found", 404, "NOT_FOUND");
      return updated;
    } catch (error) {
      if (isAdmissionNumberConstraint(error)) throw new AppError("Admission number already exists in this school", 409, "DUPLICATE_ADMISSION_NUMBER");
      throw error;
    }
  }

  async function changeStudentStatus(id, status, requestedSchoolId, actor) {
    requireManager(actor);
    const schoolId = resolveSchoolId(actor, requestedSchoolId);
    await getActiveSchool(schoolId);
    const student = await students().updateStudentStatus(id, schoolId, status);
    if (!student) throw new AppError("Student not found", 404, "NOT_FOUND");
    return student;
  }

  async function deleteStudent(id, requestedSchoolId, actor) {
    requireManager(actor);
    const schoolId = resolveSchoolId(actor, requestedSchoolId);
    await getActiveSchool(schoolId);
    const student = await students().deactivateStudent(id, schoolId);
    if (!student) throw new AppError("Student not found", 404, "NOT_FOUND");
    return student;
  }

  async function getStudentByPortalUser(actor) {
    if (actor?.role !== ROLE.STUDENT || !actor.schoolId) throw new AppError("You do not have permission to access a student portal profile", 403, "FORBIDDEN");
    const student = await students().findStudentByPortalUserId(actor.id, actor.schoolId);
    if (!student) throw new AppError("Student profile not found", 404, "NOT_FOUND");
    return student;
  }

  return { createStudent, getStudents, getStudentById, updateStudent, changeStudentStatus, deleteStudent, getStudentByPortalUser };
}

module.exports = { ...createStudentService(), createStudentService };

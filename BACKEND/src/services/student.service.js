const AppError = require("../utils/AppError");
const { ROLE, hasPermission } = require("../constants/permissions");
const bcrypt = require("bcrypt");

function createStudentService({ students: suppliedStudents, schools: suppliedSchools, bcryptLib = bcrypt } = {}) {
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
    return getPortalStudent(actor);
  }

  function requirePortalActor(actor) {
    if (actor?.role !== ROLE.STUDENT || !actor.id || !actor.schoolId) throw new AppError("You do not have permission to access a student portal profile", 403, "FORBIDDEN");
  }

  async function getPortalStudent(actor) {
    requirePortalActor(actor);
    const repository = students();
    const student = repository.findPortalProfile
      ? await repository.findPortalProfile(actor.id, actor.schoolId)
      : await repository.findStudentByPortalUserId(actor.id, actor.schoolId);
    if (!student) throw new AppError("Student profile not found", 404, "NOT_FOUND");
    return student;
  }

  function fullName(student) {
    return [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ");
  }

  function schoolEnrollmentSummary(enrollment) {
    if (!enrollment) return null;
    return {
      id: enrollment.id,
      status: enrollment.status,
      rollNumber: enrollment.rollNumber,
      enrollmentDate: enrollment.enrollmentDate,
      leavingDate: enrollment.leavingDate,
      academicYear: enrollment.academicYear,
      grade: enrollment.grade ? { id: enrollment.grade.id, name: enrollment.grade.name, code: enrollment.grade.code, sequence: enrollment.grade.sequence } : null,
      section: enrollment.section ? { id: enrollment.section.id, name: enrollment.section.name, code: enrollment.section.code, status: enrollment.section.status } : null,
      subjects: (enrollment.grade?.subjectMappings || []).map((mapping) => ({ ...mapping.subject, isMandatory: mapping.isMandatory, weeklyPeriods: mapping.weeklyPeriods, displayOrder: mapping.displayOrder })),
    };
  }

  function collegeProgrammeSummary(enrollment) {
    if (!enrollment) return null;
    const semesters = enrollment.semesterEnrollments || [];
    const currentSemester = semesters.find((item) => item.academicYear?.isCurrent && item.status === "ACTIVE")
      || semesters.find((item) => item.academicYear?.isCurrent)
      || semesters.find((item) => item.status === "ACTIVE")
      || semesters[0]
      || null;
    return {
      programmeEnrollment: {
        id: enrollment.id,
        registrationNumber: enrollment.registrationNumber,
        status: enrollment.status,
        admissionDate: enrollment.admissionDate,
        expectedCompletionDate: enrollment.expectedCompletionDate,
        actualCompletionDate: enrollment.actualCompletionDate,
      },
      programme: enrollment.programme,
      department: enrollment.programme?.department || null,
      batch: enrollment.batch,
      curriculumVersion: enrollment.curriculumVersion,
      currentSemesterEnrollment: currentSemester,
    };
  }

  async function academicInformationFor(student, query = {}) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const institutionType = student.school?.institutionType;
    if (institutionType === "SCHOOL") {
      const result = await students().findSchoolAcademicData(student.id, student.schoolId, page, limit);
      return {
        institutionType,
        current: schoolEnrollmentSummary(result.current),
        history: { records: result.records.map(schoolEnrollmentSummary), total: result.total, page: result.page, pageSize: result.pageSize, totalPages: result.totalPages },
      };
    }
    if (institutionType === "COLLEGE") {
      const result = await students().findCollegeAcademicData(student.id, student.schoolId, page, limit);
      const semesters = result.current?.semesterEnrollments || [];
      const currentSemester = semesters.find((item) => item.academicYear?.isCurrent && item.status === "ACTIVE")
        || semesters.find((item) => item.academicYear?.isCurrent)
        || semesters.find((item) => item.status === "ACTIVE")
        || semesters[0]
        || null;
      const registrations = currentSemester
        ? await students().findCollegeCourseRegistrations(student.id, student.schoolId, currentSemester.id, page, limit)
        : { records: [], total: 0, page, pageSize: limit, totalPages: 0 };
      const history = result.records.map((enrollment) => ({
        id: enrollment.id,
        registrationNumber: enrollment.registrationNumber,
        status: enrollment.status,
        admissionDate: enrollment.admissionDate,
        expectedCompletionDate: enrollment.expectedCompletionDate,
        actualCompletionDate: enrollment.actualCompletionDate,
        programme: enrollment.programme,
        department: enrollment.programme?.department || null,
        batch: enrollment.batch,
        curriculumVersion: enrollment.curriculumVersion,
        semesterEnrollments: enrollment.semesterEnrollments,
      }));
      return {
        institutionType,
        current: collegeProgrammeSummary(result.current),
        history: { records: history, total: result.total, page: result.page, pageSize: result.pageSize, totalPages: result.totalPages },
        courseRegistrations: registrations,
      };
    }
    throw new AppError("Student institution type is unsupported", 409, "INSTITUTION_TYPE_UNSUPPORTED");
  }

  async function getMyStudentDashboard(actor) {
    const student = await getPortalStudent(actor);
    const academics = await academicInformationFor(student, { page: 1, limit: 10 });
    return {
      student: {
        id: student.id,
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
        fullName: fullName(student),
        admissionNumber: student.admissionNumber,
        status: student.status,
        institutionId: student.schoolId,
      },
      institution: student.school,
      guardian: {
        name: student.guardianName,
        relationship: student.guardianRelationship,
        phone: student.guardianPhone,
        email: student.guardianEmail,
      },
      academicSummary: academics.institutionType === "COLLEGE"
        ? { institutionType: academics.institutionType, current: academics.current, courseRegistrations: academics.courseRegistrations }
        : { institutionType: academics.institutionType, current: academics.current },
    };
  }

  async function getMyStudentAcademicInformation(actor, query) {
    const student = await getPortalStudent(actor);
    return academicInformationFor(student, query);
  }

  async function updateMyStudentProfile(input, actor) {
    await getPortalStudent(actor);
    const updated = await students().updatePortalProfile(actor.id, actor.schoolId, input);
    if (!updated) throw new AppError("Student profile not found", 404, "NOT_FOUND");
    return updated;
  }

  function requireUuid(value, label) {
    if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
      throw new AppError(`Invalid ${label}`, 400, "VALIDATION_ERROR");
    }
  }

  function accountResult(result) {
    const errors = {
      STUDENT_NOT_FOUND: ["Student not found", 404, "NOT_FOUND"],
      STUDENT_INACTIVE: ["Portal access can only be assigned to an active student", 409, "STUDENT_INACTIVE"],
      PORTAL_ACCOUNT_EXISTS: ["Student already has a portal account", 409, "PORTAL_ACCOUNT_EXISTS"],
      USER_NOT_FOUND: ["User not found in this institution", 404, "NOT_FOUND"],
      USER_INELIGIBLE: ["Only an active STUDENT account can be linked", 409, "USER_INELIGIBLE"],
      USER_ALREADY_LINKED: ["This user is already linked to a student", 409, "USER_ALREADY_LINKED"],
      PORTAL_ACCOUNT_NOT_FOUND: ["Student portal account not found", 404, "NOT_FOUND"],
    };
    if (errors[result.state]) {
      const [message, status, code] = errors[result.state];
      throw new AppError(message, status, code);
    }
    return result.user;
  }

  async function getPortalAccount(id, requestedSchoolId, actor) {
    requireManager(actor, "students:read");
    requireUuid(id, "student ID");
    const schoolId = resolveSchoolId(actor, requestedSchoolId);
    await getActiveSchool(schoolId);
    const result = await students().findStudentPortalAccount(id, schoolId);
    if (!result) throw new AppError("Student not found", 404, "NOT_FOUND");
    return { studentId: result.id, linked: Boolean(result.portalUser), user: result.portalUser };
  }

  async function createPortalAccount(id, input, requestedSchoolId, actor) {
    requireManager(actor);
    requireUuid(id, "student ID");
    const schoolId = resolveSchoolId(actor, requestedSchoolId);
    await getActiveSchool(schoolId, true);
    const password = await bcryptLib.hash(input.password, 12);
    try {
      const result = await students().createPortalAccountAndLink(id, schoolId, {
        email: input.email.trim().toLowerCase(),
        phone: input.phone,
        password,
      });
      return accountResult(result);
    } catch (error) {
      if (error?.code === "P2002") throw new AppError("Email or phone is already assigned to another user; link the intended existing account explicitly", 409, "ACCOUNT_FIELD_CONFLICT");
      if (error?.code === "PORTAL_ACCOUNT_CONFLICT") throw new AppError("Student portal account was linked concurrently", 409, "PORTAL_ACCOUNT_EXISTS");
      throw error;
    }
  }

  async function linkPortalAccount(id, userId, requestedSchoolId, actor) {
    requireManager(actor);
    requireUuid(id, "student ID");
    requireUuid(userId, "user ID");
    const schoolId = resolveSchoolId(actor, requestedSchoolId);
    await getActiveSchool(schoolId, true);
    try {
      return accountResult(await students().linkPortalUser(id, schoolId, userId));
    } catch (error) {
      if (error?.code === "P2002" || error?.code === "PORTAL_ACCOUNT_CONFLICT") throw new AppError("Student or user already has a linked portal account", 409, "PORTAL_ACCOUNT_CONFLICT");
      throw error;
    }
  }

  async function changePortalAccountStatus(id, status, requestedSchoolId, actor) {
    requireManager(actor);
    requireUuid(id, "student ID");
    const schoolId = resolveSchoolId(actor, requestedSchoolId);
    await getActiveSchool(schoolId);
    return accountResult(await students().updatePortalAccountStatus(id, schoolId, status));
  }

  return { createStudent, getStudents, getStudentById, updateStudent, changeStudentStatus, deleteStudent, getStudentByPortalUser, getPortalAccount, createPortalAccount, linkPortalAccount, changePortalAccountStatus, getMyStudentDashboard, getMyStudentAcademicInformation, updateMyStudentProfile };
}

module.exports = { ...createStudentService(), createStudentService };

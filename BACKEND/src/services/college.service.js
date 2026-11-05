const prisma = require("../repositories/college.repository");
const AppError = require("../utils/AppError");
const models = {
  departments: "department", programmes: "programme", curricula: "curriculumVersion", terms: "programmeTerm",
  courses: "collegeCourse", mappings: "curriculumCourse", batches: "collegeBatch", programmeEnrollments: "studentProgrammeEnrollment",
  semesterEnrollments: "studentSemesterEnrollment", offerings: "courseOffering", registrations: "studentCourseRegistration", faculty: "facultyCourseAssignment",
};
const fail = (message, status = 400, code = "VALIDATION_ERROR") => { throw new AppError(message, status, code); };
const ensureId = (id) => { if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) fail("Invalid record ID."); };

async function context(actor, requestedSchoolId) {
  if (!actor) fail("Authentication required", 401, "UNAUTHENTICATED");
  if (!["SUPER_ADMIN", "SCHOOL_ADMIN"].includes(actor.role)) fail("You do not have permission to manage college academic records", 403, "FORBIDDEN");
  const schoolId = actor.role === "SUPER_ADMIN" ? requestedSchoolId : actor.schoolId;
  if (!schoolId) fail("schoolId is required for platform administrators", 400, "SCHOOL_REQUIRED");
  ensureId(schoolId);
  if (actor.role !== "SUPER_ADMIN" && requestedSchoolId) fail("School administrators cannot supply schoolId", 400, "SCHOOL_ID_FORBIDDEN");
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, institutionType: true } });
  if (!school) fail("College not found", 404, "NOT_FOUND");
  if (school.institutionType !== "COLLEGE") fail("This operation is available only for college institutions.", 403, "COLLEGE_ONLY");
  return schoolId;
}
const findOwned = (entity, id, schoolId) => { ensureId(id); return prisma[models[entity]].findFirst({ where: { id, schoolId } }); };
function validateProgramStructure(d) {
  if (!Number.isInteger(d.durationYears) || d.durationYears < 1 || d.durationYears > 12) fail("Programme duration must be between 1 and 12 years.");
  if (d.termMode === "YEAR") { if (d.totalSemesters != null || d.semestersPerYear != null) fail("Year-wise programmes must not define semester counts."); }
  else if (!Number.isInteger(d.semestersPerYear) || d.semestersPerYear < 1 || !Number.isInteger(d.totalSemesters) || d.totalSemesters !== d.durationYears * d.semestersPerYear) fail("Total semesters must equal duration years multiplied by semesters per year.");
}
const checks = {
  programmes: async (d, s) => { if (!await findOwned("departments", d.departmentId, s)) fail("Department does not belong to this college."); },
  curricula: async (d, s) => { const p = await findOwned("programmes", d.programmeId, s); if (!p) fail("Programme does not belong to this college."); validateProgramStructure({ ...d, termMode: d.termMode || p.termMode }); if (d.effectiveTo && d.effectiveTo < d.effectiveFrom) fail("Curriculum effective end date must not precede its start date."); },
  terms: async (d, s) => { const c = await findOwned("curricula", d.curriculumVersionId, s); if (!c) fail("Curriculum version does not belong to this college."); const max = c.termMode === "YEAR" ? c.durationYears : c.totalSemesters; if (d.sequence > max) fail("Term sequence exceeds the curriculum structure."); if (c.termMode === "SEMESTER" && d.semesterNumber !== d.sequence) fail("Semester number must match its sequence."); if (c.termMode === "YEAR" && d.semesterNumber != null) fail("Year-wise programmes cannot define semester numbers."); const expectedYear = c.termMode === "YEAR" ? d.sequence : Math.ceil(d.sequence / c.semestersPerYear); if (d.academicYearNumber !== expectedYear) fail("Programme year does not match the configured semester progression."); },
  mappings: async (d, s) => { const [c, t, course] = await Promise.all([findOwned("curricula", d.curriculumVersionId, s), findOwned("terms", d.programmeTermId, s), findOwned("courses", d.courseId, s)]); if (!c || !t || !course || t.curriculumVersionId !== c.id) fail("Curriculum, term and course must belong to this college and selected curriculum."); },
  batches: async (d, s) => { const [p, c] = await Promise.all([findOwned("programmes", d.programmeId, s), findOwned("curricula", d.curriculumVersionId, s)]); if (!p || !c || c.programmeId !== p.id) fail("Batch programme and curriculum must belong to the same college and programme."); if (d.expectedGraduationYear < d.admissionYear || d.endDate < d.startDate || d.startDate.getUTCFullYear() !== d.admissionYear) fail("Batch years and dates are inconsistent."); },
  programmeEnrollments: async (d, s) => { const [student, p, c, b] = await Promise.all([prisma.student.findFirst({ where: { id: d.studentId, schoolId: s }, select: { id: true } }), findOwned("programmes", d.programmeId, s), findOwned("curricula", d.curriculumVersionId, s), findOwned("batches", d.batchId, s)]); if (!student || !p || !c || !b || c.programmeId !== p.id || b.programmeId !== p.id || b.curriculumVersionId !== c.id) fail("Student, programme, curriculum and batch must belong to this college and match."); },
  semesterEnrollments: async (d, s) => { const [e, t, y] = await Promise.all([findOwned("programmeEnrollments", d.programmeEnrollmentId, s), findOwned("terms", d.programmeTermId, s), prisma.academicYear.findFirst({ where: { id: d.academicYearId, schoolId: s } })]); if (!e || !t || !y || e.curriculumVersionId !== t.curriculumVersionId) fail("Programme enrolment, term and academic year must belong to this college and match."); if (d.enrollmentDate < y.startDate || d.enrollmentDate > y.endDate || (d.completionDate && (d.completionDate < d.enrollmentDate || d.completionDate > y.endDate))) fail("Semester enrolment dates must fall within the selected academic year."); },
  offerings: async (d, s) => { const [m, t, y] = await Promise.all([findOwned("mappings", d.curriculumCourseId, s), findOwned("terms", d.programmeTermId, s), prisma.academicYear.findFirst({ where: { id: d.academicYearId, schoolId: s } })]); if (!m || !t || !y || m.programmeTermId !== t.id) fail("Course mapping, programme term and academic year must belong to this college and match."); },
  registrations: async (d, s) => { const [e, o] = await Promise.all([prisma.studentSemesterEnrollment.findFirst({ where: { id: d.studentSemesterEnrollmentId, schoolId: s }, include: { programmeEnrollment: true } }), prisma.courseOffering.findFirst({ where: { id: d.courseOfferingId, schoolId: s }, include: { curriculumCourse: true } })]); if (!e || !o || e.programmeTermId !== o.programmeTermId || e.academicYearId !== o.academicYearId || e.programmeEnrollment.curriculumVersionId !== o.curriculumCourse.curriculumVersionId) fail("Student is not eligible for this course offering."); },
  faculty: async (d, s) => { const [o, u] = await Promise.all([findOwned("offerings", d.courseOfferingId, s), prisma.user.findFirst({ where: { id: d.userId, schoolId: s }, select: { id: true, role: true } })]); if (!o || !u || u.role !== "TEACHER") fail("Faculty user and offering must belong to this college; user must have TEACHER role."); },
};

async function list(entity, actor, query = {}) {
  const schoolId = await context(actor, query.schoolId);
  for (const key of ["programmeId", "departmentId", "curriculumVersionId", "programmeTermId", "courseId", "academicYearId", "batchId", "studentId", "courseOfferingId", "studentSemesterEnrollmentId", "programmeEnrollmentId"]) if (query[key]) ensureId(query[key]);
  const parentChecks = {
    curricula: ["programmeId", "programmes"],
    terms: ["curriculumVersionId", "curricula"],
    mappings: ["programmeTermId", "terms"],
    semesterEnrollments: ["programmeEnrollmentId", "programmeEnrollments"],
    registrations: ["courseOfferingId", "offerings"],
    faculty: ["courseOfferingId", "offerings"],
  };
  const parentCheck = parentChecks[entity];
  if (parentCheck && query[parentCheck[0]] && !await findOwned(parentCheck[1], query[parentCheck[0]], schoolId)) fail("Parent record not found", 404, "NOT_FOUND");
  if (["programmeEnrollments", "registrations"].includes(entity) && query.studentId && !await prisma.student.findFirst({ where: { id: query.studentId, schoolId }, select: { id: true } })) fail("Student not found", 404, "NOT_FOUND");
  let where = { schoolId };
  const filters = { status: "status", programmeId: "programmeId", departmentId: "departmentId", curriculumVersionId: "curriculumVersionId", programmeTermId: "programmeTermId", courseId: "courseId", admissionYear: "admissionYear", academicYearId: "academicYearId", batchId: "batchId", studentId: "studentId", courseOfferingId: "courseOfferingId", studentSemesterEnrollmentId: "studentSemesterEnrollmentId" };
  for (const [input, field] of Object.entries(filters)) if (query[input] && !(entity === "registrations" && input === "studentId")) where[field] = query[input];
  if (query.search && ["departments", "programmes", "courses", "batches"].includes(entity)) where.OR = ["name", "code"].map((field) => ({ [field]: { contains: query.search, mode: "insensitive" } }));
  if (entity === "semesterEnrollments" && query.programmeEnrollmentId) where.programmeEnrollmentId = query.programmeEnrollmentId;
  if (entity === "registrations" && query.studentId) where.semesterEnrollment = { is: { programmeEnrollment: { is: { studentId: query.studentId } } } };
  const model = prisma[models[entity]]; if (!model) fail("College academic resource not found", 404, "NOT_FOUND");
  if (query.status) {
    const statuses = { departments: ["ACTIVE", "INACTIVE"], programmes: ["ACTIVE", "INACTIVE"], curricula: ["ACTIVE", "INACTIVE"], terms: ["ACTIVE", "INACTIVE"], courses: ["ACTIVE", "INACTIVE"], mappings: ["ACTIVE", "INACTIVE"], batches: ["ACTIVE", "INACTIVE"], programmeEnrollments: ["ACTIVE", "COMPLETED", "WITHDRAWN", "SUSPENDED", "TRANSFERRED", "OTHER"], semesterEnrollments: ["ACTIVE", "WITHDRAWN", "COMPLETED"], offerings: ["ACTIVE", "INACTIVE"], registrations: ["REGISTERED", "WITHDRAWN", "COMPLETED"], faculty: ["ACTIVE", "INACTIVE"] };
    if (!statuses[entity]?.includes(query.status)) fail("Invalid status filter for this resource.");
  }
  const page = query.page || 1, limit = query.limit || 50;
  const [total, records] = await prisma.$transaction([model.count({ where }), model.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit })]);
  return { records, page, pageSize: limit, total, totalPages: Math.ceil(total / limit) };
}
async function get(entity, id, actor, requestedSchoolId) { const schoolId = await context(actor, requestedSchoolId); const row = await findOwned(entity, id, schoolId); if (!row) fail("Record not found", 404, "NOT_FOUND"); return row; }
async function create(entity, input, actor, requestedSchoolId) {
  const schoolId = await context(actor, requestedSchoolId || input.schoolId); const data = { ...input }; delete data.schoolId;
  if (entity === "mappings") { const term = await findOwned("terms", data.programmeTermId, schoolId); if (!term) fail("Programme term does not belong to this college."); if (data.curriculumVersionId && data.curriculumVersionId !== term.curriculumVersionId) fail("Programme term does not belong to the selected curriculum."); data.curriculumVersionId = term.curriculumVersionId; }
  if (checks[entity]) await checks[entity](data, schoolId);
  if (entity === "mappings") { const course = await findOwned("courses", data.courseId, schoolId); data.courseType ??= course.courseType; data.credits ??= course.credits; data.lectureHours ??= course.lectureHours; data.tutorialHours ??= course.tutorialHours; data.practicalHours ??= course.practicalHours; }
  if (entity === "programmes" || entity === "curricula") validateProgramStructure({ ...data, termMode: data.termMode || "SEMESTER" });
  const model = prisma[models[entity]]; if (!model) fail("College academic resource not found", 404, "NOT_FOUND");
  if (entity === "terms") {
    const c = await findOwned("curricula", data.curriculumVersionId, schoolId);
    if (c.termMode === "SEMESTER" && (!data.semesterNumber || data.semesterNumber > c.totalSemesters)) fail("Semester number is outside the configured curriculum.");
    if (data.startMonth && (data.startMonth < 1 || data.startMonth > 12)) fail("Month must be between 1 and 12.");
    if (data.endMonth && (data.endMonth < 1 || data.endMonth > 12)) fail("Month must be between 1 and 12.");
  }
  if (entity === "offerings" && data.capacity === 0) fail("Offering capacity must be positive.");
  if (entity === "programmeEnrollments" && (data.status || "ACTIVE") === "ACTIVE") { const active = await prisma.studentProgrammeEnrollment.findFirst({ where: { studentId: data.studentId, programmeId: data.programmeId, schoolId, status: "ACTIVE" } }); if (active) fail("Student already has an active enrolment in this programme.", 409, "DUPLICATE_ENROLMENT"); }
  if (entity === "registrations" && (data.status || "REGISTERED") === "REGISTERED") return prisma.$transaction(async (tx) => { const offering = await tx.courseOffering.findFirst({ where: { id: data.courseOfferingId, schoolId } }); if (offering.capacity) { const count = await tx.studentCourseRegistration.count({ where: { schoolId, courseOfferingId: offering.id, status: "REGISTERED" } }); if (count >= offering.capacity) fail("Course offering capacity has been reached.", 409, "CAPACITY_REACHED"); } return tx.studentCourseRegistration.create({ data: { ...data, schoolId } }); }, { isolationLevel: "Serializable" });
  return model.create({ data: { ...data, schoolId } });
}
async function update(entity, id, input, actor, requestedSchoolId) {
  const schoolId = await context(actor, requestedSchoolId || input.schoolId); delete input.schoolId;
  if (!Object.keys(input).length) fail("At least one updatable field is required.");
  const current = await findOwned(entity, id, schoolId); if (!current) fail("Record not found", 404, "NOT_FOUND"); const merged = { ...current, ...input };
  if (entity === "curricula" && Object.keys(input).some((key) => key !== "status")) { const used = await prisma.studentProgrammeEnrollment.count({ where: { curriculumVersionId: id, schoolId } }); if (used) fail("A curriculum version used by students is immutable.", 409, "CURRICULUM_IN_USE"); }
  if (checks[entity]) await checks[entity](merged, schoolId);
  const allowed = {
    departments: ["name", "description", "status"],
    programmes: ["name", "description", "status", "durationYears", "semestersPerYear", "totalSemesters", "totalCredits", "termMode", "entryType", "degreeType"],
    curricula: ["status", "name", "effectiveFrom", "effectiveTo"],
    terms: ["name", "startMonth", "endMonth", "totalCredits", "status"],
    courses: ["name", "description", "courseType", "credits", "lectureHours", "tutorialHours", "practicalHours", "status"],
    mappings: ["courseType", "isMandatory", "credits", "lectureHours", "tutorialHours", "practicalHours", "displayOrder", "status"],
    batches: ["name", "status"],
    programmeEnrollments: ["registrationNumber", "expectedCompletionDate", "actualCompletionDate", "status"],
    semesterEnrollments: ["completionDate", "remarks", "status"],
    offerings: ["code", "capacity", "status"],
    registrations: ["status"],
    faculty: ["status"],
  };
  const unsupported = Object.keys(input).filter((key) => !allowed[entity]?.includes(key));
  if (unsupported.length) fail(`These fields cannot be changed through this endpoint: ${unsupported.join(", ")}`);
  const data = Object.fromEntries(Object.entries(input).filter(([key]) => allowed[entity]?.includes(key)));
  if (entity === "programmes") validateProgramStructure(merged);
  if (entity === "curricula" && Object.keys(data).some((key) => key !== "status")) { const [usedByStudents, usedByTerms] = await Promise.all([prisma.studentProgrammeEnrollment.count({ where: { curriculumVersionId: id, schoolId } }), prisma.programmeTerm.count({ where: { curriculumVersionId: id, schoolId } })]); if (usedByStudents || usedByTerms) fail("A curriculum version with terms or student history is immutable.", 409, "CURRICULUM_IN_USE"); }
  if (entity === "terms" && Object.keys(data).some((key) => key !== "status")) { const [enrolled, offered] = await Promise.all([prisma.studentSemesterEnrollment.count({ where: { programmeTermId: id, schoolId } }), prisma.courseOffering.count({ where: { programmeTermId: id, schoolId } })]); if (enrolled || offered) fail("A programme term used by enrolments or offerings cannot be structurally changed.", 409, "TERM_IN_USE"); }
  if (entity === "mappings") { const offered = await prisma.courseOffering.count({ where: { curriculumCourseId: id, schoolId } }); if (offered) fail("A curriculum course used by an offering cannot be changed.", 409, "CURRICULUM_COURSE_IN_USE"); }
  if (entity === "offerings" && data.capacity != null) { const registered = await prisma.studentCourseRegistration.count({ where: { courseOfferingId: id, schoolId, status: "REGISTERED" } }); if (registered > data.capacity) fail("Capacity cannot be lower than the current registration count.", 409, "CAPACITY_CONFLICT"); }
  if (entity === "programmeEnrollments" && data.status === "ACTIVE") { const active = await prisma.studentProgrammeEnrollment.findFirst({ where: { id: { not: id }, studentId: current.studentId, programmeId: current.programmeId, schoolId, status: "ACTIVE" } }); if (active) fail("Student already has an active enrolment in this programme.", 409, "DUPLICATE_ENROLMENT"); }
  if (entity === "registrations" && data.status === "REGISTERED") { const offering = await findOwned("offerings", current.courseOfferingId, schoolId); if (offering.capacity) { const count = await prisma.studentCourseRegistration.count({ where: { id: { not: id }, schoolId, courseOfferingId: current.courseOfferingId, status: "REGISTERED" } }); if (count >= offering.capacity) fail("Course offering capacity has been reached.", 409, "CAPACITY_REACHED"); } }
  const changed = await prisma[models[entity]].updateMany({ where: { id, schoolId }, data });
  if (!changed.count) fail("Record not found", 404, "NOT_FOUND");
  return findOwned(entity, id, schoolId);
}
async function generateTerms(curriculumId, actor, requestedSchoolId) {
  const schoolId = await context(actor, requestedSchoolId); const c = await findOwned("curricula", curriculumId, schoolId); if (!c) fail("Curriculum version not found", 404, "NOT_FOUND");
  const count = c.termMode === "YEAR" ? c.durationYears : c.totalSemesters;
  if (!Number.isInteger(count) || count < 1 || (c.termMode === "SEMESTER" && c.durationYears * c.semestersPerYear !== c.totalSemesters)) fail("Curriculum semester configuration is inconsistent.");
  const rows = Array.from({ length: count }, (_, i) => { const n = i + 1; const year = c.termMode === "YEAR" ? n : Math.ceil(n / c.semestersPerYear); return { schoolId, curriculumVersionId: c.id, name: c.termMode === "YEAR" ? `Year ${n}` : `Semester ${n}`, code: c.termMode === "YEAR" ? `YEAR_${n}` : `SEM_${n}`, sequence: n, academicYearNumber: year, semesterNumber: c.termMode === "SEMESTER" ? n : null }; });
  await prisma.$transaction(rows.map((row) => prisma.programmeTerm.upsert({ where: { curriculumVersionId_sequence: { curriculumVersionId: c.id, sequence: row.sequence } }, create: row, update: {} })));
  return prisma.programmeTerm.findMany({ where: { schoolId, curriculumVersionId: c.id }, orderBy: { sequence: "asc" } });
}
module.exports = { context, list, get, create, update, generateTerms };

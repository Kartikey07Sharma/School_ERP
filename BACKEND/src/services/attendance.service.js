const db = require("../repositories/attendance.repository");
const AppError = require("../utils/AppError");
const fail = (message, status = 400, code = "VALIDATION_ERROR") => { throw new AppError(message, status, code); };
const admin = (u) => ["SUPER_ADMIN", "SCHOOL_ADMIN"].includes(u.role);
const utcToday = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
async function tenant(actor, type, requestedSchoolId) {
  if (actor?.role === "SUPER_ADMIN" && !requestedSchoolId) fail("schoolId is required for platform administrators", 400, "SCHOOL_REQUIRED");
  if (actor?.role !== "SUPER_ADMIN" && requestedSchoolId) fail("Institution users cannot supply schoolId", 400, "SCHOOL_ID_FORBIDDEN");
  const schoolId = actor?.role === "SUPER_ADMIN" ? requestedSchoolId : actor?.schoolId;
  if (!schoolId) fail("Institution context is required", 403, "FORBIDDEN");
  const school = await db.school.findUnique({ where: { id: schoolId }, select: { id: true, institutionType: true } });
  if (!school || school.institutionType !== type) fail(`This attendance workflow is available only for ${type.toLowerCase()} institutions`, 403, "INSTITUTION_TYPE_MISMATCH");
  return school.id;
}
async function teacherProfile(userId, schoolId, client = db) {
  const profile = await client.teacherProfile.findFirst({ where: { schoolId, status: "ACTIVE", employee: { is: { userId, schoolId, status: "ACTIVE", category: "TEACHING" } } }, select: { id: true } });
  if (!profile) fail("An active teaching employee and teacher profile are required", 403, "TEACHER_PROFILE_REQUIRED");
  return profile.id;
}
async function authorizeSchool(actor, schoolId, placement, client = db) {
  if (admin(actor)) return;
  if (actor.role !== "TEACHER") fail("You do not have permission to manage attendance", 403, "FORBIDDEN");
  const profileId = await teacherProfile(actor.id, schoolId, client);
  const assigned = await client.schoolTeacherAssignment.findFirst({ where: { schoolId, teacherProfileId: profileId, academicYearId: placement.academicYearId, gradeId: placement.gradeId, sectionId: placement.sectionId, status: "ACTIVE" }, select: { id: true } });
  if (!assigned) fail("You are not assigned to this class and section", 403, "FORBIDDEN");
}
async function schoolRoster(input, actor, client = db) {
  const schoolId = await tenant(actor, "SCHOOL", input.schoolId);
  const { academicYearId, gradeId, sectionId, date } = input;
  if (date > utcToday()) fail("Attendance cannot be marked for a future date", 400, "FUTURE_ATTENDANCE_DATE");
  const [year, section] = await Promise.all([
    client.academicYear.findFirst({ where: { id: academicYearId, schoolId }, select: { id: true, startDate: true, endDate: true } }),
    client.section.findFirst({ where: { id: sectionId, schoolId, gradeId, academicYearId, status: "ACTIVE" }, select: { id: true } }),
  ]);
  if (!year || !section || date < year.startDate || date > year.endDate) fail("Class, section and date must belong to the selected academic year", 400, "INVALID_PLACEMENT");
  await authorizeSchool(actor, schoolId, input, client);
  const enrollments = await client.studentAcademicEnrollment.findMany({ where: { schoolId, academicYearId, gradeId, sectionId, status: "ACTIVE", enrollmentDate: { lte: date }, OR: [{ leavingDate: null }, { leavingDate: { gt: date } }] }, include: { student: { select: { id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true } } }, orderBy: [{ rollNumber: "asc" }, { student: { lastName: "asc" } }] });
  const existing = await client.schoolStudentAttendance.findMany({ where: { schoolId, academicYearId, gradeId, sectionId, attendanceDate: date }, select: { studentId: true, status: true, remarks: true, id: true } });
  const map = new Map(existing.map((a) => [a.studentId, a]));
  return enrollments.map((e) => ({ ...e.student, enrollmentId: e.id, rollNumber: e.rollNumber, attendance: map.get(e.studentId) || null }));
}
async function markSchool(input, actor) {
  const schoolId = await tenant(actor, "SCHOOL", input.schoolId);
  try {
    return await db.$transaction(async (tx) => {
      const roster = await schoolRoster(input, actor, tx);
      const enrollmentByStudent = new Map(roster.map((student) => [student.id, student.enrollmentId]));
      if (!roster.length) fail("There are no active students in this class for the selected date", 400, "EMPTY_ROSTER");
      if (input.attendance.length !== enrollmentByStudent.size || input.attendance.some((entry) => !enrollmentByStudent.has(entry.studentId))) fail("Submit exactly one attendance status for every student in the selected class roster", 400, "INCOMPLETE_ROSTER");
      await tx.schoolStudentAttendance.createMany({ data: input.attendance.map((item) => ({ schoolId, academicYearId: input.academicYearId, gradeId: input.gradeId, sectionId: input.sectionId, attendanceDate: input.date, studentId: item.studentId, enrollmentId: enrollmentByStudent.get(item.studentId), status: item.status, remarks: item.remarks ?? null, markedById: actor.id })) });
      return tx.schoolStudentAttendance.findMany({ where: { schoolId, academicYearId: input.academicYearId, gradeId: input.gradeId, sectionId: input.sectionId, attendanceDate: input.date }, orderBy: { createdAt: "asc" } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error.code === "P2002") fail("Attendance already exists for one or more students on this date. Use the correction endpoint.", 409, "ATTENDANCE_ALREADY_MARKED");
    if (error.code === "P2034") fail("Enrollment or attendance changed concurrently. Reload the roster and retry.", 409, "CONCURRENT_WRITE");
    throw error;
  }
}
async function assignedOffering(actor, schoolId, offeringId, client = db) {
  const offering = await client.courseOffering.findFirst({ where: { id: offeringId, schoolId, status: "ACTIVE" }, include: { academicYear: true, programmeTerm: true, curriculumCourse: { include: { course: true, curriculumVersion: { include: { programme: { include: { department: true } } } } } } } });
  if (!offering) fail("Active course offering not found", 404, "NOT_FOUND");
  if (!admin(actor)) {
    if (actor.role !== "TEACHER") fail("You do not have permission to manage attendance", 403, "FORBIDDEN");
    const assignment = await client.facultyCourseAssignment.findFirst({ where: { schoolId, userId: actor.id, courseOfferingId: offeringId, status: "ACTIVE" }, select: { id: true } });
    if (!assignment) fail("You are not assigned to this course offering", 403, "FORBIDDEN");
  }
  return offering;
}
async function createCollegeSession(input, actor) {
  const schoolId = await tenant(actor, "COLLEGE", input.schoolId);
  if (input.sessionDate > utcToday()) fail("Attendance sessions cannot be created for a future date", 400, "FUTURE_SESSION_DATE");
  const toTime = (v) => v ? new Date(`1970-01-01T${v}:00.000Z`) : null;
  return db.$transaction(async (tx) => {
    const offering = await assignedOffering(actor, schoolId, input.courseOfferingId, tx);
    if (input.sessionDate < offering.academicYear.startDate || input.sessionDate > offering.academicYear.endDate) fail("Session date must fall within the course offering academic year", 400, "INVALID_DATE");
    return tx.collegeAttendanceSession.create({ data: { schoolId, courseOfferingId: offering.id, sessionDate: input.sessionDate, startTime: toTime(input.startTime), endTime: toTime(input.endTime), sessionType: input.sessionType, sessionNumber: input.sessionNumber, remarks: input.remarks, createdById: actor.id, status: "CONDUCTED" }, include: { courseOffering: { select: { id: true, code: true } } } });
  }, { isolationLevel: "Serializable" });
}
async function sessionFor(actor, id, requestedSchoolId, client = db) {
  const schoolId = await tenant(actor, "COLLEGE", requestedSchoolId);
  const session = await client.collegeAttendanceSession.findFirst({ where: { id, schoolId }, include: { courseOffering: { include: { academicYear: true } } } });
  if (!session) fail("Attendance session not found", 404, "NOT_FOUND");
  await assignedOffering(actor, schoolId, session.courseOfferingId, client);
  return { schoolId, session };
}
async function collegeRoster(actor, id, requestedSchoolId, client = db) {
  const { schoolId, session } = await sessionFor(actor, id, requestedSchoolId, client);
  const regs = await client.studentCourseRegistration.findMany({
    where: {
      schoolId,
      courseOfferingId: session.courseOfferingId,
      status: "REGISTERED",
      registrationDate: { lte: session.sessionDate },
      OR: [{ withdrawalDate: null }, { withdrawalDate: { gt: session.sessionDate } }],
      semesterEnrollment: {
        is: {
          status: "ACTIVE",
          enrollmentDate: { lte: session.sessionDate },
          OR: [{ completionDate: null }, { completionDate: { gte: session.sessionDate } }],
          programmeEnrollment: { is: { status: "ACTIVE", admissionDate: { lte: session.sessionDate } } },
        },
      },
    },
    include: {
      semesterEnrollment: {
        include: {
          programmeEnrollment: {
            include: {
              student: { select: { id: true, admissionNumber: true, firstName: true, middleName: true, lastName: true } },
              batch: { select: { name: true, code: true } },
              programme: { include: { department: { select: { name: true } } } },
            },
          },
          programmeTerm: { select: { name: true, semesterNumber: true } },
        },
      },
    },
  });
  const marked = await client.collegeStudentAttendance.findMany({ where: { schoolId, sessionId: id }, select: { studentId: true, status: true, remarks: true, id: true } });
  const byStudent = new Map(marked.map((x) => [x.studentId, x]));
  return regs.map((r) => { const e = r.semesterEnrollment; const p = e.programmeEnrollment; return { ...p.student, registrationId: r.id, programme: p.programme.name, department: p.programme.department.name, batch: p.batch.name, semester: e.programmeTerm.name, attendance: byStudent.get(p.student.id) || null }; });
}
async function markCollege(actor, sessionId, input) {
  try {
    return await db.$transaction(async (tx) => {
      const { schoolId, session } = await sessionFor(actor, sessionId, input.schoolId, tx);
      if (session.status !== "CONDUCTED") fail("Cancelled sessions cannot be marked", 409, "SESSION_CANCELLED");
      const roster = await collegeRoster(actor, sessionId, input.schoolId, tx);
      const byId = new Map(roster.map((x) => [x.id, x.registrationId]));
      if (!roster.length) fail("There are no active registrations for this session", 400, "EMPTY_ROSTER");
      if (input.attendance.length !== byId.size || input.attendance.some((item) => !byId.has(item.studentId))) fail("Submit exactly one attendance status for every registered student in the session roster", 400, "INCOMPLETE_ROSTER");
      await tx.collegeStudentAttendance.createMany({ data: input.attendance.map((item) => ({ schoolId, courseOfferingId: session.courseOfferingId, sessionId, studentId: item.studentId, registrationId: byId.get(item.studentId), status: item.status, remarks: item.remarks ?? null, markedById: actor.id })) });
      return tx.collegeStudentAttendance.findMany({ where: { schoolId, sessionId } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error.code === "P2002") fail("Attendance already exists for one or more students in this session. Use the correction endpoint.", 409, "ATTENDANCE_ALREADY_MARKED");
    if (error.code === "P2034") fail("Registration or attendance changed concurrently. Reload the roster and retry.", 409, "CONCURRENT_WRITE");
    throw error;
  }
}
async function correct(kind, id, input, actor) {
  if (!admin(actor)) fail("Only institution administrators may correct attendance", 403, "FORBIDDEN");
  const schoolId = await tenant(actor, kind === "school" ? "SCHOOL" : "COLLEGE", input.schoolId);
  const model = kind === "school" ? db.schoolStudentAttendance : db.collegeStudentAttendance;
  const row = await model.findFirst({ where: { id, schoolId } });
  if (!row) fail("Attendance record not found", 404, "NOT_FOUND");
  if (row.status === input.status) fail("New status must differ from the current status", 400, "NO_CHANGE");
  return db.$transaction(async (tx) => {
    const changed = await (kind === "school" ? tx.schoolStudentAttendance : tx.collegeStudentAttendance).updateMany({ where: { id, schoolId, status: row.status }, data: { status: input.status } });
    if (!changed.count) fail("Attendance changed concurrently; reload and retry the correction", 409, "CONCURRENT_WRITE");
    await tx.studentAttendanceCorrection.create({ data: { schoolId, schoolAttendanceId: kind === "school" ? id : null, collegeAttendanceId: kind === "college" ? id : null, previousStatus: row.status, newStatus: input.status, reason: input.reason, correctedById: actor.id } });
    return (kind === "school" ? tx.schoolStudentAttendance : tx.collegeStudentAttendance).findFirst({ where: { id, schoolId } });
  });
}
function attendanceWhere(kind, q, schoolId) {
  const where = { schoolId };
  const lower = q.from, upper = q.to;
  if (kind === "school") {
    if (q.academicYearId) where.academicYearId = q.academicYearId;
    if (q.gradeId) where.gradeId = q.gradeId;
    if (q.sectionId) where.sectionId = q.sectionId;
    if (q.studentId) where.studentId = q.studentId;
    if (lower || upper) where.attendanceDate = { ...(lower && { gte: lower }), ...(upper && { lte: upper }) };
  } else {
    if (q.studentId) where.studentId = q.studentId;
    if (q.sessionId) where.sessionId = q.sessionId;
    where.session = { is: { ...(q.courseOfferingId && { courseOfferingId: q.courseOfferingId }), ...(lower || upper ? { sessionDate: { ...(lower && { gte: lower }), ...(upper && { lte: upper }) } } : {}) } };
  }
  return where;
}
async function list(kind, q, actor) {
  const schoolId = await tenant(actor, kind === "school" ? "SCHOOL" : "COLLEGE", q.schoolId);
  if (!admin(actor) && kind === "school") {
    // A teacher may query only rows from their assigned sections; service filters below using active assignments.
    if (actor.role !== "TEACHER") fail("You do not have permission to read attendance", 403, "FORBIDDEN");
    const profileId = await teacherProfile(actor.id, schoolId);
    const assignments = await db.schoolTeacherAssignment.findMany({ where: { schoolId, teacherProfileId: profileId, status: "ACTIVE", ...(q.academicYearId && { academicYearId: q.academicYearId }), ...(q.gradeId && { gradeId: q.gradeId }), ...(q.sectionId && { sectionId: q.sectionId }) }, select: { academicYearId: true, gradeId: true, sectionId: true } });
    const ors = assignments.map((x) => ({ academicYearId: x.academicYearId, gradeId: x.gradeId, sectionId: x.sectionId }));
    if (!ors.length) fail("You are not assigned to an attendance class", 403, "FORBIDDEN");
    const where = attendanceWhere(kind, q, schoolId); where.OR = ors;
    return pageRows(db.schoolStudentAttendance, where, q, "school");
  }
  if (!admin(actor) && kind === "college") {
    if (actor.role !== "TEACHER") fail("You do not have permission to read attendance", 403, "FORBIDDEN");
    const assigned = await db.facultyCourseAssignment.findMany({ where: { schoolId, userId: actor.id, status: "ACTIVE", ...(q.courseOfferingId && { courseOfferingId: q.courseOfferingId }) }, select: { courseOfferingId: true } });
    const ids = assigned.map((x) => x.courseOfferingId); if (!ids.length) fail("You are not assigned to this course offering", 403, "FORBIDDEN");
    if (q.courseOfferingId && !ids.includes(q.courseOfferingId)) fail("You are not assigned to this course offering", 403, "FORBIDDEN");
  }
  const where = attendanceWhere(kind, q, schoolId);
  if (kind === "college" && !admin(actor)) where.session.is.courseOfferingId = { in: (await db.facultyCourseAssignment.findMany({ where: { schoolId, userId: actor.id, status: "ACTIVE" }, select: { courseOfferingId: true } })).map((x) => x.courseOfferingId) };
  return pageRows(kind === "school" ? db.schoolStudentAttendance : db.collegeStudentAttendance, where, q, kind);
}
async function pageRows(model, where, q, kind) { const orderBy = kind === "school" ? [{ attendanceDate: "desc" }, { createdAt: "desc" }] : [{ createdAt: "desc" }]; const [records, total] = await Promise.all([model.findMany({ where, orderBy, skip: (q.page - 1) * q.limit, take: q.limit }), model.count({ where })]); return { records, page: q.page, pageSize: q.limit, total, totalPages: Math.ceil(total / q.limit) }; }
async function report(kind, q, actor) {
  const first = await list(kind, { ...q, page: 1, limit: 100 }, actor);
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 };
  const students = new Map();
  for (let page = 1; page <= Math.ceil(first.total / 100); page += 1) {
    const current = page === 1 ? first : await list(kind, { ...q, page, limit: 100 }, actor);
    for (const r of current.records) {
      counts[r.status] += 1;
      const student = students.get(r.studentId) || { studentId: r.studentId, counts: { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 } };
      student.counts[r.status] += 1;
      students.set(r.studentId, student);
    }
  }
  const denominator = counts.PRESENT + counts.ABSENT + counts.LATE;
  const studentSummaries = [...students.values()].map((student) => {
    const total = student.counts.PRESENT + student.counts.ABSENT + student.counts.LATE;
    return { ...student, attendancePercentage: total ? Number((((student.counts.PRESENT + student.counts.LATE) / total) * 100).toFixed(2)) : null };
  });
  return { counts, attendancePercentage: denominator ? Number((((counts.PRESENT + counts.LATE) / denominator) * 100).toFixed(2)) : null, studentSummaries, excludesLeaveFromDenominator: true, total: first.total };
}
async function history(kind, id, actor, q) { return list(kind, { ...q, studentId: id }, actor); }
async function sessions(q, actor) {
  const schoolId = await tenant(actor, "COLLEGE", q.schoolId);
  const where = { schoolId, ...(q.courseOfferingId && { courseOfferingId: q.courseOfferingId }), ...(q.from || q.to ? { sessionDate: { ...(q.from && { gte: q.from }), ...(q.to && { lte: q.to }) } } : {}) };
  if (!admin(actor)) { if (actor.role !== "TEACHER") fail("You do not have permission to read sessions", 403, "FORBIDDEN"); where.courseOffering = { is: { facultyAssignments: { some: { userId: actor.id, status: "ACTIVE" } } } }; }
  return db.collegeAttendanceSession.findMany({ where, orderBy: [{ sessionDate: "desc" }, { startTime: "asc" }], skip: (q.page - 1) * q.limit, take: q.limit, include: { courseOffering: { select: { id: true, code: true } } } });
}
module.exports = { tenant, schoolRoster, markSchool, createCollegeSession, collegeRoster, markCollege, correct, list, history, report, sessions, sessionFor };

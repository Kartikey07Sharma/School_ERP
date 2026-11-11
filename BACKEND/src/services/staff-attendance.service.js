const db = require("../repositories/staff-attendance.repository");
const AppError = require("../utils/AppError");
const fail = (message, status = 400, code = "VALIDATION_ERROR") => { throw new AppError(message, status, code); };
const admin = (actor) => ["SUPER_ADMIN", "SCHOOL_ADMIN"].includes(actor?.role);
const utcToday = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
const employeeSelect = {
  id: true, employeeId: true, category: true, status: true, firstName: true, middleName: true, lastName: true,
  joiningDate: true, relievingDate: true, departmentId: true, designationId: true,
  department: { select: { id: true, name: true, code: true } },
  designation: { select: { id: true, name: true, code: true } },
};
const attendanceInclude = {
  employee: { select: employeeSelect },
  department: { select: { id: true, name: true, code: true } },
  designation: { select: { id: true, name: true, code: true } },
};

async function tenant(actor, requestedSchoolId) {
  if (!admin(actor)) fail("You do not have permission to manage staff attendance", 403, "FORBIDDEN");
  if (actor.role !== "SUPER_ADMIN" && requestedSchoolId) fail("School administrators cannot supply schoolId", 400, "SCHOOL_ID_FORBIDDEN");
  const schoolId = actor.role === "SUPER_ADMIN" ? requestedSchoolId : actor.schoolId;
  if (!schoolId) fail("schoolId is required for platform administrators", 400, "SCHOOL_REQUIRED");
  const school = await db.school.findUnique({ where: { id: schoolId }, select: { id: true } });
  if (!school) fail("Institution not found", 404, "NOT_FOUND");
  return schoolId;
}

function employmentWhere(date) {
  return {
    status: { in: ["ACTIVE", "ON_LEAVE"] },
    joiningDate: { lte: date },
    OR: [{ relievingDate: null }, { relievingDate: { gte: date } }],
  };
}
function validateEmployment(employee, date, status) {
  if (!employee || !["ACTIVE", "ON_LEAVE"].includes(employee.status) || employee.joiningDate > date || (employee.relievingDate && employee.relievingDate < date)) {
    fail("Employee is not eligible for new attendance on the selected date", 400, "EMPLOYEE_NOT_ELIGIBLE");
  }
  if (employee.status === "ON_LEAVE" && status !== "LEAVE") fail("Employees with ON_LEAVE employment status can only be marked LEAVE", 400, "EMPLOYEE_ON_LEAVE");
}
function validateTimes(status, checkInAt, checkOutAt) {
  if (["ABSENT", "LEAVE"].includes(status) && (checkInAt || checkOutAt)) fail("Absent or leave attendance cannot include check-in or check-out timestamps", 400, "INVALID_ATTENDANCE_TIMES");
  if (checkOutAt && !checkInAt) fail("Check-in is required when check-out is supplied", 400, "CHECK_IN_REQUIRED");
  if (checkInAt && checkOutAt && checkOutAt < checkInAt) fail("Check-out cannot precede check-in", 400, "INVALID_ATTENDANCE_TIMES");
  if ((checkInAt && checkInAt > new Date()) || (checkOutAt && checkOutAt > new Date())) fail("Check-in and check-out timestamps cannot be in the future", 400, "FUTURE_ATTENDANCE_TIMESTAMP");
}
function dateRange(query) {
  if (query.month) {
    const [year, month] = query.month.split("-").map(Number);
    return { gte: new Date(Date.UTC(year, month - 1, 1)), lte: new Date(Date.UTC(year, month, 0)) };
  }
  if (query.date) return { equals: query.date };
  if (query.from || query.to) return { ...(query.from && { gte: query.from }), ...(query.to && { lte: query.to }) };
  return undefined;
}

async function roster(query, actor) {
  const schoolId = await tenant(actor, query.schoolId);
  if (query.date > utcToday()) fail("Attendance roster cannot be requested for a future date", 400, "FUTURE_ATTENDANCE_DATE");
  const statusFilter = query.employeeStatus ? (["ACTIVE", "ON_LEAVE"].includes(query.employeeStatus) ? [query.employeeStatus] : []) : ["ACTIVE", "ON_LEAVE"];
  const where = { schoolId, ...employmentWhere(query.date), ...(query.departmentId && { departmentId: query.departmentId }), ...(query.designationId && { designationId: query.designationId }), ...(query.category && { category: query.category }), status: { in: statusFilter } };
  const [employees, total] = await Promise.all([
    db.employee.findMany({ where, select: employeeSelect, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], skip: (query.page - 1) * query.limit, take: query.limit }),
    db.employee.count({ where }),
  ]);
  const attendance = employees.length ? await db.staffAttendance.findMany({ where: { schoolId, attendanceDate: query.date, employeeId: { in: employees.map((e) => e.id) } }, select: { id: true, employeeId: true, status: true, checkInAt: true, checkOutAt: true } }) : [];
  const marks = new Map(attendance.map((row) => [row.employeeId, row]));
  return { records: employees.map((employee) => ({ ...employee, attendance: marks.get(employee.id) || null })), page: query.page, pageSize: query.limit, total, totalPages: Math.ceil(total / query.limit) };
}

async function mark(input, actor) {
  const schoolId = await tenant(actor, input.schoolId);
  if (input.attendanceDate > utcToday()) fail("Attendance cannot be marked for a future date", 400, "FUTURE_ATTENDANCE_DATE");
  const ids = input.attendance.map((entry) => entry.employeeId);
  try {
    return await db.$transaction(async (tx) => {
      const employees = await tx.employee.findMany({ where: { schoolId, id: { in: ids } }, select: employeeSelect });
      if (employees.length !== ids.length) fail("One or more employees do not belong to this institution", 400, "INVALID_EMPLOYEE");
      const byId = new Map(employees.map((employee) => [employee.id, employee]));
      for (const entry of input.attendance) {
        const employee = byId.get(entry.employeeId);
        validateEmployment(employee, input.attendanceDate, entry.status);
        validateTimes(entry.status, entry.checkInAt, entry.checkOutAt);
      }
      await tx.staffAttendance.createMany({ data: input.attendance.map((entry) => {
        const employee = byId.get(entry.employeeId);
        return {
          schoolId, employeeId: employee.id, attendanceDate: input.attendanceDate,
          category: employee.category, departmentId: employee.departmentId, designationId: employee.designationId,
          status: entry.status, checkInAt: entry.checkInAt, checkOutAt: entry.checkOutAt,
          checkInRecordedById: entry.checkInAt ? actor.id : null, checkOutRecordedById: entry.checkOutAt ? actor.id : null,
          remarks: entry.remarks ?? null, markedById: actor.id,
        };
      }) });
      return tx.staffAttendance.findMany({ where: { schoolId, employeeId: { in: ids }, attendanceDate: input.attendanceDate }, include: attendanceInclude, orderBy: { createdAt: "asc" } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error.code === "P2002" || error.code === "P2034") fail("Attendance already exists for one or more employees on this date. Use the correction endpoint.", 409, "ATTENDANCE_ALREADY_MARKED");
    throw error;
  }
}

function listWhere(query, schoolId, employeeId) {
  const range = dateRange(query);
  return {
    schoolId,
    ...(employeeId && { employeeId }),
    ...(query.departmentId && { departmentId: query.departmentId }),
    ...(query.designationId && { designationId: query.designationId }),
    ...(query.category && { category: query.category }),
    ...(query.status && { status: query.status }),
    ...(range && { attendanceDate: range }),
  };
}
async function list(query, actor) {
  const schoolId = await tenant(actor, query.schoolId);
  const where = listWhere(query, schoolId);
  const [records, total] = await Promise.all([
    db.staffAttendance.findMany({ where, include: attendanceInclude, orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }], skip: (query.page - 1) * query.limit, take: query.limit }),
    db.staffAttendance.count({ where }),
  ]);
  return { records, page: query.page, pageSize: query.limit, total, totalPages: Math.ceil(total / query.limit) };
}
async function historyFor(schoolId, employeeId, query) {
  const where = listWhere(query, schoolId, employeeId);
  const [records, total] = await Promise.all([
    db.staffAttendance.findMany({ where, include: attendanceInclude, orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }], skip: (query.page - 1) * query.limit, take: query.limit }),
    db.staffAttendance.count({ where }),
  ]);
  return { records, page: query.page, pageSize: query.limit, total, totalPages: Math.ceil(total / query.limit) };
}
async function history(employeeId, query, actor) {
  const schoolId = await tenant(actor, query.schoolId);
  const employee = await db.employee.findFirst({ where: { id: employeeId, schoolId }, select: { id: true } });
  if (!employee) fail("Employee not found", 404, "NOT_FOUND");
  return historyFor(schoolId, employeeId, query);
}

async function getAttendance(id, input, actor) {
  const schoolId = await tenant(actor, input.schoolId);
  const row = await db.staffAttendance.findFirst({ where: { id, schoolId }, include: attendanceInclude });
  if (!row) fail("Staff attendance record not found", 404, "NOT_FOUND");
  return { schoolId, row };
}
async function checkIn(id, input, actor) {
  const { schoolId, row } = await getAttendance(id, input, actor);
  if (!["PRESENT", "LATE"].includes(row.status)) fail("Check-in is available only for PRESENT or LATE attendance", 409, "INVALID_ATTENDANCE_STATE");
  if (row.checkInAt) fail("Check-in is already recorded; use the authorized correction endpoint to change it", 409, "CHECK_IN_ALREADY_RECORDED");
  if (input.checkInAt > new Date()) fail("Check-in timestamp cannot be in the future", 400, "FUTURE_ATTENDANCE_TIMESTAMP");
  const changed = await db.staffAttendance.updateMany({ where: { id, schoolId, status: row.status, checkInAt: null }, data: { checkInAt: input.checkInAt, checkInRecordedById: actor.id } });
  if (!changed.count) fail("Check-in was concurrently recorded; reload the attendance record", 409, "CONCURRENT_WRITE");
  return db.staffAttendance.findFirst({ where: { id, schoolId }, include: attendanceInclude });
}
async function checkOut(id, input, actor) {
  const { schoolId, row } = await getAttendance(id, input, actor);
  if (!["PRESENT", "LATE"].includes(row.status)) fail("Check-out is available only for PRESENT or LATE attendance", 409, "INVALID_ATTENDANCE_STATE");
  if (!row.checkInAt) fail("Check-in must be recorded before check-out", 409, "CHECK_IN_REQUIRED");
  if (row.checkOutAt) fail("Check-out is already recorded; use the authorized correction endpoint to change it", 409, "CHECK_OUT_ALREADY_RECORDED");
  if (input.checkOutAt < row.checkInAt) fail("Check-out cannot precede check-in", 400, "INVALID_ATTENDANCE_TIMES");
  if (input.checkOutAt > new Date()) fail("Check-out timestamp cannot be in the future", 400, "FUTURE_ATTENDANCE_TIMESTAMP");
  const changed = await db.staffAttendance.updateMany({ where: { id, schoolId, status: row.status, checkInAt: row.checkInAt, checkOutAt: null }, data: { checkOutAt: input.checkOutAt, checkOutRecordedById: actor.id } });
  if (!changed.count) fail("Check-out was concurrently recorded; reload the attendance record", 409, "CONCURRENT_WRITE");
  return db.staffAttendance.findFirst({ where: { id, schoolId }, include: attendanceInclude });
}
async function correct(id, input, actor) {
  if (!admin(actor)) fail("Only institution administrators may correct staff attendance", 403, "FORBIDDEN");
  const { schoolId, row } = await getAttendance(id, input, actor);
  const nextStatus = input.status ?? row.status;
  const nextCheckIn = input.checkInAt === undefined ? row.checkInAt : input.checkInAt;
  const nextCheckOut = input.checkOutAt === undefined ? row.checkOutAt : input.checkOutAt;
  validateTimes(nextStatus, nextCheckIn, nextCheckOut);
  const changedFields = [];
  if (nextStatus !== row.status) changedFields.push("status");
  if (nextCheckIn?.getTime() !== row.checkInAt?.getTime()) changedFields.push("checkInAt");
  if (nextCheckOut?.getTime() !== row.checkOutAt?.getTime()) changedFields.push("checkOutAt");
  if (!changedFields.length) fail("Correction does not change the attendance record", 400, "NO_CHANGE");
  return db.$transaction(async (tx) => {
    const changed = await tx.staffAttendance.updateMany({ where: { id, schoolId, status: row.status, checkInAt: row.checkInAt, checkOutAt: row.checkOutAt }, data: { status: nextStatus, checkInAt: nextCheckIn, checkOutAt: nextCheckOut, ...(changedFields.includes("checkInAt") && { checkInRecordedById: nextCheckIn ? actor.id : null }), ...(changedFields.includes("checkOutAt") && { checkOutRecordedById: nextCheckOut ? actor.id : null }) } });
    if (!changed.count) fail("Attendance changed concurrently; reload and retry the correction", 409, "CONCURRENT_WRITE");
    const audit = await tx.staffAttendanceCorrection.create({ data: { schoolId, attendanceId: id, previousStatus: changedFields.includes("status") ? row.status : null, newStatus: changedFields.includes("status") ? nextStatus : null, previousCheckInAt: changedFields.includes("checkInAt") ? row.checkInAt : null, newCheckInAt: changedFields.includes("checkInAt") ? nextCheckIn : null, previousCheckOutAt: changedFields.includes("checkOutAt") ? row.checkOutAt : null, newCheckOutAt: changedFields.includes("checkOutAt") ? nextCheckOut : null, changedFields, reason: input.reason, correctedById: actor.id } });
    const attendance = await tx.staffAttendance.findFirst({ where: { id, schoolId }, include: attendanceInclude });
    return { attendance, correction: audit };
  }, { isolationLevel: "Serializable" });
}

async function employeeForUser(actor) {
  if (!actor?.schoolId) fail("An institution-linked employee account is required", 404, "EMPLOYEE_NOT_FOUND");
  const employee = await db.employee.findFirst({ where: { schoolId: actor.schoolId, userId: actor.id }, select: { id: true } });
  if (!employee) fail("No employee record is linked to this account", 404, "EMPLOYEE_NOT_FOUND");
  return employee.id;
}
async function me(query, actor) { if (query.schoolId) fail("Employee self-service cannot supply schoolId", 400, "SCHOOL_ID_FORBIDDEN"); const employeeId = await employeeForUser(actor); return historyFor(actor.schoolId, employeeId, query); }

function summarize(groups) {
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 };
  for (const row of groups) counts[row.status] += row._count._all;
  const denominator = counts.PRESENT + counts.ABSENT + counts.LATE;
  return { counts, attendancePercentage: denominator ? Number((((counts.PRESENT + counts.LATE) / denominator) * 100).toFixed(2)) : null, excludesLeaveFromDenominator: true };
}
async function summary(query, actor, selfOnly = false) {
  let schoolId;
  let employeeId;
  if (selfOnly) { if (query.schoolId) fail("Employee self-service cannot supply schoolId", 400, "SCHOOL_ID_FORBIDDEN"); employeeId = await employeeForUser(actor); schoolId = actor.schoolId; }
  else schoolId = await tenant(actor, query.schoolId);
  const range = dateRange(query);
  if (!range) fail("Provide date, month or a from/to date range", 400, "DATE_RANGE_REQUIRED");
  const where = listWhere(query, schoolId, employeeId);
  const groups = await db.staffAttendance.groupBy({ by: ["status"], where, _count: { _all: true } });
  const overall = summarize(groups);
  const employeeGroups = await db.staffAttendance.groupBy({ by: ["employeeId", "category", "departmentId", "status"], where, _count: { _all: true } });
  const employeeMap = new Map();
  const departmentsMap = new Map();
  for (const row of employeeGroups) {
    const employee = employeeMap.get(row.employeeId) || { employeeId: row.employeeId, category: row.category, departmentId: row.departmentId, counts: { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 } };
    employee.counts[row.status] += row._count._all;
    employeeMap.set(row.employeeId, employee);
    const key = `${row.departmentId || "none"}:${row.category}`;
    const bucket = departmentsMap.get(key) || { departmentId: row.departmentId, category: row.category, counts: { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 } };
    bucket.counts[row.status] += row._count._all;
    departmentsMap.set(key, bucket);
  }
  const percentage = (counts) => { const base = counts.PRESENT + counts.ABSENT + counts.LATE; return base ? Number((((counts.PRESENT + counts.LATE) / base) * 100).toFixed(2)) : null; };
  let eligibleEmployeeCount = null;
  let unmarkedEmployeeCount = null;
  if (query.date) {
    eligibleEmployeeCount = await db.employee.count({ where: { schoolId, ...employmentWhere(query.date), ...(query.departmentId && { departmentId: query.departmentId }), ...(query.designationId && { designationId: query.designationId }), ...(query.category && { category: query.category }) } });
    const markedWhere = { ...where };
    delete markedWhere.status;
    const marked = await db.staffAttendance.groupBy({ by: ["employeeId"], where: markedWhere, _count: { _all: true } });
    unmarkedEmployeeCount = Math.max(eligibleEmployeeCount - marked.length, 0);
  }
  const departments = [...departmentsMap.values()];
  const ids = [...new Set(departments.map((item) => item.departmentId).filter(Boolean))];
  const lookup = ids.length ? await db.employeeDepartment.findMany({ where: { schoolId, id: { in: ids } }, select: { id: true, name: true, code: true } }) : [];
  const departmentById = new Map(lookup.map((item) => [item.id, item]));
  const employeeIds = [...employeeMap.keys()];
  const employeeLookup = employeeIds.length ? await db.employee.findMany({ where: { schoolId, id: { in: employeeIds } }, select: { id: true, employeeId: true, firstName: true, middleName: true, lastName: true } }) : [];
  const employeeById = new Map(employeeLookup.map((item) => [item.id, item]));
  return {
    ...overall,
    totalMarked: Object.values(overall.counts).reduce((total, count) => total + count, 0),
    eligibleEmployeeCount,
    unmarkedEmployeeCount,
    departmentBreakdown: departments.map((item) => ({ ...item, department: item.departmentId ? departmentById.get(item.departmentId) || null : null, attendancePercentage: percentage(item.counts) })),
    employeeSummaries: [...employeeMap.values()].map((item) => ({ ...item, employee: employeeById.get(item.employeeId) || null, attendancePercentage: percentage(item.counts) })),
    teaching: summarize(groups.length ? await db.staffAttendance.groupBy({ by: ["status"], where: { ...where, category: "TEACHING" }, _count: { _all: true } }) : []),
    nonTeaching: summarize(groups.length ? await db.staffAttendance.groupBy({ by: ["status"], where: { ...where, category: "NON_TEACHING" }, _count: { _all: true } }) : []),
  };
}

async function audit(attendanceId, query, actor) {
  const schoolId = await tenant(actor, query.schoolId);
  const attendance = await db.staffAttendance.findFirst({ where: { id: attendanceId, schoolId }, select: { id: true } });
  if (!attendance) fail("Staff attendance record not found", 404, "NOT_FOUND");
  return db.staffAttendanceCorrection.findMany({ where: { schoolId, attendanceId }, orderBy: { correctedAt: "desc" }, include: { correctedBy: { select: { id: true, firstName: true, lastName: true } } } });
}

module.exports = { tenant, employmentWhere, validateEmployment, validateTimes, roster, mark, list, history, checkIn, checkOut, correct, audit, employeeForUser, me, summary };

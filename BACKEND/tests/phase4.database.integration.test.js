// Run explicitly against a dedicated/local database with:
// $env:RUN_PHASE4_DB_TESTS='1'; node --test tests/phase4.database.integration.test.js
// This test creates uniquely tagged fixtures through real HTTP APIs and deletes
// only the four tagged test institutions and the temporary bootstrap account.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const prisma = require("../src/database/prisma");
const redis = require("../src/database/redis");
const app = require("../src/app");

const enabled = process.env.RUN_PHASE4_DB_TESTS === "1";
test("Phase 4 school/college workflows, tenant security, auth and real PostgreSQL constraints", { skip: !enabled }, async (t) => {
  const tag = `QA4${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  const password = `Qa4!${crypto.randomBytes(18).toString("base64url")}`;
  const rootEmail = `${tag.toLowerCase()}-root@example.test`;
  const isolatedTestIp = `198.18.${crypto.randomInt(1, 255)}.${crypto.randomInt(1, 255)}`;
  const schoolIds = [];
  const userIds = [];
  const tokens = [];
  let rootId;
  let server;
  let base;

  async function request(method, path, token, body) {
    const headers = {};
    headers["x-forwarded-for"] = isolatedTestIp;
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    let data;
    try { data = await response.json(); } catch { data = null; }
    return { status: response.status, data };
  }
  async function login(email, pass = password) {
    const result = await request("POST", "/auth/login", null, { email, password: pass });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    tokens.push(result.data.data.accessToken);
    return result.data.data.accessToken;
  }
  function expectStatus(result, expected) {
    assert.equal(result.status, expected, JSON.stringify(result.data));
    assert.equal(result.data?.success, expected < 400, JSON.stringify(result.data));
  }
  async function createInstitution(rootToken, name, type, n) {
    const phone = String(BigInt(Date.now()) * 10n + BigInt(n)).slice(-14);
    const response = await request("POST", "/schools", rootToken, {
      name: `${tag} ${name}`, code: `${tag}-${n}`, email: `${tag.toLowerCase()}-${n}@example.test`, phone,
      address: "Isolated Phase 4 test fixture", institutionType: type,
    });
    expectStatus(response, 201);
    schoolIds.push(response.data.data.id);
    return response.data.data.id;
  }
  async function createUser(rootToken, schoolId, role, suffix) {
    const email = `${tag.toLowerCase()}-${suffix}@example.test`;
    const response = await request("POST", "/users", rootToken, {
      firstName: `QA ${suffix}`, lastName: "Phase4", email, password, role, schoolId,
    });
    expectStatus(response, 201);
    userIds.push(response.data.data.id);
    return login(email);
  }
  async function createStudent(token, schoolId, suffix) {
    const response = await request("POST", "/students", token, {
      admissionNumber: `${tag}-${suffix}`, firstName: "Aarav", lastName: `Test${suffix}`,
      dateOfBirth: "2012-01-15", gender: "Male", admissionDate: "2026-04-01",
      className: "Class 1", section: "A", academicYear: "2026-2027",
      address: "Test address", guardianName: "Guardian Test", guardianRelationship: "Parent",
      guardianPhone: "9876543210",
    });
    expectStatus(response, 201);
    return response.data.data.id;
  }

  try {
    await prisma.$connect();
    assert.equal(await redis.connectRedis(), true, "Redis must be available for the real auth flow");
    const hashed = await bcrypt.hash(password, 12);
    const bootstrap = await prisma.user.create({ data: { firstName: "QA Phase4", email: rootEmail, password: hashed, role: "SUPER_ADMIN", status: "ACTIVE" }, select: { id: true } });
    rootId = bootstrap.id;
    app.set("trust proxy", 1);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    base = `http://127.0.0.1:${server.address().port}/api/v1`;

    const root = await login(rootEmail);
    expectStatus(await request("GET", "/auth/me", root), 200);
    expectStatus(await request("GET", "/academic-years", null), 401);
    expectStatus(await request("GET", "/academic-years", "not.a.valid.token"), 401);
    expectStatus(await request("GET", "/departments", root), 400); // Super Admin must select a target institution.

    const schoolA = await createInstitution(root, "School A", "SCHOOL", 1);
    const schoolB = await createInstitution(root, "School B", "SCHOOL", 2);
    const collegeA = await createInstitution(root, "College A", "COLLEGE", 3);
    const collegeB = await createInstitution(root, "College B", "COLLEGE", 4);
    const schoolAdminA = await createUser(root, schoolA, "SCHOOL_ADMIN", "school-admin-a");
    const schoolAdminB = await createUser(root, schoolB, "SCHOOL_ADMIN", "school-admin-b");
    const collegeAdminA = await createUser(root, collegeA, "SCHOOL_ADMIN", "college-admin-a");
    const collegeAdminB = await createUser(root, collegeB, "SCHOOL_ADMIN", "college-admin-b");
    const teacherA = await createUser(root, collegeA, "TEACHER", "teacher-a");

    // School workflow: shared year, current-year lifecycle, terms, fixed grades, sections, subjects and placement.
    const yearA = await request("POST", "/academic-years", schoolAdminA, { name: `${tag}-2026-27`, startDate: "2026-04-01", endDate: "2027-03-31" });
    expectStatus(yearA, 201);
    const yearId = yearA.data.data.id;
    expectStatus(await request("PATCH", `/academic-years/${yearId}/set-current`, schoolAdminA, {}), 200);
    const period = await request("POST", `/academic-years/${yearId}/periods`, schoolAdminA, { name: "Term 1", code: "T1", sequence: 1, startDate: "2026-04-01", endDate: "2026-09-30" });
    expectStatus(period, 201);
    expectStatus(await request("POST", `/academic-years/${yearId}/periods`, schoolAdminA, { name: "Overlapping", code: "OVERLAP", sequence: 2, startDate: "2026-09-01", endDate: "2026-12-01" }), 409);
    const yearList = await request("GET", "/academic-years", schoolAdminA);
    expectStatus(yearList, 200);
    assert.equal(yearList.data.data.some((x) => x.id === yearId), true);
    expectStatus(await request("GET", `/academic-years/${yearId}`, schoolAdminB), 404);
    expectStatus(await request("PATCH", `/academic-years/${yearId}`, schoolAdminA, { endDate: "2026-08-01" }), 409);
    const grades1 = await request("POST", "/classes/initialize", schoolAdminA, {});
    const grades2 = await request("POST", "/classes/initialize", schoolAdminA, {});
    expectStatus(grades1, 200); expectStatus(grades2, 200);
    assert.equal(grades1.data.data.length, 12);
    assert.equal(grades2.data.data.length, 12);
    assert.deepEqual(grades1.data.data.map((x) => x.name), Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`));
    const grade5 = grades1.data.data.find((x) => x.code === "CLASS_5");
    const grade6 = grades1.data.data.find((x) => x.code === "CLASS_6");
    const sectionA = await request("POST", "/sections", schoolAdminA, { gradeId: grade5.id, academicYearId: yearId, name: "A", code: "A", capacity: 40 });
    expectStatus(sectionA, 201);
    const sectionB = await request("POST", "/sections", schoolAdminA, { gradeId: grade6.id, academicYearId: yearId, name: "B", code: "B", capacity: 40 });
    expectStatus(sectionB, 201);
    expectStatus(await request("POST", "/sections", schoolAdminA, { gradeId: grade5.id, academicYearId: yearId, name: "A", code: "A" }), 409);
    const subject = await request("POST", "/subjects", schoolAdminA, { name: "Mathematics", code: `${tag}-MATH`, subjectType: "CORE" });
    expectStatus(subject, 201);
    const mapped = await request("POST", `/classes/${grade5.id}/subjects`, schoolAdminA, { subjectId: subject.data.data.id, isMandatory: true });
    expectStatus(mapped, 201);
    const schoolTeacherDesignation = await request("POST", "/employees/designations", schoolAdminA, { name: "Mathematics Teacher", code: `${tag}-MATH-TEACHER`, category: "TEACHING" });
    expectStatus(schoolTeacherDesignation, 201);
    const schoolEmployee = await request("POST", "/employees", schoolAdminA, { employeeId: `${tag}-EMP-SCHOOL`, category: "TEACHING", firstName: "Rahul", lastName: "Sharma", phone: "9876543210", joiningDate: "2025-06-01", designationId: schoolTeacherDesignation.data.data.id });
    expectStatus(schoolEmployee, 201);
    expectStatus(await request("POST", "/employees", schoolAdminA, { employeeId: `${tag}-EMP-SCHOOL`, category: "TEACHING", firstName: "Duplicate", lastName: "Employee", phone: "9876543212", joiningDate: "2025-06-01", designationId: schoolTeacherDesignation.data.data.id }), 409);
    const schoolDesignationB = await request("POST", "/employees/designations", schoolAdminB, { name: "Mathematics Teacher", code: `${tag}-MATH-TEACHER`, category: "TEACHING" });
    expectStatus(schoolDesignationB, 201);
    const employeeSameIdOtherTenant = await request("POST", "/employees", schoolAdminB, { employeeId: `${tag}-EMP-SCHOOL`, category: "TEACHING", firstName: "Different", lastName: "Tenant", phone: "9876543213", joiningDate: "2025-06-01", designationId: schoolDesignationB.data.data.id });
    expectStatus(employeeSameIdOtherTenant, 201);
    expectStatus(await request("GET", `/employees/${employeeSameIdOtherTenant.data.data.id}`, schoolAdminA), 404);
    const departmentB = await request("POST", "/employees/departments", schoolAdminB, { name: "Teaching", code: `${tag}-TEACH` });
    expectStatus(departmentB, 201);
    expectStatus(await request("PATCH", `/employees/${schoolEmployee.data.data.id}`, schoolAdminA, { designationId: schoolDesignationB.data.data.id }), 404);
    expectStatus(await request("PATCH", `/employees/${schoolEmployee.data.data.id}`, schoolAdminA, { departmentId: departmentB.data.data.id }), 404);
    const nonTeachingDesignation = await request("POST", "/employees/designations", schoolAdminA, { name: "Accountant", code: `${tag}-ACCOUNTANT`, category: "NON_TEACHING" });
    expectStatus(nonTeachingDesignation, 201);
    const nonTeachingEmployee = await request("POST", "/employees", schoolAdminA, { employeeId: `${tag}-EMP-STAFF`, category: "NON_TEACHING", firstName: "Nisha", lastName: "Clerk", phone: "9876543214", joiningDate: "2025-06-01", designationId: nonTeachingDesignation.data.data.id });
    expectStatus(nonTeachingEmployee, 201); assert.equal(nonTeachingEmployee.data.data.userId, null);
    expectStatus(await request("PATCH", `/employees/${nonTeachingEmployee.data.data.id}`, schoolAdminA, { employeeId: schoolEmployee.data.data.employeeId }), 409);
    expectStatus(await request("POST", `/employees/${nonTeachingEmployee.data.data.id}/teacher-profile`, schoolAdminA, {}), 400);
    const schoolAdminId = (await prisma.user.findFirst({ where: { schoolId: schoolA, role: "SCHOOL_ADMIN" }, select: { id: true } })).id;
    expectStatus(await request("PUT", `/employees/${nonTeachingEmployee.data.data.id}/user-account`, schoolAdminA, { userId: schoolAdminId }), 200);
    expectStatus(await request("DELETE", `/employees/${nonTeachingEmployee.data.data.id}/user-account`, schoolAdminA), 200);
    assert.ok(await prisma.user.findUnique({ where: { id: schoolAdminId }, select: { id: true } }));
    const schoolProfile = await request("POST", `/employees/${schoolEmployee.data.data.id}/teacher-profile`, schoolAdminA, { specialization: "Mathematics" });
    expectStatus(schoolProfile, 201);
    expectStatus(await request("PUT", `/employees/${schoolEmployee.data.data.id}/user-account`, schoolAdminA, { userId: schoolAdminId }), 404);
    expectStatus(await request("POST", `/employees/${schoolEmployee.data.data.id}/teacher-profile`, schoolAdminA, { specialization: "Duplicate" }), 409);
    expectStatus(await request("GET", `/employees/${schoolEmployee.data.data.id}/teacher-profile`, schoolAdminA), 200);
    expectStatus(await request("PATCH", `/employees/${schoolEmployee.data.data.id}/teacher-profile`, schoolAdminA, { specialization: "Algebra" }), 200);
    const noProfileEmployee = await request("POST", "/employees", schoolAdminA, { employeeId: `${tag}-EMP-NOPROFILE`, category: "TEACHING", firstName: "No", lastName: "Profile", phone: "9876543217", joiningDate: "2025-06-01", designationId: schoolTeacherDesignation.data.data.id });
    expectStatus(noProfileEmployee, 201);
    expectStatus(await request("POST", "/school/teacher-assignments", schoolAdminA, { teacherProfileId: noProfileEmployee.data.data.id, academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, subjectId: subject.data.data.id }), 404);
    const secondSchoolProfile = await request("POST", `/employees/${noProfileEmployee.data.data.id}/teacher-profile`, schoolAdminA, { specialization: "Mathematics" });
    expectStatus(secondSchoolProfile, 201);
    await prisma.teacherProfile.updateMany({ where: { id: schoolProfile.data.data.id, schoolId: schoolA }, data: { status: "INACTIVE" } });
    expectStatus(await request("POST", "/school/teacher-assignments", schoolAdminA, { teacherProfileId: schoolProfile.data.data.id, academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, subjectId: subject.data.data.id }), 404);
    await prisma.teacherProfile.updateMany({ where: { id: schoolProfile.data.data.id, schoolId: schoolA }, data: { status: "ACTIVE" } });
    const schoolAssignment = await request("POST", "/school/teacher-assignments", schoolAdminA, { teacherProfileId: schoolProfile.data.data.id, academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, subjectId: subject.data.data.id });
    expectStatus(schoolAssignment, 201);
    expectStatus(await request("POST", "/school/teacher-assignments", schoolAdminA, { teacherProfileId: secondSchoolProfile.data.data.id, academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, subjectId: subject.data.data.id }), 201);
    expectStatus(await request("POST", `/classes/${grade6.id}/subjects`, schoolAdminA, { subjectId: subject.data.data.id, isMandatory: true }), 201);
    expectStatus(await request("POST", "/school/teacher-assignments", schoolAdminA, { teacherProfileId: schoolProfile.data.data.id, academicYearId: yearId, gradeId: grade6.id, sectionId: sectionB.data.data.id, subjectId: subject.data.data.id }), 201);
    const english = await request("POST", "/subjects", schoolAdminA, { name: "English", code: `${tag}-ENG`, subjectType: "CORE" });
    expectStatus(english, 201);
    expectStatus(await request("POST", "/school/teacher-assignments", schoolAdminA, { teacherProfileId: schoolProfile.data.data.id, academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, subjectId: english.data.data.id }), 400);
    expectStatus(await request("POST", `/classes/${grade5.id}/subjects`, schoolAdminA, { subjectId: english.data.data.id, isMandatory: true }), 201);
    expectStatus(await request("POST", "/school/teacher-assignments", schoolAdminA, { teacherProfileId: schoolProfile.data.data.id, academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, subjectId: english.data.data.id }), 201);
    const science = await request("POST", "/subjects", schoolAdminA, { name: "Science", code: `${tag}-SCI`, subjectType: "CORE" });
    expectStatus(science, 201);
    await request("POST", `/classes/${grade5.id}/subjects`, schoolAdminA, { subjectId: science.data.data.id, isMandatory: true });
    await prisma.classSubject.updateMany({ where: { schoolId: schoolA, gradeId: grade5.id, subjectId: science.data.data.id }, data: { status: "INACTIVE" } });
    expectStatus(await request("POST", "/school/teacher-assignments", schoolAdminA, { teacherProfileId: schoolProfile.data.data.id, academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, subjectId: science.data.data.id }), 400);
    expectStatus(await request("POST", "/school/teacher-assignments", schoolAdminA, { teacherProfileId: schoolProfile.data.data.id, academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, subjectId: subject.data.data.id }), 409);
    expectStatus(await request("GET", `/school/teacher-assignments/${schoolAssignment.data.data.id}`, schoolAdminA), 200);
    const schoolAssignmentList = await request("GET", `/school/teacher-assignments?employeeId=${schoolEmployee.data.data.id}&academicYearId=${yearId}&gradeId=${grade5.id}&sectionId=${sectionA.data.data.id}&subjectId=${subject.data.data.id}&search=Rahul&page=1&limit=1&sortBy=lastName`, schoolAdminA);
    expectStatus(schoolAssignmentList, 200); assert.equal(schoolAssignmentList.data.data.total, 1); assert.equal(schoolAssignmentList.data.data.records[0].teacherProfile.employee.firstName, "Rahul");
    expectStatus(await request("GET", `/school/teacher-assignments?limit=101`, schoolAdminA), 400);
    expectStatus(await request("GET", "/school/teacher-assignments?gradeId=invalid", schoolAdminA), 400);
    expectStatus(await request("GET", "/school/teacher-assignments", root), 400);
    expectStatus(await request("GET", `/school/teacher-assignments?schoolId=${schoolA}&limit=1`, root), 200);
    expectStatus(await request("GET", `/school/teacher-assignments?schoolId=${schoolB}`, schoolAdminA), 400);
    expectStatus(await request("GET", "/school/teacher-assignments", "not.a.valid.token"), 401);
    expectStatus(await request("GET", `/school/teacher-assignments/${schoolAssignment.data.data.id}`, schoolAdminB), 404);
    expectStatus(await request("PATCH", `/school/teacher-assignments/${schoolAssignment.data.data.id}`, schoolAdminA, { sectionId: sectionB.data.data.id }), 400);
    expectStatus(await request("PATCH", `/school/teacher-assignments/${schoolAssignment.data.data.id}`, schoolAdminA, { gradeId: grade6.id }), 400);
    expectStatus(await request("PATCH", `/school/teacher-assignments/${schoolAssignment.data.data.id}`, schoolAdminA, { subjectId: subject.data.data.id }), 200);
    expectStatus(await request("PATCH", `/school/teacher-assignments/${schoolAssignment.data.data.id}/status`, schoolAdminA, { status: "INACTIVE" }), 200);
    expectStatus(await request("POST", "/school/teacher-assignments", schoolAdminA, { teacherProfileId: schoolProfile.data.data.id, academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, subjectId: subject.data.data.id }), 201);
    expectStatus(await request("PATCH", `/school/teacher-assignments/${schoolAssignment.data.data.id}/status`, schoolAdminA, { status: "ACTIVE" }), 409);
    expectStatus(await request("GET", `/school/teacher-assignments?status=INACTIVE&employeeId=${schoolEmployee.data.data.id}`, schoolAdminA), 200);
    expectStatus(await request("POST", "/school/teacher-assignments", teacherA, { teacherProfileId: schoolProfile.data.data.id, academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, subjectId: subject.data.data.id }), 403);
    expectStatus(await request("GET", "/school/teacher-assignments", null), 401);
    expectStatus(await request("PATCH", `/employees/${schoolEmployee.data.data.id}`, schoolAdminA, { status: "ON_LEAVE" }), 200);
    expectStatus(await request("POST", "/school/teacher-assignments", schoolAdminA, { teacherProfileId: schoolProfile.data.data.id, academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, subjectId: subject.data.data.id }), 404);
    expectStatus(await request("PATCH", `/school/teacher-assignments/${schoolAssignment.data.data.id}/status`, schoolAdminA, { status: "ACTIVE" }), 404);
    expectStatus(await request("PATCH", `/employees/${schoolEmployee.data.data.id}`, schoolAdminA, { status: "ACTIVE" }), 200);
    expectStatus(await request("POST", "/school/teacher-assignments", collegeAdminA, { teacherProfileId: schoolProfile.data.data.id, academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, subjectId: subject.data.data.id }), 403);
    assert.equal((await request("GET", `/classes/${grade5.id}/subjects`, schoolAdminA)).data.data.length, 2);
    expectStatus(await request("DELETE", `/classes/${grade6.id}/subjects/${mapped.data.data.id}`, schoolAdminA), 404);
    assert.equal((await request("GET", `/classes/${grade5.id}/subjects`, schoolAdminA)).data.data.length, 2);
    expectStatus(await request("PATCH", `/subjects/${subject.data.data.id}`, schoolAdminA, { description: "Verified subject update" }), 200);
    const studentA = await createStudent(schoolAdminA, schoolA, "school-student");
    const studentPortalAccount = await request("POST", `/students/${studentA}/portal-account`, schoolAdminA, { email: `${tag.toLowerCase()}-student-portal@example.test`, password });
    expectStatus(studentPortalAccount, 201);
    const studentPortal = await login(`${tag.toLowerCase()}-student-portal@example.test`);
    await prisma.user.create({ data: { firstName: "QA Parent", email: `${tag.toLowerCase()}-parent@example.test`, password: hashed, role: "PARENT", schoolId: schoolA } });
    const parent = await login(`${tag.toLowerCase()}-parent@example.test`);
    expectStatus(await request("GET", "/employees", teacherA), 403);
    expectStatus(await request("GET", "/employees", studentPortal), 403);
    expectStatus(await request("GET", "/employees", parent), 403);
    expectStatus(await request("GET", "/employees", null), 401);
    expectStatus(await request("GET", "/employees", root), 400);
    expectStatus(await request("GET", `/employees?schoolId=${collegeA}`, root), 200);
    expectStatus(await request("GET", `/employees?schoolId=${collegeB}`, collegeAdminA), 400);
    expectStatus(await request("POST", "/school/teacher-assignments", studentPortal, { teacherProfileId: schoolProfile.data.data.id, academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, subjectId: subject.data.data.id }), 403);
    expectStatus(await request("POST", "/school/teacher-assignments", parent, { teacherProfileId: schoolProfile.data.data.id, academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, subjectId: subject.data.data.id }), 403);
    const enrollmentA = await request("POST", `/students/${studentA}/academic-enrollments`, schoolAdminA, { academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, rollNumber: "QA-5A-1", enrollmentDate: "2026-04-01" });
    expectStatus(enrollmentA, 201);
    expectStatus(await request("POST", `/students/${studentA}/academic-enrollments`, schoolAdminA, { academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, enrollmentDate: "2026-04-01" }), 409);
    const moved = await request("POST", `/academic-enrollments/${enrollmentA.data.data.id}/transfers`, schoolAdminA, { gradeId: grade6.id, sectionId: sectionB.data.data.id, transferDate: "2026-09-01", rollNumber: "QA-6B-1" });
    expectStatus(moved, 201);
    assert.equal(moved.data.data.previous.status, "WITHDRAWN");
    assert.equal(moved.data.data.current.status, "ACTIVE");
    const history = await request("GET", `/students/${studentA}/academic-history`, schoolAdminA);
    expectStatus(history, 200);
    assert.equal(history.data.data.length, 2);
    expectStatus(await request("POST", `/students/${studentA}/academic-enrollments`, schoolAdminA, { academicYearId: yearId, gradeId: grade5.id, sectionId: sectionA.data.data.id, enrollmentDate: "2026-04-01" }), 409);
    expectStatus(await request("GET", `/classes/${grade5.id}`, schoolAdminB), 404);
    expectStatus(await request("GET", "/classes/invalid-id", schoolAdminA), 400);
    expectStatus(await request("POST", "/classes/initialize?schoolId=" + schoolB, schoolAdminA, {}), 400);
    expectStatus(await request("GET", "/classes", collegeAdminA), 403);
    expectStatus(await request("PATCH", `/schools/${schoolA}`, root, { institutionType: "COLLEGE" }), 409);

    // College workflow with B.Tech 4x2 configuration.
    const collegeYear = await request("POST", "/academic-years", collegeAdminA, { name: `${tag}-college-2026-27`, startDate: "2026-06-01", endDate: "2027-05-31" });
    expectStatus(collegeYear, 201);
    const dept = await request("POST", "/departments", collegeAdminA, { name: "Computer Science and Engineering", code: `${tag}-CSE` });
    expectStatus(dept, 201);
    expectStatus(await request("PATCH", `/departments/${dept.data.data.id}`, collegeAdminA, { description: "Verified department update" }), 200);
    expectStatus(await request("POST", "/departments", collegeAdminA, { name: "Duplicate", code: `${tag}-CSE` }), 409);
    const deptB = await request("POST", "/departments", collegeAdminB, { name: "Computer Science and Engineering", code: `${tag}-CSE` });
    expectStatus(deptB, 201); // Same code is valid in a different tenant.
    expectStatus(await request("GET", `/departments/${dept.data.data.id}`, collegeAdminB), 404);
    expectStatus(await request("POST", "/departments", collegeAdminA, { name: "Foreign school", code: "FOREIGN", schoolId: collegeB }), 400);
    expectStatus(await request("GET", "/departments?limit=101", collegeAdminA), 400);
    const programme = await request("POST", "/programmes", collegeAdminA, { name: "B.Tech Computer Science", code: `${tag}-BTECH`, degreeType: "UNDERGRADUATE", durationYears: 4, semestersPerYear: 2, totalSemesters: 8, termMode: "SEMESTER", departmentId: dept.data.data.id });
    expectStatus(programme, 201);
    expectStatus(await request("PATCH", `/programmes/${programme.data.data.id}`, collegeAdminA, { description: "Verified programme update" }), 200);
    expectStatus(await request("POST", "/programmes", collegeAdminA, { name: "Bad structure", code: `${tag}-BAD`, degreeType: "UNDERGRADUATE", durationYears: 4, semestersPerYear: 2, totalSemesters: 7, departmentId: dept.data.data.id }), 400);
    const curriculum = await request("POST", `/programmes/${programme.data.data.id}/curricula`, collegeAdminA, { name: "Curriculum 2026", versionCode: "2026", effectiveFrom: "2026-06-01", durationYears: 4, semestersPerYear: 2, totalSemesters: 8, termMode: "SEMESTER" });
    expectStatus(curriculum, 201);
    const generated = await request("POST", `/curricula/${curriculum.data.data.id}/generate-terms`, collegeAdminA, {});
    expectStatus(generated, 201);
    assert.equal(generated.data.data.length, 8);
    assert.deepEqual(generated.data.data.map((x) => x.academicYearNumber), [1, 1, 2, 2, 3, 3, 4, 4]);
    assert.deepEqual(generated.data.data.map((x) => x.semesterNumber), [1, 2, 3, 4, 5, 6, 7, 8]);
    expectStatus(await request("POST", `/curricula/${curriculum.data.data.id}/generate-terms`, collegeAdminA, {}), 201);
    assert.equal((await prisma.programmeTerm.count({ where: { schoolId: collegeA, curriculumVersionId: curriculum.data.data.id } })), 8);
    expectStatus(await request("PATCH", `/curricula/${curriculum.data.data.id}`, collegeAdminA, { name: "Changed after terms" }), 409);
    const bca = await request("POST", "/programmes", collegeAdminA, { name: "Bachelor of Computer Applications", code: `${tag}-BCA`, degreeType: "UNDERGRADUATE", durationYears: 3, semestersPerYear: 2, totalSemesters: 6, termMode: "SEMESTER", departmentId: dept.data.data.id });
    expectStatus(bca, 201);
    const bcaCurriculum = await request("POST", `/programmes/${bca.data.data.id}/curricula`, collegeAdminA, { name: "BCA Curriculum 2026", versionCode: "2026", effectiveFrom: "2026-06-01", durationYears: 3, semestersPerYear: 2, totalSemesters: 6, termMode: "SEMESTER" });
    expectStatus(bcaCurriculum, 201);
    assert.equal((await request("POST", `/curricula/${bcaCurriculum.data.data.id}/generate-terms`, collegeAdminA, {})).data.data.length, 6);
    const course = await request("POST", "/courses", collegeAdminA, { name: "Data Structures", code: `${tag}-CS201`, courseType: "CORE", credits: 4, lectureHours: 3, tutorialHours: 1, practicalHours: 0 });
    expectStatus(course, 201);
    const term1 = generated.data.data[0];
    const map = await request("POST", `/programme-terms/${term1.id}/courses`, collegeAdminA, { courseId: course.data.data.id, isMandatory: true, displayOrder: 1 });
    expectStatus(map, 201);
    assert.equal(Number(map.data.data.credits), 4); // Defaults inherit from the catalogue course.
    expectStatus(await request("PATCH", `/curriculum-courses/${map.data.data.id}`, collegeAdminA, { credits: 3, isMandatory: false }), 200);
    expectStatus(await request("POST", `/programme-terms/${term1.id}/courses`, collegeAdminA, { courseId: course.data.data.id }), 409);
    const batch = await request("POST", "/batches", collegeAdminA, { name: "B.Tech CSE 2026–2030", code: `${tag}-CSE26`, admissionYear: 2026, expectedGraduationYear: 2030, startDate: "2026-06-01", endDate: "2030-05-31", programmeId: programme.data.data.id, curriculumVersionId: curriculum.data.data.id });
    expectStatus(batch, 201);
    const collegeStudent = await createStudent(collegeAdminA, collegeA, "college-student");
    const programmeEnrollment = await request("POST", `/students/${collegeStudent}/programme-enrollments`, collegeAdminA, { programmeId: programme.data.data.id, curriculumVersionId: curriculum.data.data.id, batchId: batch.data.data.id, registrationNumber: `${tag}-REG1`, admissionDate: "2026-06-01", expectedCompletionDate: "2030-05-31" });
    expectStatus(programmeEnrollment, 201);
    expectStatus(await request("POST", `/students/${collegeStudent}/programme-enrollments`, collegeAdminA, { programmeId: programme.data.data.id, curriculumVersionId: curriculum.data.data.id, batchId: batch.data.data.id, admissionDate: "2026-06-01", expectedCompletionDate: "2030-05-31" }), 409);
    const semesterEnrollment = await request("POST", `/programme-enrollments/${programmeEnrollment.data.data.id}/semester-enrollments`, collegeAdminA, { programmeTermId: term1.id, academicYearId: collegeYear.data.data.id, enrollmentDate: "2026-06-01" });
    expectStatus(semesterEnrollment, 201);
    const offering = await request("POST", "/course-offerings", collegeAdminA, { code: `${tag}-CS201-S1`, capacity: 1, curriculumCourseId: map.data.data.id, programmeTermId: term1.id, academicYearId: collegeYear.data.data.id });
    expectStatus(offering, 201);
    const offering2 = await request("POST", "/course-offerings", collegeAdminA, { code: `${tag}-CS201-S1-B`, capacity: 1, curriculumCourseId: map.data.data.id, programmeTermId: term1.id, academicYearId: collegeYear.data.data.id });
    expectStatus(offering2, 201);
    expectStatus(await request("DELETE", `/curriculum-courses/${map.data.data.id}`, collegeAdminA), 409);
    const registrationBody = { studentSemesterEnrollmentId: semesterEnrollment.data.data.id, registrationDate: "2026-06-01" };
    const registration = await request("POST", `/course-offerings/${offering.data.data.id}/registrations`, collegeAdminA, registrationBody);
    expectStatus(registration, 201);
    expectStatus(await request("POST", `/course-offerings/${offering.data.data.id}/registrations`, collegeAdminA, registrationBody), 409);
    const collegeStudent2 = await createStudent(collegeAdminA, collegeA, "college-student-two");
    const programmeEnrollment2 = await request("POST", `/students/${collegeStudent2}/programme-enrollments`, collegeAdminA, { programmeId: programme.data.data.id, curriculumVersionId: curriculum.data.data.id, batchId: batch.data.data.id, registrationNumber: `${tag}-REG2`, admissionDate: "2026-06-01", expectedCompletionDate: "2030-05-31" });
    expectStatus(programmeEnrollment2, 201);
    const semesterEnrollment2 = await request("POST", `/programme-enrollments/${programmeEnrollment2.data.data.id}/semester-enrollments`, collegeAdminA, { programmeTermId: term1.id, academicYearId: collegeYear.data.data.id, enrollmentDate: "2026-06-01" });
    expectStatus(semesterEnrollment2, 201);
    expectStatus(await request("POST", `/course-offerings/${offering.data.data.id}/registrations`, collegeAdminA, { studentSemesterEnrollmentId: semesterEnrollment2.data.data.id, registrationDate: "2026-06-01" }), 409);
    const faculty = await request("POST", `/course-offerings/${offering.data.data.id}/faculty`, collegeAdminA, { userId: "00000000-0000-4000-8000-000000000000" });
    expectStatus(faculty, 400);
    const teacherId = (await prisma.user.findFirst({ where: { email: `${tag.toLowerCase()}-teacher-a@example.test` }, select: { id: true } })).id;
    const teacherAccountBeforeLink = await prisma.user.findUnique({ where: { id: teacherId }, select: { status: true, password: true } });
    const facultyDesignation = await request("POST", "/employees/designations", collegeAdminA, { name: "Lecturer", code: `${tag}-LECTURER`, category: "TEACHING" });
    expectStatus(facultyDesignation, 201);
    const facultyEmployee = await request("POST", "/employees", collegeAdminA, { employeeId: `${tag}-EMP-COLLEGE`, category: "TEACHING", firstName: "Faculty", lastName: "Member", phone: "9876543211", joiningDate: "2025-06-01", designationId: facultyDesignation.data.data.id });
    expectStatus(facultyEmployee, 201);
    const facultyProfile = await request("POST", `/employees/${facultyEmployee.data.data.id}/teacher-profile`, collegeAdminA, { specialization: "Computer Science" });
    expectStatus(facultyProfile, 201);
    const replacementFacultyEmployee = await request("POST", "/employees", collegeAdminA, { employeeId: `${tag}-EMP-COLLEGE-2`, category: "TEACHING", firstName: "Replacement", lastName: "Faculty", phone: "9876543216", joiningDate: "2025-06-01", designationId: facultyDesignation.data.data.id });
    expectStatus(replacementFacultyEmployee, 201);
    const replacementFacultyProfile = await request("POST", `/employees/${replacementFacultyEmployee.data.data.id}/teacher-profile`, collegeAdminA, { specialization: "Database Systems" });
    expectStatus(replacementFacultyProfile, 201);
    expectStatus(await request("PUT", `/employees/${facultyEmployee.data.data.id}/user-account`, collegeAdminA, { userId: teacherId }), 200);
    const secondCollegeTeacher = await createUser(root, collegeA, "TEACHER", "teacher-a-two");
    const secondCollegeTeacherId = (await prisma.user.findFirst({ where: { email: `${tag.toLowerCase()}-teacher-a-two@example.test` }, select: { id: true } })).id;
    expectStatus(await request("PUT", `/employees/${replacementFacultyEmployee.data.data.id}/user-account`, collegeAdminA, { userId: secondCollegeTeacherId }), 200);
    const otherCollegeTeacher = await createUser(root, collegeB, "TEACHER", "teacher-b");
    const otherCollegeTeacherId = (await prisma.user.findFirst({ where: { email: `${tag.toLowerCase()}-teacher-b@example.test` }, select: { id: true } })).id;
    expectStatus(await request("PUT", `/employees/${facultyEmployee.data.data.id}/user-account`, collegeAdminA, { userId: secondCollegeTeacherId }), 409);
    expectStatus(await request("PUT", `/employees/${facultyEmployee.data.data.id}/user-account`, collegeAdminA, { userId: otherCollegeTeacherId }), 409);
    const unlinkedFacultyEmployee = await request("POST", "/employees", collegeAdminA, { employeeId: `${tag}-EMP-UNLINKED`, category: "TEACHING", firstName: "Unlinked", lastName: "Faculty", phone: "9876543215", joiningDate: "2025-06-01", designationId: facultyDesignation.data.data.id });
    expectStatus(unlinkedFacultyEmployee, 201);
    expectStatus(await request("PUT", `/employees/${unlinkedFacultyEmployee.data.data.id}/user-account`, collegeAdminA, { userId: teacherId }), 409);
    expectStatus(await request("PUT", `/employees/${unlinkedFacultyEmployee.data.data.id}/user-account`, collegeAdminA, { userId: otherCollegeTeacherId }), 404);
    assert.equal((await prisma.employee.findFirst({ where: { id: facultyEmployee.data.data.id }, select: { userId: true } })).userId, teacherId);
    expectStatus(await request("PATCH", `/employees/${facultyEmployee.data.data.id}`, collegeAdminA, { status: "INACTIVE" }), 200);
    expectStatus(await request("POST", `/course-offerings/${offering.data.data.id}/faculty`, collegeAdminA, { userId: teacherId }), 400);
    const teacherAccountAfterStatusChange = await prisma.user.findUnique({ where: { id: teacherId }, select: { status: true, password: true } });
    assert.equal(teacherAccountAfterStatusChange.status, teacherAccountBeforeLink.status); assert.equal(teacherAccountAfterStatusChange.password, teacherAccountBeforeLink.password);
    expectStatus(await request("PATCH", `/employees/${facultyEmployee.data.data.id}`, collegeAdminA, { status: "ACTIVE" }), 200);
    const safeEmployee = await request("GET", `/employees/${facultyEmployee.data.data.id}`, collegeAdminA);
    expectStatus(safeEmployee, 200); assert.equal(JSON.stringify(safeEmployee.data.data).includes("password"), false); assert.equal(JSON.stringify(safeEmployee.data.data).includes("token"), false);
    const facultyOk = await request("POST", `/course-offerings/${offering.data.data.id}/faculty`, collegeAdminA, { userId: teacherId });
    expectStatus(facultyOk, 201);
    expectStatus(await request("POST", `/course-offerings/${offering.data.data.id}/faculty`, collegeAdminA, { userId: teacherId }), 409);
    expectStatus(await request("GET", `/faculty-assignments/${facultyOk.data.data.id}`, collegeAdminA), 200);
    expectStatus(await request("GET", `/course-offerings/${offering.data.data.id}/faculty?employeeId=${facultyEmployee.data.data.id}`, collegeAdminA), 200);
    expectStatus(await request("GET", `/faculty-assignments/${facultyOk.data.data.id}`, collegeAdminB), 404);
    expectStatus(await request("GET", `/course-offerings/${offering.data.data.id}/faculty?batchId=${batch.data.data.id}`, collegeAdminA), 400);
    expectStatus(await request("GET", `/course-offerings/${offering.data.data.id}/faculty?academicYearId=${collegeYear.data.data.id}&programmeId=${programme.data.data.id}&courseId=${course.data.data.id}`, collegeAdminA), 200);
    expectStatus(await request("PATCH", `/faculty-assignments/${facultyOk.data.data.id}`, collegeAdminA, {}), 400);
    expectStatus(await request("PATCH", `/faculty-assignments/${facultyOk.data.data.id}`, collegeAdminA, { userId: otherCollegeTeacherId }), 400);
    expectStatus(await request("POST", `/course-offerings/${offering2.data.data.id}/faculty`, collegeAdminA, { userId: secondCollegeTeacherId }), 201);
    expectStatus(await request("PATCH", `/faculty-assignments/${facultyOk.data.data.id}`, collegeAdminA, { userId: secondCollegeTeacherId, courseOfferingId: offering2.data.data.id }), 409);
    const unchangedFaculty = await request("GET", `/faculty-assignments/${facultyOk.data.data.id}`, collegeAdminA);
    expectStatus(unchangedFaculty, 200); assert.equal(unchangedFaculty.data.data.userId, teacherId); assert.equal(unchangedFaculty.data.data.courseOfferingId, offering.data.data.id);
    const facultyUpdated = await request("PATCH", `/faculty-assignments/${facultyOk.data.data.id}`, collegeAdminA, { userId: secondCollegeTeacherId });
    expectStatus(facultyUpdated, 200); assert.equal(facultyUpdated.data.data.userId, secondCollegeTeacherId); assert.equal(facultyUpdated.data.data.courseOfferingId, offering.data.data.id);
    expectStatus(await request("GET", `/faculty-assignments/${facultyOk.data.data.id}`, collegeAdminA), 200);
    expectStatus(await request("GET", `/students/${collegeStudent}/programme-enrollments`, collegeAdminA), 200);
    expectStatus(await request("GET", `/students/${collegeStudent}/course-registrations`, collegeAdminA), 200);
    expectStatus(await request("GET", `/course-offerings/${offering.data.data.id}/faculty`, collegeAdminA), 200);
    expectStatus(await request("GET", `/programmes/${programme.data.data.id}`, collegeAdminB), 404);
    expectStatus(await request("GET", "/departments", schoolAdminA), 403);
    expectStatus(await request("GET", "/departments", teacherA), 403);
    expectStatus(await request("GET", "/departments", studentPortal), 403);
    expectStatus(await request("GET", "/departments", parent), 403);
    expectStatus(await request("GET", "/programmes/invalid-id", collegeAdminA), 400);
    expectStatus(await request("POST", `/programme-terms/${term1.id}/courses`, collegeAdminA, { courseId: subject.data.data.id }), 400);

    // Confirm PostgreSQL holds the complete migrated model/enumeration set.
    const tableCount = await prisma.$queryRaw`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('academic_years','academic_periods','grades','sections','subjects','class_subjects','student_academic_enrollments','college_departments','college_programmes','curriculum_versions','programme_terms','college_courses','curriculum_courses','college_batches','student_programme_enrollments','student_semester_enrollments','course_offerings','student_course_registrations','faculty_course_assignments')`;
    assert.equal(tableCount[0].n, 19);
    const enumCount = await prisma.$queryRaw`SELECT count(DISTINCT t.typname)::int AS n FROM pg_type t JOIN pg_enum e ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname IN ('DegreeType','EntryType','ProgrammeTermMode','CollegeCourseType','ProgrammeEnrollmentStatus','AcademicRecordStatus','CourseRegistrationStatus')`;
    assert.equal(enumCount[0].n, 7);
    const fkCount = await prisma.$queryRaw`SELECT count(*)::int AS n FROM information_schema.table_constraints WHERE table_schema='public' AND constraint_type='FOREIGN KEY' AND table_name IN ('college_departments','college_programmes','curriculum_versions','programme_terms','college_courses','curriculum_courses','college_batches','student_programme_enrollments','student_semester_enrollments','course_offerings','student_course_registrations','faculty_course_assignments')`;
    assert.ok(fkCount[0].n >= 25);
    await assert.rejects(prisma.programme.create({ data: { schoolId: collegeA, departmentId: dept.data.data.id, name: "Invalid direct DB programme", code: `${tag}-DBBAD`, durationYears: 4, semestersPerYear: 2, totalSemesters: 7 } }));
    await assert.rejects(prisma.department.delete({ where: { id: dept.data.data.id } }));
  } catch (error) {
    console.error("Phase 4 database integration failure:", error?.stack || error);
    throw error;
  } finally {
    for (const token of tokens) {
      try { await fetch(`${base}/auth/logout`, { method: "POST", headers: { authorization: `Bearer ${token}` } }); } catch {}
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (schoolIds.length) {
      const tenant = { schoolId: { in: schoolIds } };
      await prisma.schoolTeacherAssignment.deleteMany({ where: tenant });
      await prisma.studentCourseRegistration.deleteMany({ where: tenant });
      await prisma.facultyCourseAssignment.deleteMany({ where: tenant });
      await prisma.courseOffering.deleteMany({ where: tenant });
      await prisma.studentSemesterEnrollment.deleteMany({ where: tenant });
      await prisma.studentProgrammeEnrollment.deleteMany({ where: tenant });
      await prisma.curriculumCourse.deleteMany({ where: tenant });
      await prisma.collegeBatch.deleteMany({ where: tenant });
      await prisma.programmeTerm.deleteMany({ where: tenant });
      await prisma.collegeCourse.deleteMany({ where: tenant });
      await prisma.curriculumVersion.deleteMany({ where: tenant });
      await prisma.programme.deleteMany({ where: tenant });
      await prisma.department.deleteMany({ where: tenant });
      await prisma.studentAcademicEnrollment.deleteMany({ where: tenant });
      await prisma.section.deleteMany({ where: tenant });
      await prisma.classSubject.deleteMany({ where: tenant });
      await prisma.academicPeriod.deleteMany({ where: tenant });
      await prisma.grade.deleteMany({ where: tenant });
      await prisma.subject.deleteMany({ where: tenant });
      await prisma.academicYear.deleteMany({ where: tenant });
      await prisma.student.deleteMany({ where: tenant });
      await prisma.teacherProfile.deleteMany({ where: tenant });
      await prisma.employee.deleteMany({ where: tenant });
      await prisma.employeeDepartment.deleteMany({ where: tenant });
      await prisma.employeeDesignation.deleteMany({ where: tenant });
      await prisma.user.deleteMany({ where: tenant });
      await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
    }
    if (rootId) await prisma.user.deleteMany({ where: { id: rootId } });
    await redis.closeRedis();
    await prisma.$disconnect();
  }
});

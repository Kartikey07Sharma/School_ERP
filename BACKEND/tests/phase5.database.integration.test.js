// Run against the configured PostgreSQL and Redis services with:
// $env:RUN_PHASE5_DB_TESTS='1'; node --test tests/phase5.database.integration.test.js
// The test creates two tagged institutions and removes only those fixtures.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const prisma = require("../src/database/prisma");
const redis = require("../src/database/redis");
const app = require("../src/app");

const enabled = process.env.RUN_PHASE5_DB_TESTS === "1";
test("Phase 5 shared student-parent account, tenant integrity and authentication workflow", { skip: !enabled }, async () => {
  const tag = `QA5${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  const adminPassword = `Qa5!${crypto.randomBytes(18).toString("base64url")}`;
  const portalPassword = `Portal!${crypto.randomBytes(18).toString("base64url")}`;
  const rootEmail = `${tag.toLowerCase()}-root@example.test`;
  const isolatedTestIp = `198.19.${crypto.randomInt(1, 255)}.${crypto.randomInt(1, 255)}`;
  const schoolIds = [];
  const tokens = [];
  let rootId;
  let server;
  let base;

  async function request(method, path, token, body, headers = {}) {
    const requestHeaders = { "x-forwarded-for": isolatedTestIp, ...headers };
    if (token) requestHeaders.authorization = `Bearer ${token}`;
    if (body !== undefined) requestHeaders["content-type"] = "application/json";
    const response = await fetch(`${base}${path}`, { method, headers: requestHeaders, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    let data;
    try { data = await response.json(); } catch { data = null; }
    return { status: response.status, data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  function expectStatus(result, expected) {
    assert.equal(result.status, expected, JSON.stringify(result.data));
    assert.equal(result.data?.success, expected < 400, JSON.stringify(result.data));
  }
  async function login(email, password) {
    const result = await request("POST", "/auth/login", null, { email, password });
    expectStatus(result, 200);
    tokens.push(result.data.data.accessToken);
    return { ...result.data.data, cookie: result.cookie };
  }
  async function createSchool(rootToken, n) {
    const result = await request("POST", "/schools", rootToken, {
      name: `${tag} Institution ${n}`, code: `${tag}-${n}`, email: `${tag.toLowerCase()}-${n}@example.test`,
      phone: String(BigInt(Date.now()) * 10n + BigInt(n)).slice(-14), address: "Phase 5 isolated test", institutionType: n === 1 ? "SCHOOL" : "COLLEGE",
    });
    expectStatus(result, 201);
    schoolIds.push(result.data.data.id);
    return result.data.data.id;
  }
  async function createAdmin(rootToken, schoolId, suffix) {
    const email = `${tag.toLowerCase()}-${suffix}@example.test`;
    const result = await request("POST", "/users", rootToken, { firstName: "QA Admin", email, password: adminPassword, role: "SCHOOL_ADMIN", schoolId });
    expectStatus(result, 201);
    return (await login(email, adminPassword)).accessToken;
  }
  async function createStudent(adminToken, number, email = `${tag.toLowerCase()}-guardian-${number}@example.test`) {
    const result = await request("POST", "/students", adminToken, {
      admissionNumber: `${tag}-${number}`, firstName: "Rahul", lastName: `Sharma${number}`,
      dateOfBirth: "2012-05-21", gender: "Male", admissionDate: "2026-04-01",
      email: `${tag.toLowerCase()}-student-${number}@example.test`, phone: "+919876543210",
      address: "12 Main Road", city: "Pune", state: "Maharashtra", postalCode: "411001", bloodGroup: "O+",
      guardianName: "Amit Sharma", guardianRelationship: "Father", guardianPhone: "9876543210",
      guardianEmail: email, guardianAddress: "Separate guardian address",
    });
    expectStatus(result, 201);
    return result.data.data;
  }

  try {
    await prisma.$connect();
    assert.equal(await redis.connectRedis(), true, "Redis must be available for auth checks");
    const hashed = await bcrypt.hash(adminPassword, 12);
    rootId = (await prisma.user.create({ data: { firstName: "QA Phase5", email: rootEmail, password: hashed, role: "SUPER_ADMIN", status: "ACTIVE" }, select: { id: true } })).id;
    app.set("trust proxy", 1);
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    base = `http://127.0.0.1:${server.address().port}/api/v1`;

    const root = (await login(rootEmail, adminPassword)).accessToken;
    const schoolA = await createSchool(root, 1);
    const schoolB = await createSchool(root, 2);
    const adminA = await createAdmin(root, schoolA, "admin-a");
    const adminB = await createAdmin(root, schoolB, "admin-b");
    const studentA = await createStudent(adminA, "A");
    const studentB = await createStudent(adminB, "B");
    const studentC = await createStudent(adminA, "C");
    const studentD = await createStudent(adminA, "D");

    expectStatus(await request("GET", `/students/${studentA.id}`, adminB), 404);
    expectStatus(await request("PATCH", `/students/${studentB.id}`, adminA, { guardianName: "Unauthorized change" }), 404);
    const guardianBefore = await prisma.user.count({ where: { email: studentA.guardianEmail } });
    expectStatus(await request("POST", "/users", adminA, { firstName: "Separate Parent", email: `${tag.toLowerCase()}-parent@example.test`, password: adminPassword, role: "PARENT" }), 400);
    expectStatus(await request("POST", "/users", adminA, { firstName: "Unlinked Student", email: `${tag.toLowerCase()}-unlinked@example.test`, password: adminPassword, role: "STUDENT" }), 400);

    const portalEmail = `${tag.toLowerCase()}-shared@example.test`;
    const created = await request("POST", `/students/${studentA.id}/portal-account`, adminA, { email: portalEmail, password: portalPassword });
    expectStatus(created, 201);
    assert.equal(created.data.data.role, "STUDENT");
    assert.equal(created.data.data.schoolId, schoolA);
    assert.equal(Object.hasOwn(created.data.data, "password"), false);
    expectStatus(await request("POST", "/students", adminA, {
      admissionNumber: studentA.admissionNumber, firstName: "Duplicate", lastName: "Admission", dateOfBirth: "2012-05-21", gender: "Male", admissionDate: "2026-04-01",
      address: "Address", guardianName: "Guardian", guardianRelationship: "Father", guardianPhone: "9876543210",
    }), 409);
    assert.equal(await bcrypt.compare(portalPassword, (await prisma.user.findUnique({ where: { email: portalEmail }, select: { password: true } })).password), true);
    assert.equal(await prisma.user.count({ where: { email: studentA.guardianEmail } }), guardianBefore);
    expectStatus(await request("POST", `/students/${studentA.id}/portal-account`, adminA, { email: portalEmail, password: portalPassword }), 409);
    expectStatus(await request("GET", `/students/${studentA.id}/portal-account`, adminA), 200);
    expectStatus(await request("GET", `/students/${studentA.id}/portal-account`, adminB), 404);
    expectStatus(await request("GET", "/students/not-a-uuid/portal-account", adminA), 400);
    expectStatus(await request("GET", `/students/${studentA.id}/portal-account?schoolId=${schoolA}`, root), 200);

    // Existing PARENT rows remain valid identities and are never merged by matching email.
    const legacyParentEmail = `${tag.toLowerCase()}-legacy-parent@example.test`;
    const legacyParent = await prisma.user.create({ data: { firstName: "Legacy Parent", email: legacyParentEmail, password: await bcrypt.hash(adminPassword, 12), role: "PARENT", schoolId: schoolA }, select: { id: true } });
    const legacyParentSession = await login(legacyParentEmail, adminPassword);
    const legacyIdentity = await request("GET", "/auth/me", legacyParentSession.accessToken);
    expectStatus(legacyIdentity, 200);
    assert.equal(legacyIdentity.data.data.user.role, "PARENT");
    expectStatus(await request("POST", `/students/${studentC.id}/portal-account`, adminA, { email: legacyParentEmail, password: portalPassword }), 409);
    expectStatus(await request("PUT", `/students/${studentC.id}/portal-account`, adminA, { userId: legacyParent.id }), 409);
    assert.equal((await request("GET", `/students/${studentC.id}/portal-account`, adminA)).data.data.linked, false);

    const portal = await login(portalEmail, portalPassword);
    const portalIdentity = await request("GET", "/auth/me", portal.accessToken);
    expectStatus(portalIdentity, 200);
    assert.equal(portalIdentity.data.data.user.role, "STUDENT");
    const emptyDashboard = await request("GET", "/students/me/dashboard", portal.accessToken);
    expectStatus(emptyDashboard, 200);
    assert.equal(emptyDashboard.data.data.student.id, studentA.id);
    assert.equal(emptyDashboard.data.data.guardian.name, "Amit Sharma");
    assert.equal(emptyDashboard.data.data.academicSummary.current, null);
    const emptyAcademics = await request("GET", "/students/me/academics", portal.accessToken);
    expectStatus(emptyAcademics, 200);
    assert.deepEqual(emptyAcademics.data.data.history.records, []);
    expectStatus(await request("GET", "/students/me/dashboard", adminA), 403);
    expectStatus(await request("GET", "/students/me/academics?limit=101", portal.accessToken), 400);
    const selfProfile = await request("GET", "/students/me", portal.accessToken);
    expectStatus(selfProfile, 200);
    assert.equal(selfProfile.data.data.id, studentA.id);
    assert.equal(selfProfile.data.data.guardianName, "Amit Sharma");
    assert.equal(selfProfile.data.data.guardianAddress, "Separate guardian address");
    expectStatus(await request("GET", `/students/${studentB.id}`, portal.accessToken), 403);
    const userCountBeforeSelfEdit = await prisma.user.count({ where: { schoolId: schoolA } });
    const selfEdit = await request("PATCH", "/students/me", portal.accessToken, {
      email: "student-contact@example.test", phone: "+919876543211", address: "Portal updated address", city: "Mumbai", state: "Maharashtra", postalCode: "400001",
      guardianName: "Amit Sharma Updated", guardianRelationship: "Father", guardianPhone: "9876543211", guardianEmail: "portal-guardian@example.test", guardianAddress: "Portal guardian address",
    });
    expectStatus(selfEdit, 200);
    assert.equal(selfEdit.data.data.guardianName, "Amit Sharma Updated");
    assert.equal((await prisma.user.findUnique({ where: { id: created.data.data.id }, select: { email: true } })).email, portalEmail);
    assert.equal(await prisma.user.count({ where: { email: "portal-guardian@example.test" } }), 0);
    assert.equal(await prisma.user.count({ where: { schoolId: schoolA } }), userCountBeforeSelfEdit);
    for (const field of ["schoolId", "admissionNumber", "portalUserId", "status", "gradeId", "programmeId", "academicYearId", "role"]) {
      expectStatus(await request("PATCH", "/students/me", portal.accessToken, { [field]: "invalid" }), 400);
    }
    expectStatus(await request("PATCH", `/students/${studentA.id}`, adminA, { guardianEmail: "updated-guardian@example.test" }), 200);
    assert.equal(await prisma.user.count({ where: { email: "updated-guardian@example.test" } }), 0);
    assert.equal((await prisma.user.findUnique({ where: { id: created.data.data.id }, select: { email: true } })).email, portalEmail);

    // School portal data comes from Phase 4 enrollments, not legacy profile snapshots.
    expectStatus(await request("PATCH", `/students/${studentA.id}`, adminA, { className: "Legacy Class 9", section: "Z", academicYear: "Legacy Year" }), 200);
    const oldYear = await request("POST", "/academic-years", adminA, { name: `${tag}-2025-26`, startDate: "2025-04-01", endDate: "2026-03-31" });
    expectStatus(oldYear, 201);
    const currentYear = await request("POST", "/academic-years", adminA, { name: `${tag}-2026-27`, startDate: "2026-04-01", endDate: "2027-03-31" });
    expectStatus(currentYear, 201);
    expectStatus(await request("PATCH", `/academic-years/${currentYear.data.data.id}/set-current`, adminA, {}), 200);
    const grades = await request("POST", "/classes/initialize", adminA, {});
    expectStatus(grades, 200);
    const grade4 = grades.data.data.find((item) => item.code === "CLASS_4");
    const grade5 = grades.data.data.find((item) => item.code === "CLASS_5");
    const sectionOld = await request("POST", "/sections", adminA, { gradeId: grade4.id, academicYearId: oldYear.data.data.id, name: "A", code: "A" });
    const sectionCurrent = await request("POST", "/sections", adminA, { gradeId: grade5.id, academicYearId: currentYear.data.data.id, name: "B", code: "B" });
    expectStatus(sectionOld, 201); expectStatus(sectionCurrent, 201);
    const schoolSubject = await request("POST", "/subjects", adminA, { name: "Mathematics", code: `${tag}-MATH` });
    expectStatus(schoolSubject, 201);
    expectStatus(await request("POST", `/classes/${grade5.id}/subjects`, adminA, { subjectId: schoolSubject.data.data.id, isMandatory: true, weeklyPeriods: 5 }), 201);
    const oldEnrollment = await request("POST", `/students/${studentA.id}/academic-enrollments`, adminA, { academicYearId: oldYear.data.data.id, gradeId: grade4.id, sectionId: sectionOld.data.data.id, rollNumber: "OLD-1", enrollmentDate: "2025-04-01" });
    expectStatus(oldEnrollment, 201);
    await prisma.studentAcademicEnrollment.updateMany({ where: { id: oldEnrollment.data.data.id, schoolId: schoolA }, data: { status: "WITHDRAWN", leavingDate: new Date("2026-03-01T00:00:00.000Z") } });
    expectStatus(await request("POST", `/students/${studentA.id}/academic-enrollments`, adminA, { academicYearId: currentYear.data.data.id, gradeId: grade5.id, sectionId: sectionCurrent.data.data.id, rollNumber: "CUR-1", enrollmentDate: "2026-04-01" }), 201);
    const schoolAcademics = await request("GET", "/students/me/academics?page=1&limit=1", portal.accessToken);
    expectStatus(schoolAcademics, 200);
    assert.equal(schoolAcademics.data.data.institutionType, "SCHOOL");
    assert.equal(schoolAcademics.data.data.history.total, 2);
    assert.equal(schoolAcademics.data.data.current.grade.name, "Class 5");
    assert.equal(schoolAcademics.data.data.current.academicYear.name, `${tag}-2026-27`);
    assert.equal(schoolAcademics.data.data.current.subjects[0].name, "Mathematics");
    const schoolHistory = await request("GET", "/students/me/academics?page=2&limit=1", portal.accessToken);
    expectStatus(schoolHistory, 200);
    assert.equal(schoolHistory.data.data.history.records[0].status, "WITHDRAWN");
    const schoolDashboard = await request("GET", "/students/me/dashboard", portal.accessToken);
    expectStatus(schoolDashboard, 200);
    assert.equal(schoolDashboard.data.data.academicSummary.current.grade.name, "Class 5");

    const updatedPortalPassword = `${portalPassword}New`;
    expectStatus(await request("PATCH", "/auth/change-password", portal.accessToken, { currentPassword: "incorrect", newPassword: updatedPortalPassword }), 400);
    expectStatus(await request("PATCH", "/auth/change-password", portal.accessToken, { currentPassword: portalPassword, newPassword: portalPassword }), 400);
    expectStatus(await request("PATCH", "/auth/change-password", portal.accessToken, { currentPassword: portalPassword, newPassword: updatedPortalPassword }), 200);
    expectStatus(await request("GET", "/auth/me", portal.accessToken), 401);
    expectStatus(await request("POST", "/auth/refresh", null, {}, { cookie: portal.cookie, "x-csrf-token": portal.csrfToken }), 401);
    expectStatus(await request("POST", "/auth/login", null, { email: portalEmail, password: portalPassword }), 401);
    assert.equal(await bcrypt.compare(updatedPortalPassword, (await prisma.user.findUnique({ where: { email: portalEmail }, select: { password: true } })).password), true);
    const updatedPortal = await login(portalEmail, updatedPortalPassword);

    // An existing user can be explicitly linked, but never inferred by email.
    const existingEmail = `${tag.toLowerCase()}-existing@example.test`;
    const existingUser = await prisma.user.create({ data: { firstName: "Existing", email: existingEmail, password: await bcrypt.hash(adminPassword, 12), role: "STUDENT", schoolId: schoolA }, select: { id: true } });
    const linked = await request("PUT", `/students/${studentC.id}/portal-account`, adminA, { userId: existingUser.id });
    expectStatus(linked, 200);
    assert.equal(linked.data.data.id, existingUser.id);
    expectStatus(await request("PUT", `/students/${studentD.id}/portal-account`, adminA, { userId: existingUser.id }), 409);
    expectStatus(await request("PUT", `/students/${studentB.id}/portal-account?schoolId=${schoolB}`, root, { userId: existingUser.id }), 404);

    // College academic data is selected from the configured BA curriculum, not a hardcoded B.Tech pattern.
    const collegeYear = await request("POST", "/academic-years", adminB, { name: `${tag}-college-2026-27`, startDate: "2026-06-01", endDate: "2027-05-31" });
    expectStatus(collegeYear, 201);
    expectStatus(await request("PATCH", `/academic-years/${collegeYear.data.data.id}/set-current`, adminB, {}), 200);
    const department = await request("POST", "/departments", adminB, { name: "History and Social Sciences", code: `${tag}-HIST` });
    expectStatus(department, 201);
    const programme = await request("POST", "/programmes", adminB, { name: "Bachelor of Arts in History", code: `${tag}-BAH`, degreeType: "UNDERGRADUATE", durationYears: 3, semestersPerYear: 2, totalSemesters: 6, termMode: "SEMESTER", departmentId: department.data.data.id });
    expectStatus(programme, 201);
    const curriculum = await request("POST", `/programmes/${programme.data.data.id}/curricula`, adminB, { name: "BA History 2026", versionCode: "2026", effectiveFrom: "2026-06-01", durationYears: 3, semestersPerYear: 2, totalSemesters: 6, termMode: "SEMESTER" });
    expectStatus(curriculum, 201);
    const terms = await request("POST", `/curricula/${curriculum.data.data.id}/generate-terms`, adminB, {});
    expectStatus(terms, 201);
    assert.equal(terms.data.data.length, 6);
    const batch = await request("POST", "/batches", adminB, { name: "History 2026–2029", code: `${tag}-BA26`, admissionYear: 2026, expectedGraduationYear: 2029, startDate: "2026-06-01", endDate: "2029-05-31", programmeId: programme.data.data.id, curriculumVersionId: curriculum.data.data.id });
    expectStatus(batch, 201);
    const programmeEnrollment = await request("POST", `/students/${studentB.id}/programme-enrollments`, adminB, { programmeId: programme.data.data.id, curriculumVersionId: curriculum.data.data.id, batchId: batch.data.data.id, registrationNumber: `${tag}-BA-REG`, admissionDate: "2026-06-01", expectedCompletionDate: "2029-05-31" });
    expectStatus(programmeEnrollment, 201);
    const semesterOne = await request("POST", `/programme-enrollments/${programmeEnrollment.data.data.id}/semester-enrollments`, adminB, { programmeTermId: terms.data.data[0].id, academicYearId: collegeYear.data.data.id, enrollmentDate: "2026-06-01" });
    expectStatus(semesterOne, 201);
    const semesterTwo = await request("POST", `/programme-enrollments/${programmeEnrollment.data.data.id}/semester-enrollments`, adminB, { programmeTermId: terms.data.data[1].id, academicYearId: collegeYear.data.data.id, enrollmentDate: "2026-10-01", status: "WITHDRAWN" });
    expectStatus(semesterTwo, 201);
    const collegeCourse = await request("POST", "/courses", adminB, { name: "World History", code: `${tag}-HIST101`, courseType: "CORE", credits: 3, lectureHours: 3 });
    expectStatus(collegeCourse, 201);
    const courseMapping = await request("POST", `/programme-terms/${terms.data.data[0].id}/courses`, adminB, { courseId: collegeCourse.data.data.id, credits: 3 });
    expectStatus(courseMapping, 201);
    const courseOffering = await request("POST", "/course-offerings", adminB, { code: `${tag}-HIST101-S1`, curriculumCourseId: courseMapping.data.data.id, programmeTermId: terms.data.data[0].id, academicYearId: collegeYear.data.data.id });
    expectStatus(courseOffering, 201);
    expectStatus(await request("POST", `/course-offerings/${courseOffering.data.data.id}/registrations`, adminB, { studentSemesterEnrollmentId: semesterOne.data.data.id, registrationDate: "2026-06-01" }), 201);
    const collegePortal = await request("POST", `/students/${studentB.id}/portal-account`, adminB, { email: `${tag.toLowerCase()}-college-shared@example.test`, password: portalPassword });
    expectStatus(collegePortal, 201);
    assert.equal(collegePortal.data.data.schoolId, schoolB);
    const collegeSession = await login(`${tag.toLowerCase()}-college-shared@example.test`, portalPassword);
    const collegeAcademics = await request("GET", "/students/me/academics", collegeSession.accessToken);
    expectStatus(collegeAcademics, 200);
    assert.equal(collegeAcademics.data.data.institutionType, "COLLEGE");
    assert.equal(collegeAcademics.data.data.current.programme.name, "Bachelor of Arts in History");
    assert.equal(collegeAcademics.data.data.current.department.name, "History and Social Sciences");
    assert.equal(collegeAcademics.data.data.current.batch.admissionYear, 2026);
    assert.equal(collegeAcademics.data.data.current.curriculumVersion.versionCode, "2026");
    assert.equal(collegeAcademics.data.data.current.currentSemesterEnrollment.programmeTerm.semesterNumber, 1);
    assert.equal(collegeAcademics.data.data.current.currentSemesterEnrollment.status, "ACTIVE");
    assert.equal(collegeAcademics.data.data.courseRegistrations.records[0].course.name, "World History");
    assert.equal(Number(collegeAcademics.data.data.courseRegistrations.records[0].course.credits), 3);
    const collegeDashboard = await request("GET", "/students/me/dashboard", collegeSession.accessToken);
    expectStatus(collegeDashboard, 200);
    assert.equal(collegeDashboard.data.data.academicSummary.current.programme.name, "Bachelor of Arts in History");
    await assert.rejects(prisma.student.update({ where: { id: studentB.id }, data: { portalUserId: created.data.data.id } }));

    // Deactivation invalidates current access and refresh sessions; reactivation allows a fresh login.
    const deactivated = await request("PATCH", `/students/${studentA.id}/portal-account/status`, adminA, { status: "INACTIVE" });
    expectStatus(deactivated, 200);
    expectStatus(await request("GET", "/auth/me", updatedPortal.accessToken), 401);
    expectStatus(await request("GET", "/students/me/dashboard", updatedPortal.accessToken), 401);
    expectStatus(await request("GET", "/students/me/academics", updatedPortal.accessToken), 401);
    expectStatus(await request("POST", "/auth/refresh", null, {}, { cookie: updatedPortal.cookie, "x-csrf-token": updatedPortal.csrfToken }), 401);
    expectStatus(await request("POST", "/auth/login", null, { email: portalEmail, password: updatedPortalPassword }), 401);
    expectStatus(await request("PATCH", `/students/${studentA.id}/portal-account/status`, adminA, { status: "ACTIVE" }), 200);
    const reactivated = await login(portalEmail, updatedPortalPassword);
    expectStatus(await request("GET", "/students/me", reactivated.accessToken), 200);

    // Database confirms one-to-one and tenant-scoped account integrity.
    assert.equal(await prisma.student.count({ where: { schoolId: schoolA, portalUserId: created.data.data.id } }), 1);
    const fk = await prisma.$queryRaw`SELECT count(*)::int AS n FROM information_schema.table_constraints WHERE constraint_name='students_schoolId_portalUserId_fkey' AND constraint_type='FOREIGN KEY'`;
    assert.equal(fk[0].n, 1);
  } catch (error) {
    console.error("Phase 5 database integration failure:", error?.stack || error);
    throw error;
  } finally {
    for (const token of tokens) {
      try { await fetch(`${base}/auth/logout`, { method: "POST", headers: { authorization: `Bearer ${token}` } }); } catch {}
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    if (schoolIds.length) {
      const tenant = { schoolId: { in: schoolIds } };
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
      await prisma.student.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.user.deleteMany({ where: { schoolId: { in: schoolIds } } });
      await prisma.school.deleteMany({ where: { id: { in: schoolIds } } });
    }
    if (rootId) await prisma.user.deleteMany({ where: { id: rootId } });
    await redis.closeRedis();
    await prisma.$disconnect();
  }
});

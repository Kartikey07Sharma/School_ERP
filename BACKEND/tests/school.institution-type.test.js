const test = require("node:test");
const assert = require("node:assert/strict");
const repository = require("../src/repositories/school.repository");
const service = require("../src/services/school.service");

test("school profile updates cannot change persisted institution type", async (t) => {
  const oldFind = repository.findSchoolById;
  const oldUpdate = repository.updateSchool;
  let updated = false;
  repository.findSchoolById = async () => ({ id: "school-a", institutionType: "SCHOOL" });
  repository.updateSchool = async (_id, data) => { updated = true; return data; };
  t.after(() => { repository.findSchoolById = oldFind; repository.updateSchool = oldUpdate; });
  await assert.rejects(service.updateSchool("school-a", { name: "College now", institutionType: "COLLEGE" }), { code: "INSTITUTION_TYPE_CHANGE_REQUIRES_MIGRATION" });
  assert.equal(updated, false);
});

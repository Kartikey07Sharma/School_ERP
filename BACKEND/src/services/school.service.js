const AppError = require("../utils/AppError");
const schoolRepository = () => require("../repositories/school.repository");

const createSchool = async (schoolData) => schoolRepository().createSchool(schoolData);

const getSchoolById = async (id) => {
  const school = await schoolRepository().findSchoolById(id);
  if (!school) throw new AppError("School not found", 404, "NOT_FOUND");
  return school;
};

const getSchoolByCode = async (code) => {
  const school = await schoolRepository().findSchoolByCode(code);
  if (!school) throw new AppError("School not found", 404, "NOT_FOUND");
  return school;
};

const getAllSchools = () => schoolRepository().findAllSchools();

const updateSchool = async (id, data) => {
  await getSchoolById(id);
  return schoolRepository().updateSchool(id, data);
};

const changeSchoolStatus = async (id, status) => {
  await getSchoolById(id);
  return schoolRepository().changeSchoolStatus(id, status);
};

module.exports = { createSchool, getSchoolById, getSchoolByCode, getAllSchools, updateSchool, changeSchoolStatus };

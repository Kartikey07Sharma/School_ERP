const schoolRepository = require("../repositories/school.repository");

const createSchool = async (schoolData) => {
  const existingEmail =
    await schoolRepository.findSchoolByEmail(schoolData.email);

  if (existingEmail) {
    throw new Error("School email already exists");
  }

  const existingCode =
    await schoolRepository.findSchoolByCode(schoolData.code);

  if (existingCode) {
    throw new Error("School code already exists");
  }

  const existingPhone =
    await schoolRepository.findSchoolByPhone(schoolData.phone);

  if (existingPhone) {
    throw new Error("School phone already exists");
  }

  return schoolRepository.createSchool(schoolData);
};

const getSchoolById = async (id) => {
  const school = await schoolRepository.findSchoolById(id);

  if (!school) {
    throw new Error("School not found");
  }

  return school;
};

const getSchoolByCode = async (code) => {
  const school = await schoolRepository.findSchoolByCode(code);

  if (!school) {
    throw new Error("School not found");
  }

  return school;
};

const getAllSchools = async () => {
  return schoolRepository.findAllSchools();
};

const changeSchoolStatus = async (id, status) => {
  const school = await schoolRepository.findSchoolById(id);

  if (!school) {
    throw new Error("School not found");
  }

  const allowedStatus = [
    "ACTIVE",
    "INACTIVE",
    "SUSPENDED",
  ];

  if (!allowedStatus.includes(status)) {
    throw new Error("Invalid school status");
  }

  return schoolRepository.changeSchoolStatus(id, status);
};

module.exports = {
  createSchool,
  getSchoolById,
  getSchoolByCode,
  getAllSchools,
  changeSchoolStatus,
};
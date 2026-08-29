const prisma = require("../database/prisma");

/**
 * Create School
 */
const createSchool = async (schoolData) => {
  return prisma.school.create({
    data: schoolData,
  });
};

/**
 * Find School By ID
 */
const findSchoolById = async (id) => {
  return prisma.school.findUnique({
    where: { id },
  });
};

/**
 * Find School By Code
 */
const findSchoolByCode = async (code) => {
  return prisma.school.findUnique({
    where: { code },
  });
};

/**
 * Find School By Email
 */
const findSchoolByEmail = async (email) => {
  return prisma.school.findUnique({
    where: { email },
  });
};

/**
 * Get All Schools
 */
const findAllSchools = async () => {
  return prisma.school.findMany({
    orderBy: {
      createdAt: "desc",
    },
  });
};

/**
 * Update School
 */
const updateSchool = async (id, updateData) => {
  return prisma.school.update({
    where: { id },
    data: updateData,
  });
};

/**
 * Change School Status
 */
const changeSchoolStatus = async (id, status) => {
  return prisma.school.update({
    where: { id },
    data: {
      status,
    },
  });
};


const findSchoolByPhone = async (phone) => {
  return prisma.school.findUnique({
    where: {
      phone,
    },
  });
};

module.exports = {
  createSchool,
  findSchoolById,
  findSchoolByCode,
  findSchoolByEmail,
  findAllSchools,
  updateSchool,
  changeSchoolStatus,
  findSchoolByPhone,
};
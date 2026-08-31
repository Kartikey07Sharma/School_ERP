const prisma = require("../database/prisma");

/**
 * Create User
 */
const createUser = async (userData) => {
  return prisma.user.create({
    data: userData,
  });
};

/**
 * Find User By ID
 */
const findUserById = async (id) => {
  return prisma.user.findUnique({
    where: { id },
    include: {
      school: true,
    },
  });
};

/**
 * Find User By Email
 */
const findUserByEmail = async (email) => {
  return prisma.user.findUnique({
    where: { email },
  });
};

/**
 * Find User By Phone
 */
const findUserByPhone = async (phone) => {
  return prisma.user.findUnique({
    where: { phone },
  });
};

/**
 * Find All Users
 */
const findAllUsers = async () => {
  return prisma.user.findMany({
    include: {
      school: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};

/**
 * Find Users By School
 */
const findUsersBySchool = async (schoolId) => {
  return prisma.user.findMany({
    where: {
      schoolId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};

/**
 * Find Users By Role
 */
const findUsersByRole = async (role) => {
  return prisma.user.findMany({
    where: {
      role,
    },
  });
};

/**
 * Update User
 */
const updateUser = async (id, updateData) => {
  return prisma.user.update({
    where: { id },
    data: updateData,
  });
};

/**
 * Change User Status
 */
const changeUserStatus = async (id, status) => {
  return prisma.user.update({
    where: { id },
    data: {
      status,
    },
  });
};

/**
 * Delete User
 */
const deleteUser = async (id) => {
  return prisma.user.delete({
    where: { id },
  });
};

module.exports = {
  createUser,
  findUserById,
  findUserByEmail,
  findUserByPhone,
  findAllUsers,
  findUsersBySchool,
  findUsersByRole,
  updateUser,
  changeUserStatus,
  deleteUser,
};
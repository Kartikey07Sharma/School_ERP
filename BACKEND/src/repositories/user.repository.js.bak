const prisma = () => require("../database/prisma");

const PUBLIC_USER_SELECT = Object.freeze({
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  schoolId: true,
  createdAt: true,
  updatedAt: true,
});

function scopeWhere(actor) {
  if (actor.role === "SUPER_ADMIN") return {};
  if (!actor.schoolId) return { schoolId: "__no_tenant__" };
  return { schoolId: actor.schoolId };
}

const createUser = (userData) => prisma().user.create({ data: userData, select: PUBLIC_USER_SELECT });

const findUserById = (id, actor) => prisma().user.findFirst({
  where: { id, ...scopeWhere(actor) },
  select: PUBLIC_USER_SELECT,
});

const findUserByEmail = (email, actor) => prisma().user.findFirst({
  where: { email, ...scopeWhere(actor) },
  select: PUBLIC_USER_SELECT,
});

const findAllUsers = (actor) => prisma().user.findMany({
  where: scopeWhere(actor),
  select: PUBLIC_USER_SELECT,
  orderBy: { createdAt: "desc" },
});

const findUsersBySchool = (schoolId, actor) => prisma().user.findMany({
  where: {
    schoolId: actor.role === "SUPER_ADMIN" ? schoolId : actor.schoolId,
  },
  select: PUBLIC_USER_SELECT,
  orderBy: { createdAt: "desc" },
});

const updateUser = (id, updateData) => prisma().user.update({
  where: { id },
  data: updateData,
  select: PUBLIC_USER_SELECT,
});

const changeUserStatus = (id, status) => prisma().user.update({
  where: { id },
  data: { status, authVersion: { increment: 1 } },
  select: PUBLIC_USER_SELECT,
});

const deleteUser = (id) => changeUserStatus(id, "INACTIVE");

module.exports = {
  PUBLIC_USER_SELECT,
  scopeWhere,
  createUser,
  findUserById,
  findUserByEmail,
  findAllUsers,
  findUsersBySchool,
  updateUser,
  changeUserStatus,
  deleteUser,
};

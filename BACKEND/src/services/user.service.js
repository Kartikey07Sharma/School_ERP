const bcrypt = require("bcrypt");
const AppError = require("../utils/AppError");
const { ROLE } = require("../constants/permissions");

const MANAGED_ROLES = new Set(["SCHOOL_ADMIN", "TEACHER"]);

function createUserService({ users: suppliedUsers, schools: suppliedSchools, bcryptLib = bcrypt } = {}) {
  const users = () => suppliedUsers || require("../repositories/user.repository");
  const schools = () => suppliedSchools || require("../repositories/school.repository");
  function requireActorSchool(actor) {
    if (actor.role !== ROLE.SUPER_ADMIN && !actor.schoolId) {
      throw new AppError("Your account is not assigned to a school", 403, "TENANT_REQUIRED");
    }
  }

  function requireManager(actor) {
    if (![ROLE.SUPER_ADMIN, ROLE.SCHOOL_ADMIN].includes(actor?.role)) {
      throw new AppError("You do not have permission to manage users", 403, "FORBIDDEN");
    }
  }

  async function createUser(input, actor) {
    requireManager(actor);
    requireActorSchool(actor);
    if (!MANAGED_ROLES.has(input.role) || (actor.role === ROLE.SCHOOL_ADMIN && input.role === ROLE.SCHOOL_ADMIN)) {
      throw new AppError("This role cannot be assigned through user management", 403, "ROLE_ASSIGNMENT_FORBIDDEN");
    }

    let schoolId;
    if (actor.role === ROLE.SUPER_ADMIN) {
      schoolId = input.schoolId;
      if (!schoolId) throw new AppError("schoolId is required for platform administrators", 400, "SCHOOL_REQUIRED");
    } else {
      if (input.schoolId && input.schoolId !== actor.schoolId) {
        throw new AppError("You cannot create users for another school", 403, "TENANT_FORBIDDEN");
      }
      schoolId = actor.schoolId;
    }

    const school = await schools().findSchoolById(schoolId);
    if (!school) throw new AppError("School not found", 404, "NOT_FOUND");
    const password = await bcryptLib.hash(input.password, 12);
    return users().createUser({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email.trim().toLowerCase(),
      phone: input.phone,
      password,
      role: input.role,
      schoolId,
    });
  }

  async function getUserById(id, actor) {
    requireManager(actor);
    const user = await users().findUserById(id, actor);
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
    return user;
  }

  async function getUserByEmail(email, actor) {
    requireManager(actor);
    const user = await users().findUserByEmail(email.trim().toLowerCase(), actor);
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");
    return user;
  }

  const getAllUsers = (actor) => {
    requireManager(actor);
    return users().findAllUsers(actor);
  };

  async function getUsersBySchool(requestedSchoolId, actor) {
    requireManager(actor);
    requireActorSchool(actor);
    if (actor.role !== ROLE.SUPER_ADMIN && requestedSchoolId && requestedSchoolId !== actor.schoolId) {
      throw new AppError("You cannot access another school's users", 403, "TENANT_FORBIDDEN");
    }
    const schoolId = actor.role === ROLE.SUPER_ADMIN ? requestedSchoolId : actor.schoolId;
    if (!schoolId) return users().findAllUsers(actor);
    const school = await schools().findSchoolById(schoolId);
    if (!school) throw new AppError("School not found", 404, "NOT_FOUND");
    return users().findUsersBySchool(schoolId, actor);
  }

  async function updateUser(id, updateData, actor) {
    requireManager(actor);
    const existing = await getUserById(id, actor);
    if (actor.role === ROLE.SCHOOL_ADMIN && existing.role === ROLE.SCHOOL_ADMIN) {
      throw new AppError("School administrators cannot manage another administrator", 403, "FORBIDDEN");
    }
    return users().updateUser(id, {
      firstName: updateData.firstName,
      lastName: updateData.lastName,
      email: updateData.email
        ? updateData.email.trim().toLowerCase()
        : undefined,
      phone: updateData.phone,
    }, actor);
  }

  async function changeUserStatus(id, status, actor) {
    requireManager(actor);
    const existing = await getUserById(id, actor);
    if (existing.id === actor.id) throw new AppError("You cannot change your own account status", 403, "SELF_MODIFICATION_FORBIDDEN");
    if (actor.role === ROLE.SCHOOL_ADMIN && existing.role === ROLE.SCHOOL_ADMIN) {
      throw new AppError("School administrators cannot manage another administrator", 403, "FORBIDDEN");
    }
    return users().changeUserStatus(id, status, actor);
  }

  async function deleteUser(id, actor) {
    requireManager(actor);
    const existing = await getUserById(id, actor);
    if (existing.id === actor.id) throw new AppError("You cannot deactivate your own account", 403, "SELF_MODIFICATION_FORBIDDEN");
    if (actor.role === ROLE.SCHOOL_ADMIN && existing.role === ROLE.SCHOOL_ADMIN) {
      throw new AppError("School administrators cannot manage another administrator", 403, "FORBIDDEN");
    }
    return users().deleteUser(id, actor);
  }

  return { createUser, getUserById, getUserByEmail, getAllUsers, getUsersBySchool, updateUser, changeUserStatus, deleteUser };
}

module.exports = { ...createUserService(), createUserService };

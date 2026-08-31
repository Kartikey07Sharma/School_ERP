const bcrypt = require("bcrypt");

const userRepository = require("../repositories/user.repository");
const schoolRepository = require("../repositories/school.repository");

/**
 * Create User
 */
const createUser = async (userData) => {
  // Check School Exists
  const school = await schoolRepository.findSchoolById(
    userData.schoolId
  );

  if (!school) {
    throw new Error("School not found");
  }

  // Check Email Exists
  const existingEmail =
    await userRepository.findUserByEmail(userData.email);

  if (existingEmail) {
    throw new Error("User email already exists");
  }

  // Check Phone Exists
  if (userData.phone) {
    const existingPhone =
      await userRepository.findUserByPhone(userData.phone);

    if (existingPhone) {
      throw new Error("User phone already exists");
    }
  }

  // Hash Password
  const hashedPassword = await bcrypt.hash(
    userData.password,
    10
  );

  return userRepository.createUser({
    ...userData,
    password: hashedPassword,
  });
};

/**
 * Get User By ID
 */
const getUserById = async (id) => {
  const user = await userRepository.findUserById(id);

  if (!user) {
    throw new Error("User not found");
  }

  return user;
};

/**
 * Get User By Email
 */
const getUserByEmail = async (email) => {
  const user = await userRepository.findUserByEmail(email);

  if (!user) {
    throw new Error("User not found");
  }

  return user;
};

/**
 * Get All Users
 */
const getAllUsers = async () => {
  return userRepository.findAllUsers();
};

/**
 * Get Users By School
 */
const getUsersBySchool = async (schoolId) => {
  return userRepository.findUsersBySchoolId(schoolId);
};

/**
 * Update User
 */
const updateUser = async (id, updateData) => {
  const existingUser =
    await userRepository.findUserById(id);

  if (!existingUser) {
    throw new Error("User not found");
  }

  // Email Check
  if (updateData.email) {
    const emailUser =
      await userRepository.findUserByEmail(
        updateData.email
      );

    if (emailUser && emailUser.id !== id) {
      throw new Error("Email already exists");
    }
  }

  // Phone Check
  if (updateData.phone) {
    const phoneUser =
      await userRepository.findUserByPhone(
        updateData.phone
      );

    if (phoneUser && phoneUser.id !== id) {
      throw new Error("Phone already exists");
    }
  }

  return userRepository.updateUser(id, updateData);
};

/**
 * Change User Status
 */
const changeUserStatus = async (id, status) => {
  const existingUser =
    await userRepository.findUserById(id);

  if (!existingUser) {
    throw new Error("User not found");
  }

  return userRepository.changeUserStatus(
    id,
    status
  );
};

/**
 * Delete User
 */
const deleteUser = async (id) => {
  const existingUser =
    await userRepository.findUserById(id);

  if (!existingUser) {
    throw new Error("User not found");
  }

  return userRepository.deleteUser(id);
};

module.exports = {
  createUser,
  getUserById,
  getUserByEmail,
  getAllUsers,
  getUsersBySchool,
  updateUser,
  changeUserStatus,
  deleteUser,
};
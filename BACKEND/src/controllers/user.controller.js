const userService = require("../services/user.service");

/**
 * Create User
 * POST /api/users
 */
const createUser = async (req, res, next) => {
  try {
    const user = await userService.createUser(req.body);

    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get User By ID
 * GET /api/users/:id
 */
const getUserById = async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.id);

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get User By Email
 * GET /api/users/email/:email
 */
const getUserByEmail = async (req, res, next) => {
  try {
    const user = await userService.getUserByEmail(
      req.params.email
    );

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get All Users
 * GET /api/users
 */
const getAllUsers = async (req, res, next) => {
  try {
    const users = await userService.getAllUsers();

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Users By School
 * GET /api/users/school/:schoolId
 */
const getUsersBySchool = async (req, res, next) => {
  try {
    const users = await userService.getUsersBySchool(
      req.params.schoolId
    );

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update User
 * PUT /api/users/:id
 */
const updateUser = async (req, res, next) => {
  try {
    const user = await userService.updateUser(
      req.params.id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change User Status
 * PATCH /api/users/:id/status
 */
const changeUserStatus = async (req, res, next) => {
  try {
    const user = await userService.changeUserStatus(
      req.params.id,
      req.body.status
    );

    res.status(200).json({
      success: true,
      message: "User status updated successfully",
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete User
 * DELETE /api/users/:id
 */
const deleteUser = async (req, res, next) => {
  try {
    await userService.deleteUser(req.params.id);

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    next(error);
  }
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
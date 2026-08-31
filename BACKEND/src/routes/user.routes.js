const express = require("express");

const userController = require("../controllers/user.controller");

const validate = require("../middlewares/validate.middleware");

const {
  createUserSchema,
  updateUserSchema,
  changeUserStatusSchema,
} = require("../validations/user.validation");

const router = express.Router();

/**
 * Create User
 * POST /api/users
 */
router.post(
  "/",
  validate(createUserSchema),
  userController.createUser
);

/**
 * Get All Users
 * GET /api/users
 */
router.get(
  "/",
  userController.getAllUsers
);

/**
 * Get Users By School
 * GET /api/users/school/:schoolId
 */
router.get(
  "/school/:schoolId",
  userController.getUsersBySchool
);

/**
 * Get User By Email
 * GET /api/users/email/:email
 */
router.get(
  "/email/:email",
  userController.getUserByEmail
);

/**
 * Get User By ID
 * GET /api/users/:id
 */
router.get(
  "/:id",
  userController.getUserById
);

/**
 * Update User
 * PUT /api/users/:id
 */
router.put(
  "/:id",
  validate(updateUserSchema),
  userController.updateUser
);

/**
 * Change User Status
 * PATCH /api/users/:id/status
 */
router.patch(
  "/:id/status",
  validate(changeUserStatusSchema),
  userController.changeUserStatus
);

/**
 * Delete User
 * DELETE /api/users/:id
 */
router.delete(
  "/:id",
  userController.deleteUser
);

module.exports = router;
const express = require("express");

const userController = require("../controllers/user.controller");

const validate = require("../middlewares/validate.middleware");
const { requireAuth, authorizePermission } = require("../middlewares/auth.middleware");

const {
  createUserSchema,
  updateUserSchema,
  changeUserStatusSchema,
} = require("../validations/user.validation");

const router = express.Router();

router.use(requireAuth);

/**
 * Create User
 * POST /api/users
 */
router.post(
  "/",
  authorizePermission("users:create:school-members"),
  validate(createUserSchema),
  userController.createUser
);

/**
 * Get All Users
 * GET /api/users
 */
router.get(
  "/",
  authorizePermission("users:read:any", "users:read:school"),
  userController.getAllUsers
);

/**
 * Get Users By School
 * GET /api/users/school/:schoolId
 */
router.get(
  "/school/:schoolId",
  authorizePermission("users:read:any", "users:read:school"),
  userController.getUsersBySchool
);

/**
 * Get User By Email
 * GET /api/users/email/:email
 */
router.get(
  "/email/:email",
  authorizePermission("users:read:any", "users:read:school"),
  userController.getUserByEmail
);

/**
 * Get User By ID
 * GET /api/users/:id
 */
router.get(
  "/:id",
  authorizePermission("users:read:any", "users:read:school"),
  userController.getUserById
);

/**
 * Update User
 * PUT /api/users/:id
 */
router.put(
  "/:id",
  authorizePermission("users:update:any", "users:update:school-members"),
  validate(updateUserSchema),
  userController.updateUser
);

/**
 * Change User Status
 * PATCH /api/users/:id/status
 */
router.patch(
  "/:id/status",
  authorizePermission("users:status:any", "users:status:school-members"),
  validate(changeUserStatusSchema),
  userController.changeUserStatus
);

/**
 * Delete User
 * DELETE /api/users/:id
 */
router.delete(
  "/:id",
  authorizePermission("users:deactivate:any", "users:deactivate:school-members"),
  userController.deleteUser
);

module.exports = router;

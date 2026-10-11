const { z } = require("zod");

/**
 * User Roles
 */
const ManagedUserRoleEnum = z.enum([
  "SCHOOL_ADMIN",
  "TEACHER",
  "STUDENT",
  "PARENT",
]);

/**
 * User Status
 */
const UserStatusEnum = z.enum([
  "ACTIVE",
  "INACTIVE",
]);

/**
 * Create User Validation
 */
const createUserSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, "First name must be at least 2 characters")
    .max(100, "First name cannot exceed 100 characters"),

  lastName: z
    .string()
    .trim()
    .max(100, "Last name cannot exceed 100 characters")
    .optional(),

  email: z
    .string()
    .trim()
    .email("Invalid email address"),

  phone: z
    .string()
    .trim()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number cannot exceed 15 digits")
    .optional(),

  password: z.string().min(12).max(72).refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must be at most 72 bytes",
  ),

  role: ManagedUserRoleEnum,

  schoolId: z.string().uuid("Invalid school ID").optional(),
});

/**
 * Update User Validation
 */
const updateUserSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .optional(),

  lastName: z
    .string()
    .trim()
    .max(100)
    .optional(),

  email: z
    .string()
    .trim()
    .email()
    .optional(),

  phone: z
    .string()
    .trim()
    .min(10)
    .max(15)
    .optional(),

}).strict().refine((value) => Object.keys(value).length > 0, "At least one profile field is required");

/**
 * Change User Status Validation
 */
const changeUserStatusSchema = z.object({
  status: UserStatusEnum,
});

module.exports = {
  createUserSchema,
  updateUserSchema,
  changeUserStatusSchema,
  ManagedUserRoleEnum,
};

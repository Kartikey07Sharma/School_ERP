const { z } = require("zod");

/**
 * User Roles
 */
const UserRoleEnum = z.enum([
  "SUPER_ADMIN",
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

  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100, "Password cannot exceed 100 characters"),

  role: UserRoleEnum,

  schoolId: z
    .string()
    .uuid("Invalid school ID"),
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

  role: UserRoleEnum.optional(),

  status: UserStatusEnum.optional(),
});

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
};
const { z } = require("zod");

const email = z.string().trim().email().max(254);
const loginSchema = z.object({
  email,
  password: z.string().min(1).max(256),
});
const refreshSchema = z.object({}).optional();
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(72).refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must be at most 72 bytes",
  ),
});

module.exports = { loginSchema, refreshSchema, changePasswordSchema };

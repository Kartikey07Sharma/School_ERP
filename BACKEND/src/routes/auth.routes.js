const express = require("express");
const controller = require("../controllers/auth.controller");
const validate = require("../middlewares/validate.middleware");
const { requireAuth } = require("../middlewares/auth.middleware");
const { createAuthRateLimiter } = require("../middlewares/authRateLimit.middleware");
const { loginSchema, refreshSchema, changePasswordSchema } = require("../validations/auth.validation");

const router = express.Router();

router.post("/login", createAuthRateLimiter({ kind: "login" }), validate(loginSchema), controller.login);
router.post("/refresh", createAuthRateLimiter({ kind: "refresh" }), validate(refreshSchema), controller.refresh);
router.post("/logout", requireAuth, controller.logout);
router.get("/me", requireAuth, controller.me);
router.patch("/change-password", requireAuth, validate(changePasswordSchema), controller.changePassword);

module.exports = router;

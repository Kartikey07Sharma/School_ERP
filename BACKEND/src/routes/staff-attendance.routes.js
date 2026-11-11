const express = require("express");
const { z } = require("zod");
const { requireAuth, authorizePermission } = require("../middlewares/auth.middleware");
const validate = require("../middlewares/validate.middleware");
const v = require("../validations/staff-attendance.validation");
const c = require("../controllers/staff-attendance.controller");
const router = express.Router();
const read = authorizePermission("employees:read:any", "employees:read:school");
const manage = authorizePermission("employees:manage:any", "employees:manage:school");
function parseQuery(schema = v.query) { return (req, res, next) => { const parsed = schema.safeParse(req.query); if (!parsed.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: parsed.error.issues } }); req.validatedQuery = parsed.data; return next(); }; }
function uuidParam(name) { return (req, res, next) => { if (!z.string().uuid().safeParse(req.params[name]).success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: `Invalid ${name}` } }); return next(); }; }
router.use(requireAuth);
router.get("/me", parseQuery(), c.me);
router.get("/me/summary", parseQuery(), c.meSummary);
router.get("/roster", read, parseQuery(v.roster), c.roster);
router.post("/mark", manage, validate(v.mark), c.mark);
router.get("/summary", read, parseQuery(), c.summary);
router.get("/report", read, parseQuery(), c.report);
router.get("/", read, parseQuery(), c.list);
router.patch("/:attendanceId/check-in", manage, uuidParam("attendanceId"), validate(v.checkIn), c.checkIn);
router.patch("/:attendanceId/check-out", manage, uuidParam("attendanceId"), validate(v.checkOut), c.checkOut);
router.patch("/:attendanceId/correct", manage, uuidParam("attendanceId"), validate(v.correction), c.correct);
router.get("/:attendanceId/audit", read, uuidParam("attendanceId"), parseQuery(), c.audit);
router.get("/:employeeId", read, uuidParam("employeeId"), parseQuery(), c.history);
module.exports = router;

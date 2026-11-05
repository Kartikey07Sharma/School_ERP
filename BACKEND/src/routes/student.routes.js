const express = require("express");
const { z } = require("zod");
const studentController = require("../controllers/student.controller");
const studentImportController = require("../controllers/student-import.controller");
const validate = require("../middlewares/validate.middleware");
const { requireAuth, authorize, authorizePermission } = require("../middlewares/auth.middleware");
const { studentCsvUpload } = require("../middlewares/student-csv-upload.middleware");
const { studentImportQuerySchema } = require("../validations/student-import.validation");
const {
  createStudentSchema,
  updateStudentSchema,
  changeStudentStatusSchema,
  studentQuerySchema,
  createPortalAccountSchema,
  linkPortalAccountSchema,
  portalAccountStatusSchema,
  updateMyStudentProfileSchema,
  portalAcademicQuerySchema,
} = require("../validations/student.validation");

const router = express.Router();
const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query);
  if (!result.success) return res.status(400).json({
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: result.error.issues.map(({ path, message, code }) => ({ path: path.map(String), message, code })),
    },
  });
  req.validatedQuery = result.data;
  return next();
};
const schoolContextSchema = z.object({ schoolId: z.string().uuid().optional() }).strict();
const studentIdParamsSchema = z.object({ id: z.string().uuid() }).strict();
const validateStudentId = (req, res, next) => {
  const result = studentIdParamsSchema.safeParse(req.params);
  if (!result.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid student ID" } });
  return next();
};
const validateImportQuery = (req, res, next) => {
  const result = studentImportQuerySchema.safeParse(req.query);
  if (!result.success) return res.status(400).json({
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Request validation failed",
      details: result.error.issues.map(({ path, message, code }) => ({ path: path.map(String), message, code })),
    },
  });
  req.validatedImportQuery = result.data;
  return next();
};
const validatePortalAcademicQuery = (req, res, next) => {
  const result = portalAcademicQuerySchema.safeParse(req.query);
  if (!result.success) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Request validation failed", details: result.error.issues } });
  req.validatedQuery = result.data;
  return next();
};

router.use(requireAuth);
router.get("/me", authorize("STUDENT"), studentController.getMyStudentProfile);
router.get("/me/dashboard", authorize("STUDENT"), studentController.getMyStudentDashboard);
router.get("/me/academics", authorize("STUDENT"), validatePortalAcademicQuery, studentController.getMyStudentAcademicInformation);
router.patch("/me", authorize("STUDENT"), validate(updateMyStudentProfileSchema), studentController.updateMyStudentProfile);
router.get("/:id/portal-account", validateStudentId, authorizePermission("students:read:any", "students:read:school"), validateQuery(schoolContextSchema), studentController.getPortalAccount);
router.post("/:id/portal-account", validateStudentId, authorizePermission("students:manage:any", "students:manage:school"), validateQuery(schoolContextSchema), validate(createPortalAccountSchema), studentController.createPortalAccount);
router.put("/:id/portal-account", validateStudentId, authorizePermission("students:manage:any", "students:manage:school"), validateQuery(schoolContextSchema), validate(linkPortalAccountSchema), studentController.linkPortalAccount);
router.patch("/:id/portal-account/status", validateStudentId, authorizePermission("students:manage:any", "students:manage:school"), validateQuery(schoolContextSchema), validate(portalAccountStatusSchema), studentController.changePortalAccountStatus);
router.post("/import/preview", authorizePermission("students:manage:any", "students:manage:school"), validateImportQuery, studentCsvUpload, studentImportController.preview);
router.post("/import", authorizePermission("students:manage:any", "students:manage:school"), validateImportQuery, studentCsvUpload, studentImportController.importStudents);
router.post("/", authorizePermission("students:manage:any", "students:manage:school"), validate(createStudentSchema), studentController.createStudent);
router.get("/", authorizePermission("students:read:any", "students:read:school"), validateQuery(studentQuerySchema), studentController.getStudents);
router.get("/:id", validateStudentId, authorizePermission("students:read:any", "students:read:school"), validateQuery(schoolContextSchema), studentController.getStudentById);
router.patch("/:id/status", validateStudentId, authorizePermission("students:manage:any", "students:manage:school"), validateQuery(schoolContextSchema), validate(changeStudentStatusSchema), studentController.changeStudentStatus);
router.patch("/:id", validateStudentId, authorizePermission("students:manage:any", "students:manage:school"), validateQuery(schoolContextSchema), validate(updateStudentSchema), studentController.updateStudent);
router.delete("/:id", validateStudentId, authorizePermission("students:manage:any", "students:manage:school"), validateQuery(schoolContextSchema), studentController.deleteStudent);

module.exports = router;

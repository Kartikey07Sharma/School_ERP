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

router.use(requireAuth);
router.get("/me", authorize("STUDENT"), studentController.getMyStudentProfile);
router.post("/import/preview", authorizePermission("students:manage:any", "students:manage:school"), validateImportQuery, studentCsvUpload, studentImportController.preview);
router.post("/import", authorizePermission("students:manage:any", "students:manage:school"), validateImportQuery, studentCsvUpload, studentImportController.importStudents);
router.post("/", authorizePermission("students:manage:any", "students:manage:school"), validate(createStudentSchema), studentController.createStudent);
router.get("/", authorizePermission("students:read:any", "students:read:school"), validateQuery(studentQuerySchema), studentController.getStudents);
router.get("/:id", authorizePermission("students:read:any", "students:read:school"), validateQuery(schoolContextSchema), studentController.getStudentById);
router.patch("/:id/status", authorizePermission("students:manage:any", "students:manage:school"), validateQuery(schoolContextSchema), validate(changeStudentStatusSchema), studentController.changeStudentStatus);
router.patch("/:id", authorizePermission("students:manage:any", "students:manage:school"), validateQuery(schoolContextSchema), validate(updateStudentSchema), studentController.updateStudent);
router.delete("/:id", authorizePermission("students:manage:any", "students:manage:school"), validateQuery(schoolContextSchema), studentController.deleteStudent);

module.exports = router;

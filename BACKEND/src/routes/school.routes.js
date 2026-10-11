const express = require("express");

const router = express.Router();

const schoolController = require(
  "../controllers/school.controller"
);

const validate = require(
  "../middlewares/validate.middleware"
);
const { requireAuth, authorizePermission } = require("../middlewares/auth.middleware");

const {
  createSchoolSchema,
  updateSchoolSchema,
  changeSchoolStatusSchema,
} = require(
  "../validations/school.validation"
);

router.use(requireAuth, authorizePermission("schools:manage"));

/**
 * Create School
 */
router.post(
  "/",
  validate(createSchoolSchema),
  schoolController.createSchool
);

/**
 * Get All Schools
 */
router.get(
  "/",
  schoolController.getAllSchools
);

/**
 * Get School By ID
 */
router.get(
  "/:id",
  schoolController.getSchoolById
);

/**
 * Update School
 */
router.patch(
  "/:id",
  validate(updateSchoolSchema),
  schoolController.updateSchool
);

/**
 * Change School Status
 */
router.patch(
  "/:id/status",
  validate(changeSchoolStatusSchema),
  schoolController.changeSchoolStatus
);

module.exports = router;

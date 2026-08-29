const express = require("express");

const router = express.Router();

const schoolController = require(
  "../controllers/school.controller"
);

const validate = require(
  "../middlewares/validate.middleware"
);

const {
  createSchoolSchema,
} = require(
  "../validations/school.validation"
);

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
  schoolController.updateSchool
);

/**
 * Change School Status
 */
router.patch(
  "/:id/status",
  schoolController.changeSchoolStatus
);

module.exports = router;
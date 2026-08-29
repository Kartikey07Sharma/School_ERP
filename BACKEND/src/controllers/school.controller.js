const schoolService = require("../services/school.service");

/**
 * Create School
 */
const createSchool = async (req, res, next) => {
  try {
    const school = await schoolService.createSchool(req.body);

    res.status(201).json({
      success: true,
      message: "School created successfully",
      data: school,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get All Schools
 */
const getAllSchools = async (req, res, next) => {
  try {
    const schools = await schoolService.getAllSchools();

    res.status(200).json({
      success: true,
      count: schools.length,
      data: schools,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get School By ID
 */
const getSchoolById = async (req, res, next) => {
  try {
    const school = await schoolService.getSchoolById(
      req.params.id
    );

    res.status(200).json({
      success: true,
      data: school,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update School
 */
const updateSchool = async (req, res, next) => {
  try {
    const school = await schoolService.updateSchool(
      req.params.id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: "School updated successfully",
      data: school,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change School Status
 */
const changeSchoolStatus = async (req, res, next) => {
  try {
    const school =
      await schoolService.changeSchoolStatus(
        req.params.id,
        req.body.status
      );

    res.status(200).json({
      success: true,
      message: "School status updated successfully",
      data: school,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createSchool,
  getAllSchools,
  getSchoolById,
  updateSchool,
  changeSchoolStatus,
};
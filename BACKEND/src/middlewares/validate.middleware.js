const validate = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: result.error.issues.map(({ path, message, code }) => ({
            path: path.map(String),
            message,
            code,
          })),
        },
      });
    }

    req.body = result.data;
    next();
  };
};

module.exports = validate;

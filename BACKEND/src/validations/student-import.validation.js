const { z } = require("zod");

const studentImportQuerySchema = z.object({
  schoolId: z.string().uuid().optional(),
}).strict();

module.exports = { studentImportQuerySchema };

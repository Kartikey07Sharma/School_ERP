const service = require("../services/college.service");
const run = (fn, status = 200) => async (req, res, next) => { try { const data = await fn(req); res.status(status).json({ success: true, data }); } catch (error) { next(error); } };
exports.list = (entity) => run((r) => service.list(entity, r.user, r.validatedQuery));
exports.create = (entity) => run((r) => service.create(entity, r.body, r.user, r.validatedQuery.schoolId), 201);
exports.get = (entity) => run((r) => service.get(entity, r.params.id, r.user, r.validatedQuery.schoolId));
exports.update = (entity, idParam = "id") => run((r) => service.update(entity, r.params[idParam], r.body, r.user, r.validatedQuery.schoolId));
exports.generateTerms = run((r) => service.generateTerms(r.params.curriculumId, r.user, r.validatedQuery.schoolId), 201);

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const branch_controller_1 = require("../controllers/branch.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/', branch_controller_1.getBranches);
router.get('/:id', branch_controller_1.getBranch);
router.post('/', (0, auth_middleware_1.authorize)('ADMIN', 'SUPERADMIN'), branch_controller_1.createBranch);
router.put('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'SUPERADMIN'), branch_controller_1.updateBranch);
router.delete('/:id', (0, auth_middleware_1.authorize)('ADMIN', 'SUPERADMIN'), branch_controller_1.deleteBranch);
exports.default = router;
//# sourceMappingURL=branch.routes.js.map
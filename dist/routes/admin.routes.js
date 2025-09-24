"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_controller_1 = require("../controllers/admin.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/', (0, auth_middleware_1.authorize)('SUPERADMIN'), admin_controller_1.getAdmins);
router.get('/stats', (0, auth_middleware_1.authorize)('SUPERADMIN'), admin_controller_1.getSuperAdminStats);
router.get('/:createdBy/users', (0, auth_middleware_1.authorize)('SUPERADMIN'), admin_controller_1.getAdminUsers);
router.post('/', (0, auth_middleware_1.authorize)('SUPERADMIN'), admin_controller_1.createAdmin);
router.get('/:id', (0, auth_middleware_1.authorize)('SUPERADMIN'), admin_controller_1.getAdmin);
router.put('/:id', (0, auth_middleware_1.authorize)('SUPERADMIN'), admin_controller_1.updateAdmin);
router.delete('/:id', (0, auth_middleware_1.authorize)('SUPERADMIN'), admin_controller_1.deleteAdmin);
exports.default = router;
//# sourceMappingURL=admin.routes.js.map
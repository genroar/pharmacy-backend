"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const role_middleware_1 = require("../middleware/role.middleware");
const role_controller_1 = require("../controllers/role.controller");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/roles', (0, role_middleware_1.requireRole)('SUPERADMIN', 'PRODUCT_OWNER'), role_controller_1.getRoles);
router.get('/roles/:role/permissions', (0, role_middleware_1.requireRole)('SUPERADMIN', 'PRODUCT_OWNER'), role_controller_1.getRolePermissions);
router.get('/permissions', role_controller_1.getUserPermissions);
router.get('/check-permission', role_controller_1.checkPermission);
router.get('/resources/:resource/actions', role_controller_1.getAllowedActions);
router.put('/users/:userId/role', (0, role_middleware_1.requireRole)('SUPERADMIN', 'PRODUCT_OWNER'), role_controller_1.updateUserRole);
exports.default = router;
//# sourceMappingURL=role.routes.js.map
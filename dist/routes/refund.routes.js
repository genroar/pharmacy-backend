"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const refund_controller_1 = require("../controllers/refund.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const role_middleware_1 = require("../middleware/role.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.post('/', (0, role_middleware_1.requireRole)('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER'), refund_controller_1.createRefund);
router.get('/', (0, role_middleware_1.requireRole)('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER'), refund_controller_1.getRefunds);
router.get('/:id', (0, role_middleware_1.requireRole)('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER'), refund_controller_1.getRefundById);
exports.default = router;
//# sourceMappingURL=refund.routes.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const report_controller_1 = require("../controllers/report.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/sales', (0, auth_middleware_1.authorize)('CASHIER', 'MANAGER', 'ADMIN', 'SUPERADMIN'), report_controller_1.getSalesReport);
router.get('/inventory', (0, auth_middleware_1.authorize)('CASHIER', 'MANAGER', 'ADMIN', 'SUPERADMIN'), report_controller_1.getInventoryReport);
router.get('/customers', (0, auth_middleware_1.authorize)('MANAGER', 'ADMIN', 'SUPERADMIN'), report_controller_1.getCustomerReport);
router.get('/products', (0, auth_middleware_1.authorize)('CASHIER', 'MANAGER', 'ADMIN', 'SUPERADMIN'), report_controller_1.getProductPerformanceReport);
router.get('/top-products', (0, auth_middleware_1.authorize)('CASHIER', 'MANAGER', 'ADMIN', 'SUPERADMIN'), report_controller_1.getTopSellingProducts);
router.get('/payment-methods', (0, auth_middleware_1.authorize)('CASHIER', 'MANAGER', 'ADMIN', 'SUPERADMIN'), report_controller_1.getSalesByPaymentMethod);
router.get('/dashboard', (0, auth_middleware_1.authorize)('CASHIER', 'MANAGER', 'ADMIN', 'SUPERADMIN'), report_controller_1.getDashboardData);
exports.default = router;
//# sourceMappingURL=report.routes.js.map
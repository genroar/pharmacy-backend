"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const dashboard_controller_1 = require("../controllers/dashboard.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/stats', dashboard_controller_1.getDashboardStats);
router.get('/chart', dashboard_controller_1.getSalesChart);
router.get('/admin-stats', dashboard_controller_1.getAdminDashboardStats);
router.get('/top-products', dashboard_controller_1.getTopSellingProducts);
router.get('/sales-by-payment', dashboard_controller_1.getSalesByPaymentMethod);
exports.default = router;
//# sourceMappingURL=dashboard.routes.js.map
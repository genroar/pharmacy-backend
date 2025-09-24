"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const customer_controller_1 = require("../controllers/customer.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/', customer_controller_1.getCustomers);
router.get('/:id', customer_controller_1.getCustomer);
router.get('/:id/purchase-history', customer_controller_1.getCustomerPurchaseHistory);
router.post('/', (0, auth_middleware_1.authorize)('MANAGER', 'ADMIN', 'SUPERADMIN', 'CASHIER'), customer_controller_1.createCustomer);
router.put('/:id', (0, auth_middleware_1.authorize)('MANAGER', 'ADMIN', 'SUPERADMIN'), customer_controller_1.updateCustomer);
router.delete('/:id', (0, auth_middleware_1.authorize)('MANAGER', 'ADMIN', 'SUPERADMIN'), customer_controller_1.deleteCustomer);
exports.default = router;
//# sourceMappingURL=customer.routes.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supplier_controller_1 = require("../controllers/supplier.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/', supplier_controller_1.getSuppliers);
router.get('/:id', supplier_controller_1.getSupplier);
router.post('/', (0, auth_middleware_1.authorize)('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'PHARMACIST'), supplier_controller_1.createSupplier);
router.put('/:id', (0, auth_middleware_1.authorize)('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'PHARMACIST'), supplier_controller_1.updateSupplier);
router.delete('/:id', (0, auth_middleware_1.authorize)('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'PHARMACIST'), supplier_controller_1.deleteSupplier);
exports.default = router;
//# sourceMappingURL=supplier.routes.js.map
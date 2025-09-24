"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const category_controller_1 = require("../controllers/category.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/', category_controller_1.getCategories);
router.get('/:id', category_controller_1.getCategory);
router.post('/', (0, auth_middleware_1.authorize)('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'PHARMACIST'), category_controller_1.createCategory);
router.put('/:id', (0, auth_middleware_1.authorize)('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'PHARMACIST'), category_controller_1.updateCategory);
router.delete('/:id', (0, auth_middleware_1.authorize)('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'PHARMACIST'), category_controller_1.deleteCategory);
exports.default = router;
//# sourceMappingURL=category.routes.js.map
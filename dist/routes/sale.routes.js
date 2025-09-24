"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sale_controller_1 = require("../controllers/sale.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/', sale_controller_1.getSales);
router.get('/:id', sale_controller_1.getSale);
router.get('/receipt/:receiptNumber', sale_controller_1.getSaleByReceiptNumber);
router.get('/receipts', sale_controller_1.getAvailableReceiptNumbers);
router.post('/', sale_controller_1.createSale);
exports.default = router;
//# sourceMappingURL=sale.routes.js.map
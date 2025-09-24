"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const subscription_controller_1 = require("../controllers/subscription.controller");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/', subscription_controller_1.getSubscription);
router.put('/', subscription_controller_1.updateSubscription);
router.get('/payment-methods', subscription_controller_1.getPaymentMethods);
router.post('/payment-methods', subscription_controller_1.addPaymentMethod);
router.put('/payment-methods/:methodId/default', subscription_controller_1.setDefaultPaymentMethod);
router.delete('/payment-methods/:methodId', subscription_controller_1.deletePaymentMethod);
router.get('/billing-history', subscription_controller_1.getBillingHistory);
router.get('/invoices/:invoiceId/download', subscription_controller_1.downloadInvoice);
exports.default = router;
//# sourceMappingURL=subscription.routes.js.map
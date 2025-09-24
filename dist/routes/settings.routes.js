"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const settings_controller_1 = require("../controllers/settings.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/', (0, auth_middleware_1.authorize)('ADMIN', 'SUPERADMIN'), settings_controller_1.getSettings);
router.put('/', (0, auth_middleware_1.authorize)('ADMIN', 'SUPERADMIN'), settings_controller_1.updateSettings);
router.get('/tax-rate', settings_controller_1.getTaxRate);
exports.default = router;
//# sourceMappingURL=settings.routes.js.map
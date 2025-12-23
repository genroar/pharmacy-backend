"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post('/login', auth_controller_1.login);
router.post('/register', auth_controller_1.register);
router.post('/forgot-password', auth_controller_1.forgotPassword);
router.get('/profile', auth_middleware_1.authenticate, auth_controller_1.getProfile);
router.post('/change-password', auth_middleware_1.authenticate, auth_controller_1.changePassword);
router.put('/update-profile', auth_middleware_1.authenticate, auth_controller_1.updateProfile);
router.post('/reset-password', auth_middleware_1.authenticate, auth_controller_1.resetPassword);
router.get('/check-status', auth_middleware_1.authenticate, auth_controller_1.checkAccountStatus);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map
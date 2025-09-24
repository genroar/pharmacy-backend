"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_controller_1 = require("../controllers/user.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
router.get('/', (0, auth_middleware_1.authorize)('MANAGER', 'ADMIN', 'SUPERADMIN'), user_controller_1.getUsers);
router.get('/:id', (0, auth_middleware_1.authorize)('MANAGER', 'ADMIN', 'SUPERADMIN'), user_controller_1.getUser);
router.post('/', (0, auth_middleware_1.authorize)('MANAGER', 'ADMIN', 'SUPERADMIN'), user_controller_1.createUser);
router.put('/:id', (0, auth_middleware_1.authorize)('MANAGER', 'ADMIN', 'SUPERADMIN'), user_controller_1.updateUser);
router.delete('/:id', (0, auth_middleware_1.authorize)('MANAGER', 'ADMIN', 'SUPERADMIN'), user_controller_1.deleteUser);
exports.default = router;
//# sourceMappingURL=user.routes.js.map
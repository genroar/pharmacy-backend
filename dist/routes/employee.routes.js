"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const employee_controller_1 = require("../controllers/employee.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
router.get('/', employee_controller_1.getEmployees);
router.get('/stats', employee_controller_1.getEmployeeStats);
router.get('/:id', employee_controller_1.getEmployee);
router.post('/', employee_controller_1.createEmployee);
router.put('/:id', employee_controller_1.updateEmployee);
router.delete('/:id', employee_controller_1.deleteEmployee);
exports.default = router;
//# sourceMappingURL=employee.routes.js.map
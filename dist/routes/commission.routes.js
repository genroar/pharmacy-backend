"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const commission_controller_1 = require("../controllers/commission.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
router.post('/calculate', commission_controller_1.calculateCommission);
router.get('/', commission_controller_1.getCommissions);
router.get('/stats', commission_controller_1.getCommissionStats);
router.get('/performance/:employeeId', commission_controller_1.getEmployeePerformance);
router.get('/:id', commission_controller_1.getCommission);
router.put('/:id', commission_controller_1.updateCommission);
exports.default = router;
//# sourceMappingURL=commission.routes.js.map
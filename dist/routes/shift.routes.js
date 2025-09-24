"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const shift_controller_1 = require("../controllers/shift.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
router.post('/start', shift_controller_1.startShift);
router.post('/end', shift_controller_1.endShift);
router.get('/', shift_controller_1.getShifts);
router.get('/active/:employeeId', shift_controller_1.getActiveShift);
router.get('/stats', shift_controller_1.getShiftStats);
router.put('/:id', shift_controller_1.updateShift);
exports.default = router;
//# sourceMappingURL=shift.routes.js.map
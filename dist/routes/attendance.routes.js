"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const attendance_controller_1 = require("../controllers/attendance.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.authenticate);
router.post('/check-in', attendance_controller_1.checkIn);
router.post('/check-out', attendance_controller_1.checkOut);
router.get('/', attendance_controller_1.getAttendance);
router.get('/today/:employeeId', attendance_controller_1.getTodayAttendance);
router.get('/stats', attendance_controller_1.getAttendanceStats);
router.put('/:id', attendance_controller_1.updateAttendance);
exports.default = router;
//# sourceMappingURL=attendance.routes.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAttendanceStats = exports.updateAttendance = exports.getTodayAttendance = exports.getAttendance = exports.checkOut = exports.checkIn = void 0;
const client_1 = require("@prisma/client");
const joi_1 = __importDefault(require("joi"));
const prisma = new client_1.PrismaClient();
const checkInSchema = joi_1.default.object({
    employeeId: joi_1.default.string().required(),
    branchId: joi_1.default.string().required(),
    notes: joi_1.default.string().optional()
});
const checkOutSchema = joi_1.default.object({
    attendanceId: joi_1.default.string().required(),
    notes: joi_1.default.string().optional()
});
const updateAttendanceSchema = joi_1.default.object({
    status: joi_1.default.string().valid('PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'LEAVE').optional(),
    notes: joi_1.default.string().optional()
});
const checkIn = async (req, res) => {
    try {
        const { error } = checkInSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const { employeeId, branchId, notes } = req.body;
        const employee = await prisma.employee.findUnique({
            where: { id: employeeId },
            include: { branch: true }
        });
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }
        if (!employee.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Employee is not active'
            });
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const existingAttendance = await prisma.attendance.findFirst({
            where: {
                employeeId,
                checkIn: {
                    gte: today,
                    lt: tomorrow
                },
                checkOut: null
            }
        });
        if (existingAttendance) {
            return res.status(400).json({
                success: false,
                message: 'Employee is already checked in today'
            });
        }
        const attendance = await prisma.attendance.create({
            data: {
                employeeId,
                branchId,
                checkIn: new Date(),
                status: 'PRESENT',
                notes
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        position: true
                    }
                },
                branch: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        return res.status(201).json({
            success: true,
            data: attendance,
            message: 'Check-in successful'
        });
    }
    catch (error) {
        console.error('Error checking in employee:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.checkIn = checkIn;
const checkOut = async (req, res) => {
    try {
        const { error } = checkOutSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const { attendanceId, notes } = req.body;
        const attendance = await prisma.attendance.findUnique({
            where: { id: attendanceId },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        position: true
                    }
                },
                branch: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        if (!attendance) {
            return res.status(404).json({
                success: false,
                message: 'Attendance record not found'
            });
        }
        if (attendance.checkOut) {
            return res.status(400).json({
                success: false,
                message: 'Employee is already checked out'
            });
        }
        const checkOutTime = new Date();
        const checkInTime = new Date(attendance.checkIn);
        const totalHours = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
        const updatedAttendance = await prisma.attendance.update({
            where: { id: attendanceId },
            data: {
                checkOut: checkOutTime,
                totalHours: Math.round(totalHours * 100) / 100,
                notes: notes || attendance.notes
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        position: true
                    }
                },
                branch: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        return res.json({
            success: true,
            data: updatedAttendance,
            message: 'Check-out successful'
        });
    }
    catch (error) {
        console.error('Error checking out employee:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.checkOut = checkOut;
const getAttendance = async (req, res) => {
    try {
        const { page = 1, limit = 10, employeeId = '', branchId = '', startDate = '', endDate = '', status = '' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = {};
        if (employeeId) {
            where.employeeId = employeeId;
        }
        if (branchId) {
            where.branchId = branchId;
        }
        if (status) {
            where.status = status;
        }
        if (startDate || endDate) {
            where.checkIn = {};
            if (startDate) {
                where.checkIn.gte = new Date(startDate);
            }
            if (endDate) {
                const endDateObj = new Date(endDate);
                endDateObj.setHours(23, 59, 59, 999);
                where.checkIn.lte = endDateObj;
            }
        }
        const [attendance, total] = await Promise.all([
            prisma.attendance.findMany({
                where,
                skip,
                take,
                include: {
                    employee: {
                        select: {
                            id: true,
                            name: true,
                            employeeId: true,
                            position: true
                        }
                    },
                    branch: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                orderBy: { checkIn: 'desc' }
            }),
            prisma.attendance.count({ where })
        ]);
        return res.json({
            success: true,
            data: {
                attendance,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit))
                }
            }
        });
    }
    catch (error) {
        console.error('Error fetching attendance:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getAttendance = getAttendance;
const getTodayAttendance = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const attendance = await prisma.attendance.findFirst({
            where: {
                employeeId,
                checkIn: {
                    gte: today,
                    lt: tomorrow
                }
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        position: true
                    }
                },
                branch: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        return res.json({
            success: true,
            data: attendance
        });
    }
    catch (error) {
        console.error('Error fetching today\'s attendance:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getTodayAttendance = getTodayAttendance;
const updateAttendance = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = updateAttendanceSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const updateData = req.body;
        const existingAttendance = await prisma.attendance.findUnique({
            where: { id }
        });
        if (!existingAttendance) {
            return res.status(404).json({
                success: false,
                message: 'Attendance record not found'
            });
        }
        const attendance = await prisma.attendance.update({
            where: { id },
            data: updateData,
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        position: true
                    }
                },
                branch: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        return res.json({
            success: true,
            data: attendance,
            message: 'Attendance updated successfully'
        });
    }
    catch (error) {
        console.error('Error updating attendance:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.updateAttendance = updateAttendance;
const getAttendanceStats = async (req, res) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        const where = {};
        if (branchId) {
            where.branchId = branchId;
        }
        if (startDate || endDate) {
            where.checkIn = {};
            if (startDate) {
                where.checkIn.gte = new Date(startDate);
            }
            if (endDate) {
                const endDateObj = new Date(endDate);
                endDateObj.setHours(23, 59, 59, 999);
                where.checkIn.lte = endDateObj;
            }
        }
        const [totalRecords, presentCount, absentCount, lateCount, halfDayCount, leaveCount] = await Promise.all([
            prisma.attendance.count({ where }),
            prisma.attendance.count({ where: { ...where, status: 'PRESENT' } }),
            prisma.attendance.count({ where: { ...where, status: 'ABSENT' } }),
            prisma.attendance.count({ where: { ...where, status: 'LATE' } }),
            prisma.attendance.count({ where: { ...where, status: 'HALF_DAY' } }),
            prisma.attendance.count({ where: { ...where, status: 'LEAVE' } })
        ]);
        return res.json({
            success: true,
            data: {
                totalRecords,
                presentCount,
                absentCount,
                lateCount,
                halfDayCount,
                leaveCount
            }
        });
    }
    catch (error) {
        console.error('Error fetching attendance stats:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getAttendanceStats = getAttendanceStats;
//# sourceMappingURL=attendance.controller.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getShiftStats = exports.updateShift = exports.getActiveShift = exports.getShifts = exports.endShift = exports.startShift = void 0;
const client_1 = require("@prisma/client");
const joi_1 = __importDefault(require("joi"));
const prisma = new client_1.PrismaClient();
const startShiftSchema = joi_1.default.object({
    employeeId: joi_1.default.string().required(),
    branchId: joi_1.default.string().required(),
    shiftDate: joi_1.default.date().required(),
    startTime: joi_1.default.date().required(),
    openingBalance: joi_1.default.number().min(0).default(0),
    notes: joi_1.default.string().optional()
});
const endShiftSchema = joi_1.default.object({
    shiftId: joi_1.default.string().required(),
    endTime: joi_1.default.date().required(),
    actualBalance: joi_1.default.number().min(0).required(),
    notes: joi_1.default.string().optional()
});
const updateShiftSchema = joi_1.default.object({
    cashIn: joi_1.default.number().min(0).optional(),
    cashOut: joi_1.default.number().min(0).optional(),
    notes: joi_1.default.string().optional()
});
const startShift = async (req, res) => {
    try {
        const { error } = startShiftSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const { employeeId, branchId, shiftDate, startTime, openingBalance, notes } = req.body;
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
        const activeShift = await prisma.shift.findFirst({
            where: {
                employeeId,
                status: 'ACTIVE'
            }
        });
        if (activeShift) {
            return res.status(400).json({
                success: false,
                message: 'Employee already has an active shift'
            });
        }
        const shift = await prisma.shift.create({
            data: {
                employeeId,
                branchId,
                shiftDate: new Date(shiftDate),
                startTime: new Date(startTime),
                openingBalance,
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
            data: shift,
            message: 'Shift started successfully'
        });
    }
    catch (error) {
        console.error('Error starting shift:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.startShift = startShift;
const endShift = async (req, res) => {
    try {
        const { error } = endShiftSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const { shiftId, endTime, actualBalance, notes } = req.body;
        const shift = await prisma.shift.findUnique({
            where: { id: shiftId },
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
        if (!shift) {
            return res.status(404).json({
                success: false,
                message: 'Shift not found'
            });
        }
        if (shift.status !== 'ACTIVE') {
            return res.status(400).json({
                success: false,
                message: 'Shift is not active'
            });
        }
        const expectedBalance = shift.openingBalance + shift.cashIn - shift.cashOut;
        const difference = actualBalance - expectedBalance;
        const updatedShift = await prisma.shift.update({
            where: { id: shiftId },
            data: {
                endTime: new Date(endTime),
                actualBalance,
                expectedBalance,
                difference,
                status: 'COMPLETED',
                notes: notes || shift.notes
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
            data: updatedShift,
            message: 'Shift ended successfully'
        });
    }
    catch (error) {
        console.error('Error ending shift:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.endShift = endShift;
const getShifts = async (req, res) => {
    try {
        const { page = 1, limit = 10, employeeId = '', branchId = '', status = '', startDate = '', endDate = '' } = req.query;
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
            where.shiftDate = {};
            if (startDate) {
                where.shiftDate.gte = new Date(startDate);
            }
            if (endDate) {
                const endDateObj = new Date(endDate);
                endDateObj.setHours(23, 59, 59, 999);
                where.shiftDate.lte = endDateObj;
            }
        }
        const [shifts, total] = await Promise.all([
            prisma.shift.findMany({
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
                orderBy: { shiftDate: 'desc' }
            }),
            prisma.shift.count({ where })
        ]);
        return res.json({
            success: true,
            data: {
                shifts,
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
        console.error('Error fetching shifts:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getShifts = getShifts;
const getActiveShift = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const activeShift = await prisma.shift.findFirst({
            where: {
                employeeId,
                status: 'ACTIVE'
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
            data: activeShift
        });
    }
    catch (error) {
        console.error('Error fetching active shift:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getActiveShift = getActiveShift;
const updateShift = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = updateShiftSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const updateData = req.body;
        const existingShift = await prisma.shift.findUnique({
            where: { id }
        });
        if (!existingShift) {
            return res.status(404).json({
                success: false,
                message: 'Shift not found'
            });
        }
        if (existingShift.status !== 'ACTIVE') {
            return res.status(400).json({
                success: false,
                message: 'Shift is not active'
            });
        }
        const newCashIn = updateData.cashIn !== undefined ? updateData.cashIn : existingShift.cashIn;
        const newCashOut = updateData.cashOut !== undefined ? updateData.cashOut : existingShift.cashOut;
        const expectedBalance = existingShift.openingBalance + newCashIn - newCashOut;
        const shift = await prisma.shift.update({
            where: { id },
            data: {
                ...updateData,
                expectedBalance
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
            data: shift,
            message: 'Shift updated successfully'
        });
    }
    catch (error) {
        console.error('Error updating shift:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.updateShift = updateShift;
const getShiftStats = async (req, res) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        const where = {};
        if (branchId) {
            where.branchId = branchId;
        }
        if (startDate || endDate) {
            where.shiftDate = {};
            if (startDate) {
                where.shiftDate.gte = new Date(startDate);
            }
            if (endDate) {
                const endDateObj = new Date(endDate);
                endDateObj.setHours(23, 59, 59, 999);
                where.shiftDate.lte = endDateObj;
            }
        }
        const [totalShifts, activeShifts, completedShifts, cancelledShifts, totalCashIn, totalCashOut, totalDifference] = await Promise.all([
            prisma.shift.count({ where }),
            prisma.shift.count({ where: { ...where, status: 'ACTIVE' } }),
            prisma.shift.count({ where: { ...where, status: 'COMPLETED' } }),
            prisma.shift.count({ where: { ...where, status: 'CANCELLED' } }),
            prisma.shift.aggregate({
                where: { ...where, status: 'COMPLETED' },
                _sum: { cashIn: true }
            }),
            prisma.shift.aggregate({
                where: { ...where, status: 'COMPLETED' },
                _sum: { cashOut: true }
            }),
            prisma.shift.aggregate({
                where: { ...where, status: 'COMPLETED' },
                _sum: { difference: true }
            })
        ]);
        return res.json({
            success: true,
            data: {
                totalShifts,
                activeShifts,
                completedShifts,
                cancelledShifts,
                totalCashIn: totalCashIn._sum.cashIn || 0,
                totalCashOut: totalCashOut._sum.cashOut || 0,
                totalDifference: totalDifference._sum.difference || 0
            }
        });
    }
    catch (error) {
        console.error('Error fetching shift stats:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getShiftStats = getShiftStats;
//# sourceMappingURL=shift.controller.js.map
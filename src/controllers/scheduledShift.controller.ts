import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Joi from 'joi';

const prisma = new PrismaClient();

// Validation schemas
const createScheduledShiftSchema = Joi.object({
  name: Joi.string().required(),
  startTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  endTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
  date: Joi.date().required(),
  branchId: Joi.string().required(),
  maxUsers: Joi.number().min(1).default(1),
  notes: Joi.string().optional(),
  assignedUserIds: Joi.array().items(Joi.string()).default([])
});

const updateScheduledShiftSchema = Joi.object({
  name: Joi.string().optional(),
  startTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  endTime: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  date: Joi.date().optional(),
  branchId: Joi.string().optional(),
  maxUsers: Joi.number().min(1).optional(),
  notes: Joi.string().optional(),
  assignedUserIds: Joi.array().items(Joi.string()).optional()
});

// Create a new scheduled shift
export const createScheduledShift = async (req: Request, res: Response) => {
  try {
    const { error } = createScheduledShiftSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { name, startTime, endTime, date, branchId, maxUsers, notes, assignedUserIds } = req.body;

    // Check if branch exists
    const branch = await prisma.branch.findUnique({
      where: { id: branchId }
    });

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    // Create the scheduled shift
    const scheduledShift = await prisma.scheduledShift.create({
      data: {
        name,
        startTime,
        endTime,
        date: new Date(date),
        branchId,
        maxUsers,
        notes,
        assignedUsers: {
          create: assignedUserIds.map((userId: string) => ({
            userId
          }))
        }
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true
          }
        },
        assignedUsers: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true
              }
            }
          }
        }
      }
    });

    return res.status(201).json({
      success: true,
      data: scheduledShift,
      message: 'Scheduled shift created successfully'
    });
  } catch (error) {
    console.error('Error creating scheduled shift:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get all scheduled shifts
export const getScheduledShifts = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      branchId = '',
      status = '',
      startDate = '',
      endDate = ''
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: any = {};

    if (branchId) {
      where.branchId = branchId;
    }

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.date = {};
      if (startDate) {
        where.date.gte = new Date(startDate as string);
      }
      if (endDate) {
        const endDateObj = new Date(endDate as string);
        endDateObj.setHours(23, 59, 59, 999);
        where.date.lte = endDateObj;
      }
    }

    const [scheduledShifts, total] = await Promise.all([
      prisma.scheduledShift.findMany({
        where,
        skip,
        take,
        include: {
          branch: {
            select: {
              id: true,
              name: true
            }
          },
          assignedUsers: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  role: true
                }
              }
            }
          }
        },
        orderBy: { date: 'desc' }
      }),
      prisma.scheduledShift.count({ where })
    ]);

    // Transform the data to match frontend expectations
    const transformedShifts = scheduledShifts.map(shift => ({
      id: shift.id,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      date: shift.date.toISOString().split('T')[0],
      branchId: shift.branchId,
      branchName: shift.branch.name,
      assignedUsers: shift.assignedUsers.map(su => ({
        id: su.user.id,
        name: su.user.name,
        role: su.user.role
      })),
      maxUsers: shift.maxUsers,
      status: shift.status.toLowerCase(),
      notes: shift.notes,
      createdAt: shift.createdAt.toISOString(),
      updatedAt: shift.updatedAt.toISOString()
    }));

    return res.json({
      success: true,
      data: transformedShifts,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching scheduled shifts:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get a single scheduled shift
export const getScheduledShift = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const scheduledShift = await prisma.scheduledShift.findUnique({
      where: { id },
      include: {
        branch: {
          select: {
            id: true,
            name: true
          }
        },
        assignedUsers: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true
              }
            }
          }
        }
      }
    });

    if (!scheduledShift) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled shift not found'
      });
    }

    // Transform the data to match frontend expectations
    const transformedShift = {
      id: scheduledShift.id,
      name: scheduledShift.name,
      startTime: scheduledShift.startTime,
      endTime: scheduledShift.endTime,
      date: scheduledShift.date.toISOString().split('T')[0],
      branchId: scheduledShift.branchId,
      branchName: scheduledShift.branch.name,
      assignedUsers: scheduledShift.assignedUsers.map(su => ({
        id: su.user.id,
        name: su.user.name,
        role: su.user.role
      })),
      maxUsers: scheduledShift.maxUsers,
      status: scheduledShift.status.toLowerCase(),
      notes: scheduledShift.notes,
      createdAt: scheduledShift.createdAt.toISOString(),
      updatedAt: scheduledShift.updatedAt.toISOString()
    };

    return res.json({
      success: true,
      data: transformedShift
    });
  } catch (error) {
    console.error('Error fetching scheduled shift:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update a scheduled shift
export const updateScheduledShift = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = updateScheduledShiftSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const updateData = req.body;
    const { assignedUserIds, ...shiftData } = updateData;

    // Check if scheduled shift exists
    const existingShift = await prisma.scheduledShift.findUnique({
      where: { id }
    });

    if (!existingShift) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled shift not found'
      });
    }

    // Update the scheduled shift
    const updatedShift = await prisma.scheduledShift.update({
      where: { id },
      data: {
        ...shiftData,
        ...(shiftData.date && { date: new Date(shiftData.date) }),
        ...(assignedUserIds !== undefined && {
          assignedUsers: {
            deleteMany: {},
            create: assignedUserIds.map((userId: string) => ({
              userId
            }))
          }
        })
      },
      include: {
        branch: {
          select: {
            id: true,
            name: true
          }
        },
        assignedUsers: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true
              }
            }
          }
        }
      }
    });

    // Transform the data to match frontend expectations
    const transformedShift = {
      id: updatedShift.id,
      name: updatedShift.name,
      startTime: updatedShift.startTime,
      endTime: updatedShift.endTime,
      date: updatedShift.date.toISOString().split('T')[0],
      branchId: updatedShift.branchId,
      branchName: updatedShift.branch.name,
      assignedUsers: updatedShift.assignedUsers.map(su => ({
        id: su.user.id,
        name: su.user.name,
        role: su.user.role
      })),
      maxUsers: updatedShift.maxUsers,
      status: updatedShift.status.toLowerCase(),
      notes: updatedShift.notes,
      createdAt: updatedShift.createdAt.toISOString(),
      updatedAt: updatedShift.updatedAt.toISOString()
    };

    return res.json({
      success: true,
      data: transformedShift,
      message: 'Scheduled shift updated successfully'
    });
  } catch (error) {
    console.error('Error updating scheduled shift:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete a scheduled shift
export const deleteScheduledShift = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if scheduled shift exists
    const existingShift = await prisma.scheduledShift.findUnique({
      where: { id }
    });

    if (!existingShift) {
      return res.status(404).json({
        success: false,
        message: 'Scheduled shift not found'
      });
    }

    // Delete the scheduled shift (cascade will handle assigned users)
    await prisma.scheduledShift.delete({
      where: { id }
    });

    return res.json({
      success: true,
      message: 'Scheduled shift deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting scheduled shift:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

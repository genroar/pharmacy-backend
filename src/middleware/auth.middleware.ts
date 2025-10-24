import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
    branchId?: string;
    companyId?: string;
    createdBy?: string; // For data isolation
    selectedCompanyId?: string; // Currently selected company
    selectedBranchId?: string; // Currently selected branch
  };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        role: true,
        branchId: true,
        companyId: true,
        createdBy: true,
        isActive: true
      }
    });

    if (!user) {
      return res.status(401).json({
        message: 'Invalid token or user not found.',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        message: 'Your account has been deactivated. Please contact your administrator.',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // For ADMIN users, if createdBy is null, use their own ID (self-referencing)
    let createdBy = user.createdBy;
    if (user.role === 'ADMIN' && (!createdBy || createdBy === '')) {
      createdBy = user.id;
    }

    // Get context headers from frontend
    const selectedCompanyId = req.header('X-Company-ID');
    const selectedBranchId = req.header('X-Branch-ID');

    // Debug: Log headers
    console.log('🔍 Auth middleware - Headers received:', {
      'X-Company-ID': selectedCompanyId,
      'X-Branch-ID': selectedBranchId,
      'All headers': req.headers
    });

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      branchId: user.branchId || undefined,
      companyId: user.companyId || undefined,
      createdBy: createdBy || undefined,
      selectedCompanyId: selectedCompanyId || undefined,
      selectedBranchId: selectedBranchId || undefined
    };
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token.' });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Access denied. No user found.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'Access denied. Insufficient permissions.'
      });
    }

    return next();
  };
};

/**
 * Helper function to build admin-aware where clauses for data isolation
 * This ensures all database queries are automatically scoped to the correct admin
 */
export const buildAdminWhereClause = (req: AuthRequest, baseWhere: any = {}) => {
  const whereClause = { ...baseWhere };

  // Apply company context filtering if available
  if (req.user?.selectedCompanyId) {
    whereClause.companyId = req.user.selectedCompanyId;
    console.log('🏢 Adding company context to where clause:', req.user.selectedCompanyId);
  }

  // SUPERADMIN can access all data (but still filtered by company if selected)
  if (req.user?.role === 'SUPERADMIN') {
    return whereClause;
  }

  // All other users are scoped to their admin's data
  if (req.user?.createdBy) {
    return {
      ...whereClause,
      createdBy: req.user.createdBy
    };
  }

  // If no admin context, return empty where clause (will return no results)
  return {
    ...whereClause,
    createdBy: 'non-existent-admin-id' // This will return no results
  };
};

/**
 * Helper function to build branch-aware where clauses
 * This ensures all database queries are automatically scoped to the correct branch
 */
export const buildBranchWhereClause = (req: AuthRequest, baseWhere: any = {}) => {
  const whereClause = { ...baseWhere };

  // Apply company context filtering if available
  if (req.user?.selectedCompanyId) {
    whereClause.companyId = req.user.selectedCompanyId;
    console.log('🏢 Adding company context to branch where clause:', req.user.selectedCompanyId);
  }

  // SUPERADMIN can access all data (but still filtered by company if selected)
  if (req.user?.role === 'SUPERADMIN') {
    return whereClause;
  }

  // ADMIN can access all branches within their admin scope
  if (req.user?.role === 'ADMIN') {
    return buildAdminWhereClause(req, whereClause);
  }

  // MANAGER can only access data from their assigned branch
  if (req.user?.role === 'MANAGER' && req.user?.branchId) {
    return {
      ...whereClause,
      createdBy: req.user.createdBy,
      branchId: req.user.branchId
    };
  }

  // CASHIER can access all data within their admin group (for shared inventory)
  if (req.user?.role === 'CASHIER' && req.user?.createdBy) {
    return buildAdminWhereClause(req, whereClause);
  }

  // If no admin context, return empty where clause
  return {
    ...whereClause,
    createdBy: 'non-existent-admin-id' // This will return no results
  };
};

/**
 * Helper function to build branch-aware where clauses for models that don't have branchId directly
 * This is used for models like Refund that only have branchId through relations
 */
export const buildBranchWhereClauseForRelation = (req: AuthRequest, baseWhere: any = {}) => {
  const whereClause = { ...baseWhere };

  // Apply company context filtering if available
  if (req.user?.selectedCompanyId) {
    whereClause.companyId = req.user.selectedCompanyId;
    console.log('🏢 Adding company context to relation where clause:', req.user.selectedCompanyId);
  }

  // SUPERADMIN can access all data (but still filtered by company if selected)
  if (req.user?.role === 'SUPERADMIN') {
    return whereClause;
  }

  // ADMIN can access all branches within their admin scope
  if (req.user?.role === 'ADMIN') {
    return buildAdminWhereClause(req, whereClause);
  }

  // MANAGER can only access data from their assigned branch
  if (req.user?.role === 'MANAGER' && req.user?.branchId) {
    return {
      ...whereClause,
      createdBy: req.user.createdBy
      // Note: branchId will be handled through the relation filter
    };
  }

  // CASHIER can access all data within their admin group (for shared inventory)
  if (req.user?.role === 'CASHIER' && req.user?.createdBy) {
    return buildAdminWhereClause(req, whereClause);
  }

  // If no admin context, return empty where clause
  return {
    ...whereClause,
    createdBy: 'non-existent-admin-id' // This will return no results
  };
};

/**
 * Middleware to validate that a resource belongs to the user's admin
 * Use this for operations that access specific resources by ID
 */
export const validateResourceOwnership = (resourceType: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // SUPERADMIN can access any resource
      if (req.user?.role === 'SUPERADMIN') {
        return next();
      }

      const resourceId = req.params.id;
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: 'Resource ID required'
        });
      }

      // Check if resource belongs to user's admin
      const resource = await (prisma as any)[resourceType].findFirst({
        where: {
          id: resourceId,
          createdBy: req.user?.createdBy
        },
        select: { id: true }
      });

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Resource not found or access denied'
        });
      }

      next();
    } catch (error) {
      console.error('Resource ownership validation error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };
};

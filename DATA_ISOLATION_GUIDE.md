# Data Isolation Implementation Guide

## Overview
This guide explains how data isolation is implemented in the pharmacy management system to ensure that each admin can only access and manage their own data.

## Architecture

### 1. Database Schema Changes
- Added `adminId` field to all business entities (products, sales, customers, etc.)
- Each record is linked to an admin who created it
- Unique constraints are scoped per admin (e.g., product SKU is unique per admin, not globally)

### 2. User Hierarchy
```
SUPERADMIN
├── ADMIN 1 (Umair)
│   ├── Branch 1 (Main Branch)
│   │   ├── MANAGER (Ali)
│   │   └── CASHIER (Sara)
│   └── Branch 2 (Secondary Branch)
│       ├── MANAGER (Ahmed)
│       └── CASHIER (Fatima)
└── ADMIN 2 (Hassan)
    ├── Branch 1 (Downtown Branch)
    │   ├── MANAGER (Omar)
    │   └── CASHIER (Layla)
    └── Branch 2 (Uptown Branch)
        ├── MANAGER (Yusuf)
        └── CASHIER (Aisha)
```

### 3. Data Isolation Rules
- **SUPERADMIN**: Can access all data across all admins
- **ADMIN**: Can only access data they created (adminId = their own ID)
- **MANAGER/CASHIER**: Can only access data from their assigned branch within their admin's scope

## Implementation

### 1. Middleware Usage

#### Authentication Middleware
```typescript
import { authenticate, authorize, buildAdminWhereClause, buildBranchWhereClause } from '../middleware/auth.middleware';

// Protect route and extract user context
router.get('/products', authenticate, getProducts);

// Protect route with role-based access
router.post('/products', authenticate, authorize('ADMIN', 'MANAGER'), createProduct);
```

#### Data Isolation Helpers
```typescript
// For admin-scoped queries (ADMIN can see all their data)
const whereClause = buildAdminWhereClause(req, {
  isActive: true,
  categoryId: 'some-category'
});

// For branch-scoped queries (MANAGER/CASHIER can only see their branch data)
const whereClause = buildBranchWhereClause(req, {
  isActive: true,
  status: 'ACTIVE'
});
```

### 2. Controller Implementation

#### Reading Data with Isolation
```typescript
export const getProducts = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;

    // Build where clause with automatic data isolation
    const where: any = buildBranchWhereClause(req, {
      isActive: true
    });

    // Add search filters
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search } }
      ];
    }

    const products = await prisma.product.findMany({
      where,
      include: { category: true, supplier: true },
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit)
    });

    res.json({ success: true, data: products });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
```

#### Creating Data with Isolation
```typescript
export const createProduct = async (req: AuthRequest, res: Response) => {
  try {
    const productData = req.body;

    const product = await prisma.product.create({
      data: {
        ...productData,
        adminId: req.user?.adminId || req.user?.id, // Automatic admin assignment
        branchId: req.user?.branchId || productData.branchId
      },
      include: { category: true, supplier: true }
    });

    res.status(201).json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
```

### 3. Route Protection Examples

#### Admin-Only Routes
```typescript
// Only admins can create branches
router.post('/branches',
  authenticate,
  authorize('ADMIN'),
  createBranch
);

// Only admins can create users
router.post('/users',
  authenticate,
  authorize('ADMIN'),
  createUser
);
```

#### Branch-Scoped Routes
```typescript
// Managers and cashiers can manage products in their branch
router.get('/products',
  authenticate,
  authorize('ADMIN', 'MANAGER', 'CASHIER'),
  getProducts
);

// Only cashiers can process sales
router.post('/sales',
  authenticate,
  authorize('CASHIER'),
  createSale
);
```

## Database Migration

### Running the Migration
```bash
cd backend-pharmachy
npx prisma migrate deploy
```

### Migration Details
The migration adds:
- `adminId` field to all business tables
- Foreign key constraints linking records to admins
- Unique constraints scoped per admin
- Proper indexing for performance

## Testing Data Isolation

### 1. Create Test Data
```typescript
// Create admin 1
const admin1 = await prisma.user.create({
  data: {
    username: 'admin1',
    email: 'admin1@test.com',
    password: 'hashed_password',
    name: 'Admin 1',
    role: 'ADMIN'
  }
});

// Create admin 2
const admin2 = await prisma.user.create({
  data: {
    username: 'admin2',
    email: 'admin2@test.com',
    password: 'hashed_password',
    name: 'Admin 2',
    role: 'ADMIN'
  }
});

// Create products for each admin
const product1 = await prisma.product.create({
  data: {
    name: 'Product 1',
    sku: 'PROD001',
    adminId: admin1.id, // Belongs to admin 1
    // ... other fields
  }
});

const product2 = await prisma.product.create({
  data: {
    name: 'Product 2',
    sku: 'PROD001', // Same SKU, but different admin
    adminId: admin2.id, // Belongs to admin 2
    // ... other fields
  }
});
```

### 2. Test Isolation
```typescript
// When admin1 queries products, they should only see product1
// When admin2 queries products, they should only see product2
// SUPERADMIN should see both products
```

## Security Considerations

### 1. Input Validation
- Always validate that `adminId` in requests matches the authenticated user's context
- Use middleware to automatically inject correct `adminId` rather than trusting client input

### 2. Query Security
- Never use raw SQL queries without proper `adminId` filtering
- Always use the provided helper functions for building where clauses

### 3. API Security
- Implement rate limiting per admin
- Log all data access for audit purposes
- Use HTTPS for all API communications

## Performance Optimization

### 1. Database Indexes
```sql
-- Index on adminId for fast filtering
CREATE INDEX idx_products_admin_id ON products(adminId);
CREATE INDEX idx_sales_admin_id ON sales(adminId);
CREATE INDEX idx_customers_admin_id ON customers(adminId);

-- Composite indexes for common queries
CREATE INDEX idx_products_admin_branch ON products(adminId, branchId);
CREATE INDEX idx_sales_admin_date ON sales(adminId, createdAt);
```

### 2. Query Optimization
- Use `select` to limit returned fields
- Implement pagination for large datasets
- Use `include` judiciously to avoid N+1 queries

## Troubleshooting

### Common Issues

1. **"Resource not found" errors**
   - Check if the resource belongs to the correct admin
   - Verify the user has the correct role and permissions

2. **Duplicate key errors**
   - Remember that unique constraints are now scoped per admin
   - Check if you're trying to create a duplicate within the same admin's scope

3. **Empty result sets**
   - Verify the user has the correct `adminId` and `branchId`
   - Check if the data isolation middleware is working correctly

### Debug Mode
Enable debug logging to see the generated where clauses:
```typescript
console.log('Generated where clause:', whereClause);
console.log('User context:', { role: req.user?.role, adminId: req.user?.adminId, branchId: req.user?.branchId });
```

## Best Practices

1. **Always use the helper functions** (`buildAdminWhereClause`, `buildBranchWhereClause`)
2. **Never trust client input** for `adminId` or `branchId`
3. **Test thoroughly** with different user roles and admin contexts
4. **Monitor performance** and add indexes as needed
5. **Document any custom isolation logic** for future developers

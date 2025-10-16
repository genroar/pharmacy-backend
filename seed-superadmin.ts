import { PrismaClient } from '@prisma/client';
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedSuperAdmin() {
  try {
    console.log('🌱 Creating super admin, company, and branch...');

    // Create a company first
    const company = await prisma.company.create({
      data: {
        name: 'MediBill Pulse',
        description: 'Pharmacy Management System',
        address: '123 Healthcare Street, Medical City',
        phone: '+92 300 0000000',
        email: 'info@medibillpulse.com',
        website: 'https://medibillpulse.com',
        isActive: true
      }
    });

    console.log('✅ Company created:', company.id);

    // Create a branch
    const branch = await prisma.branch.create({
      data: {
        name: 'Main Branch',
        address: '123 Main Street, Medical City',
        phone: '+92 300 0000000',
        email: 'main@medibillpulse.com',
        companyId: company.id,
        isActive: true
      }
    });

    console.log('✅ Branch created:', branch.id);

    // Create super admin user
    const hashedPassword = await bcrypt.hash('superadmin123', 12);

    const superAdmin = await prisma.user.create({
      data: {
        username: 'superadmin',
        email: 'superadmin@medibillpulse.com',
        password: hashedPassword,
        name: 'Super Admin',
        role: 'SUPERADMIN',
        branchId: branch.id,
        companyId: company.id,
        isActive: true
      }
    });

    console.log('✅ Super Admin user created:', superAdmin.id);
    console.log('🔑 Login credentials:');
    console.log('   Username: superadmin');
    console.log('   Password: superadmin123');
    console.log('   Email: superadmin@medibillpulse.com');
    console.log('   Role: SUPERADMIN');

    // Also create a regular admin for testing
    const adminHashedPassword = await bcrypt.hash('admin123', 12);

    const admin = await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@medibillpulse.com',
        password: adminHashedPassword,
        name: 'Admin User',
        role: 'ADMIN',
        branchId: branch.id,
        companyId: company.id,
        isActive: true,
        createdBy: superAdmin.id
      }
    });

    console.log('✅ Admin user created:', admin.id);
    console.log('🔑 Admin credentials:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('   Email: admin@medibillpulse.com');
    console.log('   Role: ADMIN');

  } catch (error) {
    console.error('❌ Error creating super admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedSuperAdmin();

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createSuperAdmin() {
  try {
    console.log('🌱 Creating superadmin user...');

    // First, create a company if it doesn't exist
    let company = await prisma.company.findFirst({
      where: { name: 'MediBill Pulse' }
    });

    if (!company) {
      company = await prisma.company.create({
        data: {
          name: 'MediBill Pulse',
          description: 'Pharmacy Management System',
          address: '123 Healthcare Street',
          phone: '+92 300 0000000',
          email: 'info@medibillpulse.com',
          isActive: true
        }
      });
      console.log('✅ Company created:', company.id);
    } else {
      console.log('✅ Company already exists:', company.id);
    }

    // Create a branch if it doesn't exist
    let branch = await prisma.branch.findFirst({
      where: {
        name: 'Main Branch',
        companyId: company.id
      }
    });

    if (!branch) {
      branch = await prisma.branch.create({
        data: {
          name: 'Main Branch',
          address: '123 Main Street',
          phone: '+92 300 0000000',
          email: 'main@medibillpulse.com',
          companyId: company.id,
          isActive: true
        }
      });
      console.log('✅ Branch created:', branch.id);
    } else {
      console.log('✅ Branch already exists:', branch.id);
    }

    // Create superadmin user with password '123456'
    const hashedPassword = await bcrypt.hash('123456', 12);

    const superadmin = await prisma.user.upsert({
      where: { username: 'superadmin' },
      update: {
        password: hashedPassword, // Update password if user exists
        isActive: true
      },
      create: {
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

    console.log('✅ Superadmin user created/updated:', superadmin.id);
    console.log('🔑 Login credentials:');
    console.log('   Username: superadmin');
    console.log('   Password: 123456');
    console.log('   Email: superadmin@medibillpulse.com');
    console.log('   Role: SUPERADMIN');

  } catch (error: any) {
    console.error('❌ Error creating superadmin:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

createSuperAdmin();

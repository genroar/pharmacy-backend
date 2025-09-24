import { PrismaClient } from '@prisma/client';
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedAdmin() {
  try {
    console.log('🌱 Creating admin user and branch...');

    // Create a branch first
    const branch = await prisma.branch.create({
      data: {
        name: 'Main Branch',
        address: '123 Main Street',
        phone: '+92 300 0000000',
        email: 'main@pharmacy.com',
        isActive: true
      }
    });

    console.log('✅ Branch created:', branch.id);

    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', 12);

    const admin = await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@pharmacy.com',
        password: hashedPassword,
        name: 'Admin User',
        role: 'ADMIN',
        branchId: branch.id,
        isActive: true
      }
    });

    console.log('✅ Admin user created:', admin.id);
    console.log('🔑 Login credentials:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('   Email: admin@pharmacy.com');

  } catch (error) {
    console.error('❌ Error creating admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedAdmin();

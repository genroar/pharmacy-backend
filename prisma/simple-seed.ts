import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting simple database seed...');

  const hashedPassword = await bcrypt.hash('password123', 12);

  // Create a branch first
  const branch = await prisma.branch.upsert({
    where: { name: 'Main Branch' },
    update: {},
    create: {
      name: 'Main Branch',
      address: '123 Main Street, City',
      phone: '+92 300 0000000',
      email: 'main@pharmacy.com',
      isActive: true
    }
  });

  // Create users with the branch
  const superadmin = await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: {},
    create: {
      username: 'superadmin',
      email: 'superadmin@medibillpulse.com',
      password: hashedPassword,
      name: 'Super Admin',
      role: 'SUPERADMIN',
      branchId: branch.id,
      createdBy: null
    }
  });

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@medibillpulse.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'ADMIN',
      branchId: branch.id,
      createdBy: superadmin.id
    }
  });

  const manager = await prisma.user.upsert({
    where: { username: 'manager' },
    update: {},
    create: {
      username: 'manager',
      email: 'manager@medibillpulse.com',
      password: hashedPassword,
      name: 'Manager User',
      role: 'MANAGER',
      branchId: branch.id,
      createdBy: admin.id
    }
  });

  const cashier = await prisma.user.upsert({
    where: { username: 'cashier' },
    update: {},
    create: {
      username: 'cashier',
      email: 'cashier@medibillpulse.com',
      password: hashedPassword,
      name: 'Cashier User',
      role: 'CASHIER',
      branchId: branch.id,
      createdBy: admin.id
    }
  });

  console.log('✅ Database seeded successfully!');
  console.log('Users created:');
  console.log('- superadmin (password: password123)');
  console.log('- admin (password: password123)');
  console.log('- manager (password: password123)');
  console.log('- cashier (password: password123)');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting simple seed...');

  // Create a super admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@pharmacy.com' },
    update: {},
    create: {
      username: 'superadmin',
      email: 'admin@pharmacy.com',
      password: hashedPassword,
      name: 'Super Admin',
      role: 'SUPERADMIN',
      isActive: true,
    },
  });

  console.log('✅ Super admin user created:', superAdmin.email);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

const { PrismaClient } = require('@prisma/client');

async function checkDatabase() {
  const prisma = new PrismaClient();

  try {
    console.log('🔍 Checking database connection...');
    await prisma.$connect();
    console.log('✅ Database connection successful');

    console.log('🔍 Checking ScheduledShift table...');
    const shifts = await prisma.scheduledShift.findMany({ take: 5 });
    console.log(`✅ ScheduledShift table accessible, found ${shifts.length} existing shifts`);

    if (shifts.length > 0) {
      console.log('📋 Existing shifts:');
      shifts.forEach(shift => {
        console.log(`  - ${shift.name} (${shift.date}) - ${shift.status}`);
      });
    }

    console.log('🔍 Checking Branch table...');
    const branches = await prisma.branch.findMany({ take: 3 });
    console.log(`✅ Branch table accessible, found ${branches.length} branches`);

    if (branches.length > 0) {
      console.log('📋 Available branches:');
      branches.forEach(branch => {
        console.log(`  - ${branch.name} (ID: ${branch.id})`);
      });
    }

  } catch (error) {
    console.error('❌ Database check failed:', error.message);
    console.error('Full error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearDatabaseExceptUsers() {
  console.log('🚀 Starting database cleanup...');
  console.log('⚠️  This will delete ALL data except users!');

  try {
    // Delete in order to respect foreign key constraints

    // 1. Delete all sale-related data first (in correct order for foreign keys)
    console.log('🗑️  Deleting sale items...');
    await prisma.saleItem.deleteMany();

    console.log('🗑️  Deleting receipts...');
    await prisma.receipt.deleteMany();

    console.log('🗑️  Deleting sales...');
    await prisma.sale.deleteMany();

    console.log('🗑️  Deleting refund items...');
    await prisma.refundItem.deleteMany();

    console.log('🗑️  Deleting refunds...');
    await prisma.refund.deleteMany();

    // 2. Delete purchase-related data
    console.log('🗑️  Deleting purchase items...');
    await prisma.purchaseItem.deleteMany();

    console.log('🗑️  Deleting purchases...');
    await prisma.purchase.deleteMany();

    // 3. Delete inventory-related data
    console.log('🗑️  Deleting batches...');
    await prisma.batch.deleteMany();

    console.log('🗑️  Deleting stock movements...');
    await prisma.stockMovement.deleteMany();

    console.log('🗑️  Deleting products...');
    await prisma.product.deleteMany();

    // 4. Delete customer data
    console.log('🗑️  Deleting customers...');
    await prisma.customer.deleteMany();

    // 5. Delete employee-related data
    console.log('🗑️  Deleting attendance records...');
    await prisma.attendance.deleteMany();

    console.log('🗑️  Deleting commissions...');
    await prisma.commission.deleteMany();

    console.log('🗑️  Deleting shifts...');
    await prisma.shift.deleteMany();

    console.log('🗑️  Deleting scheduled shift users...');
    await prisma.scheduledShiftUser.deleteMany();

    console.log('🗑️  Deleting scheduled shifts...');
    await prisma.scheduledShift.deleteMany();

    console.log('🗑️  Deleting employees...');
    await prisma.employee.deleteMany();

    // 6. Delete organizational data
    console.log('🗑️  Deleting branches...');
    await prisma.branch.deleteMany();

    console.log('🗑️  Deleting companies...');
    await prisma.company.deleteMany();

    // 7. Delete reference data
    console.log('🗑️  Deleting categories...');
    await prisma.category.deleteMany();

    console.log('🗑️  Deleting manufacturers...');
    await prisma.manufacturer.deleteMany();

    console.log('🗑️  Deleting suppliers...');
    await prisma.supplier.deleteMany();

    console.log('🗑️  Deleting shelves...');
    await prisma.shelf.deleteMany();

    // 8. Delete settings
    console.log('🗑️  Deleting settings...');
    await prisma.settings.deleteMany();

    // 9. Delete subscription and card data (but keep users)
    console.log('🗑️  Deleting subscriptions...');
    await prisma.subscriptions.deleteMany();

    console.log('🗑️  Deleting card details...');
    await prisma.card_details.deleteMany();

    console.log('✅ Database cleanup completed successfully!');
    console.log('👥 Users have been preserved.');

    // Show remaining user count
    const userCount = await prisma.user.count();
    console.log(`📊 Remaining users: ${userCount}`);

  } catch (error) {
    console.error('❌ Error during database cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
clearDatabaseExceptUsers()
  .then(() => {
    console.log('🎉 Database cleanup finished!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Database cleanup failed:', error);
    process.exit(1);
  });

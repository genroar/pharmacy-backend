/**
 * Script to fix all controllers to use getPrisma() instead of new PrismaClient()
 * This ensures all controllers use the correct database (SQLite/PostgreSQL)
 */

const fs = require('fs');
const path = require('path');

const controllersDir = path.join(__dirname, '../src/controllers');
const files = fs.readdirSync(controllersDir).filter(f => f.endsWith('.ts') && f !== 'auth.controller.ts');

console.log('🔧 Fixing Prisma imports in controllers...\n');

files.forEach(file => {
  const filePath = path.join(controllersDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Skip if already using getPrisma
  if (content.includes('getPrisma')) {
    console.log(`⏭️  Skipping ${file} - already uses getPrisma`);
    return;
  }

  // Replace import
  if (content.includes("import { PrismaClient } from '@prisma/client';")) {
    content = content.replace(
      /import { PrismaClient[^}]*} from '@prisma\/client';/g,
      "import { getPrisma } from '../utils/db.util';"
    );
    modified = true;
  }

  // Remove const prisma = new PrismaClient();
  if (content.includes('const prisma = new PrismaClient();')) {
    content = content.replace(/const prisma = new PrismaClient\(\);\s*\n/g, '');
    modified = true;
  }

  // Add const prisma = await getPrisma(); at the start of each async function
  // This is a simple pattern - might need manual review
  const functionPattern = /export const (\w+) = async \(req: Request, res: Response\): Promise<void> => \{[\s\S]*?try \{/g;
  const matches = [...content.matchAll(functionPattern)];

  matches.forEach(match => {
    const funcName = match[1];
    const tryIndex = match[0].indexOf('try {');
    if (tryIndex > 0 && !match[0].includes('const prisma = await getPrisma()')) {
      const beforeTry = match[0].substring(0, tryIndex);
      const afterTry = match[0].substring(tryIndex);
      const newFunc = beforeTry + '    const prisma = await getPrisma();\n' + afterTry;
      content = content.replace(match[0], newFunc);
      modified = true;
    }
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Fixed ${file}`);
  } else {
    console.log(`ℹ️  No changes needed for ${file}`);
  }
});

console.log('\n✨ Done! Please review the changes and test your application.');

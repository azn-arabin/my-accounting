import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { loadEnvConfig } from '@next/env';
import { hash } from 'bcryptjs';
import * as schema from './schema';
import { subDays } from 'date-fns';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db = drizzle(pool, { schema });

  console.log('Seed started...');

  // 1. Create admin user
  const passwordHash = await hash('admin123', 10);
  const [admin] = await db.insert(schema.users).values({
    email: 'admin@keepaccounts.app',
    passwordHash,
    name: 'Admin User',
  }).returning();
  
  console.log('Admin user created:', admin.id);

  // 2. Create default accounts
  const accountsData = [
    { name: 'Cash', type: 'cash' as const, icon: 'wallet', color: '#22c55e', userId: admin.id, balance: 1500000 },
    { name: 'Bkash', type: 'mobile_banking' as const, icon: 'smartphone', color: '#e91e8a', userId: admin.id, balance: 500000 },
    { name: 'Bank Account', type: 'bank' as const, icon: 'landmark', color: '#3b82f6', userId: admin.id, balance: 5000000 },
  ];
  const createdAccounts = await db.insert(schema.accounts).values(accountsData).returning();
  console.log('Created accounts:', createdAccounts.length);

  // 3. Create default categories
  const categoriesData = [
    { name: 'Expense', type: 'expense' as const },
    { name: 'Income', type: 'income' as const },
    { name: 'Transfer', type: 'transfer' as const },
  ];
  const rootCategories = await db.insert(schema.categories).values(categoriesData).returning();
  
  const expenseCat = rootCategories.find(c => c.type === 'expense')!;
  const incomeCat = rootCategories.find(c => c.type === 'income')!;
  const transferCat = rootCategories.find(c => c.type === 'transfer')!;

  const subcategoriesData = [
    // Expense subcategories
    { name: 'Food', type: 'expense' as const, parentId: expenseCat.id, icon: 'utensils', color: '#f97316' },
    { name: 'Transport', type: 'expense' as const, parentId: expenseCat.id, icon: 'car', color: '#8b5cf6' },
    { name: 'Utilities', type: 'expense' as const, parentId: expenseCat.id, icon: 'zap', color: '#eab308' },
    { name: 'Shopping', type: 'expense' as const, parentId: expenseCat.id, icon: 'shopping-bag', color: '#ec4899' },
    { name: 'Health', type: 'expense' as const, parentId: expenseCat.id, icon: 'heart-pulse', color: '#ef4444' },
    { name: 'Entertainment', type: 'expense' as const, parentId: expenseCat.id, icon: 'tv', color: '#06b6d4' },
    { name: 'Education', type: 'expense' as const, parentId: expenseCat.id, icon: 'graduation-cap', color: '#6366f1' },
    { name: 'Rent', type: 'expense' as const, parentId: expenseCat.id, icon: 'home', color: '#84cc16' },
    
    // Income subcategories
    { name: 'Salary', type: 'income' as const, parentId: incomeCat.id, icon: 'briefcase', color: '#22c55e' },
    { name: 'Freelance', type: 'income' as const, parentId: incomeCat.id, icon: 'laptop', color: '#3b82f6' },
    { name: 'Investment', type: 'income' as const, parentId: incomeCat.id, icon: 'trending-up', color: '#8b5cf6' },
    { name: 'Other Income', type: 'income' as const, parentId: incomeCat.id, icon: 'plus-circle', color: '#6b7280' },
    
    // Transfer
    { name: 'Account Transfer', type: 'transfer' as const, parentId: transferCat.id, icon: 'arrow-left-right', color: '#64748b' },
  ];
  const mainSubcategories = await db.insert(schema.categories).values(subcategoriesData).returning();

  const getCatId = (name: string) => mainSubcategories.find(c => c.name === name)!.id;

  const thirdLevelCategories = [
    // Food
    { name: 'Restaurant', type: 'expense' as const, parentId: getCatId('Food') },
    { name: 'Groceries', type: 'expense' as const, parentId: getCatId('Food') },
    { name: 'Snacks', type: 'expense' as const, parentId: getCatId('Food') },
    // Transport
    { name: 'Uber/Pathao', type: 'expense' as const, parentId: getCatId('Transport') },
    { name: 'Bus/CNG', type: 'expense' as const, parentId: getCatId('Transport') },
    { name: 'Fuel', type: 'expense' as const, parentId: getCatId('Transport') },
    // Utilities
    { name: 'Electricity', type: 'expense' as const, parentId: getCatId('Utilities') },
    { name: 'Internet', type: 'expense' as const, parentId: getCatId('Utilities') },
    { name: 'Phone', type: 'expense' as const, parentId: getCatId('Utilities') },
    // Shopping
    { name: 'Clothes', type: 'expense' as const, parentId: getCatId('Shopping') },
    { name: 'Electronics', type: 'expense' as const, parentId: getCatId('Shopping') },
    { name: 'Others', type: 'expense' as const, parentId: getCatId('Shopping') },
    // Health
    { name: 'Medicine', type: 'expense' as const, parentId: getCatId('Health') },
    { name: 'Doctor', type: 'expense' as const, parentId: getCatId('Health') },
  ];
  const createdThirdLevel = await db.insert(schema.categories).values(thirdLevelCategories).returning();
  console.log('Created categories hierarchy');

  // 4. Sample transactions
  const restaurantCat = createdThirdLevel.find(c => c.name === 'Restaurant')!;
  const groceriesCat = createdThirdLevel.find(c => c.name === 'Groceries')!;
  const uberCat = createdThirdLevel.find(c => c.name === 'Uber/Pathao')!;
  const electricityCat = createdThirdLevel.find(c => c.name === 'Electricity')!;
  const internetCat = createdThirdLevel.find(c => c.name === 'Internet')!;
  const salaryCat = mainSubcategories.find(c => c.name === 'Salary')!;
  const freelanceCat = mainSubcategories.find(c => c.name === 'Freelance')!;
  const transferAccountCat = mainSubcategories.find(c => c.name === 'Account Transfer')!;

  const expenseCats = [restaurantCat, groceriesCat, uberCat, electricityCat, internetCat];
  const incomeCats = [salaryCat, freelanceCat];
  const descriptions: Record<string, string[]> = {
    'Restaurant': ['Lunch at office', 'Dinner with friends', 'Breakfast biryani'],
    'Groceries': ['Weekly bazaar', 'Vegetables & fish', 'Rice & oil'],
    'Uber/Pathao': ['Office commute', 'Pathao to Gulshan', 'Uber to Dhanmondi'],
    'Electricity': ['DESCO bill Sept', 'DESCO bill Aug'],
    'Internet': ['ISP monthly bill', 'WiFi recharge'],
    'Salary': ['September salary', 'August salary'],
    'Freelance': ['Web project payment', 'UI design gig'],
  };

  const tData = [];
  const today = new Date();
  
  for (let i = 0; i < 25; i++) {
    const rand = Math.random();
    const dayOffset = Math.floor(Math.random() * 30);
    const dateStr = subDays(today, dayOffset).toISOString().split('T')[0];
    
    if (rand < 0.1) {
      // Transfer (10%)
      const amount = Math.floor(Math.random() * 300000) + 50000;
      tData.push({
        amount,
        type: 'transfer' as const,
        categoryId: transferAccountCat.id,
        accountId: createdAccounts[0].id,
        toAccountId: createdAccounts[1].id,
        description: 'Cash to Bkash transfer',
        date: dateStr,
      });
    } else if (rand < 0.3) {
      // Income (20%)
      const cat = incomeCats[Math.floor(Math.random() * incomeCats.length)];
      const descs = descriptions[cat.name] || ['Income'];
      const amount = cat.name === 'Salary' 
        ? 5000000 + Math.floor(Math.random() * 2000000) 
        : 1000000 + Math.floor(Math.random() * 3000000);
      tData.push({
        amount,
        type: 'income' as const,
        categoryId: cat.id,
        accountId: createdAccounts[2].id,
        description: descs[Math.floor(Math.random() * descs.length)],
        date: dateStr,
      });
    } else {
      // Expense (70%)
      const cat = expenseCats[Math.floor(Math.random() * expenseCats.length)];
      const descs = descriptions[cat.name] || ['Expense'];
      const amount = Math.floor(Math.random() * 200000) + 5000;
      tData.push({
        amount,
        type: 'expense' as const,
        categoryId: cat.id,
        accountId: createdAccounts[Math.floor(Math.random() * createdAccounts.length)].id,
        description: descs[Math.floor(Math.random() * descs.length)],
        date: dateStr,
      });
    }
  }

  await db.insert(schema.transactions).values(tData).execute();
  console.log('Created', tData.length, 'sample transactions');

  console.log('✅ Seeding finished successfully!');
  await pool.end();
  process.exit(0);
}

main().catch(e => {
  console.error('❌ Seed failed', e);
  process.exit(1);
});

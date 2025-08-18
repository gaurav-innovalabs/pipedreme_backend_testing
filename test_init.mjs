#!/usr/bin/env node

import componentSystem from './core/ComponentSystem.mjs';

console.log('Testing component system...');
try {
  await componentSystem.init();
  console.log('✓ Init completed');
  
  const apps = await componentSystem.getApps();
  console.log(`✓ Found ${apps.length} apps`);
  
  if (apps.length > 0) {
    console.log('Apps:');
    apps.forEach(app => {
      console.log(`  - ${app.name_slug}: ${app.name}`);
    });
    
    const actions = await componentSystem.getAllActions();
    console.log(`✓ Found ${actions.length} actions total`);
    
    const triggers = await componentSystem.getAllTriggers();
    console.log(`✓ Found ${triggers.length} triggers total`);
  }
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('Stack:', error.stack);
}
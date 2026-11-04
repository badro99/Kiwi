// Load the generated dependencies alongside declarations extracted by a VM harness.
const fs = require('node:fs');
const path = require('node:path');
const blocks = source => [...source.matchAll(/^[ \t]*\/\* GENERATED SHARED (Kiwi\w+) BEGIN \*\/[\s\S]*?^[ \t]*\/\* GENERATED SHARED \1 END \*\//gm)].map(m => m[0]).join('\n');
module.exports = source => {
  let dependencies = blocks(source);
  // Maison imports this generated module; isolated declarations keep that real binding.
  if (/\bloyaltyRewardDiscount\b/.test(source)) {
    if (!dependencies.includes('GENERATED SHARED KiwiLoyaltyRules BEGIN')) dependencies += '\n' + blocks(fs.readFileSync(path.join(__dirname, '../assets/loyalty-rules.js'), 'utf8'));
    dependencies += '\nconst loyaltyRewardDiscount = KiwiLoyaltyRules.rewardDiscount;';
  }
  return dependencies;
};

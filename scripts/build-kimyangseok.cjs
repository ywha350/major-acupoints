const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const input = fs.readFileSync(path.join(__dirname, 'kimyangseok-terms.txt'), 'utf8');
const cards = [];
const seen = new Set();
for (const [index, line] of input.split(/\r?\n/).entries()) {
  if (!line.trim() || line.startsWith('#')) continue;
  const fields = line.split('|').map(value => value.trim());
  if (fields.length !== 6 || fields.some(value => !value)) throw new Error(`Invalid row ${index + 1}`);
  const [tier, section, location, prompt, answer, explanation] = fields;
  if (!/^[ABC]$/.test(tier) || !/[가-힣]/.test(prompt) || /[A-Za-z]/.test(prompt) || !/[A-Za-z]/.test(answer)) throw new Error(`Invalid fields at ${index + 1}`);
  if (seen.has(prompt)) throw new Error(`Duplicate Korean term: ${prompt}`);
  seen.add(prompt);
  const key = crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16);
  cards.push({
    // Stable across row reordering, explanation edits, and tier changes.
    id: `kimyangseok:${key}`, prompt, answer, explanation,
    source: `김양석 의학용어 | ${location.startsWith('녹취') ? location : `PDF ${location.replace(';', '쪽;')}${location.includes(';') ? '' : '쪽'}`} | ${section} | 학습 중요도 ${tier}`,
    section, tier, tags: ['KYS2026', `tier_${tier}`, section],
  });
}
if (new Set(cards.map(card => card.id)).size !== cards.length) throw new Error('Duplicate ID');
for (const tier of ['A', 'B', 'C']) {
  const deck = cards.filter(card => card.tier === tier);
  if (!deck.length) throw new Error(`Empty tier ${tier}`);
  fs.writeFileSync(path.join(root, 'public', 'data', `kimyangseok-${tier.toLowerCase()}.json`), JSON.stringify(deck, null, 2) + '\n');
  console.log(`${tier}: ${deck.length} cards`);
}
console.log(`Total: ${cards.length} unique terms`);

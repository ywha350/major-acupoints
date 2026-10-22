const { execFileSync } = require('node:child_process');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const assert = require('node:assert/strict');

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/import-kimwoojin.cjs <김우진_단어.apkg>');
const directory = mkdtempSync(path.join(tmpdir(), 'kimwoojin-import-'));
let database;
try {
  const databasePath = path.join(directory, 'collection.anki2');
  writeFileSync(databasePath, execFileSync('tar', ['-xOf', path.resolve(source), 'collection.anki2'], { maxBuffer: 32 * 1024 * 1024 }));
  database = new DatabaseSync(databasePath, { readOnly: true });
  const metadata = database.prepare('SELECT models, decks FROM col').get();
  const models = JSON.parse(metadata.models);
  const decks = JSON.parse(metadata.decks);
  const rows = database.prepare('SELECT c.id, c.did, c.ord, n.mid, n.flds, n.tags FROM cards c JOIN notes n ON n.id = c.nid ORDER BY c.id').all();
  const groups = [...new Set(rows.map(row => row.did))].sort();
  assert.equal(groups.length, 3);
  const manifestPath = path.join(__dirname, '../public/data/decks.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const additions = groups.map((did, index) => {
    const letter = ['a', 'b', 'c'][index];
    const id = `kimwoojin-${letter}`;
    const cards = rows.filter(row => row.did === did).map(row => {
      assert.equal(row.ord, 0);
      assert.deepEqual(models[row.mid].flds.map(field => field.name), ['Front', 'BackEnglish', 'Explanation', 'Source']);
      const fields = row.flds.split('\x1f');
      assert.equal(fields.length, 4);
      assert.ok(fields.every(field => field.trim() && !/<\/?[a-z][^>]*>/i.test(field)), 'Missing content or HTML requires review');
      const [prompt, answer, explanation, source] = fields;
      return { id: `${id}:${row.id}`, prompt, answer, explanation, source, tags: row.tags.trim().split(/\s+/).filter(Boolean) };
    });
    assert.equal(new Set(cards.map(card => card.id)).size, cards.length);
    writeFileSync(path.join(__dirname, `../public/data/${id}.json`), JSON.stringify(cards, null, 2) + '\n', 'utf8');
    console.log(`${decks[did].name}: ${cards.length}`);
    return { id, name: decks[did].name, description: '한글 용어 → 영어 · 설명 · 출처', type: 'text', path: `data/${id}.json` };
  });
  writeFileSync(manifestPath, JSON.stringify([...manifest.filter(deck => !additions.some(item => item.id === deck.id)), ...additions], null, 2) + '\n', 'utf8');
} finally {
  database?.close();
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith('kimwoojin-import-'));
  rmSync(directory, { recursive: true, force: true });
}

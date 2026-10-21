const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const assert = require("node:assert/strict");

const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/import-jangbu.cjs <장부생리.apkg>");
const directory = mkdtempSync(path.join(tmpdir(), "jangbu-import-"));
let database;
try {
  const collection = execFileSync("tar", ["-xOf", path.resolve(source), "collection.anki2"], {
    maxBuffer: 32 * 1024 * 1024,
  });
  const databasePath = path.join(directory, "collection.anki2");
  writeFileSync(databasePath, collection);
  database = new DatabaseSync(databasePath, { readOnly: true });
  const metadata = database.prepare("SELECT models, decks FROM col").get();
  const models = JSON.parse(metadata.models);
  const decks = JSON.parse(metadata.decks);
  const rows = database.prepare(`
    SELECT c.id AS cardId, c.did AS deckId, c.ord, n.mid AS modelId, n.flds, n.tags
    FROM cards c JOIN notes n ON n.id = c.nid ORDER BY c.id
  `).all();
  const cards = rows.map((row) => {
    assert.equal(row.ord, 0, "Unexpected card template");
    const names = models[row.modelId].flds.map((field) => field.name);
    assert.deepEqual(names, ["OX 진술", "정답", "해설", "출처"]);
    const fields = row.flds.split("\x1f");
    assert.equal(fields.length, 4);
    const [prompt, answer, explanation, source] = fields;
    assert.ok(prompt && explanation && source, "Missing card content");
    assert.ok(["O", "X"].includes(answer), "Unexpected OX answer");
    assert.ok(fields.every((field) => !/<\/?[a-z][^>]*>/i.test(field)), "HTML content needs review");
    return {
      id: `jangbu:${row.cardId}`,
      prompt,
      answer,
      explanation,
      source,
      section: decks[row.deckId].name.split("::").at(-1).replace(/^\d+\s+/, ""),
      tags: row.tags.trim().split(/\s+/).filter(Boolean),
    };
  });
  assert.ok(cards.length > 0);
  assert.equal(new Set(cards.map((card) => card.id)).size, cards.length);
  const destination = path.join(__dirname, "../public/data/jangbu.json");
  writeFileSync(destination, `${JSON.stringify(cards, null, 2)}\n`, "utf8");
  assert.deepEqual(JSON.parse(readFileSync(destination, "utf8")), cards);
  console.log(`Imported ${cards.length} OX cards; answers, explanations, sources and sections preserved.`);
  console.log(JSON.stringify(cards.reduce((counts, card) => {
    counts[card.section] = (counts[card.section] || 0) + 1;
    return counts;
  }, {})));
} finally {
  database?.close();
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
  assert.ok(path.basename(directory).startsWith("jangbu-import-"));
  rmSync(directory, { recursive: true, force: true });
}

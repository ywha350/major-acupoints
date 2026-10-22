import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const imageCards = JSON.parse(readFileSync("public/data/cards.json", "utf8"));
const oxCards = JSON.parse(readFileSync("public/data/jangbu.json", "utf8"));
const decks = JSON.parse(readFileSync("public/data/decks.json", "utf8"));
const reversedDecks = new Set(decks.filter((deck) => deck.reversed).map((deck) => deck.id));

// A reversed deck shows the English term on the front and the Korean meaning on the back.
function cardFaces(deckId, card) {
  return reversedDecks.has(deckId)
    ? { front: card.answer, back: card.prompt }
    : { front: card.prompt, back: card.answer };
}

async function openDeck(page, id) {
  await page.locator(`[data-deck="${id}"]`).click();
}

async function startAll(page) {
  await page.locator('[data-mode="all"]').click();
  await expect(page.locator(".progress-label")).toBeVisible();
}

async function databaseRows(page, store) {
  return page.evaluate((storeName) => new Promise((resolve, reject) => {
    const open = indexedDB.open("major-acupoints");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = db.transaction(storeName).objectStore(storeName).getAll();
      request.onsuccess = () => { db.close(); resolve(request.result); };
      request.onerror = () => { db.close(); reject(request.error); };
    };
  }), store);
}

// The app must finish init first: opening the database earlier creates an empty
// one and the failed transaction below never settles the promise. The tab bar is
// rendered only after init, so it also means the stores exist on every screen.
async function seedSession(page, deckId, cardId) {
  await expect(page.locator(".deck-tabs")).toBeVisible();
  await page.evaluate(({ deckId, cardId }) => new Promise((resolve, reject) => {
    const open = indexedDB.open("major-acupoints");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const close = () => db.close();
      try {
        const transaction = db.transaction("sessions", "readwrite");
        transaction.objectStore("sessions").put({ mode: `${deckId}:all`, deckId, cardIds: [cardId], index: 0, revealed: true, chosenAnswer: null });
        transaction.oncomplete = () => { close(); resolve(); };
        transaction.onerror = () => { close(); reject(transaction.error); };
        transaction.onabort = () => { close(); reject(transaction.error); };
      } catch (error) {
        close();
        reject(error);
      }
    };
  }), { deckId, cardId });
}

test("home opens both decks and keeps empty review modes usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "오늘은 어떤 덱을 공부할까요?" })).toBeVisible();
  await expect(page.locator(".deck-count")).toHaveText(decks.map(deck => `${JSON.parse(readFileSync(`public/${deck.path}`, 'utf8')).length}장 · 학습 0장`));
  await page.getByRole("button", { name: "장부생리 학습하기", exact: true }).click();
  await expect(page.locator(".menu-title")).toHaveText("장부생리");
  await page.locator('[data-mode="fail"]').click();
  await page.getByRole("button", { name: "실패 카드 없음 · 목록으로" }).click();
  await expect(page.locator(".menu-title")).toHaveText("장부생리");
  await openDeck(page, "acupoints");
  await expect(page.locator(".menu-title")).toHaveText("주요경혈");
  await expect(page.locator('[data-mode="all"] .count')).toHaveText("51");
});

test("OX answers, explanations and independent sessions survive reload and restart", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await openDeck(page, "jangbu");
  await startAll(page);
  const prompt = await page.locator(".statement").textContent();
  const card = oxCards.find((item) => item.prompt === prompt);
  await page.locator(`[data-answer="${card.answer}"]`).click();
  await expect(page.locator(".answer-result")).toContainText("맞았어요");
  await expect(page.locator(".explanation")).toHaveText(card.explanation);
  await expect(page.locator(".source")).toHaveText(card.source);

  await openDeck(page, "acupoints");
  await startAll(page);
  const image = await page.locator(".card img").getAttribute("src");
  await page.getByRole("button", { name: "정답 보기", exact: true }).click();
  await page.locator('[data-grade="middle"]').click();
  await expect(page.locator(".progress-label")).toHaveText("2 / 51");
  await page.reload();
  await openDeck(page, "jangbu");
  await startAll(page);
  await expect(page.locator(".statement")).toHaveText(prompt);
  await expect(page.locator(".answer-value")).toHaveText(`정답 ${card.answer}`);
  await page.locator('[data-grade="perfect"]').click();
  await expect(page.locator(".progress-label")).toHaveText("2 / 321");
  const nextPrompt = await page.locator(".statement").textContent();
  const nextCard = oxCards.find((item) => item.prompt === nextPrompt);
  const wrongAnswer = nextCard.answer === "O" ? "X" : "O";
  await page.keyboard.press(wrongAnswer.toLowerCase());
  await expect(page.locator(".answer-result")).toContainText("다시 확인해 보세요");
  await page.keyboard.press("1");
  await expect(page.locator(".progress-label")).toHaveText("3 / 321");

  await openDeck(page, "jangbu");
  await expect(page.locator('[data-mode="perfect"] .count')).toHaveText("1");
  await expect(page.locator('[data-mode="fail"] .count')).toHaveText("1");
  await expect(page.locator('[data-mode="middle"] .count')).toHaveText("0");
  await page.getByRole("button", { name: "전체 학습 처음부터", exact: true }).click();
  await expect(page.locator(".progress-label")).toHaveText("1 / 321");
  await expect(page.locator(".answer-panel")).toHaveCount(0);
  await openDeck(page, "acupoints");
  await expect(page.locator('[data-mode="middle"] .count')).toHaveText("1");
  await expect(page.locator('[data-mode="perfect"] .count')).toHaveText("0");
  await startAll(page);
  await expect(page.locator(".progress-label")).toHaveText("2 / 51");
  expect((await databaseRows(page, "sessions")).map((row) => row.mode).sort()).toEqual(["all", "jangbu:all"]);
  const rows = await databaseRows(page, "progress");
  expect(rows.find((row) => row.cardId === card.id)?.grade).toBe("perfect");
  expect(rows.find((row) => row.cardId === imageCards.find((item) => image.endsWith(item.frontImage)).id)?.grade).toBe("middle");
  expect(errors).toEqual([]);
});

test("legacy progress and last-card session resume without migration loss", async ({ page }) => {
  // Create the old database before the app loads, using an HTML-only same-origin page.
  await page.route("**/seed", (route) => route.fulfill({ contentType: "text/html", body: "<html></html>" }));
  await page.goto("/seed");
  await page.evaluate((cards) => new Promise((resolve, reject) => {
    const request = indexedDB.open("major-acupoints", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore("progress", { keyPath: "cardId" });
      db.createObjectStore("sessions", { keyPath: "mode" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(["progress", "sessions"], "readwrite");
      transaction.objectStore("progress").put({ cardId: cards[0].id, grade: "perfect" });
      transaction.objectStore("sessions").put({ mode: "all", cardIds: cards.slice(0, 2).map((card) => card.id), index: 1, revealed: true });
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }), imageCards);
  await page.goto("/");
  await openDeck(page, "acupoints");
  await expect(page.locator('[data-mode="perfect"] .count')).toHaveText("1");
  await startAll(page);
  await expect(page.locator(".progress-label")).toHaveText("2 / 2");
  await expect(page.locator(".card img")).toHaveAttribute("src", `./${imageCards[1].backImage}`);
  await page.locator('[data-grade="fail"]').click();
  await expect(page.locator(".menu-title")).toHaveText("주요경혈");
  expect(await databaseRows(page, "sessions")).toEqual([]);
  await expect(page.locator('[data-mode="perfect"] .count')).toHaveText("1");
  await expect(page.locator('[data-mode="fail"] .count')).toHaveText("1");
  await openDeck(page, "jangbu");
  await expect(page.locator('[data-mode="perfect"] .count')).toHaveText("0");
  await expect(page.locator('[data-mode="fail"] .count')).toHaveText("0");
});

test("both decks work offline after the PWA has cached them", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true }));
    }
  });
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find((key) => key.startsWith("major-acupoints-")));
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cached).toContain("/data/jangbu.json");
  for (const letter of ["a", "b", "c"]) expect(cached).toContain(`/data/kimwoojin-${letter}.json`);
  for (const letter of ["a", "b", "c"]) expect(cached).toContain(`/data/kimyangseok-${letter}.json`);
  expect(cached).toContain(`/${imageCards[0].frontImage}`);
  await context.setOffline(true);
  await page.reload();
  for (const letter of ["a", "b", "c"]) {
    await openDeck(page, `kimyangseok-${letter}`);
    await startAll(page);
    await page.getByRole("button", { name: "정답 보기", exact: true }).click();
    await expect(page.locator(".answer-value")).toBeVisible();
    await expect(page.locator(".explanation")).toBeVisible();
  }
  for (const letter of ["a", "b", "c"]) {
    await openDeck(page, `kimwoojin-${letter}`);
    await startAll(page);
    await page.getByRole("button", { name: "정답 보기", exact: true }).click();
    await expect(page.locator(".answer-value")).toBeVisible();
  }
  await openDeck(page, "jangbu");
  await startAll(page);
  await page.locator('[data-answer="O"]').click();
  await expect(page.locator(".explanation")).toBeVisible();
  await page.locator('[data-grade="middle"]').click();
  await expect(page.locator(".progress-label")).toHaveText("2 / 321");
  await openDeck(page, "acupoints");
  await startAll(page);
  await expect.poll(() => page.locator(".card img").evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  await page.getByRole("button", { name: "정답 보기", exact: true }).click();
  await expect.poll(() => page.locator(".card img").evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
});

test("small screens keep navigation and answer controls accessible", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/");
  await page.screenshot({ path: testInfo.outputPath("home.png") });
  await openDeck(page, "jangbu");
  await startAll(page);
  await page.locator('[data-answer="X"]').click();
  await page.screenshot({ path: testInfo.outputPath("ox-answer.png") });
  const layout = await page.evaluate(() => {
    const nav = document.querySelector(".deck-tabs").getBoundingClientRect();
    const actions = document.querySelector(".actions").getBoundingClientRect();
    const card = document.querySelector(".card");
    card.scrollTop = card.scrollHeight;
    const source = document.querySelector(".source").getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > innerWidth,
      navVisible: nav.top >= 0,
      controlsVisible: actions.bottom <= innerHeight && actions.top >= 0,
      sourceAccessible: source.bottom <= actions.top,
    };
  });
  expect(layout).toEqual({ overflow: false, navVisible: true, controlsVisible: true, sourceAccessible: true });
});

for (const author of ['kimwoojin', 'kimyangseok']) {
test(`${author} vocabulary decks reveal fields and preserve separate study records`, async ({ page }) => {
  await page.goto('/');
  const fronts = {};
  for (const letter of ['a', 'b', 'c']) {
    const id = `${author}-${letter}`;
    const cards = JSON.parse(readFileSync(`public/data/${id}.json`, 'utf8'));
    await openDeck(page, id);
    await startAll(page);
    const front = await page.locator('.statement').textContent();
    const card = cards.find(item => cardFaces(id, item).front === front);
    await expect(page.locator('.answer-panel')).toHaveCount(0);
    await page.getByRole('button', { name: '정답 보기', exact: true }).click();
    await expect(page.locator('.answer-value')).toHaveText(cardFaces(id, card).back);
    await expect(page.locator('.explanation')).toHaveText(card.explanation);
    await expect(page.locator('.source')).toHaveText(card.source);
    await page.locator('[data-grade="perfect"]').click();
    await expect(page.locator('.progress-label')).toHaveText(`2 / ${cards.length}`);
    fronts[id] = await page.locator('.statement').textContent();
  }
  await page.reload();
  for (const [id, front] of Object.entries(fronts)) {
    await openDeck(page, id);
    await expect(page.locator('[data-mode="perfect"] .count')).toHaveText('1');
    await startAll(page);
    await expect(page.locator('.statement')).toHaveText(front);
    await expect(page.locator('.answer-panel')).toHaveCount(0);
  }
  expect((await databaseRows(page, 'sessions')).map(row => row.mode).sort()).toEqual(['a', 'b', 'c'].map(letter => `${author}-${letter}:all`));
});
}

test('Kim Yangseok long answers remain readable on a narrow screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  for (const letter of ['a', 'b', 'c']) {
    const id = `kimyangseok-${letter}`;
    const cards = JSON.parse(readFileSync(`public/data/${id}.json`, 'utf8'));
    const backLength = (card) => cardFaces(id, card).back.length + card.explanation.length + card.source.length;
    const card = cards.reduce((longest, current) => backLength(current) > backLength(longest) ? current : longest);
    // Resume a known long card so the layout check does not depend on shuffle order.
    await seedSession(page, id, card.id);
    await page.reload();
    await openDeck(page, id);
    await startAll(page);
    await expect(page.locator('.answer-value')).toHaveText(cardFaces(id, card).back);
    const layout = await page.evaluate(() => {
      const card = document.querySelector('.card');
      card.scrollTop = card.scrollHeight;
      const source = document.querySelector('.source').getBoundingClientRect();
      const actions = document.querySelector('.actions').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth, controls: actions.bottom <= innerHeight, source: source.bottom <= actions.top };
    });
    expect(layout).toEqual({ overflow: false, controls: true, source: true });
    await page.screenshot({ path: testInfo.outputPath(`kimyangseok-${letter}.png`) });
  }
});

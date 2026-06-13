const DB_NAME = "major-acupoints";
const DB_VERSION = 3;
const PROGRESS_STORE = "progress";
const SESSION_STORE = "sessions";
const SETTINGS_STORE = "settings";

const app = document.querySelector("#app");
const baseUrl = import.meta.env.BASE_URL;
let cards = [];
let progress = new Map();
let savedSessions = new Map();
let enabledTypes = new Set(["경혈 이름", "적응증", "위치"]);
let session = null;

const labels = {
  all: "전체 학습",
  perfect: "완벽",
  middle: "중간",
  fail: "실패",
};

const typeLabels = {
  "경혈 이름": "이름",
  적응증: "적응증",
  위치: "그림",
};

async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PROGRESS_STORE)) {
        request.result.createObjectStore(PROGRESS_STORE, { keyPath: "cardId" });
      }
      if (!request.result.objectStoreNames.contains(SESSION_STORE)) {
        request.result.createObjectStore(SESSION_STORE, { keyPath: "mode" });
      }
      if (!request.result.objectStoreNames.contains(SETTINGS_STORE)) {
        request.result.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadSettings() {
  const db = await openDatabase();
  const row = await new Promise((resolve, reject) => {
    const request = db.transaction(SETTINGS_STORE, "readonly").objectStore(SETTINGS_STORE).get("enabledTypes");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  if (row?.value?.length) enabledTypes = new Set(row.value);
}

async function saveSettings() {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const request = db
      .transaction(SETTINGS_STORE, "readwrite")
      .objectStore(SETTINGS_STORE)
      .put({ key: "enabledTypes", value: [...enabledTypes] });
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  db.close();
}

async function loadProgress() {
  const db = await openDatabase();
  const rows = await new Promise((resolve, reject) => {
    const request = db.transaction(PROGRESS_STORE, "readonly").objectStore(PROGRESS_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  progress = new Map(rows.map((row) => [row.cardId, row.grade]));
}

async function loadSessions() {
  const db = await openDatabase();
  const rows = await new Promise((resolve, reject) => {
    const request = db.transaction(SESSION_STORE, "readonly").objectStore(SESSION_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  savedSessions = new Map(rows.map((row) => [row.mode, row]));
}

async function saveGrade(cardId, grade) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const request = db
      .transaction(PROGRESS_STORE, "readwrite")
      .objectStore(PROGRESS_STORE)
      .put({ cardId, grade, updatedAt: Date.now() });
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  db.close();
  progress.set(cardId, grade);
}

async function saveSession() {
  if (!session) return;
  const row = {
    mode: session.mode,
    cardIds: session.cards.map((card) => card.id),
    index: session.index,
    revealed: session.revealed,
    filterKey: getFilterKey(),
    updatedAt: Date.now(),
  };
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const request = db.transaction(SESSION_STORE, "readwrite").objectStore(SESSION_STORE).put(row);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  db.close();
  savedSessions.set(row.mode, row);
}

async function clearSession(mode) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const request = db.transaction(SESSION_STORE, "readwrite").objectStore(SESSION_STORE).delete(mode);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
  db.close();
  savedSessions.delete(mode);
}

function button(label, className, onClick, attributes = {}) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  element.addEventListener("click", onClick);
  return element;
}

function getCardsFor(mode) {
  const filtered = cards.filter((card) => enabledTypes.has(card.prompt));
  if (mode === "all") return filtered;
  return filtered.filter((card) => progress.get(card.id) === mode);
}

function getFilterKey() {
  return [...enabledTypes].sort().join("|");
}

function shuffleCards(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

function renderMenu() {
  session = null;
  const menu = document.createElement("section");
  menu.className = "menu";
  const menuContent = document.createElement("div");
  menuContent.className = "menu-content";

  const title = document.createElement("h1");
  title.className = "menu-title";
  title.textContent = "주요 경혈";
  menuContent.append(title);

  ["all", "perfect", "middle", "fail"].forEach((mode) => {
    const row = document.createElement("div");
    row.className = "menu-row";
    const item = button(labels[mode], "menu-button", () => startSession(mode), {
      "data-mode": mode,
    });
    const count = document.createElement("span");
    count.className = "count";
    const candidate = savedSessions.get(mode);
    const saved = candidate?.filterKey === getFilterKey() ? candidate : null;
    count.textContent = saved ? `${Math.min(saved.index + 1, saved.cardIds.length)} / ${saved.cardIds.length}` : `${getCardsFor(mode).length}`;
    item.append(count);
    row.append(item, button("처음부터", "restart-button", () => startSession(mode, true)));
    menuContent.append(row);
  });

  const toggles = document.createElement("div");
  toggles.className = "type-toggles";
  Object.entries(typeLabels).forEach(([type, label]) => {
    toggles.append(
      button(label, "type-toggle", () => toggleType(type), {
        "aria-pressed": enabledTypes.has(type),
        "data-active": enabledTypes.has(type),
      }),
    );
  });

  menu.append(menuContent, toggles);
  app.replaceChildren(menu);
}

async function toggleType(type) {
  if (enabledTypes.has(type)) {
    if (enabledTypes.size === 1) return;
    enabledTypes.delete(type);
  } else {
    enabledTypes.add(type);
  }
  await saveSettings();
  renderMenu();
}

async function startSession(mode, restart = false) {
  const selected = getCardsFor(mode);
  if (!selected.length) {
    renderEmpty(mode);
    return;
  }

  const candidate = restart ? null : savedSessions.get(mode);
  const saved = candidate?.filterKey === getFilterKey() ? candidate : null;
  const byId = new Map(cards.map((card) => [card.id, card]));
  const savedCards = saved?.cardIds.map((id) => byId.get(id)).filter(Boolean);
  session = savedCards?.length
    ? {
        mode,
        cards: savedCards,
        index: Math.min(saved.index, savedCards.length - 1),
        revealed: saved.revealed,
      }
    : { mode, cards: shuffleCards(selected), index: 0, revealed: false };
  await saveSession();
  renderCard();
}

function renderEmpty(mode) {
  const empty = document.createElement("section");
  empty.className = "empty";
  empty.append(button(`${labels[mode]} 카드 없음 · 목록으로`, "menu-button", renderMenu));
  app.replaceChildren(empty);
}

function renderCard() {
  const card = session.cards[session.index];
  const study = document.createElement("section");
  study.className = "study";

  const bar = document.createElement("div");
  bar.className = "study-bar";
  bar.append(button("‹", "back-button", renderMenu, { "aria-label": "목록으로" }));

  const track = document.createElement("div");
  track.className = "progress-track";
  const fill = document.createElement("div");
  fill.className = "progress-fill";
  fill.style.width = `${((session.index + 1) / session.cards.length) * 100}%`;
  track.append(fill);
  bar.append(track);

  const label = document.createElement("span");
  label.className = "progress-label";
  label.textContent = `${session.index + 1} / ${session.cards.length}`;
  bar.append(label);

  const cardElement = document.createElement("div");
  cardElement.className = "card";
  const image = document.createElement("img");
  image.src = session.revealed ? card.backImage : card.frontImage;
  image.alt = session.revealed ? "정답" : card.prompt;
  cardElement.append(image);
  if (!session.revealed) cardElement.addEventListener("click", reveal);

  const actions = document.createElement("div");
  actions.className = "actions";
  if (session.revealed) {
    ["fail", "middle", "perfect"].forEach((grade) => {
      actions.append(
        button(labels[grade], "grade-button", () => gradeCard(grade), {
          "data-grade": grade,
        }),
      );
    });
  } else {
    actions.append(button("정답 보기", "reveal-button", reveal));
  }

  study.append(bar, cardElement, actions);
  app.replaceChildren(study);
}

function reveal() {
  session.revealed = true;
  saveSession();
  renderCard();
}

async function gradeCard(grade) {
  const card = session.cards[session.index];
  await saveGrade(card.id, grade);
  if (session.index === session.cards.length - 1) {
    await clearSession(session.mode);
    renderMenu();
    return;
  }
  session.index += 1;
  session.revealed = false;
  await saveSession();
  renderCard();
}

async function init() {
  const response = await fetch(`${baseUrl}data/cards.json`);
  cards = await response.json();
  await loadProgress();
  await loadSessions();
  await loadSettings();
  renderMenu();
}

window.addEventListener("keydown", (event) => {
  if (!session) return;
  if (!session.revealed && (event.key === " " || event.key === "Enter")) {
    event.preventDefault();
    reveal();
  }
  if (session.revealed && ["1", "2", "3"].includes(event.key)) {
    gradeCard({ 1: "fail", 2: "middle", 3: "perfect" }[event.key]);
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register(`${baseUrl}sw.js`));
}

init().catch(() => {
  app.replaceChildren(button("데이터를 불러오지 못했습니다", "menu-button", () => location.reload()));
});

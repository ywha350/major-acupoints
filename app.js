const DB_NAME = "major-acupoints";
const PROGRESS_STORE = "progress";
const SESSION_STORE = "sessions";

const app = document.querySelector("#app");
const baseUrl = import.meta.env.BASE_URL;
let decks = [];
let activeDeck = null;
let busy = false;
let progress = new Map();
let savedSessions = new Map();
let session = null;

const labels = {
  all: "전체 학습",
  perfect: "완벽",
  middle: "중간",
  fail: "실패",
};

async function openDatabase() {
  const open = (version) => new Promise((resolve, reject) => {
    const request = version ? indexedDB.open(DB_NAME, version) : indexedDB.open(DB_NAME);
    request.onupgradeneeded = () => createStores(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const db = await open();
  const hasRequiredStores = [PROGRESS_STORE, SESSION_STORE].every((store) =>
    db.objectStoreNames.contains(store),
  );
  if (hasRequiredStores) return db;

  const nextVersion = db.version + 1;
  db.close();
  return open(nextVersion);
}

function createStores(db) {
  if (!db.objectStoreNames.contains(PROGRESS_STORE)) {
    db.createObjectStore(PROGRESS_STORE, { keyPath: "cardId" });
  }
  if (!db.objectStoreNames.contains(SESSION_STORE)) {
    db.createObjectStore(SESSION_STORE, { keyPath: "mode" });
  }
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
    const transaction = db.transaction(PROGRESS_STORE, "readwrite");
    transaction.objectStore(PROGRESS_STORE).put({ cardId, grade, updatedAt: Date.now() });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  db.close();
  progress.set(cardId, grade);
}

async function saveSession() {
  if (!session) return;
  const row = {
    mode: sessionKey(session.deckId, session.mode),
    deckId: session.deckId,
    cardIds: session.cards.map((card) => card.id),
    index: session.index,
    revealed: session.revealed,
    chosenAnswer: session.chosenAnswer,
    updatedAt: Date.now(),
  };
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(SESSION_STORE, "readwrite");
    transaction.objectStore(SESSION_STORE).put(row);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  db.close();
  savedSessions.set(row.mode, row);
}

async function clearSession(mode) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(SESSION_STORE, "readwrite");
    transaction.objectStore(SESSION_STORE).delete(mode);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  db.close();
  savedSessions.delete(mode);
}

// Keep the original deck's keys so existing learning records and sessions survive.
function sessionKey(deckId, mode) {
  return deckId === "acupoints" ? mode : `${deckId}:${mode}`;
}

function text(tag, className, content) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = content;
  return element;
}

async function runAction(action) {
  if (busy) return;
  const previousSession = session ? { ...session } : null;
  const previousDeck = activeDeck;
  busy = true;
  app.setAttribute("aria-busy", "true");
  app.querySelectorAll("button").forEach((item) => { item.disabled = true; });
  app.querySelector(".error-message")?.remove();
  try {
    await action();
  } catch (error) {
    session = previousSession;
    activeDeck = previousDeck;
    console.error(error);
    const message = text("p", "error-message", "저장하지 못했습니다. 다시 시도해 주세요.");
    message.setAttribute("role", "alert");
    app.append(message);
  } finally {
    busy = false;
    app.removeAttribute("aria-busy");
    app.querySelectorAll("button").forEach((item) => { item.disabled = false; });
  }
}

function button(label, className, onClick, attributes = {}) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = label;
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  element.addEventListener("click", () => runAction(onClick));
  return element;
}

function renderShell(content) {
  const tabs = document.createElement("nav");
  tabs.className = "deck-tabs";
  tabs.setAttribute("aria-label", "플래시카드 덱");
  for (const item of [{ id: "home", name: "홈" }, ...decks]) {
    const selected = item.id === (activeDeck?.id || "home");
    tabs.append(button(item.name, `deck-tab${selected ? " is-active" : ""}`, () => {
      if (item.id === "home") renderHome();
      else {
        activeDeck = item;
        renderMenu();
      }
    }, { "aria-current": selected ? "page" : "false", "data-deck": item.id }));
  }
  app.replaceChildren(tabs, content);
}

function renderHome() {
  activeDeck = null;
  session = null;
  const home = document.createElement("section");
  home.className = "home";
  home.append(
    text("p", "eyebrow", "나의 플래시카드"),
    text("h1", "home-title", "오늘은 어떤 덱을 공부할까요?"),
    text("p", "home-description", "덱을 선택해 학습을 이어가세요."),
  );
  for (const deck of decks) {
    const tile = button("", "deck-tile", () => {
      activeDeck = deck;
      renderMenu();
    }, { "aria-label": `${deck.name} 학습하기` });
    const studied = deck.cards.filter((card) => progress.has(card.id)).length;
    const saved = savedSessions.get(sessionKey(deck.id, "all"));
    tile.append(
      text("span", "deck-type", deckTypeLabel(deck)),
      text("span", "deck-name", deck.name),
      text("span", "deck-description", deck.description),
      text("span", "deck-count", `${deck.cards.length}장 · 학습 ${studied}장`),
      text("span", "deck-open", saved ? "학습 중 · 덱 열기 →" : "덱 열기 →"),
    );
    home.append(tile);
  }
  renderShell(home);
}

function getCardsFor(mode) {
  if (mode === "all") return [...activeDeck.cards];
  return activeDeck.cards.filter((card) => progress.get(card.id) === mode);
}

function deckTypeLabel(deck) {
  return { ox: "OX 퀴즈", text: "단어 카드", image: "이미지 카드" }[deck.type];
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

  const title = document.createElement("h1");
  title.className = "menu-title";
  title.textContent = activeDeck.name;
  menu.append(title, text("p", "menu-description", `${deckTypeLabel(activeDeck)} · ${activeDeck.cards.length}장`));

  ["all", "perfect", "middle", "fail"].forEach((mode) => {
    const row = document.createElement("div");
    row.className = "menu-row";
    const item = button(labels[mode], "menu-button", () => startSession(mode), {
      "data-mode": mode,
    });
    const count = document.createElement("span");
    count.className = "count";
    const saved = savedSessions.get(sessionKey(activeDeck.id, mode));
    count.textContent = saved ? `${Math.min(saved.index + 1, saved.cardIds.length)} / ${saved.cardIds.length}` : `${getCardsFor(mode).length}`;
    item.append(count);
    row.append(item, button("처음부터", "restart-button", () => startSession(mode, true), {
      "aria-label": `${labels[mode]} 처음부터`,
    }));
    menu.append(row);
  });

  menu.append(text("p", "menu-help", "정답을 확인한 뒤 완벽·중간·실패로 분류하세요."));
  renderShell(menu);
}

async function startSession(mode, restart = false) {
  const selected = getCardsFor(mode);
  const saved = restart ? null : savedSessions.get(sessionKey(activeDeck.id, mode));
  const byId = new Map(activeDeck.cards.map((card) => [card.id, card]));
  const savedCards = saved?.cardIds.map((id) => byId.get(id)).filter(Boolean);
  if (!selected.length && !savedCards?.length) {
    renderEmpty(mode);
    return;
  }

  session = savedCards?.length
    ? {
        deckId: activeDeck.id,
        mode,
        cards: savedCards,
        index: Math.min(saved.index, savedCards.length - 1),
        revealed: saved.revealed,
        chosenAnswer: saved.chosenAnswer || null,
      }
    : { deckId: activeDeck.id, mode, cards: shuffleCards(selected), index: 0, revealed: false, chosenAnswer: null };
  await saveSession();
  renderCard();
}

function renderEmpty(mode) {
  const empty = document.createElement("section");
  empty.className = "empty";
  empty.append(button(`${labels[mode]} 카드 없음 · 목록으로`, "menu-button", renderMenu));
  renderShell(empty);
}

function renderCard() {
  const card = session.cards[session.index];
  const isOx = activeDeck.type === "ox";
  const study = document.createElement("section");
  study.className = "study";

  const bar = document.createElement("div");
  bar.className = "study-bar";
  bar.append(button("‹", "back-button", renderMenu, { "aria-label": "덱 목록으로" }));

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
  cardElement.className = activeDeck.type !== "image" ? "card text-card" : "card";
  if (isOx) {
    cardElement.append(text("p", "eyebrow", `장부생리 · ${card.section}`), text("h1", "statement", card.prompt));
    if (session.revealed) {
      const answer = document.createElement("div");
      answer.className = "answer-panel";
      if (session.chosenAnswer) {
        const correct = session.chosenAnswer === card.answer;
        answer.append(text("p", `answer-result ${correct ? "correct" : "incorrect"}`,
          `${correct ? "맞았어요" : "다시 확인해 보세요"} · 내 답 ${session.chosenAnswer}`));
      }
      answer.append(
        text("p", "answer-value", `정답 ${card.answer}`),
        text("p", "explanation", card.explanation),
        text("p", "source", card.source),
      );
      cardElement.append(answer);
    } else {
      cardElement.append(text("p", "answer-hint", "맞으면 O, 틀리면 X를 선택하세요."));
    }
  } else if (activeDeck.type === "text") {
    // A reversed deck shows the English term first and the Korean meaning behind it.
    const [front, back] = activeDeck.reversed ? [card.answer, card.prompt] : [card.prompt, card.answer];
    cardElement.append(text("p", "eyebrow", activeDeck.name), text("h1", "statement", front));
    if (session.revealed) {
      const answer = document.createElement("div");
      answer.className = "answer-panel";
      answer.append(text("p", "answer-value", back), text("p", "explanation", card.explanation), text("p", "source", card.source));
      cardElement.append(answer);
    } else {
      cardElement.append(text("p", "answer-hint", activeDeck.reversed ? "한국어 뜻을 떠올린 뒤 정답을 확인하세요." : "영어 용어를 떠올린 뒤 정답을 확인하세요."));
      cardElement.addEventListener("click", () => runAction(() => reveal()));
    }
  } else {
    const image = document.createElement("img");
    image.src = `${baseUrl}${session.revealed ? card.backImage : card.frontImage}`;
    image.alt = session.revealed ? "정답" : card.prompt;
    cardElement.append(image);
    if (!session.revealed) cardElement.addEventListener("click", () => runAction(() => reveal()));
  }

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
  } else if (isOx) {
    actions.classList.add("ox-actions");
    for (const choice of ["O", "X"]) {
      actions.append(button(choice, "ox-button", () => reveal(choice), {
        "aria-label": choice === "O" ? "O · 맞다" : "X · 틀리다",
        "data-answer": choice,
      }));
    }
  } else {
    actions.append(button("정답 보기", "reveal-button", () => reveal()));
  }

  study.append(bar, cardElement, actions);
  renderShell(study);
}

async function reveal(chosenAnswer = null) {
  if (!session || session.revealed) return;
  session.revealed = true;
  session.chosenAnswer = chosenAnswer;
  await saveSession();
  renderCard();
}

async function gradeCard(grade) {
  if (!session?.revealed) return;
  const card = session.cards[session.index];
  await saveGrade(card.id, grade);
  if (session.index === session.cards.length - 1) {
    await clearSession(sessionKey(session.deckId, session.mode));
    renderMenu();
    return;
  }
  session.index += 1;
  session.revealed = false;
  session.chosenAnswer = null;
  await saveSession();
  renderCard();
}

async function fetchJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(`Card data request failed: ${response.status}`);
  return response.json();
}

async function init() {
  const manifest = await fetchJson("data/decks.json");
  decks = await Promise.all(manifest.map(async (deck) => ({ ...deck, cards: await fetchJson(deck.path) })));
  await loadProgress();
  await loadSessions();
  renderHome();
}

window.addEventListener("keydown", (event) => {
  if (!session || busy || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.target.closest?.("input, textarea, select, [contenteditable='true']")) return;
  let action;
  if (!session.revealed) {
    if (activeDeck.type === "ox" && ["o", "x"].includes(event.key.toLowerCase())) {
      action = () => reveal(event.key.toUpperCase());
    } else if (activeDeck.type !== "ox" && [" ", "Enter"].includes(event.key) && event.target.tagName !== "BUTTON") {
      action = () => reveal();
    }
  } else if (["1", "2", "3"].includes(event.key)) {
    action = () => gradeCard({ 1: "fail", 2: "middle", 3: "perfect" }[event.key]);
  }
  if (action) {
    event.preventDefault();
    runAction(action);
  }
});

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register(`${baseUrl}sw.js`).catch(console.error));
}

init().catch(() => {
  app.replaceChildren(button("데이터를 불러오지 못했습니다", "menu-button", () => location.reload()));
});

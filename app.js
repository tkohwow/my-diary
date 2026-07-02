(function () {
  const STORAGE_KEY = "my-diary.entries.v1";
  const MILESTONES = [
    { count: 30, text: "呼吸が文字になってきた" },
    { count: 100, text: "もう流れがある" },
    { count: 300, text: "今日の輪郭が見えてきた" },
    { count: 700, text: "かなり深く潜れている" },
    { count: 1200, text: "よくここまで書いた" }
  ];

  const moodColors = {
    moss: "#426a53",
    plum: "#ad6672",
    amber: "#c28d36",
    blue: "#4a7188"
  };

  const el = {
    body: document.body,
    dateLabel: document.getElementById("dateLabel"),
    timeLabel: document.getElementById("timeLabel"),
    titleInput: document.getElementById("titleInput"),
    entryInput: document.getElementById("entryInput"),
    saveStatus: document.getElementById("saveStatus"),
    charCount: document.getElementById("charCount"),
    minutesCount: document.getElementById("minutesCount"),
    lineCount: document.getElementById("lineCount"),
    streakCount: document.getElementById("streakCount"),
    phraseLine: document.getElementById("phraseLine"),
    flowBar: document.getElementById("flowBar"),
    inkField: document.getElementById("inkField"),
    entryList: document.getElementById("entryList"),
    toast: document.getElementById("toast"),
    todayButton: document.getElementById("todayButton"),
    focusButton: document.getElementById("focusButton"),
    exportButton: document.getElementById("exportButton"),
    clearButton: document.getElementById("clearButton"),
    moodButtons: Array.from(document.querySelectorAll(".mood-swatch"))
  };

  let entries = readEntries();
  let currentDate = dateKey(new Date());
  let saveTimer = 0;
  let writingTimer = 0;
  let toastTimer = 0;
  let phraseTimer = 0;
  let sessionStartedAt = Date.now();
  let reachedMilestones = new Set();

  function readEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function writeEntries() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  function dateKey(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function dateFromKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function formatDate(key, style) {
    const date = dateFromKey(key);
    const options = style === "short"
      ? { month: "numeric", day: "numeric", weekday: "short" }
      : { year: "numeric", month: "long", day: "numeric", weekday: "short" };

    return new Intl.DateTimeFormat("ja-JP", options).format(date);
  }

  function ensureEntry(key) {
    if (!entries[key]) {
      entries[key] = {
        title: "",
        text: "",
        mood: "moss",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    return entries[key];
  }

  function loadEntry(key) {
    currentDate = key;
    const entry = ensureEntry(key);
    el.titleInput.value = entry.title || "";
    el.entryInput.value = entry.text || "";
    sessionStartedAt = Date.now();
    reachedMilestones = new Set(MILESTONES.filter((item) => charLength(entry.text) >= item.count).map((item) => item.count));
    setMood(entry.mood || "moss", false);
    updateDate();
    updateStats();
    renderEntries();
    updatePhrase();
    el.saveStatus.textContent = "保存済み";
  }

  function collectCurrentEntry() {
    const entry = ensureEntry(currentDate);
    entry.title = el.titleInput.value.trim();
    entry.text = el.entryInput.value;
    entry.mood = document.body.dataset.mood || "moss";
    entry.updatedAt = new Date().toISOString();
    return entry;
  }

  function scheduleSave() {
    el.saveStatus.textContent = "保存中";
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 220);
  }

  function saveNow() {
    try {
      collectCurrentEntry();
      writeEntries();
      el.saveStatus.textContent = "保存済み";
      renderEntries();
    } catch (error) {
      el.saveStatus.textContent = "保存失敗";
    }
  }

  function handleWriting() {
    el.body.classList.add("is-writing");
    clearTimeout(writingTimer);
    writingTimer = window.setTimeout(() => {
      el.body.classList.remove("is-writing");
    }, 850);

    bloomInk();
    updateStats();
    schedulePhrase();
    scheduleSave();
    checkMilestones();
  }

  function charLength(text) {
    return Array.from(text.replace(/\s/g, "")).length;
  }

  function lineLength(text) {
    if (!text.trim()) {
      return 0;
    }

    return text.split(/\n/).length;
  }

  function updateDate() {
    const dateText = formatDate(currentDate);
    el.dateLabel.textContent = dateText;
    el.timeLabel.textContent = new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date());
    el.timeLabel.dateTime = new Date().toISOString();
  }

  function updateStats() {
    const text = el.entryInput.value;
    const chars = charLength(text);
    const lines = lineLength(text);
    const minutes = Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 60000));
    const progress = Math.min(1, chars / 1000);

    el.charCount.textContent = chars.toLocaleString("ja-JP");
    el.lineCount.textContent = lines.toLocaleString("ja-JP");
    el.minutesCount.textContent = minutes.toLocaleString("ja-JP");
    el.streakCount.textContent = countStreak().toLocaleString("ja-JP");
    el.flowBar.style.width = `${Math.round(progress * 100)}%`;
    document.documentElement.style.setProperty("--score", `${Math.round(progress * 360)}deg`);
  }

  function countStreak() {
    const filled = new Set(
      Object.entries(entries)
        .filter(([, entry]) => entry && (entry.text || entry.title))
        .map(([key]) => key)
    );
    let cursor = dateFromKey(dateKey(new Date()));
    let count = 0;

    while (filled.has(dateKey(cursor))) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    return count;
  }

  function bloomInk() {
    const bloom = document.createElement("span");
    const rect = el.inkField.getBoundingClientRect();
    const x = 18 + Math.random() * 72;
    const y = 18 + Math.random() * 70;

    bloom.className = "ink-bloom";
    bloom.style.left = `${(rect.width * x) / 100}px`;
    bloom.style.top = `${(rect.height * y) / 100}px`;
    bloom.style.background = moodColors[document.body.dataset.mood || "moss"];
    el.inkField.appendChild(bloom);
    window.setTimeout(() => bloom.remove(), 940);
  }

  function schedulePhrase() {
    clearTimeout(phraseTimer);
    phraseTimer = window.setTimeout(updatePhrase, 360);
  }

  function updatePhrase() {
    const text = el.entryInput.value.trim();
    if (!text) {
      el.phraseLine.textContent = "まだ白い";
      return;
    }

    const fragments = text
      .split(/[\n。！？!?]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 4);
    const last = fragments[fragments.length - 1] || text;
    el.phraseLine.textContent = `「${clip(last, 42)}」`;
  }

  function clip(text, max) {
    const chars = Array.from(text);
    if (chars.length <= max) {
      return text;
    }

    return `${chars.slice(0, max).join("")}...`;
  }

  function checkMilestones() {
    const chars = charLength(el.entryInput.value);
    const next = MILESTONES.find((item) => chars >= item.count && !reachedMilestones.has(item.count));

    if (next) {
      reachedMilestones.add(next.count);
      showToast(next.text);
    }
  }

  function showToast(text) {
    clearTimeout(toastTimer);
    el.toast.textContent = text;
    el.toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      el.toast.classList.remove("is-visible");
    }, 1800);
  }

  function setMood(mood, shouldSave) {
    document.body.dataset.mood = mood;
    el.moodButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mood === mood);
    });

    if (shouldSave) {
      scheduleSave();
      showToast("色がなじんだ");
    }
  }

  function renderEntries() {
    const items = Object.entries(entries)
      .filter(([, entry]) => entry && (entry.title || entry.text))
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 18);

    el.entryList.innerHTML = "";

    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "phrase-line";
      empty.textContent = "まだ白い";
      el.entryList.appendChild(empty);
      return;
    }

    items.forEach(([key, entry]) => {
      const card = document.createElement("button");
      const title = entry.title || firstLine(entry.text) || "題名なし";
      const snippet = entry.text ? entry.text.replace(/\s+/g, " ").trim() : " ";

      card.type = "button";
      card.className = "entry-card";
      card.classList.toggle("is-current", key === currentDate);
      card.innerHTML = `
        <time datetime="${key}">${formatDate(key, "short")}</time>
        <strong></strong>
        <span></span>
      `;
      card.querySelector("strong").textContent = clip(title, 24);
      card.querySelector("span").textContent = clip(snippet, 58);
      card.addEventListener("click", () => {
        saveNow();
        loadEntry(key);
        el.entryInput.focus();
      });
      el.entryList.appendChild(card);
    });
  }

  function firstLine(text) {
    return (text || "").split(/\n/).map((line) => line.trim()).find(Boolean);
  }

  function exportCurrentEntry() {
    saveNow();
    const entry = ensureEntry(currentDate);
    const title = entry.title || formatDate(currentDate);
    const body = [`# ${title}`, "", entry.text || ""].join("\n");
    const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");

    link.href = URL.createObjectURL(blob);
    link.download = `${currentDate}-diary.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    showToast("書き出した");
  }

  function clearCurrentEntry() {
    const entry = ensureEntry(currentDate);
    if (!entry.title && !entry.text) {
      return;
    }

    if (!confirm("今日の日記を空にしますか？")) {
      return;
    }

    delete entries[currentDate];
    writeEntries();
    loadEntry(currentDate);
    showToast("空にした");
  }

  function bindEvents() {
    el.entryInput.addEventListener("input", handleWriting);
    el.titleInput.addEventListener("input", () => {
      updateStats();
      scheduleSave();
      renderEntries();
    });
    el.todayButton.addEventListener("click", () => {
      saveNow();
      loadEntry(dateKey(new Date()));
      el.entryInput.focus();
    });
    el.focusButton.addEventListener("click", () => {
      const active = !el.body.classList.contains("is-focus");
      el.body.classList.toggle("is-focus", active);
      el.focusButton.setAttribute("aria-pressed", String(active));
    });
    el.exportButton.addEventListener("click", exportCurrentEntry);
    el.clearButton.addEventListener("click", clearCurrentEntry);
    el.moodButtons.forEach((button) => {
      button.addEventListener("click", () => setMood(button.dataset.mood, true));
    });
    window.addEventListener("beforeunload", saveNow);
  }

  function tick() {
    updateDate();
    updateStats();
  }

  bindEvents();
  loadEntry(currentDate);
  window.setInterval(tick, 30000);
}());

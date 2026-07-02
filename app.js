(function () {
  const STORAGE_KEY = "my-diary.entries.v1";
  const PRIVACY_KEY = "my-diary.privacy.v1";
  const IDLE_PRIVACY_DELAY = 120000;
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
    offlineStatus: document.getElementById("offlineStatus"),
    charCount: document.getElementById("charCount"),
    minutesCount: document.getElementById("minutesCount"),
    lineCount: document.getElementById("lineCount"),
    streakCount: document.getElementById("streakCount"),
    phraseLine: document.getElementById("phraseLine"),
    flowBar: document.getElementById("flowBar"),
    inkField: document.getElementById("inkField"),
    entryList: document.getElementById("entryList"),
    searchInput: document.getElementById("searchInput"),
    monthGrid: document.getElementById("monthGrid"),
    monthLabel: document.getElementById("monthLabel"),
    toast: document.getElementById("toast"),
    prevDayButton: document.getElementById("prevDayButton"),
    todayButton: document.getElementById("todayButton"),
    nextDayButton: document.getElementById("nextDayButton"),
    focusButton: document.getElementById("focusButton"),
    privacyButton: document.getElementById("privacyButton"),
    exportButton: document.getElementById("exportButton"),
    backupButton: document.getElementById("backupButton"),
    importInput: document.getElementById("importInput"),
    prevMonthButton: document.getElementById("prevMonthButton"),
    nextMonthButton: document.getElementById("nextMonthButton"),
    clearButton: document.getElementById("clearButton"),
    moodButtons: Array.from(document.querySelectorAll(".mood-swatch"))
  };

  let entries = readEntries();
  let currentDate = dateKey(new Date());
  let saveTimer = 0;
  let writingTimer = 0;
  let toastTimer = 0;
  let phraseTimer = 0;
  let idleTimer = 0;
  let sessionStartedAt = Date.now();
  let reachedMilestones = new Set();
  let visibleMonth = new Date();
  let privacyMode = readPrivacyMode();

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

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Offline support is helpful, but the diary remains usable without it.
    });
  }

  function updateConnectionStatus() {
    const online = navigator.onLine;
    el.offlineStatus.textContent = online ? "online" : "offline";
    el.offlineStatus.classList.toggle("is-offline", !online);
  }

  function readPrivacyMode() {
    try {
      return localStorage.getItem(PRIVACY_KEY) === "true";
    } catch (error) {
      return false;
    }
  }

  function setPrivacyMode(active, shouldAnnounce) {
    privacyMode = active;
    el.body.classList.toggle("is-private", active);
    el.privacyButton.setAttribute("aria-pressed", String(active));
    el.privacyButton.querySelector("span").textContent = active ? "◐" : "●";

    try {
      localStorage.setItem(PRIVACY_KEY, String(active));
    } catch (error) {
      // The visual state still works even if preference storage is unavailable.
    }

    if (shouldAnnounce) {
      showToast(active ? "隠した" : "戻した");
    }
  }

  function hasDiaryText() {
    return Boolean(el.titleInput.value.trim() || el.entryInput.value.trim());
  }

  function scheduleIdlePrivacy() {
    clearTimeout(idleTimer);

    if (privacyMode || !hasDiaryText()) {
      return;
    }

    idleTimer = window.setTimeout(() => {
      if (hasDiaryText()) {
        setPrivacyMode(true, true);
      }
    }, IDLE_PRIVACY_DELAY);
  }

  function wakeInteraction() {
    scheduleIdlePrivacy();
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
    visibleMonth = new Date(dateFromKey(key).getFullYear(), dateFromKey(key).getMonth(), 1);
    sessionStartedAt = Date.now();
    reachedMilestones = new Set(MILESTONES.filter((item) => charLength(entry.text) >= item.count).map((item) => item.count));
    setMood(entry.mood || "moss", false);
    updateDate();
    updateStats();
    renderMemory();
    updatePhrase();
    el.saveStatus.textContent = "保存済み";
  }

  function shiftDay(delta) {
    saveNow();
    const target = dateFromKey(currentDate);
    target.setDate(target.getDate() + delta);
    loadEntry(dateKey(target));
    el.entryInput.focus();
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
      renderMemory();
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
    scheduleIdlePrivacy();
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

  function renderMemory() {
    renderMonth();
    renderEntries();
  }

  function renderMonth() {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const today = dateKey(new Date());
    const days = new Date(year, month + 1, 0).getDate();
    const offset = new Date(year, month, 1).getDay();
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

    el.monthLabel.textContent = new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "long"
    }).format(visibleMonth);
    el.monthGrid.innerHTML = "";

    weekdays.forEach((weekday) => {
      const node = document.createElement("div");
      node.className = "weekday";
      node.textContent = weekday;
      el.monthGrid.appendChild(node);
    });

    for (let index = 0; index < offset; index += 1) {
      const blank = document.createElement("div");
      blank.className = "month-blank";
      el.monthGrid.appendChild(blank);
    }

    for (let day = 1; day <= days; day += 1) {
      const key = keyFromParts(year, month, day);
      const entry = entries[key];
      const hasEntry = Boolean(entry && (entry.title || entry.text));
      const button = document.createElement("button");

      button.type = "button";
      button.className = "month-day";
      button.textContent = String(day);
      button.classList.toggle("has-entry", hasEntry);
      button.classList.toggle("is-current", key === currentDate);
      button.classList.toggle("is-today", key === today);
      button.setAttribute("aria-label", `${formatDate(key)}${hasEntry ? " の日記" : ""}`);

      if (entry && entry.mood && moodColors[entry.mood]) {
        button.style.setProperty("--day-mood", moodColors[entry.mood]);
      }

      button.addEventListener("click", () => {
        saveNow();
        loadEntry(key);
        el.entryInput.focus();
      });
      el.monthGrid.appendChild(button);
    }
  }

  function keyFromParts(year, monthIndex, day) {
    const month = String(monthIndex + 1).padStart(2, "0");
    const date = String(day).padStart(2, "0");
    return `${year}-${month}-${date}`;
  }

  function renderEntries() {
    const query = normalizeSearch(el.searchInput.value);
    const items = Object.entries(entries)
      .filter(([, entry]) => entry && (entry.title || entry.text))
      .filter(([key, entry]) => matchesSearch(key, entry, query))
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 24);

    el.entryList.innerHTML = "";

    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "phrase-line empty-memory";
      empty.textContent = query ? "見つからない" : "まだ白い";
      el.entryList.appendChild(empty);
      return;
    }

    items.forEach(([key, entry]) => {
      const card = document.createElement("button");
      const title = entry.title || firstLine(entry.text) || "題名なし";
      const snippet = entry.text ? entry.text.replace(/\s+/g, " ").trim() : " ";
      const tags = extractTags(entry.text);

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

      if (tags.length > 0) {
        const tagRow = document.createElement("div");
        tagRow.className = "tag-row";
        tags.slice(0, 3).forEach((tag) => {
          const tagNode = document.createElement("b");
          tagNode.className = "tag-pill";
          tagNode.textContent = tag;
          tagRow.appendChild(tagNode);
        });
        card.appendChild(tagRow);
      }

      card.addEventListener("click", () => {
        saveNow();
        loadEntry(key);
        el.entryInput.focus();
      });
      el.entryList.appendChild(card);
    });
  }

  function normalizeSearch(value) {
    return value.trim().toLocaleLowerCase("ja-JP");
  }

  function matchesSearch(key, entry, query) {
    if (!query) {
      return true;
    }

    return [
      key,
      formatDate(key),
      entry.title || "",
      entry.text || "",
      extractTags(entry.text).join(" ")
    ].join(" ").toLocaleLowerCase("ja-JP").includes(query);
  }

  function extractTags(text) {
    const matches = (text || "").match(/#[^\s#。、！？!?]+/g) || [];
    return Array.from(new Set(matches)).slice(0, 8);
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

  function exportAllEntries() {
    saveNow();
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      entries
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a");

    link.href = URL.createObjectURL(blob);
    link.download = `my-diary-backup-${dateKey(new Date())}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    showToast("バックアップした");
  }

  async function importBackup(file) {
    if (!file) {
      return;
    }

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const importedEntries = sanitizeEntries(parsed.entries || parsed);
      const count = Object.keys(importedEntries).length;

      if (count === 0) {
        showToast("復元できる日記がない");
        return;
      }

      if (!confirm(`${count}件の日記を復元します。同じ日付は上書きしますか？`)) {
        return;
      }

      saveNow();
      entries = { ...entries, ...importedEntries };
      writeEntries();
      const latest = Object.keys(importedEntries).sort().pop() || currentDate;
      loadEntry(latest);
      showToast("復元した");
    } catch (error) {
      showToast("復元に失敗した");
    } finally {
      el.importInput.value = "";
    }
  }

  function sanitizeEntries(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return Object.entries(value).reduce((safe, [key, entry]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !entry || typeof entry !== "object") {
        return safe;
      }

      safe[key] = {
        title: String(entry.title || "").slice(0, 120),
        text: String(entry.text || ""),
        mood: moodColors[entry.mood] ? entry.mood : "moss",
        createdAt: entry.createdAt || new Date().toISOString(),
        updatedAt: entry.updatedAt || new Date().toISOString()
      };
      return safe;
    }, {});
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
      renderMemory();
      scheduleIdlePrivacy();
    });
    el.prevDayButton.addEventListener("click", () => shiftDay(-1));
    el.todayButton.addEventListener("click", () => {
      saveNow();
      loadEntry(dateKey(new Date()));
      el.entryInput.focus();
    });
    el.nextDayButton.addEventListener("click", () => shiftDay(1));
    el.focusButton.addEventListener("click", () => {
      const active = !el.body.classList.contains("is-focus");
      el.body.classList.toggle("is-focus", active);
      el.focusButton.setAttribute("aria-pressed", String(active));
    });
    el.privacyButton.addEventListener("click", () => {
      setPrivacyMode(!privacyMode, true);
    });
    el.entryInput.addEventListener("focus", () => {
      if (privacyMode) {
        setPrivacyMode(false, true);
      }
      scheduleIdlePrivacy();
    });
    el.titleInput.addEventListener("focus", () => {
      if (privacyMode) {
        setPrivacyMode(false, true);
      }
      scheduleIdlePrivacy();
    });
    el.exportButton.addEventListener("click", exportCurrentEntry);
    el.backupButton.addEventListener("click", exportAllEntries);
    el.importInput.addEventListener("change", () => importBackup(el.importInput.files[0]));
    el.searchInput.addEventListener("input", renderEntries);
    el.prevMonthButton.addEventListener("click", () => {
      visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
      renderMonth();
    });
    el.nextMonthButton.addEventListener("click", () => {
      visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
      renderMonth();
    });
    el.clearButton.addEventListener("click", clearCurrentEntry);
    el.moodButtons.forEach((button) => {
      button.addEventListener("click", () => setMood(button.dataset.mood, true));
    });
    window.addEventListener("online", updateConnectionStatus);
    window.addEventListener("offline", updateConnectionStatus);
    ["pointerdown", "keydown", "scroll"].forEach((eventName) => {
      window.addEventListener(eventName, wakeInteraction, { passive: true });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && hasDiaryText()) {
        setPrivacyMode(true, false);
      } else {
        scheduleIdlePrivacy();
      }
    });
    window.addEventListener("beforeunload", saveNow);
  }

  function tick() {
    updateDate();
    updateStats();
  }

  bindEvents();
  loadEntry(currentDate);
  setPrivacyMode(privacyMode, false);
  scheduleIdlePrivacy();
  updateConnectionStatus();
  registerServiceWorker();
  window.setInterval(tick, 30000);
}());

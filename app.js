const IMG_KEY = "downgrader_imgs_v2";   // в браузере кэшируются только картинки и курсы (не деньги и не аккаунты)
const RAR_KEY = "downgrader_rarity_v2";
const RARITY = {
  W: { name: "Ширпотреб", color: "#b0c3d9" },
  I: { name: "Промышленное", color: "#5e98d9" },
  M: { name: "Армейское", color: "#4b69ff" },
  R: { name: "Запрещённое", color: "#8847ff" },
  C: { name: "Засекреченное", color: "#d32ee6" },
  T: { name: "Тайное", color: "#eb4b4b" },
  K: { name: "Редкое: нож", color: "#e4ae39" },
  G: { name: "Редкое: перчатки", color: "#e4ae39" },
  O: { name: "Контрабанда", color: "#ff8c1a" },
  X: { name: "Другая редкость", color: "#6b7280" },   // скрыта из каталога
};

const $ = (id) => document.getElementById(id);
const money = (n) => Math.floor(n).toLocaleString("ru-RU") + " ₸";
const skinById = (id) => SKINS.find((s) => s.id === id);

// ---------- состояние ----------
// Источник правды — «база» в localStorage (storage.js). Здесь только копия для отрисовки.
let account = null;   // {login, display, role, adminRequest}
let state = defaultState();
let pendingAdmin = 0; // сколько заявок на админа ждёт (видно только админу)
let selected = new Set();
let stakeBal = 0;
let autoTop = 0;   // сколько баланса докинул быстрый выбор цели (чтобы шанс вышел ровным)
function setStakeBal(v) { stakeBal = v; autoTop = 0; }
let targetId = null;
let busy = false;
let rotation = 0;
let mode = null;   // быстрый выбор цели: {t:"x"|"p", v:число}

function defaultState() {
  return { balance: 500, inventory: [], nextUid: 1, clicks: 0, clickLvl: 0, autoLvl: 0, nick: "Игрок", avatar: "", speed: "slow", autoWin: false };
}
const isAdmin = () => !!account && account.role === "admin";

// ---------- связь с «базой» (localStorage, см. storage.js) ----------
// Интерфейс прежний: api(путь, тело) → Promise с новым состоянием игрока. Сети нет, всё считается в браузере.
async function api(path, body) {
  try { return await Store.call(path, body || {}, { fx: FX }); }
  catch (e) {
    if (e.status === 401 && account) sessionLost();
    throw Object.assign(e, { status: e.status || 0 });
  }
}
const invSig = () => state.inventory.map((i) => i.uid).join(",");
// Принять новое состояние из базы. light = фоновое обновление: тяжёлые списки перерисовываем только если инвентарь изменился.
function applyState(d, light) {
  if (busy) return;   // во время прокрутки ничего не показываем раньше времени
  const before = invSig();
  if (d.user) account = d.user;
  if (d.state) {
    state = { ...defaultState(), ...d.state };
    if (pendingClicks) { addBalance(pendingClicks * clickPower()); state.clicks += pendingClicks; }   // клики, которые ещё не записаны в базу
  }
  if (d.pending !== undefined) pendingAdmin = d.pending;
  const alive = new Set(state.inventory.map((i) => i.uid));
  [...selected].forEach((u) => { if (!alive.has(u)) selected.delete(u); });
  if (!light || invSig() !== before) renderAll();
  else { renderTop(); if ($("profile").open) renderProfile(); updateAdminUI(); }
}
// Действие игрока: проверка и расчёт в storage.js, назад приходит новое состояние
async function act(path, body) {
  if (!account) return null;
  if (busy) { toast("Подожди окончания прокрутки"); return null; }
  try {
    await settleClicks();
    const d = await api(path, body);
    applyState(d);
    return d;
  } catch (e) { if (e.status !== 401) toast(e.message); return null; }
}
function sessionLost() {
  account = null; state = defaultState(); selected.clear(); setStakeBal(0); targetId = null; mode = null; busy = false;
  renderAll(); showAuth(); toast("Сессия закончилась, войди снова");
}
// Клики копим и записываем пачками (на экране показываем сразу)
let pendingClicks = 0, flushing = null;
function flushClicks(force) {
  if (flushing) return flushing;
  if (!pendingClicks || !account || (busy && !force)) return Promise.resolve();
  const n = pendingClicks; pendingClicks = 0;
  flushing = api("farm", { n }).then((d) => applyState(d, true)).catch((e) => { if (e.status !== 401) toast(e.message); }).finally(() => { flushing = null; });
  return flushing;
}
async function settleClicks(force) { while ((pendingClicks || flushing) && account && (force || !busy)) await flushClicks(force); }
setInterval(flushClicks, 500);
// Раз в 10 секунд сверяемся с базой (автофарм, заявки на админа, правки баланса админом)
async function refresh() {
  if (!account || busy || document.hidden) return;
  try {
    await settleClicks();
    applyState(await api("me"), true);
    if ($("admin").open) renderAdmin();
  } catch (e) {}
}
setInterval(refresh, 10000);
// Другая вкладка изменила данные: подтягиваем их сразу
window.addEventListener("storage", (e) => { if (e.key === Store.DB_KEY) refresh(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toast.id);
  toast.id = setTimeout(() => t.classList.remove("show"), 1800);
}

// ---------- карточки ----------
function card(skin, cls, extra) {
  const [weapon, name] = skin.name.split(" | ");
  const el = document.createElement("div");
  el.className = "card " + (cls || "");
  el.style.setProperty("--rc", RARITY[skin.r].color);
  el.tabIndex = 0;
  el.innerHTML = `${extra || ""}<span class="cp">${money(skin.price)}</span>
    <span class="cw">${weapon}</span><span class="cs">${name}</span>`;
  el.insertBefore(skinImage(skin), el.querySelector(".cw"));
  return el;
}
// Крестик «убрать», плавно появляется при наведении (стили в style.css)
function addRm(el, fn) {
  if (busy) return;
  const b = document.createElement("button");
  b.type = "button"; b.className = "rm"; b.textContent = "×"; b.setAttribute("aria-label", "Убрать");
  b.addEventListener("click", (e) => { e.stopPropagation(); if (!busy) fn(); });
  el.appendChild(b);
}
const emptyMsg = (t) => `<div class="empty">${t}</div>`;

// ---------- профиль и фарм ----------
const clickPower = () => CLICK_BASE * Math.pow(1.5, state.clickLvl);
const autoPower = () => (state.autoLvl ? AUTO_BASE * Math.pow(1.5, state.autoLvl - 1) : 0);
const clickCost = () => CLICK_COST * Math.pow(1.8, state.clickLvl);
const autoCost = () => AUTO_COST * Math.pow(1.9, state.autoLvl);
const invValue = () => state.inventory.reduce((s, i) => s + skinById(i.id).price, 0);
const addBalance = (x) => { state.balance = +(state.balance + x).toFixed(2); };

function renderTop() {
  $("balance").textContent = money(state.balance);
  $("balConv").textContent = "≈ " + fmtCur(state.balance / FX.USD, "USD") + " · " + fmtCur(state.balance / FX.RUB, "RUB");
  $("nickTop").textContent = state.nick || "Игрок";
  syncStakeUI();
  document.querySelectorAll("[data-ava]").forEach((el) => {
    const okAva = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(state.avatar || "");
    el.style.backgroundImage = okAva ? `url(${state.avatar})` : "none";
    el.textContent = okAva ? "" : (state.nick || "И")[0].toUpperCase();
  });
}
function renderProfile() {
  $("whoami").textContent = account ? `Аккаунт: ${account.login}` + (isAdmin() ? " (админ)" : account.adminRequest ? " (заявка на админа ждёт одобрения)" : "") : "";
  $("farmInfo").textContent = "+" + money(clickPower()) + " за клик";
  $("upClick").textContent = `Сила клика ур.${state.clickLvl} → ${money(clickCost())}`;
  $("upAuto").textContent = `Автофарм ур.${state.autoLvl} → ${money(autoCost())}`;
  $("stats").innerHTML =
    `<div>Всего кликов: <b>${state.clicks}</b></div>` +
    `<div>Пассивный доход: <b>${money(autoPower())}/сек</b></div>` +
    `<div>Скинов: <b>${state.inventory.length}</b> на <b>${money(invValue())}</b></div>`;
}

$("openProfile").addEventListener("click", () => { $("nick").value = state.nick; renderProfile(); $("profile").showModal(); });
$("closeProfile").addEventListener("click", () => $("profile").close());
let nickTimer = 0;
$("nick").addEventListener("input", (e) => {
  state.nick = e.target.value.trim().slice(0, 20) || "Игрок"; renderTop();
  clearTimeout(nickTimer);
  nickTimer = setTimeout(() => api("profile", { nick: state.nick }).catch((er) => toast(er.message)), 400);
});
$("avatarFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = c.height = 96;
    const s = Math.min(img.width, img.height);
    c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 96, 96);
    state.avatar = c.toDataURL("image/jpeg", 0.8);
    URL.revokeObjectURL(url);
    renderTop();
    api("profile", { avatar: state.avatar }).catch((er) => toast(er.message));
  };
  img.src = url;
});

$("farm").addEventListener("click", () => {
  if (!account) return;
  addBalance(clickPower()); state.clicks++; pendingClicks++;
  renderTop(); renderProfile();
});
$("upClick").addEventListener("click", () => act("levelup", { kind: "click" }));
$("upAuto").addEventListener("click", () => act("levelup", { kind: "auto" }));
// Автофарм: тут только «живая» отрисовка, настоящее начисление делает storage.js (сверка раз в 10 секунд)
setInterval(() => {
  if (!account || !autoPower()) return;
  addBalance(autoPower());
  renderTop(); if ($("profile").open) renderProfile();
}, 1000);
$("reset").addEventListener("click", async () => {
  if (!confirm("Сбросить весь прогресс?")) return;
  if (!(await act("reset", {}))) return;
  selected.clear(); setStakeBal(0); targetId = null; mode = null;
  $("nick").value = state.nick;
  renderAll(); $("result").textContent = "";
});

// ---------- инвентарь и закуп ----------
const RARITY_RANK = { W: 1, I: 2, M: 3, R: 4, C: 5, T: 6, K: 7, G: 7, O: 8, X: 0 };
function invSorter() {
  const p = (x) => skinById(x.id).price, r = (x) => RARITY_RANK[skinById(x.id).r] || 0;
  switch ($("i_s").value) {
    case "price_asc": return (x, y) => p(x) - p(y);
    case "rar_desc": return (x, y) => r(y) - r(x) || p(y) - p(x);
    case "rar_asc": return (x, y) => r(x) - r(y) || p(y) - p(x);
    default: return (x, y) => p(y) - p(x);
  }
}
function renderInv() {
  const g = $("invGrid");
  g.innerHTML = "";
  if (!state.inventory.length) g.innerHTML = emptyMsg("Пусто. Нафарми баланс в профиле и закупись.");
  [...state.inventory].sort(invSorter()).forEach((it) => {
    const skin = skinById(it.id);
    const el = card(skin, selected.has(it.uid) ? "sel" : "", '<span class="sellbtn">продать</span>');
    el.addEventListener("click", (e) => {
      if (busy) return;
      if (e.target.classList.contains("sellbtn")) return sell(it.uid);
      selected.has(it.uid) ? selected.delete(it.uid) : selected.add(it.uid);
      renderInv(); renderStage();
    });
    g.appendChild(el);
  });
}

function renderBuy() {
  const g = $("buyGrid");
  const amt = parseFloat($("buyAmt").value) || 0;
  g.innerHTML = "";
  if (amt <= 0) return void (g.innerHTML = emptyMsg("Введи сумму, и тут появятся скины, которые на неё можно купить."));
  const list = SKINS.filter((s) => s.r !== "X" && s.price <= amt).sort((a, b) => b.price - a.price).slice(0, 80);
  if (!list.length) g.innerHTML = emptyMsg("На такую сумму ничего нет.");
  list.forEach((skin) => {
    const el = card(skin, skin.price > state.balance ? "dim" : "");
    el.addEventListener("click", () => buy(skin.id));
    g.appendChild(el);
  });
}
async function buy(id) {
  const d = await act("buy", { id });
  if (d) toast("Куплено: " + d.bought);
}
function sell(uid) { act("sell", { uid }); }
$("i_s").addEventListener("input", renderInv);
$("buyAmt").addEventListener("input", renderBuy);
$("buyMax").addEventListener("click", () => { $("buyAmt").value = Math.floor(state.balance); renderBuy(); });

// ---------- каталог целей ----------
function renderCat() {
  const q = $("c_q").value.trim().toLowerCase();
  const r = $("c_r").value, asc = $("c_s").value === "asc";
  const from = parseFloat($("c_from").value) || 0;
  const to = parseFloat($("c_to").value) || Infinity;
  const list = SKINS
    .filter((s) => s.r !== "X" && (r === "all" || s.r === r) && s.price >= from && s.price <= to && s.name.toLowerCase().includes(q))
    .sort((a, b) => (asc ? a.price - b.price : b.price - a.price));
  const g = $("catGrid");
  g.innerHTML = list.length ? "" : emptyMsg("Ничего не найдено");
  list.forEach((skin) => {
    const el = card(skin, skin.id === targetId ? "sel" : "");
    el.addEventListener("click", () => { if (busy) return; mode = null; targetId = skin.id; renderQuick(); renderCat(); renderStage(); });
    g.appendChild(el);
  });
}
$("c_r").innerHTML = '<option value="all">Все типы</option>' +
  Object.entries(RARITY).filter(([k]) => k !== "X").map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
["c_q", "c_r", "c_s", "c_from", "c_to"].forEach((id) => $(id).addEventListener("input", renderCat));

// ---------- сцена апгрейда ----------
const itemsSum = () => state.inventory.filter((i) => selected.has(i.uid)).reduce((s, i) => s + skinById(i.id).price, 0);
const stakeSum = () => itemsSum() + Math.min(stakeBal, state.balance);

function calcChance() {
  const stake = stakeSum();
  const target = skinById(targetId);
  if (!target || stake <= 0 || target.price <= stake) return 0;
  return Math.min(MAX_CHANCE, Math.max(MIN_CHANCE, (stake / target.price) * 100 * HOUSE_EDGE));
}

// Подбирает цель под выбранный множитель или шанс (срабатывает один раз, потом шанс меняется от ставки).
// Если подходящего скина нет впритык, докидывает недостающее из баланса, чтобы шанс вышел точным.
function applyMode() {
  if (!mode) return false;
  const stake = stakeSum();
  if (stake <= 0) return false;
  const p = mode.t === "x" ? (100 * HOUSE_EDGE) / mode.v : mode.v;   // нужный шанс, %
  const desired = (stake * HOUSE_EDGE * 100) / p;                    // цена цели при текущей ставке
  const pool = SKINS.filter((s) => s.r !== "X" && s.price > stake);
  if (!pool.length) return false;
  const free = Math.floor(state.balance - Math.min(stakeBal, state.balance));
  let best = null, extra = 0;
  const up = pool.filter((s) => s.price >= desired).sort((a, b) => a.price - b.price)[0];
  if (up && up.price <= desired * 1.3) {
    const need = Math.max(0, Math.ceil((up.price * p) / (100 * HOUSE_EDGE) - stake));
    if (need <= free) { best = up; extra = need; }
  }
  if (!best) pool.forEach((s) => { if (!best || Math.abs(s.price - desired) < Math.abs(best.price - desired)) best = s; });
  const old = targetId;
  targetId = best.id;
  if (extra > 0) { stakeBal = Math.floor(stakeBal) + extra; autoTop += extra; }
  mode = null; renderQuick();
  return old !== targetId;
}

function renderStage() {
  if (applyMode()) renderCat();
  const sl = $("stakeList");
  sl.innerHTML = "";
  const items = state.inventory.filter((i) => selected.has(i.uid));
  const bal = Math.min(stakeBal, state.balance);
  const count = items.length + (bal > 0 ? 1 : 0);
  balCardOn = false;
  sl.classList.toggle("single", count === 1);   // один предмет, он занимает всё окно
  const fill = count === 1 ? " fill" : "";
  items.forEach((i) => {
    const c = card(skinById(i.id), "big" + fill);
    addRm(c, () => { selected.delete(i.uid); renderInv(); renderStage(); });
    sl.appendChild(c);
  });
  if (bal > 0) {
    const bc = document.createElement("div");
    bc.className = "card big balcard" + fill;
    balCardOn = true;
    bc.innerHTML = `<span class="cimg ph">₸</span><span class="cs">Баланс</span><span class="cp">${money(bal)}</span>`;
    addRm(bc, () => { setStakeBal(0); renderStage(); });
    sl.appendChild(bc);
  }
  const emptyStake = !sl.children.length;
  sl.classList.toggle("empty", emptyStake);
  if (emptyStake) sl.innerHTML = '<div class="ph-hint">Выбери предметы из инвентаря<br>и/или добавь баланс ползунком</div>';

  const t = skinById(targetId);
  const tb = $("targetBox");
  tb.innerHTML = "";
  if (t) {
    const c = card(t, "big fill");
    addRm(c, () => { mode = null; targetId = null; renderQuick(); renderCat(); renderStage(); });
    tb.appendChild(c);
  } else tb.innerHTML = '<div class="ph-hint">Выбери цель апгрейда<br>на рынке скинов справа внизу</div>';

  updateChance();
  syncStakeUI();
}

// ---------- ползунок баланса ----------
let balCardOn = false, stakeAnim = 0, deltaBase = null, deltaTimer = 0;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function syncStakeUI() {
  const el = $("stakeBal");
  const max = Math.max(0, Math.floor(state.balance));
  const val = Math.min(Math.floor(stakeBal), max);
  el.max = max; el.value = val;
  el.disabled = busy || max <= 0;
  const p = max ? (val / max) * 100 : 0;
  el.style.setProperty("--p", p + "%");
  $("stakeBalVal").textContent = money(val);
  $("stakeBalPct").textContent = Math.round(p) + "% баланса";
}
// Лёгкое обновление без перерисовки карточек (пока тянешь ползунок)
function onStakeChanged() {
  const on = Math.min(stakeBal, state.balance) > 0;
  if (on !== balCardOn) return renderStage();
  const price = document.querySelector(".balcard .cp");
  if (price) price.textContent = money(Math.min(stakeBal, state.balance));
  updateChance();
}
function changeStake(v) {
  const before = calcChance();
  setStakeBal(Math.max(0, Math.floor(v)));
  syncStakeUI(); onStakeChanged();
  trackDelta(before, calcChance());
}
// Плавно докручиваем ползунок до нужного значения (кнопки +1 000, Макс, Сбросить)
function animateStake(to) {
  cancelAnimationFrame(stakeAnim);
  const from = Math.floor(stakeBal), t0 = performance.now(), dur = reducedMotion() ? 0 : 380;
  const step = (now) => {
    const k = dur ? Math.min(1, (now - t0) / dur) : 1;
    changeStake(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) stakeAnim = requestAnimationFrame(step);
  };
  step(t0);
}
// «▲ +2.40%» рядом с колесом: на сколько шанс изменился с начала движения
function trackDelta(before, after) {
  const el = $("chanceDelta");
  if (deltaBase === null) deltaBase = before;
  const d = after - deltaBase;
  clearTimeout(deltaTimer);
  if (Math.abs(d) < 0.005) { el.classList.remove("show"); deltaBase = null; return; }
  el.textContent = (d > 0 ? "▲ +" : "▼ −") + Math.abs(d).toFixed(2) + "%";
  el.className = "delta show " + (d > 0 ? "up" : "down");
  deltaTimer = setTimeout(() => { el.classList.remove("show"); deltaBase = null; }, 1600);
}

$("stakeBal").addEventListener("input", (e) => {
  if (busy) return syncStakeUI();
  cancelAnimationFrame(stakeAnim);
  changeStake(+e.target.value || 0);
});
document.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => {
  if (busy) return;
  animateStake(Math.min(Math.floor(state.balance), Math.floor(stakeBal) + +b.dataset.add));
}));
$("stakeClear").addEventListener("click", () => { if (!busy) animateStake(0); });
$("stakeMax").addEventListener("click", () => { if (!busy) animateStake(Math.floor(state.balance)); });

// ---------- колесо: два вида ----------
// Оба вида рисуют одно и то же: зона выигрыша = дуга внизу окружности, по центру внизу,
// шириной шанс × 3.6°. 0% внизу, 50% по бокам, 100% вверху.
//   old: круг заливается снизу (как жидкость)
//   new: шанс идёт по окружности двумя дугами от низа
const WHEEL = { cx: 170, cy: 170, ring: 112, disc: 104, lambda: 170 };
const WM_KEY = "downgrader_wheel_mode";
let wheelMode = "new";
try { const m = localStorage.getItem(WM_KEY); if (m === "old" || m === "new") wheelMode = m; } catch (e) {}
let shownChance = 0, goalChance = 0, chanceRaf = 0;

const SVGNS = "http://www.w3.org/2000/svg";
function svgEl(name, attrs) {
  const el = document.createElementNS(SVGNS, name);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}
(function buildDial() {
  const g = $("dialTicks"), { cx, cy } = WHEEL;
  for (let p = 0; p <= 100; p += 5) {
    const a = (p * 1.8 * Math.PI) / 180, major = p % 25 === 0;
    const r1 = major ? 125 : 129, r2 = 136;
    for (const side of p === 0 || p === 100 ? [1] : [-1, 1]) {
      g.appendChild(svgEl("line", {
        class: "w-tick" + (major ? " major" : ""),
        x1: cx + side * r1 * Math.sin(a), y1: cy + r1 * Math.cos(a),
        x2: cx + side * r2 * Math.sin(a), y2: cy + r2 * Math.cos(a),
      }));
    }
  }
  // волна на поверхности «жидкости»: ровно два периода, чтобы сдвиг на lambda шёл без шва
  const L = WHEEL.lambda, A = 4;
  let top = "";
  for (let x = -L; x <= 340 + L; x += 10) top += (top ? " L " : "M ") + x + " " + (A * Math.sin((2 * Math.PI * x) / L)).toFixed(2);
  $("waveLine").setAttribute("d", top);
  $("wavePath").setAttribute("d", top + ` L ${340 + L} 300 L ${-L} 300 Z`);
})();

function chanceColor(c) {
  const stops = [[0, [255, 93, 108]], [45, [255, 200, 87]], [100, [93, 240, 176]]];
  let i = 1; while (i < stops.length - 1 && c > stops[i][0]) i++;
  const [c0, a] = stops[i - 1], [c1, b] = stops[i];
  const k = Math.max(0, Math.min(1, (c - c0) / (c1 - c0)));
  return "rgb(" + a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(",") + ")";
}
function tierOf(c) {
  if (c <= 0) return "выбери ставку и цель";
  if (c < 10) return "рискованно";
  if (c < 30) return "низкий шанс";
  if (c < 55) return "средний шанс";
  if (c < 80) return "высокий шанс";
  return "СУПЕР!";
}
function drawWheel(c) {
  const { cx, cy, ring, disc } = WHEEL;
  const phi = (Math.min(c, 99.9) * 1.8 * Math.PI) / 180;   // полуширина зоны, от низа
  let d = "";
  if (c > 0.001) {
    const sx = ring * Math.sin(phi), y = cy + ring * Math.cos(phi);
    d = `M ${(cx - sx).toFixed(2)} ${y.toFixed(2)} A ${ring} ${ring} 0 ${phi > Math.PI / 2 ? 1 : 0} 0 ${(cx + sx).toFixed(2)} ${y.toFixed(2)}`;
  }
  $("arc").setAttribute("d", d);
  $("arcGlow").setAttribute("d", d);
  // жидкость: поверхность на высоте концов дуги
  const Y = cy + disc * Math.cos(phi);
  $("liquidPos").setAttribute("transform", `translate(0 ${Y.toFixed(2)})`);
  $("liquidGrad").setAttribute("y1", (cy + disc - Y).toFixed(2));
  $("liquidGrad").setAttribute("y2", (cy - disc - Y).toFixed(2));
  $("liquidGrp").setAttribute("opacity", c > 0.05 ? 1 : 0);
  const col = chanceColor(c);
  $("wPct").textContent = c.toFixed(2) + "%";
  $("wPct").setAttribute("fill", c > 0 ? col : "#7ea597");
  $("wTier").textContent = tierOf(c);
  $("wTier").setAttribute("fill", c > 0 ? col : "#7ea597");
}
// Число и заливка догоняют цель плавно, поэтому проценты «набегают» вслед за ползунком
function setChance(c) {
  goalChance = c;
  if (!chanceRaf) chanceRaf = requestAnimationFrame(chanceTick);
}
function chanceTick() {
  const diff = goalChance - shownChance;
  if (Math.abs(diff) < 0.005 || reducedMotion()) { shownChance = goalChance; chanceRaf = 0; }
  else { shownChance += diff * 0.2; chanceRaf = requestAnimationFrame(chanceTick); }
  drawWheel(shownChance);
}
function updateChance() {
  const c = calcChance(), t = skinById(targetId), st = stakeSum();
  setChance(c);
  $("mult").textContent = t && st > 0 && c > 0 ? "x" + (t.price / st).toFixed(2) : "—";
  $("upgrade").disabled = busy || c <= 0;
}
function renderWheelMode() {
  $("wheelWrap").classList.toggle("m-old", wheelMode === "old");
  $("wheelWrap").classList.toggle("m-new", wheelMode === "new");
  document.querySelectorAll(".wbtn").forEach((b) => b.classList.toggle("active", b.dataset.wmode === wheelMode));
}
document.querySelectorAll(".wbtn").forEach((b) => b.addEventListener("click", () => {
  wheelMode = b.dataset.wmode; renderWheelMode();
  try { localStorage.setItem(WM_KEY, wheelMode); } catch (e) {}
}));
renderWheelMode();
drawWheel(0);

function flash(text, cls) { $("result").textContent = text; $("result").className = "result " + (cls || ""); }

$("upgrade").addEventListener("click", async () => {
  if (busy || calcChance() <= 0 || !account) return;
  busy = true; flash(""); renderStage();
  $("wheelWrap").classList.remove("win", "lose");
  let res;
  try {
    await settleClicks(true);
    res = await api("spin", { uids: [...selected], balance: Math.min(stakeBal, state.balance), targetId });
  } catch (e) {
    busy = false;
    if (e.status !== 401) { toast(e.message); refresh(); }
    renderStage();
    return;
  }
  // Исход уже решён в storage.js, тут мы только красиво его показываем
  const { win, chance, targetName } = res.result;
  setChance(chance);
  const w = chance * 3.6, m = Math.min(0.5, w / 4);   // ширина зоны выигрыша, градусы, и отступ от края
  const lo = 180 - w / 2;                              // зона по центру внизу (0° = стрелка сверху)
  const angle = win
    ? lo + m + Math.random() * (w - 2 * m)
    : (180 + w / 2 + m + Math.random() * (360 - w - 2 * m)) % 360;
  const dur = spinSeconds();
  rotation = rotation - (rotation % 360) + 360 * (state.speed === "fast" ? 3 : 6) + angle;
  $("pointer").style.transition = `transform ${dur}s cubic-bezier(.12, .6, .1, 1)`;
  $("pointer").style.transform = `rotate(${rotation}deg)`;

  setTimeout(() => {
    selected.clear(); setStakeBal(0);
    busy = false;
    applyState(res);
    $("wheelWrap").classList.add(win ? "win" : "lose");
    flash(win ? "Успех! Получен " + targetName : "В этот раз не вышло", win ? "win" : "lose");
    refresh();
  }, dur * 1000 + 200);
});

// ---------- вкладки нижнего блока ----------
document.querySelectorAll(".ptab").forEach((btn) => btn.addEventListener("click", () => {
  document.querySelectorAll(".ptab").forEach((b) => b.classList.toggle("active", b === btn));
  ["inv", "buy"].forEach((p) => $("pane-" + p).classList.toggle("hidden", p !== btn.dataset.pane));
  renderBuy();
}));

// ---------- быстрый выбор цели (x2, x3, 25%, свой %) ----------
function setMode(t, v) {
  if (busy) return;
  if (autoTop) { stakeBal = Math.max(0, stakeBal - autoTop); autoTop = 0; syncStakeUI(); }
  mode = { t, v };
  if (stakeSum() <= 0) toast("Сначала выбери ставку");
  renderQuick(); renderStage();
  if (!mode && targetId) toast("Шанс: " + calcChance().toFixed(2) + "%");
}
function renderQuick() {
  document.querySelectorAll(".qbtn[data-t]").forEach((b) => {
    b.classList.toggle("active", !!mode && b.dataset.t === mode.t && +b.dataset.v === mode.v);
  });
}
document.querySelectorAll(".qbtn[data-t]").forEach((b) =>
  b.addEventListener("click", () => { $("qCustom").value = ""; setMode(b.dataset.t, +b.dataset.v); }));
function applyCustom() {
  const v = parseFloat($("qCustom").value);
  if (!(v >= MIN_CHANCE && v <= MAX_CHANCE)) return toast("Шанс от " + MIN_CHANCE + " до " + MAX_CHANCE + "%");
  setMode("p", v);
}
$("qApply").addEventListener("click", applyCustom);
$("qCustom").addEventListener("keydown", (e) => { if (e.key === "Enter") applyCustom(); });

// ---------- скорость прокрутки ----------
const SPEEDS = { slow: 6, fast: 1.5 };
function spinSeconds() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0.2;
  return SPEEDS[state.speed] || SPEEDS.slow;
}
function renderSpeed() {
  document.querySelectorAll(".sbtn").forEach((b) => b.classList.toggle("active", b.dataset.speed === state.speed));
}
document.querySelectorAll(".sbtn").forEach((b) => b.addEventListener("click", () => {
  if (busy) return;
  state.speed = b.dataset.speed; renderSpeed();
  api("profile", { speed: state.speed }).catch((e) => toast(e.message));
}));

function renderAll() { renderTop(); renderProfile(); renderInv(); renderBuy(); renderCat(); renderStage(); renderQuick(); renderSpeed(); updateAdminUI(); }


// ---------- аккаунты ----------
let authMode = "login";
function showAuth() {
  $("aUser").value = ""; $("aPass").value = ""; $("aErr").textContent = "";
  ["profile", "deposit", "admin"].forEach((id) => { if ($(id).open) $(id).close(); });
  if (!$("auth").open) $("auth").showModal();
}
$("auth").addEventListener("cancel", (e) => e.preventDefault());   // закрыть окно без входа нельзя

function enterSession(d) {
  selected.clear(); setStakeBal(0); targetId = null; mode = null;
  flash("");
  account = null;   // чтобы applyState не считал это фоновым обновлением
  applyState(d);
}

document.querySelectorAll(".atab").forEach((b) => b.addEventListener("click", () => {
  authMode = b.dataset.mode;
  document.querySelectorAll(".atab").forEach((x) => x.classList.toggle("active", x === b));
  $("aAdminRow").classList.toggle("hidden", authMode !== "register");
  $("aPass").autocomplete = authMode === "login" ? "current-password" : "new-password";
  $("authSubmit").textContent = authMode === "login" ? "Войти" : "Создать аккаунт";
  $("aErr").textContent = "";
}));

async function submitAuth() {
  const login = $("aUser").value.trim(), password = $("aPass").value;
  const err = (t) => { $("aErr").textContent = t; };
  if (!/^[a-z0-9_а-яё]{3,16}$/i.test(login)) return err("Логин: 3–16 символов, буквы, цифры и _");
  if (password.length < 8) return err("Пароль минимум 8 символов");
  $("authSubmit").disabled = true;
  try {
    const d = await api(authMode, authMode === "login" ? { login, password } : { login, password, wantAdmin: $("aAdmin").checked });
    $("auth").close(); enterSession(d);
    if (d.note) toast(d.note);
  } catch (e) { err(e.message); }
  $("authSubmit").disabled = false;
}
$("authSubmit").addEventListener("click", submitAuth);
["aUser", "aPass"].forEach((id) => $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") submitAuth(); }));

$("logout").addEventListener("click", async () => {
  $("profile").close();
  try { await api("logout", {}); } catch (e) {}
  account = null; state = defaultState(); selected.clear(); setStakeBal(0); targetId = null; mode = null;
  renderAll(); showAuth();
});

// ---------- админка (права проверяются в storage.js) ----------
function updateAdminUI() {
  const a = isAdmin();
  $("openAdmin").classList.toggle("hidden", !a);
  const n = a ? pendingAdmin : 0;
  $("adminBadge").textContent = n;
  $("adminBadge").classList.toggle("hidden", !n);
}

function urow(parts) {
  const d = document.createElement("div");
  d.className = "urow";
  parts.forEach((p) => d.appendChild(p));
  return d;
}
const span = (text, cls) => { const s = document.createElement("span"); s.textContent = text; if (cls) s.className = cls; return s; };
function button(text, cls, fn) {
  const b = document.createElement("button");
  b.textContent = text; b.className = cls; b.addEventListener("click", fn);
  return b;
}
async function adminCall(path, body) {
  try {
    const d = await api(path, body);
    if (d.state) applyState(d, true);
    if (d.users) drawAdmin(d.users);
    return d;
  } catch (e) { toast(e.message); return null; }
}
async function renderAdmin() {
  $("adAuto").textContent = state.autoWin ? "Выключить" : "Включить";
  $("adAuto").className = "btn small" + (state.autoWin ? "" : " ghost");
  $("adHint").textContent = `Сейчас: ${state.autoWin ? "ВКЛ" : "ВЫКЛ"}. Когда шанс ${ADMIN_LOW}% или ниже, твои улучшения всегда выигрываются.`;
  try { drawAdmin((await api("admin/users")).users); } catch (e) { toast(e.message); }
}
function drawAdmin(users) {
  const req = $("adReq");
  req.innerHTML = "";
  const list = users.filter((u) => u.adminRequest);
  pendingAdmin = list.length; updateAdminUI();
  if (!list.length) req.innerHTML = '<div class="hint">Заявок нет</div>';
  list.forEach((u) => req.appendChild(urow([
    span(u.display, "grow"),
    button("Одобрить", "btn small", () => adminCall("admin/decide", { login: u.login, ok: true })),
    button("Отклонить", "mini", () => adminCall("admin/decide", { login: u.login, ok: false })),
  ])));

  const box = $("adUsers");
  box.innerHTML = "";
  users.forEach((u) => {
    const input = document.createElement("input");
    input.type = "number"; input.min = "0"; input.placeholder = "₸";
    box.appendChild(urow([
      span(u.display + (u.role === "admin" ? " (админ)" : ""), "grow"),
      span(money(u.login === account.login ? state.balance : u.balance), ""),
      input,
      button("OK", "mini", () => {
        const v = parseFloat(input.value);
        if (!(v >= 0)) return toast("Введи сумму");
        adminCall("admin/balance", { login: u.login, value: v });
      }),
    ]));
  });
}

$("openAdmin").addEventListener("click", () => { if (!isAdmin()) return; renderAdmin(); $("admin").showModal(); });
$("closeAdmin").addEventListener("click", () => $("admin").close());
$("adSet").addEventListener("click", () => {
  const v = parseFloat($("adBal").value);
  if (!(v >= 0)) return toast("Введи сумму");
  adminCall("admin/balance", { login: account.login, value: v });
});
$("adAdd").addEventListener("click", () => {
  const v = parseFloat($("adBal").value);
  if (!(v > 0)) return toast("Введи сумму");
  adminCall("admin/balance", { login: account.login, value: Math.floor(state.balance) + v });
});
$("adAuto").addEventListener("click", async () => {
  if (!isAdmin()) return;
  const d = await adminCall("admin/autowin", { on: !state.autoWin });
  if (d) { renderAdmin(); toast("Автоматический залет: " + (state.autoWin ? "ВКЛ" : "ВЫКЛ")); }
});

// ---------- картинки и редкости скинов ----------
// Берём из открытой базы ByMykel/CSGO-API (интернет нужен один раз), результат кэшируем в localStorage.
// Редкость (Классифайд/Тайное) берётся оттуда же и исправляет ошибки в data.js.
const IMG_SOURCES = [
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json",
  "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins_not_grouped.json",
];
const API_RARITY = { "Consumer Grade": "W", "Industrial Grade": "I", "Mil-Spec Grade": "M", Restricted: "R", Classified: "C", Covert: "T", Contraband: "O" };   // ножи и перчатки (K, G) не трогаем
let IMG = {};
const normName = (n) => n.replace(/[’‘]/g, "'").replace(/^(StatTrak™|Souvenir)\s*/i, "").replace(/^★\s*(StatTrak™\s*)?/, "")
  .replace(/\s*\([^)]*\)\s*$/, "").trim().toLowerCase();

function applyRarity(map) {
  SKINS.forEach((sk) => { if (map[sk.id]) sk.r = map[sk.id]; });
}
function skinImage(skin) {
  const url = IMG[skin.id];
  const ph = () => Object.assign(document.createElement("span"), { className: "cimg ph", textContent: "CS" });
  if (!url) return ph();
  const im = document.createElement("img");
  im.className = "cimg"; im.alt = ""; im.loading = "lazy"; im.src = url;
  im.addEventListener("error", () => im.replaceWith(ph()));
  return im;
}

async function loadImages() {
  let rar = null;
  try { IMG = JSON.parse(localStorage.getItem(IMG_KEY)) || {}; } catch (e) { IMG = {}; }
  try { rar = JSON.parse(localStorage.getItem(RAR_KEY)); } catch (e) {}
  if (rar) applyRarity(rar);
  if (rar && Object.keys(IMG).length >= SKINS.length * 0.9) return;   // всё уже в кэше

  const imgs = {}, rars = {};
  let ok = false;
  for (const src of IMG_SOURCES) {
    try {
      const list = await (await fetch(src)).json();
      const byName = {};
      list.forEach((x) => { const k = normName(x.name); if (!byName[k]) byName[k] = x; });
      SKINS.forEach((sk) => {
        const x = byName[normName(sk.name)];
        if (!x) return;
        if (!imgs[sk.id] && x.image && /^https:\/\//.test(x.image)) imgs[sk.id] = x.image;
        if (!rars[sk.id] && x.rarity && x.rarity.name && sk.r !== "K" && sk.r !== "G") rars[sk.id] = API_RARITY[x.rarity.name] || sk.r;
      });
      ok = true;
    } catch (e) { console.warn("База скинов не загрузилась (нужен интернет):", src, e); }
    if (Object.keys(imgs).length >= SKINS.length * 0.9) break;
  }
  if (!ok) return;
  IMG = imgs;
  const fixed = SKINS.filter((sk) => rars[sk.id] && rars[sk.id] !== sk.r).map((sk) => `${sk.name}: ${sk.r} → ${rars[sk.id]}`);
  if (fixed.length) console.info("Редкость исправлена по базе:", fixed);
  const miss = SKINS.filter((sk) => !imgs[sk.id]).map((sk) => sk.name);
  if (miss.length) console.info("Нет картинки/данных для:", miss);
  applyRarity(rars);
  try {
    localStorage.setItem(IMG_KEY, JSON.stringify(imgs));
    localStorage.setItem(RAR_KEY, JSON.stringify(rars));
  } catch (e) {}
  renderAll();
}

// ---------- пополнение и конвертер валют ----------
// Курс берётся онлайн раз в 6 часов и кэшируется в localStorage. Без интернета работает запасной.
const FX = { KZT: 1, USD: RATE, RUB: 5.15, live: false };   // запасные значения, пока курс не загрузился
const FX_KEY = "downgrader_fx_v1", FX_TTL = 6 * 3600 * 1000;
const CUR_SYM = { KZT: "₸", RUB: "₽", USD: "$" };
const fmtCur = (n, c) => (c === "KZT" ? Math.floor(n) : Math.round(n * 100) / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " " + CUR_SYM[c];

function useFx(c) {
  if (!(c && c.USD > 100 && c.USD < 2000 && c.RUB > 1 && c.RUB < 100)) return false;
  FX.USD = c.USD; FX.RUB = c.RUB; FX.live = true;
  return true;
}
async function loadFx() {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(FX_KEY)); } catch (e) {}
  if (cached && useFx(cached)) { renderTop(); renderDeposit(); if (Date.now() - cached.ts < FX_TTL) return; }
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD");
    const d = await r.json();
    const kzt = d.rates && d.rates.KZT, rub = d.rates && d.rates.RUB;
    const c = { USD: kzt, RUB: kzt / rub, ts: Date.now() };
    if (!useFx(c)) throw new Error("странный курс");
    try { localStorage.setItem(FX_KEY, JSON.stringify(c)); } catch (e) {}
    renderTop(); renderDeposit();
  } catch (e) { console.warn("Курс валют не загрузился, используется запасной:", e); }
}

const dpAmount = () => { const v = parseFloat($("dpAmt").value); return v > 0 ? v : 0; };
function renderDeposit() {
  const cur = $("dpCur").value, tg = dpAmount() * FX[cur];
  $("dpRate").textContent = `Курс: 1 $ = ${FX.USD.toFixed(2)} ₸, 1 ₽ = ${FX.RUB.toFixed(2)} ₸ (${FX.live ? "онлайн" : "запасной, без интернета"})`;
  $("dpLimit").textContent = `Лимит одного пополнения: ${money(DEPOSIT_MAX)} (≈ ${fmtCur(DEPOSIT_MAX / FX.USD, "USD")} · ${fmtCur(DEPOSIT_MAX / FX.RUB, "RUB")})`;
  $("dpConv").innerHTML = ["KZT", "RUB", "USD"].map((c) => `<div>${fmtCur(tg / FX[c], c)}</div>`).join("");
  const over = tg > DEPOSIT_MAX;
  $("dpErr").textContent = over ? "Это больше лимита пополнения" : "";
  $("dpGo").disabled = over || Math.floor(tg) <= 0;
}
$("openDeposit").addEventListener("click", () => { renderDeposit(); $("deposit").showModal(); });
$("closeDeposit").addEventListener("click", () => $("deposit").close());
["dpAmt", "dpCur"].forEach((id) => $(id).addEventListener("input", renderDeposit));
$("dpGo").addEventListener("click", async () => {
  const amount = dpAmount();
  if (!(amount > 0)) return;
  $("dpGo").disabled = true;
  const d = await act("deposit", { amount, currency: $("dpCur").value });
  if (d) { $("dpAmt").value = ""; toast("Пополнено: +" + money(d.deposited)); }
  renderDeposit();
});

// ---------- старт ----------
loadImages();
loadFx();
(async function boot() {
  await Store.ready;
  try { enterSession(await api("me")); }
  catch (e) { renderAll(); showAuth(); }
  if (Store.notice) { const t = Store.notice; Store.clearNotice(); alert(t); }   // пароль нового админа, один раз
})();

"use strict";
// «База данных» DownGrader: всё хранится в localStorage браузера (ключ downgrader_db_v1).
// Здесь же игровая логика, которая раньше жила на Node-сервере: покупка, продажа, фарм,
// улучшения, пополнение, сам апгрейд, аккаунты и админка. Интерфейс тот же: Store.call(путь, тело).
const Store = (() => {
  const DB_KEY = "downgrader_db_v1";
  const SESSION_MS = 7 * 24 * 3600 * 1000;
  const LOGIN_RE = /^[a-z0-9_а-яё]{3,16}$/i;
  const AVATAR_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
  const ACCRUE_CAP_MS = 30000;               // автофарм начисляется, только пока страница открыта
  const CLICK_RATE = 15, CLICK_BURST = 30;   // антиавтокликер: 15 кликов/сек, пачка до 30
  const MAX_INV = 2000, MAX_BALANCE = 1e12;
  const PBKDF2_ITER = 150000, FALLBACK_ITER = 20000;

  class GameError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
  }
  const str = (v) => (typeof v === "string" ? v : "");
  const round2 = (x) => Math.round(x * 100) / 100;
  const skinById = new Map(SKINS.map((s) => [s.id, s]));

  // ---------- случайные числа ----------
  function randomBytes(n) { return crypto.getRandomValues(new Uint8Array(n)); }
  const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  function randomToken(n) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    return Array.from(randomBytes(n), (b) => chars[b % chars.length]).join("");
  }
  function secureRoll() {   // [0; 100), без перекоса распределения
    const lim = 4294967296 - (4294967296 % 1000000), a = new Uint32Array(1);
    do { crypto.getRandomValues(a); } while (a[0] >= lim);
    return (a[0] % 1000000) / 10000;
  }

  // ---------- пароли ----------
  // PBKDF2 из WebCrypto. Он доступен на https и localhost (и в file://). Если страница открыта по обычному http
  // с другого адреса, WebCrypto нет, и тогда используется запасной вариант на чистом JS (слабее).
  function sha256(bytes) {
    const K = new Uint32Array([
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
    const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const len = bytes.length, total = (((len + 9 + 63) >> 6) << 6);
    const m = new Uint8Array(total);
    m.set(bytes); m[len] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(total - 8, Math.floor((len * 8) / 4294967296)); dv.setUint32(total - 4, (len * 8) >>> 0);
    const w = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }
    const out = new Uint8Array(32), odv = new DataView(out.buffer);
    h.forEach((v, i) => odv.setUint32(i * 4, v));
    return out;
  }
  const utf8 = (s) => new TextEncoder().encode(s);
  const hasSubtle = () => !!(globalThis.crypto && crypto.subtle);

  async function derive(password, salt, algo) {
    if (algo === "pbkdf2") {
      if (!hasSubtle()) throw new GameError("Для входа нужен https или localhost (в этом режиме нет WebCrypto)");
      const key = await crypto.subtle.importKey("raw", utf8(password), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: utf8(salt), iterations: PBKDF2_ITER }, key, 256);
      return toHex(new Uint8Array(bits));
    }
    let cur = sha256(utf8(salt + ":" + password));
    for (let i = 0; i < FALLBACK_ITER; i++) cur = sha256(cur);
    return toHex(cur);
  }
  async function hashPassword(password, salt = toHex(randomBytes(16))) {
    const algo = hasSubtle() ? "pbkdf2" : "sha256x";
    return { salt, algo, hash: await derive(password, salt, algo) };
  }
  async function verifyPassword(password, user) {
    const got = await derive(password, user.salt, user.algo || "pbkdf2");
    if (got.length !== user.hash.length) return false;
    let diff = 0;
    for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ user.hash.charCodeAt(i);
    return diff === 0;
  }

  // ---------- хранилище ----------
  function readDb() {
    let db = null;
    try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch { /* пусто или повреждено */ }
    if (!db || typeof db !== "object") db = {};
    if (!db.users || typeof db.users !== "object" || Array.isArray(db.users)) db.users = {};
    return db;
  }
  function writeDb(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
    catch { throw new GameError("Не удалось сохранить: память браузера переполнена или недоступна", 507); }
  }
  const usersList = (db) => Object.values(db.users).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const hasAdmin = (db) => usersList(db).some((u) => u.role === "admin");
  const countRequests = (db) => usersList(db).filter((u) => u.adminRequest).length;

  // ---------- игровая логика ----------
  function defaultState(now = Date.now()) {
    return { balance: 500, inventory: [], nextUid: 1, clicks: 0, clickLvl: 0, autoLvl: 0, nick: "Игрок", avatar: "", speed: "slow", autoWin: false, lastTick: now, tokens: CLICK_BURST, tokTs: now };
  }
  function loadState(raw) {
    const s = { ...defaultState(), ...(raw && typeof raw === "object" ? raw : {}) };
    s.inventory = Array.isArray(s.inventory) ? s.inventory.filter((i) => i && skinById.has(i.id) && Number.isInteger(i.uid)) : [];
    if (!Number.isFinite(s.balance)) s.balance = 0;
    return s;
  }
  function publicState(s, isAdmin) {   // то, что уходит в интерфейс (без служебных полей)
    const { lastTick, tokens, tokTs, ...rest } = s;
    rest.autoWin = isAdmin && !!s.autoWin;
    return rest;
  }
  const clickPower = (s) => CLICK_BASE * Math.pow(1.5, s.clickLvl);
  const autoPower = (s) => (s.autoLvl ? AUTO_BASE * Math.pow(1.5, s.autoLvl - 1) : 0);
  const clickCost = (s) => CLICK_COST * Math.pow(1.8, s.clickLvl);
  const autoCost = (s) => AUTO_COST * Math.pow(1.9, s.autoLvl);

  function accrue(s, now = Date.now()) {
    const dt = Math.min(Math.max(0, now - s.lastTick), ACCRUE_CAP_MS);
    s.lastTick = now;
    const p = autoPower(s);
    if (p && dt) s.balance = round2(s.balance + (p * dt) / 1000);
    s.tokens = Math.min(CLICK_BURST, s.tokens + (Math.max(0, now - s.tokTs) / 1000) * CLICK_RATE);
    s.tokTs = now;
  }
  function farm(s, n) {
    n = Math.floor(Number(n));
    if (!Number.isFinite(n) || n < 1) throw new GameError("Неверное число кликов");
    const take = Math.min(n, 500, Math.floor(s.tokens));
    s.tokens -= take;
    s.balance = round2(s.balance + take * clickPower(s));
    s.clicks += take;
  }
  function levelUp(s, kind) {
    if (kind !== "click" && kind !== "auto") throw new GameError("Неизвестное улучшение");
    const cost = kind === "click" ? clickCost(s) : autoCost(s);
    if (s.balance < cost) throw new GameError("Не хватает баланса");
    s.balance = round2(s.balance - cost);
    if (kind === "click") s.clickLvl++; else s.autoLvl++;
  }
  function buy(s, id) {
    const skin = skinById.get(id);
    if (!skin || skin.r === "X") throw new GameError("Такого скина нет");
    if (s.inventory.length >= MAX_INV) throw new GameError("Инвентарь переполнен");
    if (s.balance < skin.price) throw new GameError("Не хватает баланса");
    s.balance = round2(s.balance - skin.price);
    s.inventory.push({ uid: s.nextUid++, id: skin.id });
    return skin;
  }
  function sell(s, uid) {
    const idx = s.inventory.findIndex((i) => i.uid === uid);
    if (idx < 0) throw new GameError("Предмета нет в инвентаре");
    s.balance = round2(s.balance + skinById.get(s.inventory[idx].id).price);
    s.inventory.splice(idx, 1);
  }
  function calcChance(stake, targetPrice) {
    if (!(stake > 0) || targetPrice <= stake) return 0;
    return Math.min(MAX_CHANCE, Math.max(MIN_CHANCE, (stake / targetPrice) * 100 * HOUSE_EDGE));
  }
  function spin(s, body, isAdmin, roll = secureRoll) {
    const uids = Array.isArray(body.uids) ? body.uids : [];
    if (uids.length > 200 || !uids.every(Number.isInteger)) throw new GameError("Неверная ставка");
    const set = new Set(uids);
    const items = s.inventory.filter((i) => set.has(i.uid));
    if (items.length !== set.size) throw new GameError("Этого предмета нет в инвентаре");
    let bal = Number(body.balance);
    if (!Number.isFinite(bal) || bal < 0) bal = 0;
    bal = Math.min(bal, s.balance);
    const target = skinById.get(body.targetId);
    if (!target || target.r === "X") throw new GameError("Цель не выбрана");
    const stake = items.reduce((a, i) => a + skinById.get(i.id).price, 0) + bal;
    const chance = calcChance(stake, target.price);
    if (chance <= 0) throw new GameError("Ставка должна быть больше нуля и меньше цены цели");

    let win = roll() < chance;
    if (isAdmin && s.autoWin && chance <= ADMIN_LOW) win = true;   // «автоматический залет» админа

    s.balance = round2(s.balance - bal);
    s.inventory = s.inventory.filter((i) => !set.has(i.uid));
    if (win) s.inventory.push({ uid: s.nextUid++, id: target.id });
    return { win, chance, targetId: target.id, targetName: target.name };
  }
  function deposit(s, amount, currency, fx) {
    const rate = currency === "KZT" ? 1 : currency === "USD" ? fx.USD : currency === "RUB" ? fx.RUB : 0;
    amount = Number(amount);
    if (!(rate > 0) || !Number.isFinite(amount) || amount <= 0) throw new GameError("Неверная сумма");
    const tg = Math.floor(amount * rate);
    if (tg <= 0) throw new GameError("Сумма слишком мала");
    if (tg > DEPOSIT_MAX) throw new GameError("Это больше лимита пополнения");
    s.balance = round2(s.balance + tg);
    return tg;
  }
  function setProfile(s, body) {
    if (body.nick !== undefined) {
      const nick = String(body.nick).replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 20);
      s.nick = nick || "Игрок";
    }
    if (body.avatar !== undefined) {
      if (body.avatar !== "" && (typeof body.avatar !== "string" || body.avatar.length > 60000 || !AVATAR_RE.test(body.avatar))) throw new GameError("Неверная картинка");
      s.avatar = body.avatar;
    }
    if (body.speed !== undefined) {
      if (body.speed !== "slow" && body.speed !== "fast") throw new GameError("Неверная скорость");
      s.speed = body.speed;
    }
  }
  function resetState(s) {
    const fresh = defaultState();
    fresh.nick = s.nick;
    Object.keys(s).forEach((k) => delete s[k]);
    Object.assign(s, fresh);
  }
  function setBalance(s, v) {
    v = Number(v);
    if (!Number.isFinite(v) || v < 0 || v > MAX_BALANCE) throw new GameError("Неверная сумма");
    s.balance = round2(v);
  }

  // ---------- ответы с актуальным состоянием игрока ----------
  const publicUser = (u) => ({ login: u.login, display: u.display, role: u.role, adminRequest: !!u.adminRequest });
  function payload(db, user, state) {
    const admin = user.role === "admin";
    return { user: publicUser(user), state: publicState(state, admin), pending: admin ? countRequests(db) : 0 };
  }
  // Загрузили → изменили → сохранили, всё синхронно, поэтому вкладки не перебивают друг друга на полпути.
  function run(db, user, fn) {
    const state = loadState(user.state);
    accrue(state);
    const extra = fn ? fn(state) : undefined;
    user.state = state;
    writeDb(db);
    return { ...payload(db, user, state), ...(extra || {}) };
  }
  const adminList = (db) => usersList(db).map((u) => ({
    login: u.login, display: u.display, role: u.role, adminRequest: !!u.adminRequest, balance: Math.floor(loadState(u.state).balance),
  }));
  const requireAdmin = (u) => { if (u.role !== "admin") throw new GameError("Нет прав", 403); };
  function needUser(db, login) {
    const u = db.users[str(login).toLowerCase()];
    if (!u) throw new GameError("Пользователь не найден", 404);
    return u;
  }
  function sessionUser(db) {
    const s = db.session;
    if (!s || typeof s !== "object" || !(s.exp > Date.now())) return null;
    return db.users[s.login] || null;
  }
  function startSession(db, login) { db.session = { login, exp: Date.now() + SESSION_MS }; }

  // ---------- маршруты ----------
  async function register(db, body) {
    const display = str(body.login).trim(), key = display.toLowerCase(), pass = str(body.password);
    if (!LOGIN_RE.test(display)) throw new GameError("Логин: 3–16 символов, буквы, цифры и _");
    if (pass.length < 8 || pass.length > 128) throw new GameError("Пароль: от 8 до 128 символов");
    if (db.users[key]) throw new GameError("Этот логин уже занят", 409);
    const { salt, hash, algo } = await hashPassword(pass);
    const fresh = readDb();   // пока считался хеш, другая вкладка могла занять логин
    if (fresh.users[key]) throw new GameError("Этот логин уже занят", 409);
    const wantAdmin = body.wantAdmin === true;
    const state = defaultState(); state.nick = display;
    const user = { login: key, display, salt, hash, algo, role: "user", adminRequest: wantAdmin, state, createdAt: Date.now() };
    fresh.users[key] = user;
    startSession(fresh, key);
    return { ...run(fresh, user), note: wantAdmin ? "Заявка на админа отправлена, ждёт одобрения" : "" };
  }
  async function login(db, body) {
    const key = str(body.login).trim().toLowerCase(), pass = str(body.password);
    const user = db.users[key];
    if (!user || !(await verifyPassword(pass.slice(0, 128), user))) throw new GameError("Неверный логин или пароль", 401);
    const fresh = readDb();
    if (!fresh.users[key]) throw new GameError("Неверный логин или пароль", 401);
    startSession(fresh, key);
    return run(fresh, fresh.users[key]);
  }

  const authed = {   // нужна сессия; обработчик возвращает функцию над состоянием игрока (см. run)
    me: () => () => undefined,
    farm: ({ body }) => (s) => farm(s, body.n),
    levelup: ({ body }) => (s) => levelUp(s, body.kind),
    buy: ({ body }) => (s) => ({ bought: buy(s, body.id).name }),
    sell: ({ body }) => (s) => sell(s, body.uid),
    spin: ({ body, user }) => (s) => ({ result: spin(s, body, user.role === "admin") }),
    profile: ({ body }) => (s) => setProfile(s, body),
    reset: () => (s) => resetState(s),
    deposit: ({ body, fx }) => (s) => ({ deposited: deposit(s, body.amount, str(body.currency), fx) }),

    // ----- админка -----
    "admin/users": ({ user, db }) => { requireAdmin(user); return () => ({ users: adminList(db) }); },
    "admin/autowin": ({ user, body }) => { requireAdmin(user); return (s) => { s.autoWin = body.on === true; }; },
    "admin/balance": ({ user, body, db }) => {
      requireAdmin(user);
      const target = needUser(db, body.login);
      if (target.login === user.login) return (s) => setBalance(s, body.value);
      return () => {
        const ts = loadState(target.state);
        accrue(ts);
        setBalance(ts, body.value);
        target.state = ts;
      };
    },
    "admin/decide": ({ user, body, db }) => {
      requireAdmin(user);
      const target = needUser(db, body.login);
      return () => {
        if (!target.adminRequest) throw new GameError("Заявки нет");
        if (body.ok === true) target.role = "admin";
        target.adminRequest = false;
      };
    },
  };
  const WITH_USERS = new Set(["admin/balance", "admin/decide"]);   // после этих действий отдаём свежий список игроков

  async function call(path, body, ctx) {
    await ready;
    body = body && typeof body === "object" ? body : {};
    const fx = { USD: RATE, RUB: 5.15, ...((ctx && ctx.fx) || {}) };
    if (path === "register") return register(readDb(), body);
    if (path === "login") return login(readDb(), body);

    const db = readDb();
    if (path === "logout") { delete db.session; writeDb(db); return { ok: true }; }
    const route = authed[path];
    if (!route) throw new GameError("Не найдено", 404);
    const user = sessionUser(db);
    if (!user) throw new GameError("Нужно войти", 401);
    const fn = route({ body, user, db, fx });
    const res = run(db, user, fn);
    if (WITH_USERS.has(path)) res.users = adminList(db);
    return res;
  }

  // ---------- первый админ ----------
  // Создаётся при первом запуске, если в базе ещё нет ни одного админа. Логин и пароль задаются в data.js
  // (ADMIN_LOGIN, ADMIN_PASSWORD). Если пароль пустой или короче 8 символов, он генерируется и показывается один раз.
  const api = { notice: "" };
  async function bootstrapAdmin() {
    const db = readDb();
    if (hasAdmin(db)) return;
    const login = str(ADMIN_LOGIN || "admin").trim().toLowerCase();
    if (!LOGIN_RE.test(login)) { console.warn("ADMIN_LOGIN в data.js некорректен, админ не создан"); return; }
    if (db.users[login]) { console.warn(`Логин ${login} уже занят обычным игроком, админ не создан`); return; }
    let pass = str(ADMIN_PASSWORD), generated = false;
    if (pass.length < 8) { pass = randomToken(12); generated = true; }
    const { salt, hash, algo } = await hashPassword(pass);
    db.users[login] = { login, display: login, salt, hash, algo, role: "admin", adminRequest: false, state: defaultState(), createdAt: Date.now() };
    writeDb(db);
    if (generated) {
      api.notice = `Создан админ-аккаунт.\nЛогин: ${login}\nПароль: ${pass}\n\nЗапиши пароль: он показывается один раз. Свой пароль можно задать в data.js (ADMIN_PASSWORD).`;
      console.log(`=== Админ: ${login} / ${pass} (показывается один раз) ===`);
    }
  }

  // Назначить админом или сменить пароль, не теряя данные игроков (аналог прежней команды `npm run admin`).
  // Вызывать из консоли браузера: Store.setAdmin("логин", "новый пароль")
  async function setAdmin(loginRaw, pass) {
    const login = str(loginRaw).trim().toLowerCase();
    pass = str(pass);
    if (!LOGIN_RE.test(login) || pass.length < 8 || pass.length > 128) throw new Error("Логин 3–16 символов, пароль от 8 символов");
    const db = readDb();
    const { salt, hash, algo } = await hashPassword(pass);
    const u = db.users[login];
    if (u) { Object.assign(u, { salt, hash, algo, role: "admin", adminRequest: false }); }
    else db.users[login] = { login, display: login, salt, hash, algo, role: "admin", adminRequest: false, state: defaultState(), createdAt: Date.now() };
    if (db.session && db.session.login === login) delete db.session;   // старая сессия закрывается
    writeDb(db);
    return `Готово: ${login} теперь админ, пароль заменён`;
  }

  const ready = bootstrapAdmin().catch((e) => { console.error("Не удалось создать админа:", e); });
  return { call, ready, setAdmin, DB_KEY, get notice() { return api.notice; }, clearNotice() { api.notice = ""; } };
})();

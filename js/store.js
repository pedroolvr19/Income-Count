/* Camada de dados: contas de usuário + armazenamento criptografado (PBKDF2 + AES-GCM 256) */
'use strict';

const Store = (() => {
  const USERS_KEY = 'fm_users';
  const DATA_PREFIX = 'fm_data_';
  const SESSION_KEY = 'fm_session';
  const ATTEMPTS_KEY = 'fm_attempts';
  const ITERATIONS = 150000;
  const MAX_ATTEMPTS = 5;
  const LOCK_MS = 60000;

  const te = new TextEncoder(), td = new TextDecoder();
  let current = null; // { email, name, key, data }

  const toB64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const readJSON = (k, fb, st = localStorage) => { try { return JSON.parse(st.getItem(k)) ?? fb; } catch { return fb; } };
  const users = () => readJSON(USERS_KEY, {});
  const saveUsers = u => localStorage.setItem(USERS_KEY, JSON.stringify(u));
  const normEmail = e => String(e || '').trim().toLowerCase();

  function emptyData() {
    return {
      version: 1,
      transactions: [],
      budgets: {},        // { categoriaId: limiteMensal }
      goals: [],          // metas de economia
      recurrences: [],    // receitas/despesas recorrentes
      accounts: [],       // contas bancárias e cartões
      imports: [],        // histórico de faturas importadas
      settings: { theme: 'light', notified: {} }
    };
  }
  function migrate(d) {
    const base = emptyData();
    const out = Object.assign(base, d || {});
    out.settings = Object.assign(emptyData().settings, (d && d.settings) || {});
    ['transactions', 'goals', 'recurrences', 'accounts', 'imports'].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
    if (typeof out.budgets !== 'object' || !out.budgets) out.budgets = {};
    return out;
  }

  async function derive(password, saltB64) {
    const base = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromB64(saltB64), iterations: ITERATIONS, hash: 'SHA-256' }, base, 512));
    // 256 bits para verificação de senha + 256 bits para a chave AES (independentes entre si)
    return { auth: toB64(bits.slice(0, 32)), keyRaw: bits.slice(32) };
  }
  const importKey = raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  async function encrypt(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
    return { iv: toB64(iv), ct: toB64(ct) };
  }
  async function decrypt(key, box) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(box.iv) }, key, fromB64(box.ct));
    return JSON.parse(td.decode(pt));
  }
  function safeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

  /* --- proteção contra força bruta --- */
  function checkLock(email) {
    const a = readJSON(ATTEMPTS_KEY, {})[email];
    if (a && a.until && a.until > Date.now()) {
      const s = Math.ceil((a.until - Date.now()) / 1000);
      throw new Error(`Muitas tentativas. Tente novamente em ${s}s.`);
    }
  }
  function registerFail(email) {
    const all = readJSON(ATTEMPTS_KEY, {});
    const a = all[email] || { n: 0 };
    if (a.until && a.until <= Date.now()) a.until = 0;
    a.n = (a.n || 0) + 1;
    if (a.n >= MAX_ATTEMPTS) { a.until = Date.now() + LOCK_MS; a.n = 0; }
    all[email] = a; localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(all));
  }
  function clearFail(email) { const all = readJSON(ATTEMPTS_KEY, {}); delete all[email]; localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(all)); }

  function persistSession(email, keyRaw, remember) {
    const payload = JSON.stringify({ email, k: toB64(keyRaw) });
    sessionStorage.setItem(SESSION_KEY, payload);
    if (remember) localStorage.setItem(SESSION_KEY, payload); else localStorage.removeItem(SESSION_KEY);
  }
  function clearSession() { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); }

  async function open(email, keyRaw) {
    const u = users()[email];
    if (!u) throw new Error('Conta não encontrada.');
    const key = await importKey(keyRaw);
    const raw = localStorage.getItem(DATA_PREFIX + email);
    const data = raw ? migrate(await decrypt(key, JSON.parse(raw))) : emptyData();
    current = { email, name: u.name, key, data };
    return current;
  }

  async function register(name, email, password) {
    email = normEmail(email);
    const all = users();
    if (all[email]) throw new Error('Já existe uma conta com este e-mail.');
    const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
    const { auth, keyRaw } = await derive(password, salt);
    all[email] = { name: name.trim(), salt, auth, created: new Date().toISOString() };
    saveUsers(all);
    current = { email, name: name.trim(), key: await importKey(keyRaw), data: emptyData() };
    await save();
    persistSession(email, keyRaw, false);
    return current;
  }

  async function login(email, password, remember) {
    email = normEmail(email);
    checkLock(email);
    const u = users()[email];
    if (!u) { registerFail(email); throw new Error('E-mail ou senha incorretos.'); }
    const { auth, keyRaw } = await derive(password, u.salt);
    if (!safeEqual(auth, u.auth)) { registerFail(email); throw new Error('E-mail ou senha incorretos.'); }
    clearFail(email);
    await open(email, keyRaw);
    persistSession(email, keyRaw, remember);
    return current;
  }

  async function restore() {
    const s = readJSON(SESSION_KEY, null, sessionStorage) || readJSON(SESSION_KEY, null);
    if (!s || !s.email || !s.k) return null;
    try {
      await open(s.email, fromB64(s.k));
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      return current;
    } catch { clearSession(); return null; }
  }

  let saving = Promise.resolve();
  function save() {
    if (!current) return Promise.resolve();
    const { key, email } = current;
    const snapshot = JSON.parse(JSON.stringify(current.data));
    saving = saving.then(async () => {
      const box = await encrypt(key, snapshot);
      try { localStorage.setItem(DATA_PREFIX + email, JSON.stringify(box)); }
      catch (e) { toast('Não foi possível salvar: armazenamento cheio.', 'error'); throw e; }
    });
    return saving;
  }

  async function changePassword(oldPw, newPw) {
    const all = users(); const u = all[current.email];
    const { auth } = await derive(oldPw, u.salt);
    if (!safeEqual(auth, u.auth)) throw new Error('Senha atual incorreta.');
    const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
    const d = await derive(newPw, salt);
    u.salt = salt; u.auth = d.auth; all[current.email] = u; saveUsers(all);
    current.key = await importKey(d.keyRaw);
    await save();
    persistSession(current.email, d.keyRaw, !!localStorage.getItem(SESSION_KEY));
  }

  function updateName(name) {
    const all = users(); all[current.email].name = name; saveUsers(all); current.name = name;
  }

  async function deleteAccount(password) {
    const all = users(); const u = all[current.email];
    const { auth } = await derive(password, u.salt);
    if (!safeEqual(auth, u.auth)) throw new Error('Senha incorreta.');
    localStorage.removeItem(DATA_PREFIX + current.email);
    delete all[current.email]; saveUsers(all);
    logout();
  }

  function logout() { clearSession(); current = null; }

  return {
    get current() { return current; },
    get data() { return current && current.data; },
    emptyData, migrate, register, login, restore, save, logout, changePassword, updateName, deleteAccount
  };
})();

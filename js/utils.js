/* Utilitários gerais: formatação BR, datas, DOM */
'use strict';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const NUM2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PCT = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });

const fmt = v => BRL.format(Math.round((Number(v) || 0) * 100) / 100);
const fmtNum = v => NUM2.format(Number(v) || 0);
const fmtPct = v => PCT.format(isFinite(v) ? v : 0);

const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => toISO(new Date());
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDate = iso => iso ? iso.split('-').reverse().join('/') : '';
const monthKey = iso => iso.slice(0, 7);
const currentMonth = () => todayISO().slice(0, 7);
const monthLabel = key => { const [y, m] = key.split('-').map(Number); return `${MONTHS[m - 1]} de ${y}`; };
const monthShort = key => { const [y, m] = key.split('-').map(Number); return `${MONTHS_SHORT[m - 1]}/${String(y).slice(2)}`; };
const addMonths = (key, n) => { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const daysInMonth = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const monthEnd = key => `${key}-${pad(daysInMonth(key))}`;
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

/** Converte "DD/MM/AAAA" em ISO (AAAA-MM-DD). Retorna null se inválida. */
function parseBRDate(str) {
  const m = String(str || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m.map(Number);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  if (y < 1900 || y > 2200) return null;
  return toISO(dt);
}

/** Converte "1.234,56", "1234.56", "R$ 10" em número. */
function parseMoney(str) {
  let s = String(str ?? '').trim().replace(/[R$\s ]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
  const v = parseFloat(s);
  return isFinite(v) ? Math.round(v * 100) / 100 : NaN;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const sum = (arr, f = t => t.amount) => arr.reduce((s, t) => s + (Number(f(t)) || 0), 0);
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const slug = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function icons() { if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': 2 } }); }

function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function toast(msg, type = 'success') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const ic = { success: 'circle-check', error: 'circle-x', warning: 'triangle-alert', info: 'info' }[type] || 'info';
  el.innerHTML = `<i data-lucide="${ic}"></i><span>${esc(msg)}</span>`;
  box.appendChild(el);
  icons();
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3200);
}

/* ---------- Campos de formulário reutilizáveis ---------- */

function dateField(name, iso = '', { required = false, placeholder = 'DD/MM/AAAA', attrs = '' } = {}) {
  return `<div class="date-field">
    <input type="text" class="input" name="${name}" placeholder="${placeholder}" inputmode="numeric" maxlength="10" autocomplete="off" data-datemask value="${iso ? fmtDate(iso) : ''}" ${required ? 'required' : ''} ${attrs}>
    <button type="button" class="date-btn" data-datepick tabindex="-1" aria-label="Abrir calendário"><i data-lucide="calendar"></i></button>
    <input type="date" class="date-native" tabindex="-1" aria-hidden="true">
  </div>`;
}

function moneyField(name, value = '', attrs = '', ph = '0,00') {
  return `<div class="money-field"><span>R$</span><input type="text" class="input" name="${name}" inputmode="decimal" placeholder="${ph}" autocomplete="off" data-money value="${value !== '' && value != null ? fmtNum(value) : ''}" ${attrs}></div>`;
}

// Máscara de data DD/MM/AAAA
document.addEventListener('input', e => {
  const el = e.target;
  if (el.matches && el.matches('[data-datemask]')) {
    const digits = el.value.replace(/\D/g, '').slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    if (out !== el.value) el.value = out;
  }
  if (el.matches && el.matches('[data-money]')) {
    el.value = el.value.replace(/[^\d.,]/g, '');
  }
});
document.addEventListener('focusout', e => {
  const el = e.target;
  if (el.matches && el.matches('[data-money]') && el.value) {
    const v = parseMoney(el.value);
    if (isFinite(v)) el.value = fmtNum(v);
  }
});
document.addEventListener('click', e => {
  const btn = e.target.closest && e.target.closest('[data-datepick]');
  if (!btn) return;
  const wrap = btn.closest('.date-field');
  const text = $('[data-datemask]', wrap), nat = $('.date-native', wrap);
  nat.value = parseBRDate(text.value) || todayISO();
  try { nat.showPicker(); } catch { nat.focus(); nat.click(); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.matches && el.matches('.date-native') && el.value) {
    const text = $('[data-datemask]', el.closest('.date-field'));
    text.value = fmtDate(el.value);
    text.dispatchEvent(new Event('input', { bubbles: true }));
    text.dispatchEvent(new Event('change', { bubbles: true }));
  }
});

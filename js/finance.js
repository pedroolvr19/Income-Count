/* Regras financeiras: categorias, cálculos, recorrências e alertas */
'use strict';

const CATS = {
  in: [
    { id: 'salario', name: 'Salário', icon: 'briefcase', color: '#059669' },
    { id: 'freelance', name: 'Freelance', icon: 'laptop', color: '#0ea5e9' },
    { id: 'investimentos', name: 'Investimentos', icon: 'trending-up', color: '#8b5cf6' },
    { id: 'vendas', name: 'Vendas', icon: 'store', color: '#f59e0b' },
    { id: 'outros_in', name: 'Outros', icon: 'circle-plus', color: '#64748b' }
  ],
  out: [
    { id: 'alimentacao', name: 'Alimentação', icon: 'utensils', color: '#f97316' },
    { id: 'transporte', name: 'Transporte', icon: 'car', color: '#3b82f6' },
    { id: 'moradia', name: 'Moradia', icon: 'house', color: '#8b5cf6' },
    { id: 'saude', name: 'Saúde', icon: 'heart-pulse', color: '#ef4444' },
    { id: 'lazer', name: 'Lazer', icon: 'gamepad-2', color: '#ec4899' },
    { id: 'educacao', name: 'Educação', icon: 'graduation-cap', color: '#14b8a6' },
    { id: 'compras', name: 'Compras', icon: 'shopping-bag', color: '#eab308' },
    { id: 'contas', name: 'Contas', icon: 'receipt', color: '#6366f1' },
    { id: 'outros_out', name: 'Outros', icon: 'ellipsis', color: '#64748b' }
  ]
};
const ALL_CATS = [...CATS.in, ...CATS.out];
const catById = id => ALL_CATS.find(c => c.id === id) || { id, name: 'Outros', icon: 'circle', color: '#64748b' };
const BANKS = [
  { name: 'Nubank', color: '#820ad1' }, { name: 'Bradesco', color: '#cc092f' }, { name: 'Itaú', color: '#ec7000' },
  { name: 'Banco do Brasil', color: '#0038a8' }, { name: 'Caixa', color: '#005ca9' }, { name: 'Santander', color: '#ec0000' },
  { name: 'Inter', color: '#ff7a00' }, { name: 'C6 Bank', color: '#2d2d2d' }, { name: 'PicPay', color: '#11c76f' },
  { name: 'Mercado Pago', color: '#00a6e0' }, { name: 'Neon', color: '#00a5e3' }, { name: 'XP', color: '#1f1f1f' },
  { name: 'Sicredi', color: '#3fa110' }, { name: 'Sicoob', color: '#00a091' }, { name: 'Outro', color: '#059669' }
];
const ACC_TYPES = { credit: { name: 'Cartão de crédito', icon: 'credit-card' }, checking: { name: 'Conta corrente', icon: 'landmark' }, savings: { name: 'Poupança', icon: 'piggy-bank' }, wallet: { name: 'Carteira / dinheiro', icon: 'wallet' }, invest: { name: 'Investimentos', icon: 'trending-up' } };
const bankColor = name => (BANKS.find(b => norm(b.name) === norm(name)) || BANKS[BANKS.length - 1]).color;
const FREQ = { daily: 'Diária', weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual' };
const FREQ_MONTHLY_FACTOR = { daily: 30.44, weekly: 4.345, monthly: 1, yearly: 1 / 12 };

const F = {
  get d() { return Store.data; },
  get txs() { return Store.data.transactions; },

  isIn: t => t.type === 'in',
  isOut: t => t.type === 'out',

  monthList(key) { return this.txs.filter(t => t.date.slice(0, 7) === key); },
  rangeList(from, to) { return this.txs.filter(t => (!from || t.date >= from) && (!to || t.date <= to)); },

  stats(list) {
    const inc = sum(list.filter(F.isIn));
    const outs = list.filter(F.isOut);
    const exp = sum(outs);
    const paid = sum(outs.filter(t => t.paid));
    return {
      inc, exp, paid, pending: exp - paid, net: inc - exp,
      fixed: sum(outs.filter(t => t.fixed)), variable: sum(outs.filter(t => !t.fixed)),
      incRecurring: sum(list.filter(t => F.isIn(t) && t.recurring)), incOccasional: sum(list.filter(t => F.isIn(t) && !t.recurring)),
      count: list.length, rate: inc > 0 ? (inc - exp) / inc : 0
    };
  },
  monthStats(key) { return this.stats(this.monthList(key)); },

  /** Saldo disponível: saldos iniciais das contas + receitas já recebidas (até hoje) − despesas pagas */
  balance() {
    const t = todayISO();
    const initial = sum(this.accounts.filter(a => a.type !== 'credit'), a => a.initialBalance || 0);
    return initial + sum(this.txs.filter(x => F.isIn(x) && x.date <= t)) - sum(this.txs.filter(x => F.isOut(x) && x.paid));
  },

  /* ----- Contas e cartões ----- */
  get accounts() { return Store.data.accounts; },
  accountById(id) { return this.accounts.find(a => a.id === id) || null; },
  accountTx(id) { return this.txs.filter(t => (id === 'none' ? !t.accountId || !this.accountById(t.accountId) : t.accountId === id)); },
  accountSummary(a, key) {
    const all = this.accountTx(a.id), t = todayISO();
    const month = all.filter(x => x.date.slice(0, 7) === key);
    const ms = this.stats(month);
    const balance = (a.initialBalance || 0) + sum(all.filter(x => F.isIn(x) && x.date <= t)) - sum(all.filter(x => F.isOut(x) && x.paid));
    const open = sum(all.filter(x => F.isOut(x) && !x.paid));
    const lastImport = [...this.d.imports].filter(i => i.accountId === a.id).sort((x, y) => (y.importedAt || '').localeCompare(x.importedAt || ''))[0];
    return { ...ms, balance, open, count: all.length, available: a.limit ? a.limit - open : null, lastImport };
  },
  byAccount(list) {
    const map = {};
    list.filter(F.isOut).forEach(t => { const k = t.accountId && this.accountById(t.accountId) ? t.accountId : 'none'; map[k] = (map[k] || 0) + t.amount; });
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    return Object.entries(map).map(([id, v]) => ({ acc: id === 'none' ? { id: 'none', name: 'Sem conta', color: '#94a3b8', type: 'wallet' } : this.accountById(id), total: v, pct: total ? v / total : 0 })).sort((a, b) => b.total - a.total);
  },
  /** Saldo acumulado até o fim de um mês (para evolução) */
  balanceUntil(iso) {
    const l = this.txs.filter(x => x.date <= iso);
    return sum(l.filter(F.isIn)) - sum(l.filter(F.isOut));
  },

  byCategory(list, type = 'out') {
    const map = {};
    list.filter(t => t.type === type).forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
    const total = Object.values(map).reduce((a, b) => a + b, 0);
    return Object.entries(map).map(([id, v]) => ({ cat: catById(id), total: v, pct: total ? v / total : 0 })).sort((a, b) => b.total - a.total);
  },

  lastMonths(n, endKey = currentMonth()) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(addMonths(endKey, -i)); return out; },
  yearMonths(year) { return Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`); },

  topExpenses(list, n = 5) { return list.filter(F.isOut).sort((a, b) => b.amount - a.amount).slice(0, n); },

  avgMonthlyExpense(cat, endKey, months = 3) {
    const keys = this.lastMonths(months, addMonths(endKey, -1));
    const vals = keys.map(k => sum(this.monthList(k).filter(t => F.isOut(t) && (!cat || t.category === cat))));
    const used = vals.filter(v => v > 0);
    return used.length ? used.reduce((a, b) => a + b, 0) / used.length : 0;
  },

  /* ----- Orçamento ----- */
  budgetStatus(key) {
    const list = this.monthList(key).filter(F.isOut);
    return CATS.out.map(c => {
      const limit = Number(this.d.budgets[c.id]) || 0;
      const spent = sum(list.filter(t => t.category === c.id));
      const ratio = limit ? spent / limit : 0;
      return { cat: c, limit, spent, left: limit - spent, ratio, level: !limit ? 'none' : ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok' };
    });
  },
  budgetAlerts(key = currentMonth()) { return this.budgetStatus(key).filter(b => b.level === 'warn' || b.level === 'over'); },

  /* ----- Recorrências ----- */
  nextOccurrence(iso, freq, day, month) {
    const d = parseISO(iso);
    if (freq === 'daily') { d.setDate(d.getDate() + 1); return toISO(d); }
    if (freq === 'weekly') { d.setDate(d.getDate() + 7); return toISO(d); }
    if (freq === 'monthly') {
      let y = d.getFullYear(), m = d.getMonth() + 1;
      if (m > 11) { m = 0; y++; }
      return toISO(new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate())));
    }
    const y = d.getFullYear() + 1, m = month;
    return toISO(new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate())));
  },

  /** Gera as transações das recorrências cujo vencimento já chegou. Retorna quantas foram criadas. */
  processRecurrences() {
    const today = todayISO();
    let created = 0;
    this.d.recurrences.forEach(r => {
      if (!r.active || !r.next) return;
      let guard = 0;
      while (r.next <= today && (!r.end || r.next <= r.end) && guard++ < 1000) {
        this.txs.push({
          id: uid(), type: r.type, desc: r.desc, amount: r.amount, date: r.next, category: r.category,
          recurring: true, fixed: r.type === 'out' ? !!r.fixed : false,
          paid: r.type === 'in' ? true : !!r.autoPay, recId: r.id, accountId: r.accountId || '', notes: '', createdAt: new Date().toISOString()
        });
        created++;
        r.next = this.nextOccurrence(r.next, r.freq, r.day, r.month);
      }
      if (r.end && r.next > r.end) { r.active = false; r.finished = true; }
    });
    return created;
  },

  monthlyImpact(r) { return r.amount * (FREQ_MONTHLY_FACTOR[r.freq] || 1); },

  /** Próximas ocorrências (ainda não geradas) de uma recorrência até uma data limite */
  upcomingOf(r, limitISO) {
    const out = []; if (!r.active || !r.next) return out;
    let n = r.next, g = 0;
    while (n <= limitISO && (!r.end || n <= r.end) && g++ < 400) { out.push(n); n = this.nextOccurrence(n, r.freq, r.day, r.month); }
    return out;
  },

  /** Contas pendentes vencidas ou que vencem nos próximos `days` dias */
  dueItems(days = 7) {
    const t = todayISO(), lim = addDays(t, days);
    const items = this.txs.filter(x => F.isOut(x) && !x.paid && x.date <= lim)
      .map(x => ({ kind: 'tx', id: x.id, desc: x.desc, amount: x.amount, date: x.date, category: x.category, overdue: x.date < t, days: daysBetween(t, x.date) }));
    this.d.recurrences.filter(r => r.type === 'out' && r.active && !r.autoPay).forEach(r => {
      this.upcomingOf(r, lim).filter(d => d > t).forEach(d => items.push({ kind: 'rec', id: r.id, desc: r.desc, amount: r.amount, date: d, category: r.category, overdue: false, days: daysBetween(t, d) }));
    });
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }
};

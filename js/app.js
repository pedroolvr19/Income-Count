/* Finance Manager — interface, rotas e interações */
'use strict';

const S = {
  route: 'dashboard',
  month: currentMonth(),
  year: new Date().getFullYear(),
  reportMode: 'month',
  charts: {},
  afterRender: [],
  inc: { q: '', cat: '', kind: '', acc: '', all: false },
  exp: { q: '', cat: '', status: '', kind: '', acc: '', all: false },
  hist: { q: '', type: '', cat: '', status: '', acc: '', from: '', to: '', sort: 'date-desc', limit: 60 },
  importAcc: '',
  chat: []
};

const ROUTES = {
  dashboard: { title: 'Dashboard', icon: 'layout-dashboard', group: 'Principal', render: viewDashboard },
  contas: { title: 'Contas & Cartões', icon: 'landmark', group: 'Principal', render: viewAccounts },
  entradas: { title: 'Entradas', icon: 'circle-arrow-down', group: 'Principal', render: viewIncome },
  saidas: { title: 'Saídas', icon: 'circle-arrow-up', group: 'Principal', render: viewExpense },
  historico: { title: 'Histórico', icon: 'history', group: 'Principal', render: viewHistory },
  orcamento: { title: 'Orçamento & Metas', icon: 'piggy-bank', group: 'Planejamento', render: viewBudget },
  recorrentes: { title: 'Recorrentes', icon: 'repeat', group: 'Planejamento', render: viewRecurring },
  relatorios: { title: 'Relatórios', icon: 'chart-pie', group: 'Planejamento', render: viewReports },
  assistente: { title: 'Assistente', icon: 'sparkles', group: 'Inteligência', render: viewAssistant },
  config: { title: 'Configurações', icon: 'settings', group: 'Conta', render: viewSettings }
};

const after = fn => S.afterRender.push(fn);
const D = () => Store.data;

/* ======================================================================
   Inicialização e autenticação
   ====================================================================== */
document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  applyTheme(localStorage.getItem('fm_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  setupCharts();
  bindAuth();
  registerSW();
  icons();
  const u = await Store.restore();
  if (u) enterApp(); else showAuth();
}

function registerSW() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
}

function showAuth() {
  $('#app').classList.add('hidden');
  $('#auth').classList.remove('hidden');
  $('#loginForm').reset(); $('#registerForm').reset();
  $('[data-authtab="login"]').click();
  $('.pw-meter span').style.width = '0';
  $$('[data-error]').forEach(e => e.textContent = '');
}

function bindAuth() {
  $$('[data-authtab]').forEach(b => b.addEventListener('click', () => {
    $$('[data-authtab]').forEach(x => x.classList.toggle('active', x === b));
    $('#loginForm').classList.toggle('hidden', b.dataset.authtab !== 'login');
    $('#registerForm').classList.toggle('hidden', b.dataset.authtab !== 'register');
  }));
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-pwtoggle]'); if (!t) return;
    const inp = t.parentElement.querySelector('input');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    t.innerHTML = `<i data-lucide="${inp.type === 'password' ? 'eye' : 'eye-off'}"></i>`; icons();
  });
  const pw = $('#registerForm [name=password]');
  pw.addEventListener('input', () => {
    const v = pw.value; let sc = 0;
    if (v.length >= 6) sc++; if (v.length >= 10) sc++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) sc++; if (/\d/.test(v)) sc++; if (/[^A-Za-z0-9]/.test(v)) sc++;
    const bar = $('.pw-meter span');
    bar.style.width = `${Math.min(100, sc * 20)}%`;
    bar.style.background = sc <= 1 ? 'var(--expense)' : sc <= 3 ? 'var(--warn)' : 'var(--income)';
  });

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, err = $('[data-error]', f), btn = $('button[type=submit]', f);
    const email = f.email.value.trim(), password = f.password.value;
    err.textContent = '';
    if (!/^\S+@\S+\.\S+$/.test(email)) return err.textContent = 'Informe um e-mail válido.';
    if (!password) return err.textContent = 'Informe sua senha.';
    btn.disabled = true;
    try { await Store.login(email, password, f.remember.checked); enterApp(); }
    catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; }
  });

  $('#registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target, err = $('[data-error]', f), btn = $('button[type=submit]', f);
    const name = f.name.value.trim(), email = f.email.value.trim(), password = f.password.value;
    err.textContent = '';
    if (name.length < 2) return err.textContent = 'Informe seu nome.';
    if (!/^\S+@\S+\.\S+$/.test(email)) return err.textContent = 'Informe um e-mail válido.';
    if (password.length < 6) return err.textContent = 'A senha deve ter pelo menos 6 caracteres.';
    if (password !== f.confirm.value) return err.textContent = 'As senhas não coincidem.';
    btn.disabled = true;
    try { await Store.register(name, email, password); enterApp(); toast('Conta criada! Comece cadastrando suas entradas e saídas.'); }
    catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; }
  });
}

async function enterApp() {
  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');
  const created = F.processRecurrences();
  if (created) { await Store.save(); toast(`${created} lançamento(s) recorrente(s) gerado(s) automaticamente.`, 'info'); }
  S.chat = [];
  renderShell();
  if (!location.hash) location.hash = '#/dashboard'; else route();
  browserNotify();
  // Verifica recorrências periodicamente (app aberto por muito tempo / virada do dia)
  clearInterval(S.timer);
  S.timer = setInterval(async () => { if (Store.current && F.processRecurrences()) { await Store.save(); refresh(); } }, 60000);
}

function logout() {
  Store.logout(); destroyCharts(); clearInterval(S.timer);
  history.replaceState(null, '', location.pathname);
  showAuth();
}

/* ======================================================================
   Estrutura (menu, topo, notificações)
   ====================================================================== */
function renderShell() {
  const u = Store.current;
  $('#sideName').textContent = u.name;
  $('#sideEmail').textContent = u.email;
  $('#sideAvatar').textContent = u.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  let html = '', group = '';
  Object.entries(ROUTES).forEach(([k, r]) => {
    if (r.group !== group) { group = r.group; html += `<div class="nav-label">${group}</div>`; }
    html += `<a href="#/${k}" data-route="${k}"><i data-lucide="${r.icon}"></i><span>${r.title}</span>${k === 'saidas' ? '<span class="count hidden" id="navDue"></span>' : ''}</a>`;
  });
  $('#sideNav').innerHTML = html;
  icons();
}

window.addEventListener('hashchange', () => { if (Store.current) route(); });

function route() {
  const r = location.hash.replace(/^#\/?/, '') || 'dashboard';
  S.route = ROUTES[r] ? r : 'dashboard';
  render(true);
}

function render(resetScroll = false) {
  if (!Store.current) return;
  destroyCharts();
  S.afterRender = [];
  const r = ROUTES[S.route];
  $('#pageTitle').textContent = r.title;
  document.title = `${r.title} · Finance Manager`;
  $('#view').innerHTML = r.render();
  $$('[data-route]').forEach(a => a.classList.toggle('active', a.dataset.route === S.route));
  icons();
  S.afterRender.forEach(fn => fn());
  updateNotifs();
  closeDrawer();
  if (resetScroll) window.scrollTo({ top: 0 });
}
const refresh = () => render(false);

async function commit(msg, type = 'success') {
  await Store.save();
  refresh();
  if (msg) toast(msg, type);
}

function notifItems() {
  const items = F.dueItems(7).map(i => ({
    icon: i.overdue ? 'triangle-alert' : 'calendar-clock', level: i.overdue ? 'danger' : 'warn',
    title: `${i.desc} — ${fmt(i.amount)}`,
    sub: i.overdue ? `Vencida em ${fmtDate(i.date)}` : i.days === 0 ? 'Vence hoje' : `Vence em ${i.days} dia(s) · ${fmtDate(i.date)}`,
    act: i.kind === 'tx' ? `<button class="btn sm soft" data-act="toggle-paid" data-id="${i.id}">Pagar</button>` : '',
    go: i.kind === 'tx' ? 'saidas' : 'recorrentes'
  }));
  F.budgetAlerts().forEach(b => items.push({
    icon: 'piggy-bank', level: b.level === 'over' ? 'danger' : 'warn',
    title: b.level === 'over' ? `Orçamento de ${b.cat.name} ultrapassado` : `${b.cat.name}: ${fmtPct(b.ratio)} do orçamento`,
    sub: `${fmt(b.spent)} de ${fmt(b.limit)} neste mês`, act: '', go: 'orcamento'
  }));
  return items;
}

function updateNotifs() {
  const items = notifItems();
  const badge = $('#notifBadge');
  badge.textContent = items.length; badge.classList.toggle('hidden', !items.length);
  const overdue = F.dueItems(0).filter(i => i.kind === 'tx').length;
  const nav = $('#navDue'); if (nav) { nav.textContent = overdue; nav.classList.toggle('hidden', !overdue); }
  const panel = $('#notifPanel');
  panel.innerHTML = `<h4>Notificações <small class="muted">${items.length} alerta(s)</small></h4>` + (items.length
    ? items.map(i => `<div class="notif-item"><div class="dot ${i.level}"><i data-lucide="${i.icon}"></i></div><div style="flex:1;cursor:pointer" data-act="notif-go" data-go="${i.go}"><p>${esc(i.title)}</p><small>${i.sub}</small></div>${i.act}</div>`).join('')
    : `<div class="notif-empty"><i data-lucide="bell-off"></i><br>Nenhum alerta. Tudo em dia!</div>`);
  icons();
}

function browserNotify() {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !D().settings.notifications) return;
  const t = todayISO(); let changed = false;
  F.dueItems(3).forEach(i => {
    const key = `${i.id}:${i.date}`;
    if (D().settings.notified[key] === t) return;
    try { new Notification(i.overdue ? 'Conta vencida' : 'Conta próxima do vencimento', { body: `${i.desc} — ${fmt(i.amount)} · ${fmtDate(i.date)}`, icon: 'icons/icon-192.png', tag: key }); } catch { }
    D().settings.notified[key] = t; changed = true;
  });
  if (changed) Store.save();
}

function openDrawer() { $('#sidebar').classList.add('open'); $('#backdrop').classList.add('show'); }
function closeDrawer() { $('#sidebar').classList.remove('open'); $('#backdrop').classList.remove('show'); }

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('fm_theme', t);
  $('meta[name=theme-color]').setAttribute('content', t === 'dark' ? '#0b100e' : '#059669');
  const b = $('[data-act="toggle-theme"]'); if (b) { b.innerHTML = `<i data-lucide="${t === 'dark' ? 'sun' : 'moon'}"></i>`; icons(); }
  if (window.Chart) { Chart.defaults.color = cssVar('--muted'); Chart.defaults.borderColor = cssVar('--border'); }
}

/* ======================================================================
   Gráficos
   ====================================================================== */
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

function setupCharts() {
  if (!window.Chart) return;
  Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.plugins.tooltip.padding = 10;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.callbacks.label = ctx => ` ${ctx.dataset.label || ctx.label}: ${fmt(ctx.parsed.y ?? ctx.parsed)}`;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.boxWidth = 8;
  Chart.defaults.animation.duration = 700;
}
function chart(id, cfg) {
  after(() => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!window.Chart) { el.parentElement.innerHTML = '<p class="muted">Gráficos indisponíveis.</p>'; return; }
    Chart.defaults.color = cssVar('--muted'); Chart.defaults.borderColor = cssVar('--border');
    S.charts[id] = new Chart(el, cfg);
  });
}
function destroyCharts() { Object.values(S.charts).forEach(c => c.destroy()); S.charts = {}; }
const moneyAxis = { ticks: { callback: v => 'R$ ' + compact.format(v) }, grid: { color: () => cssVar('--border') }, border: { display: false } };
const plainAxis = { grid: { display: false }, border: { display: false } };

function flowChart(id, keys) {
  const st = keys.map(k => F.monthStats(k));
  chart(id, {
    data: {
      labels: keys.map(monthShort),
      datasets: [
        { type: 'bar', label: 'Receitas', data: st.map(s => s.inc), backgroundColor: cssVar('--income'), borderRadius: 6, maxBarThickness: 28, order: 1 },
        { type: 'bar', label: 'Despesas', data: st.map(s => s.exp), backgroundColor: cssVar('--expense'), borderRadius: 6, maxBarThickness: 28, order: 1 },
        { type: 'line', label: 'Saldo do mês', data: st.map(s => s.net), borderColor: cssVar('--balance'), backgroundColor: cssVar('--balance'), tension: .35, pointRadius: 3, borderWidth: 2, order: 0 }
      ]
    },
    options: { interaction: { mode: 'index', intersect: false }, scales: { y: moneyAxis, x: plainAxis }, plugins: { legend: { position: 'bottom' } } }
  });
}
function catChart(id, cats) {
  chart(id, {
    type: 'doughnut',
    data: { labels: cats.map(c => c.cat.name), datasets: [{ data: cats.map(c => c.total), backgroundColor: cats.map(c => c.cat.color), borderWidth: 2, borderColor: cssVar('--surface'), hoverOffset: 8 }] },
    options: { cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.parsed)} (${fmtPct(cats[ctx.dataIndex].pct)})` } } } }
  });
}
function balanceChart(id, keys) {
  chart(id, {
    type: 'line',
    data: { labels: keys.map(monthShort), datasets: [{ label: 'Saldo acumulado', data: keys.map(k => F.balanceUntil(monthEnd(k))), borderColor: cssVar('--primary'), backgroundColor: ctx => { const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, ctx.chart.height); g.addColorStop(0, 'rgba(16,185,129,.28)'); g.addColorStop(1, 'rgba(16,185,129,0)'); return g; }, fill: true, tension: .35, pointRadius: 3, borderWidth: 2.5 }] },
    options: { scales: { y: moneyAxis, x: plainAxis }, plugins: { legend: { display: false } } }
  });
}
function catLegend(cats) {
  return `<div class="tx-list" style="margin-top:14px">${cats.slice(0, 6).map(c => `
    <div style="display:flex;align-items:center;gap:10px;padding:6px 0;font-size:13.5px">
      <span style="width:10px;height:10px;border-radius:3px;background:${c.cat.color}"></span>
      <span style="flex:1">${c.cat.name}</span><b>${fmt(c.total)}</b><span class="muted" style="width:48px;text-align:right">${fmtPct(c.pct)}</span>
    </div>`).join('')}</div>`;
}

/* ======================================================================
   Componentes
   ====================================================================== */
const monthPicker = () => `<div class="month-picker"><button data-act="month-prev" aria-label="Mês anterior"><i data-lucide="chevron-left"></i></button><span>${monthLabel(S.month)}</span><button data-act="month-next" aria-label="Próximo mês"><i data-lucide="chevron-right"></i></button></div>`;
const yearPicker = () => `<div class="month-picker"><button data-act="year-prev"><i data-lucide="chevron-left"></i></button><span>${S.year}</span><button data-act="year-next"><i data-lucide="chevron-right"></i></button></div>`;

function stat(cls, label, value, icon, foot = '', valueCls = '') {
  return `<div class="card stat ${cls}"><div class="s-top"><span class="s-label">${label}</span><span class="s-ico"><i data-lucide="${icon}"></i></span></div>
    <div class="s-val ${valueCls}" title="${fmt(value)}">${fmt(value)}</div>${foot ? `<div class="s-foot">${foot}</div>` : ''}</div>`;
}
function change(cur, prev, upIsGood, prevKey) {
  if (!prev) return `<span class="chip neutral">sem dados de ${monthShort(prevKey)}</span>`;
  const p = (cur - prev) / Math.abs(prev);
  const good = upIsGood ? p >= 0 : p <= 0;
  return `<span class="chip ${good ? 'up' : 'down'}"><i data-lucide="${p >= 0 ? 'trending-up' : 'trending-down'}" style="width:13px;height:13px"></i>${p >= 0 ? '+' : ''}${fmtPct(p)}</span> vs ${monthShort(prevKey)}`;
}
function empty(icon, title, text, btn = '') {
  return `<div class="empty"><i data-lucide="${icon}"></i><h4>${title}</h4><p>${text}</p>${btn}</div>`;
}
function catOptions(type, sel = '', allLabel = null) {
  const list = type ? CATS[type] : ALL_CATS;
  let html = allLabel !== null ? `<option value="">${allLabel}</option>` : '';
  if (!type) {
    html += `<optgroup label="Receitas">${CATS.in.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.name}</option>`).join('')}</optgroup>`;
    html += `<optgroup label="Despesas">${CATS.out.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.name}</option>`).join('')}</optgroup>`;
    return html;
  }
  return html + list.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.name}</option>`).join('');
}

function accChip(id) {
  const a = id && F.accountById(id);
  return a ? `<span class="acc-chip" style="--c:${a.color}" title="${esc(ACC_TYPES[a.type]?.name || '')}"><i></i>${esc(a.name)}</span>` : '';
}
function accOptions(sel = '', allLabel = null, noneLabel = 'Sem conta') {
  let html = allLabel !== null ? `<option value="">${allLabel}</option>` : `<option value="">${noneLabel}</option>`;
  html += F.accounts.map(a => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)} · ${ACC_TYPES[a.type]?.name || ''}</option>`).join('');
  if (allLabel !== null) html += `<option value="none" ${sel === 'none' ? 'selected' : ''}>${noneLabel}</option>`;
  return html;
}
const accFilter = grp => F.accounts.length ? `<label class="field"><span>Conta</span><select class="input" data-f="${grp}.acc">${accOptions(S[grp].acc, 'Todas')}</select></label>` : '';

function txRow(t) {
  const c = catById(t.category), isIn = t.type === 'in', today = todayISO();
  const tags = [];
  if (isIn) tags.push(t.recurring ? '<span class="tag rec"><i data-lucide="repeat"></i>Recorrente</span>' : '<span class="tag">Eventual</span>');
  else {
    tags.push(`<span class="tag">${t.fixed ? 'Fixa' : 'Variável'}</span>`);
    tags.push(t.paid ? '<span class="tag paid">Pago</span>' : t.date < today ? '<span class="tag overdue">Vencida</span>' : '<span class="tag pending">Pendente</span>');
    if (t.recId) tags.push('<span class="tag rec" title="Gerada por recorrência"><i data-lucide="repeat"></i></span>');
  }
  return `<div class="tx-row">
    <div class="cat-ico" style="--c:${c.color}"><i data-lucide="${c.icon}"></i></div>
    <div class="tx-main"><div class="tx-desc" title="${esc(t.desc)}">${esc(t.desc)}</div>
      <div class="tx-meta"><span>${c.name}</span>·<span>${fmtDate(t.date)}</span>${accChip(t.accountId)}${tags.join('')}</div></div>
    <div class="tx-amt ${t.type}">${isIn ? '+' : '−'} ${fmt(t.amount)}</div>
    <div class="tx-actions">
      ${!isIn ? `<button class="icon-btn sm" data-act="toggle-paid" data-id="${t.id}" title="${t.paid ? 'Marcar como pendente' : 'Marcar como pago'}"><i data-lucide="${t.paid ? 'rotate-ccw' : 'check'}"></i></button>` : ''}
      <button class="icon-btn sm" data-act="edit-tx" data-id="${t.id}" title="Editar"><i data-lucide="pencil"></i></button>
      <button class="icon-btn sm" data-act="del-tx" data-id="${t.id}" title="Excluir"><i data-lucide="trash-2"></i></button>
    </div></div>`;
}

function filterTx(list, f) {
  const q = norm(f.q);
  return list.filter(t =>
    (!f.type || t.type === f.type) &&
    (!f.cat || t.category === f.cat) &&
    (!f.acc || (f.acc === 'none' ? !F.accountById(t.accountId) : t.accountId === f.acc)) &&
    (!f.status || (f.status === 'paid' ? t.type === 'out' && t.paid : f.status === 'pending' ? t.type === 'out' && !t.paid : f.status === 'overdue' ? t.type === 'out' && !t.paid && t.date < todayISO() : true)) &&
    (!f.kind || (f.kind === 'fixed' && t.fixed) || (f.kind === 'variable' && !t.fixed) || (f.kind === 'recurring' && t.recurring) || (f.kind === 'occasional' && !t.recurring)) &&
    (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to) &&
    (!q || norm(`${t.desc} ${t.notes || ''} ${catById(t.category).name}`).includes(q)));
}
function sortTx(list, mode = 'date-desc') {
  const [k, dir] = mode.split('-'); const m = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => k === 'amount' ? (a.amount - b.amount) * m : (a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || '')) * m);
}

/* ======================================================================
   VIEW: Dashboard
   ====================================================================== */
function viewDashboard() {
  const k = S.month, pk = addMonths(k, -1), s = F.monthStats(k), p = F.monthStats(pk), bal = F.balance();
  const allPending = sum(F.txs.filter(t => t.type === 'out' && !t.paid));
  const first = esc(Store.current.name.split(' ')[0]);
  const cats = F.byCategory(F.monthList(k));
  const recent = sortTx(F.txs).slice(0, 7);
  const due = F.dueItems(10).slice(0, 5);
  const alerts = F.budgetAlerts(k);
  const keys6 = F.lastMonths(6, k);
  flowChart('chFlow', keys6);
  if (cats.length) catChart('chCat', cats);

  return `
  <div class="page-head">
    <div><h2>Olá, ${first}!</h2><p>Resumo financeiro de ${monthLabel(k)}</p></div>
    <div class="page-actions">${monthPicker()}
      <button class="btn income hide-mobile" data-act="add-tx" data-type="in"><i data-lucide="plus"></i> Entrada</button>
      <button class="btn expense hide-mobile" data-act="add-tx" data-type="out"><i data-lucide="minus"></i> Saída</button>
    </div>
  </div>
  <div class="grid c4">
    ${stat('hero', 'Saldo total disponível', bal, 'wallet', allPending ? `${fmt(allPending)} em contas pendentes` : 'Nenhuma conta pendente')}
    ${stat('income', 'Receitas do mês', s.inc, 'circle-arrow-down', change(s.inc, p.inc, true, pk), 'pos')}
    ${stat('expense', 'Despesas do mês', s.exp, 'circle-arrow-up', change(s.exp, p.exp, false, pk), 'neg')}
    ${stat('net', 'Saldo restante do mês', s.net, 'scale', s.inc ? `Você ${s.net >= 0 ? 'economizou' : 'excedeu'} ${fmtPct(Math.abs(s.rate))} da renda` : (s.pending ? `${fmt(s.pending)} pendentes` : 'Receitas − despesas do mês'), s.net >= 0 ? 'bal' : 'neg')}
  </div>
  <div class="grid c21">
    <div class="card"><div class="card-head"><h3><i data-lucide="chart-column"></i> Entradas x Saídas</h3><span class="muted" style="font-size:13px">Últimos 6 meses</span></div>
      <div class="chart-box"><canvas id="chFlow"></canvas></div></div>
    <div class="card"><div class="card-head"><h3><i data-lucide="chart-pie"></i> Gastos por categoria</h3></div>
      ${cats.length ? `<div class="chart-box sm"><canvas id="chCat"></canvas></div>${catLegend(cats)}` : empty('chart-pie', 'Sem despesas no mês', 'Cadastre despesas para ver a distribuição.')}</div>
  </div>
  <div class="grid c21">
    <div class="card"><div class="card-head"><h3><i data-lucide="list"></i> Últimas movimentações</h3><a href="#/historico" class="btn sm ghost">Ver tudo <i data-lucide="arrow-right"></i></a></div>
      ${recent.length ? `<div class="tx-list">${recent.map(txRow).join('')}</div>` : empty('wallet', 'Nenhuma movimentação ainda', 'Comece registrando sua primeira entrada ou saída.', '<button class="btn primary" data-act="quick-add"><i data-lucide="plus"></i> Adicionar</button>')}</div>
    <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
      <div class="card"><div class="card-head"><h3><i data-lucide="landmark"></i> Gastos por conta</h3><a href="#/contas" class="btn sm ghost">Contas</a></div>${accountsMini(k)}</div>
      <div class="card"><div class="card-head"><h3><i data-lucide="calendar-clock"></i> Contas a vencer</h3><a href="#/saidas" class="btn sm ghost">Saídas</a></div>
        ${due.length ? due.map(i => `<div class="notif-item"><div class="dot ${i.overdue ? 'danger' : 'warn'}"><i data-lucide="${i.overdue ? 'triangle-alert' : 'clock'}"></i></div><div style="flex:1;min-width:0"><p class="tx-desc">${esc(i.desc)}</p><small>${i.overdue ? `Vencida em ${fmtDate(i.date)}` : i.days === 0 ? 'Vence hoje' : `${fmtDate(i.date)} · em ${i.days} dia(s)`}</small></div><b class="neg nowrap">${fmt(i.amount)}</b></div>`).join('') : `<div class="alert ok"><i data-lucide="circle-check"></i><p>Nenhuma conta pendente nos próximos 10 dias.</p></div>`}
      </div>
      <div class="card"><div class="card-head"><h3><i data-lucide="piggy-bank"></i> Orçamento</h3><a href="#/orcamento" class="btn sm ghost">Gerenciar</a></div>
        ${budgetMini(k, alerts)}
      </div>
    </div>
  </div>
  <div class="card"><div class="card-head"><h3><i data-lucide="chart-line"></i> Comparativo mensal</h3></div>${compareTable(keys6)}</div>`;
}

function accountsMini(k) {
  if (!F.accounts.length) return `<p class="muted" style="margin:0 0 12px">Cadastre suas contas e cartões (Nubank, Bradesco...) e importe as faturas em PDF.</p><a class="btn soft sm" href="#/contas"><i data-lucide="plus"></i> Adicionar conta</a>`;
  const by = F.byAccount(F.monthList(k));
  if (!by.length) return `<p class="muted" style="margin:0">Nenhum gasto em ${monthLabel(k)}.</p>`;
  return by.map(b => `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;gap:8px;font-size:14px;margin-bottom:6px"><span class="acc-chip" style="--c:${b.acc.color}"><i></i>${esc(b.acc.name)}</span><b class="neg">${fmt(b.total)}</b></div>
    <div class="progress"><span style="width:${b.pct * 100}%;background:${b.acc.color}"></span></div></div>`).join('');
}

function budgetMini(k, alerts) {
  const st = F.budgetStatus(k).filter(b => b.limit);
  if (!st.length) return `<p class="muted" style="margin:0 0 12px">Defina limites mensais por categoria para receber alertas.</p><a class="btn soft sm" href="#/orcamento"><i data-lucide="plus"></i> Definir orçamento</a>`;
  const tl = sum(st, b => b.limit), ts = sum(st, b => b.spent), r = tl ? ts / tl : 0;
  return `<div class="b-top" style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:8px"><span>${fmt(ts)} de ${fmt(tl)}</span><b>${fmtPct(r)}</b></div>
    <div class="progress ${r >= 1 ? 'over' : r >= .8 ? 'warn' : ''}"><span style="width:${Math.min(100, r * 100)}%"></span></div>
    <div style="margin-top:12px">${alerts.length ? alerts.slice(0, 3).map(a => `<div class="alert ${a.level}" style="margin-bottom:6px;padding:8px 12px"><i data-lucide="triangle-alert"></i><p>${a.cat.name}: ${fmtPct(a.ratio)} do limite</p></div>`).join('') : '<div class="alert ok" style="padding:8px 12px"><i data-lucide="circle-check"></i><p>Tudo dentro do orçamento.</p></div>'}</div>`;
}

function compareTable(keys) {
  const rows = keys.map((k, i) => { const s = F.monthStats(k), p = i ? F.monthStats(keys[i - 1]) : F.monthStats(addMonths(k, -1)); return { k, s, p }; }).reverse();
  const v = (a, b) => b ? `<span class="${a > b ? 'neg' : 'pos'}">${a >= b ? '+' : ''}${fmtPct((a - b) / b)}</span>` : '<span class="muted">—</span>';
  return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Mês</th><th class="r">Receitas</th><th class="r">Despesas</th><th class="r">Saldo</th><th class="r">Var. despesas</th><th class="r">Economia</th></tr></thead><tbody>
    ${rows.map(({ k, s, p }) => `<tr><td><b>${monthLabel(k)}</b></td><td class="r pos">${fmt(s.inc)}</td><td class="r neg">${fmt(s.exp)}</td><td class="r ${s.net >= 0 ? 'bal' : 'neg'}"><b>${fmt(s.net)}</b></td><td class="r">${v(s.exp, p.exp)}</td><td class="r">${s.inc ? fmtPct(s.rate) : '—'}</td></tr>`).join('')}
  </tbody></table></div>`;
}

/* ======================================================================
   VIEW: Contas & Cartões + importação de faturas
   ====================================================================== */
function viewAccounts() {
  const k = S.month, accs = F.accounts, by = F.byAccount(F.monthList(k));
  const imports = [...D().imports].sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || ''));
  if (by.length) chart('chAcc', {
    type: 'bar',
    data: { labels: by.map(b => b.acc.name), datasets: [{ label: 'Gastos', data: by.map(b => b.total), backgroundColor: by.map(b => b.acc.color), borderRadius: 8, maxBarThickness: 34 }] },
    options: { indexAxis: 'y', scales: { x: moneyAxis, y: plainAxis }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmt(c.parsed.x)} (${fmtPct(by[c.dataIndex].pct)})` } } } }
  });
  return `
  <div class="page-head"><div><h2>Contas e cartões</h2><p>Cadastre seus bancos e importe as faturas em PDF</p></div>
    <div class="page-actions">${monthPicker()}
      <button class="btn ghost" data-act="import-invoice"><i data-lucide="file-up"></i> Importar fatura</button>
      <button class="btn primary" data-act="add-acc"><i data-lucide="plus"></i> Nova conta</button></div></div>
  <div class="dropzone" id="dropzone" data-act="import-invoice" role="button" tabindex="0">
    <div class="dz-ico"><i data-lucide="file-up"></i></div>
    <div><b>Arraste a fatura em PDF aqui ou clique para escolher</b>
      <p>Os lançamentos são reconhecidos automaticamente (data, descrição, valor e categoria) e você revisa antes de salvar. Pode enviar várias faturas de bancos diferentes de uma vez. O arquivo é lido no seu dispositivo — nada é enviado para a internet.</p></div>
  </div>
  ${accs.length ? `<div class="acc-grid">${accs.map(a => accCard(a, k)).join('')}</div>`
    : `<div class="card" style="margin-bottom:18px">${empty('landmark', 'Nenhuma conta cadastrada', 'Cadastre, por exemplo, “Nubank” e “Bradesco” para ver quanto gastou em cada um. Se preferir, importe a fatura direto: a conta é criada automaticamente.', '<button class="btn primary" data-act="add-acc"><i data-lucide="plus"></i> Nova conta</button>')}</div>`}
  <div class="grid c2">
    <div class="card"><div class="card-head"><h3><i data-lucide="chart-bar"></i> Gastos por conta</h3><span class="muted" style="font-size:13px">${monthLabel(k)}</span></div>
      ${by.length ? `<div class="chart-box sm"><canvas id="chAcc"></canvas></div>
        <div class="table-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>Conta</th><th class="r">Gastos</th><th class="r">%</th></tr></thead><tbody>
        ${by.map(b => `<tr><td><span class="acc-chip" style="--c:${b.acc.color}"><i></i>${esc(b.acc.name)}</span></td><td class="r neg"><b>${fmt(b.total)}</b></td><td class="r">${fmtPct(b.pct)}</td></tr>`).join('')}
        </tbody></table></div>` : empty('chart-bar', 'Sem gastos no mês', 'Importe uma fatura ou registre despesas informando a conta.')}
    </div>
    <div class="card"><div class="card-head"><h3><i data-lucide="file-check"></i> Faturas importadas</h3></div>
      ${imports.length ? `<div class="tx-list">${imports.map(im => { const a = F.accountById(im.accountId); return `<div class="tx-row">
        <div class="cat-ico" style="--c:${a ? a.color : '#64748b'}"><i data-lucide="file-text"></i></div>
        <div class="tx-main"><div class="tx-desc" title="${esc(im.fileName)}">${esc(im.fileName)}</div>
          <div class="tx-meta">${a ? accChip(a.id) : '<span>Conta removida</span>'}<span>${im.count} lançamento(s)</span>·<span>importada em ${fmtDate(toISO(new Date(im.importedAt)))}</span>${im.due ? `<span>· vence ${fmtDate(im.due)}</span>` : ''}</div></div>
        <div class="tx-amt out">${fmt(im.total)}</div>
        <div class="tx-actions"><button class="icon-btn sm" data-act="undo-import" data-id="${im.id}" title="Desfazer importação"><i data-lucide="undo-2"></i></button></div></div>`; }).join('')}</div>`
      : empty('file-text', 'Nenhuma fatura importada', 'As faturas que você enviar aparecem aqui, com opção de desfazer.')}
    </div>
  </div>`;
}

function accCard(a, k) {
  const s = F.accountSummary(a, k), credit = a.type === 'credit', T = ACC_TYPES[a.type] || ACC_TYPES.checking;
  return `<div class="acc-card" style="--c:${a.color}">
    <div class="acc-head">
      <div class="acc-badge"><i data-lucide="${T.icon}"></i></div>
      <div style="flex:1;min-width:0"><h4>${esc(a.name)}</h4><small>${T.name}${a.bank && norm(a.bank) !== norm(a.name) ? ` · ${esc(a.bank)}` : ''}</small></div>
      <button class="icon-btn sm light" data-act="edit-acc" data-id="${a.id}" title="Editar"><i data-lucide="pencil"></i></button>
      <button class="icon-btn sm light" data-act="del-acc" data-id="${a.id}" title="Excluir"><i data-lucide="trash-2"></i></button>
    </div>
    <div class="acc-body">
      <small class="muted">${credit ? `Gastos em ${monthLabel(k)}` : 'Saldo atual'}</small>
      <div class="acc-val ${credit ? 'neg' : s.balance >= 0 ? 'bal' : 'neg'}">${fmt(credit ? s.exp : s.balance)}</div>
      <div class="acc-stats">
        ${credit ? `<div><small>Em aberto</small><b class="warn-t">${fmt(s.open)}</b></div>
          <div><small>${a.limit ? 'Limite disponível' : 'Vencimento'}</small><b>${a.limit ? fmt(s.available) : a.dueDay ? `Dia ${a.dueDay}` : '—'}</b></div>`
        : `<div><small>Entradas no mês</small><b class="pos">${fmt(s.inc)}</b></div><div><small>Saídas no mês</small><b class="neg">${fmt(s.exp)}</b></div>`}
      </div>
      ${credit && a.limit ? `<div class="progress" style="margin-top:12px"><span style="width:${Math.min(100, s.open / a.limit * 100)}%;background:var(--c)"></span></div>` : ''}
      <p class="acc-last">${s.lastImport ? `<i data-lucide="file-check"></i> Última fatura: ${esc(s.lastImport.fileName)} (${fmtDate(toISO(new Date(s.lastImport.importedAt)))})` : `<i data-lucide="list"></i> ${s.count} lançamento(s)`}</p>
      <div class="acc-actions">
        <button class="btn sm soft" data-act="import-invoice" data-acc="${a.id}"><i data-lucide="file-up"></i> Importar fatura</button>
        <button class="btn sm ghost" data-act="acc-tx" data-id="${a.id}">Ver lançamentos</button>
      </div>
    </div></div>`;
}

function accountModal(id, preset = {}) {
  const a = id ? F.accountById(id) : { name: preset.name || '', bank: preset.bank || 'Nubank', type: preset.type || 'credit', color: bankColor(preset.bank || 'Nubank'), initialBalance: '', limit: '', dueDay: '' };
  if (!a) return;
  const typeFields = t => t === 'credit'
    ? `<div class="row2"><div class="field"><span>Limite do cartão <small>(opcional)</small></span>${moneyField('limit', a.limit || '')}</div>
       <label class="field"><span>Dia do vencimento <small>(opcional)</small></span><input class="input" name="dueDay" inputmode="numeric" maxlength="2" value="${a.dueDay || ''}" placeholder="Ex.: 10"></label></div>`
    : `<div class="field"><span>Saldo inicial <small>(saldo atual da conta antes dos lançamentos)</small></span>${moneyField('initialBalance', a.initialBalance || '')}</div>`;
  openModal({
    title: id ? 'Editar conta' : 'Nova conta ou cartão',
    body: `<div class="row2">
        <label class="field"><span>Banco / instituição</span><select class="input" name="bank">${BANKS.map(b => `<option ${norm(b.name) === norm(a.bank) ? 'selected' : ''}>${b.name}</option>`).join('')}</select></label>
        <label class="field"><span>Tipo</span><select class="input" name="type">${Object.entries(ACC_TYPES).map(([k, v]) => `<option value="${k}" ${a.type === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
      </div>
      <div class="row2">
        <label class="field"><span>Nome da conta</span><input class="input" name="name" maxlength="40" value="${esc(a.name)}" placeholder="Ex.: Nubank, Bradesco Visa"></label>
        <label class="field"><span>Cor</span><input class="input" type="color" name="color" value="${a.color}" style="padding:4px;height:42px"></label>
      </div>
      <div id="accType">${typeFields(a.type)}</div>`,
    onMount: form => {
      if (!id && !a.name) form.name.value = a.bank;
      let auto = !id && !preset.name;
      form.name.addEventListener('input', () => { auto = false; });
      form.addEventListener('change', e => {
        if (e.target.name === 'bank') { form.color.value = bankColor(e.target.value); if (auto) form.name.value = e.target.value === 'Outro' ? '' : e.target.value; }
        if (e.target.name === 'type') { $('#accType', form).innerHTML = typeFields(e.target.value); }
      });
    },
    onSubmit: async form => {
      const name = form.name.value.trim();
      if (!name) fail('Informe o nome da conta.', 'name');
      if (F.accounts.some(x => x.id !== id && norm(x.name) === norm(name))) fail('Já existe uma conta com esse nome.', 'name');
      const type = form.type.value;
      const data = { name, bank: form.bank.value, type, color: form.color.value };
      if (type === 'credit') {
        const lim = form.limit.value ? parseMoney(form.limit.value) : 0, dd = form.dueDay.value ? +form.dueDay.value : '';
        if (!(lim >= 0)) fail('Limite inválido.', 'limit');
        if (dd !== '' && !(dd >= 1 && dd <= 31)) fail('Dia de vencimento deve estar entre 1 e 31.', 'dueDay');
        Object.assign(data, { limit: lim, dueDay: dd, initialBalance: 0 });
      } else {
        const ib = form.initialBalance.value ? parseMoney(form.initialBalance.value.replace(/^-/, '')) * (/^\s*-/.test(form.initialBalance.value) ? -1 : 1) : 0;
        if (!isFinite(ib)) fail('Saldo inicial inválido.', 'initialBalance');
        Object.assign(data, { initialBalance: ib, limit: 0, dueDay: '' });
      }
      if (id) Object.assign(a, data);
      else { const acc = { id: uid(), ...data, createdAt: new Date().toISOString() }; F.accounts.push(acc); if (preset.onCreate) preset.onCreate(acc); }
      await commit(id ? 'Conta atualizada.' : `Conta “${name}” criada.`);
    }
  });
}

/* ---- Importação de faturas PDF ---- */
function busy(msg) {
  let el = $('#busy');
  if (!msg) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'busy'; document.body.appendChild(el); }
  el.innerHTML = `<div class="busy-box"><span class="spinner"></span><span>${esc(msg)}</span></div>`;
}

async function importInvoices(files) {
  const list = [...files];
  for (const f of list) await importOne(f);
  S.importAcc = '';
}

async function importOne(file, password) {
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { toast(`“${file.name}” não é um PDF.`, 'error'); return; }
  busy(`Lendo ${file.name}...`);
  try {
    const res = await Invoice.read(file, password);
    busy();
    await reviewInvoice(file, res);
  } catch (e) {
    busy();
    if (e && e.name === 'PasswordException') {
      const pw = await askPdfPassword(file.name, e.code === 2);
      if (pw) return importOne(file, pw);
      return;
    }
    console.error(e);
    toast(e && e.code === 'NOTEXT' ? e.message : `Não foi possível ler “${file.name}”. Verifique se é a fatura original em PDF.`, 'error');
  }
}

function askPdfPassword(name, wrong) {
  return new Promise(resolve => {
    let value = null;
    openModal({
      title: 'PDF protegido por senha', submit: 'Abrir',
      body: `<p style="margin-top:0">A fatura <b>${esc(name)}</b> está protegida. ${wrong ? '<b class="neg">Senha incorreta, tente novamente.</b>' : 'Alguns bancos usam parte do CPF do titular como senha.'}</p>
        <label class="field"><span>Senha do PDF</span><input class="input" type="password" name="pw" autocomplete="off"></label>
        <p class="muted" style="font-size:12.5px">A senha é usada apenas para abrir o arquivo e não é armazenada.</p>`,
      onSubmit: form => { if (!form.pw.value) fail('Informe a senha.', 'pw'); value = form.pw.value; },
      onClose: () => resolve(value)
    });
  });
}

function matchAccount(bank) {
  if (S.importAcc) return S.importAcc;
  if (!bank) return F.accounts.length === 1 ? F.accounts[0].id : '';
  const b = norm(bank);
  const a = F.accounts.find(x => x.type === 'credit' && (norm(x.bank || '') === b || norm(x.name).includes(b))) || F.accounts.find(x => norm(x.bank || '') === b || norm(x.name).includes(b));
  return a ? a.id : '__new';
}

function reviewInvoice(file, res) {
  return new Promise(resolve => {
    if (!res.items.length) {
      openModal({
        title: 'Nenhum lançamento encontrado', submit: '', cancel: 'Fechar', onClose: resolve,
        body: `<p style="margin-top:0">Não reconhecemos lançamentos em <b>${esc(file.name)}</b>.</p>
          <ul class="muted" style="padding-left:18px;font-size:14px"><li>Use o PDF original da fatura baixado pelo app ou site do banco (não uma foto ou print).</li><li>Confirme que é uma <b>fatura</b> ou <b>extrato</b> com linhas de data, descrição e valor.</li><li>Se o problema continuar, cadastre os gastos manualmente em <a href="#/saidas">Saídas</a>.</li></ul>`
      });
      return;
    }
    const existing = new Set(F.txs.filter(t => t.accountId).map(t => Invoice.fingerprint(t.accountId, t.date, t.amount, t.desc)));
    const items = res.items.map((it, i) => ({ ...it, i, payment: it.credit && Invoice.PAYMENT.test(it.desc) }));
    let accId = matchAccount(res.bank);
    const newName = res.bank || 'Cartão de crédito';
    const defaultPending = res.due && res.due >= todayISO();
    const isDup = it => accId && accId !== '__new' && existing.has(Invoice.fingerprint(accId, it.date, it.amount, it.desc));
    const row = it => `<div class="inv-row${it.credit ? ' credit' : ''}" data-row="${it.i}">
        <label class="inv-check"><input type="checkbox" name="sel_${it.i}" ${!it.credit && !isDup(it) ? 'checked' : ''}></label>
        <div class="inv-date">${fmtDate(it.date)}</div>
        <div class="inv-desc"><input class="input" name="d_${it.i}" value="${esc(it.desc)}" maxlength="80">
          <div class="inv-tags">${it.installment ? `<span class="tag rec">Parcela ${it.installment}</span>` : ''}${it.payment ? '<span class="tag paid">Pagamento da fatura</span>' : it.credit ? '<span class="tag paid">Estorno / crédito</span>' : ''}<span class="tag overdue dup${isDup(it) ? '' : ' hidden'}">Já importado</span></div></div>
        <select class="input inv-cat" name="c_${it.i}">${catOptions(it.credit ? 'in' : 'out', it.category)}</select>
        <div class="inv-amt ${it.credit ? 'pos' : 'neg'}">${it.credit ? '+' : '−'} ${fmt(it.amount)}</div>
      </div>`;
    openModal({
      title: 'Revisar fatura importada', wide: true, submit: 'Importar lançamentos', onClose: resolve,
      body: `
        <div class="inv-summary">
          <div><small>Arquivo</small><b title="${esc(file.name)}">${esc(file.name)}</b></div>
          <div><small>Banco detectado</small><b>${res.bank ? esc(res.bank) : '—'}</b></div>
          <div><small>Vencimento</small><b>${res.due ? fmtDate(res.due) : '—'}</b></div>
          <div><small>Total da fatura</small><b>${res.total != null ? fmt(res.total) : '—'}</b></div>
        </div>
        <div class="row2">
          <label class="field"><span>Lançar na conta</span><select class="input" name="accountId">
            ${F.accounts.map(a => `<option value="${a.id}" ${a.id === accId ? 'selected' : ''}>${esc(a.name)} · ${ACC_TYPES[a.type]?.name || ''}</option>`).join('')}
            <option value="__new" ${accId === '__new' || !accId ? 'selected' : ''}>+ Criar conta “${esc(newName)}” (cartão de crédito)</option></select></label>
          <label class="field"><span>Data dos lançamentos</span><select class="input" name="dateMode">
            <option value="purchase">Data de cada compra</option>${res.due ? `<option value="due">Vencimento da fatura (${fmtDate(res.due)})</option>` : ''}</select></label>
        </div>
        <div class="row2">
          <label class="field"><span>Status das despesas</span><select class="input" name="status"><option value="pending" ${defaultPending ? 'selected' : ''}>Pendente (fatura a pagar)</option><option value="paid" ${!defaultPending ? 'selected' : ''}>Pago (fatura já quitada)</option></select></label>
          <div class="field"><span>Seleção</span><div style="display:flex;gap:8px"><button type="button" class="btn sm ghost" data-inv="all">Marcar compras</button><button type="button" class="btn sm ghost" data-inv="none">Desmarcar todos</button></div></div>
        </div>
        <div class="inv-total" id="invTotal"></div>
        <div class="inv-list">${items.map(row).join('')}</div>`,
      onMount: form => {
        const upd = () => {
          const sel = items.filter(it => form[`sel_${it.i}`].checked);
          const out = sum(sel.filter(it => !it.credit)), cr = sum(sel.filter(it => it.credit));
          const purchases = sum(items.filter(it => !it.credit)), refunds = sum(items.filter(it => it.credit && !it.payment));
          const recon = res.total != null ? Math.abs(purchases - refunds - res.total) < 0.05 : null;
          $('#invTotal', form).innerHTML = `<span><b>${sel.length}</b> de ${items.length} selecionados · despesas <b class="neg">${fmt(out)}</b>${cr ? ` · créditos <b class="pos">${fmt(cr)}</b>` : ''}</span>
            ${recon === true ? '<span class="tag paid"><i data-lucide="check"></i> Bate com o total da fatura</span>' : recon === false ? `<span class="tag pending">Compras − estornos = ${fmt(purchases - refunds)} (fatura: ${fmt(res.total)}) — confira os itens</span>` : ''}`;
          icons();
        };
        const refreshDup = () => {
          accId = form.accountId.value;
          items.forEach(it => { const d = isDup(it); const r = $(`[data-row="${it.i}"]`, form); $('.dup', r).classList.toggle('hidden', !d); if (d) form[`sel_${it.i}`].checked = false; });
          upd();
        };
        form.addEventListener('change', e => { if (e.target.name === 'accountId') refreshDup(); else upd(); });
        form.addEventListener('click', e => {
          const b = e.target.closest('[data-inv]'); if (!b) return;
          items.forEach(it => { form[`sel_${it.i}`].checked = b.dataset.inv === 'all' ? !it.credit && !isDup(it) : false; });
          upd();
        });
        upd();
      },
      onSubmit: async form => {
        const sel = items.filter(it => form[`sel_${it.i}`].checked);
        if (!sel.length) fail('Selecione ao menos um lançamento.');
        let id = form.accountId.value;
        if (id === '__new' || !id) {
          const name = F.accounts.some(a => norm(a.name) === norm(newName)) ? `${newName} ${F.accounts.length + 1}` : newName;
          const acc = { id: uid(), name, bank: res.bank || 'Outro', type: 'credit', color: bankColor(res.bank || 'Outro'), limit: 0, dueDay: res.due ? +res.due.slice(8) : '', initialBalance: 0, createdAt: new Date().toISOString() };
          F.accounts.push(acc); id = acc.id;
        }
        const acc = F.accountById(id), importId = uid(), byDue = form.dateMode.value === 'due', paid = form.status.value === 'paid';
        const now = new Date().toISOString();
        sel.forEach(it => {
          const desc = String(form[`d_${it.i}`].value || it.desc).trim() || it.desc;
          F.txs.push({
            id: uid(), type: it.credit ? 'in' : 'out', desc, amount: it.amount, date: byDue ? res.due : it.date, category: form[`c_${it.i}`].value,
            accountId: id, paid: it.credit ? true : paid, fixed: false, recurring: false, importId,
            notes: `Importado de ${file.name}${it.installment ? ` · parcela ${it.installment}` : ''}${byDue ? ` · compra em ${fmtDate(it.date)}` : ''}`, createdAt: now
          });
        });
        const total = sum(sel.filter(it => !it.credit));
        D().imports.push({ id: importId, accountId: id, fileName: file.name, importedAt: now, due: res.due, count: sel.length, total, invoiceTotal: res.total });
        await commit(`${sel.length} lançamento(s) importado(s) em ${acc.name} — ${fmt(total)} em despesas.`);
        sel.filter(it => !it.credit).map(it => (byDue ? res.due : it.date).slice(0, 7)).filter((v, i, a) => a.indexOf(v) === i).forEach(key => {
          F.budgetAlerts(key).filter(b => b.level === 'over').slice(0, 2).forEach(b => toast(`Orçamento de ${b.cat.name} ultrapassado em ${monthLabel(key)}.`, 'warning'));
        });
      }
    });
  });
}

/* ======================================================================
   VIEW: Entradas
   ====================================================================== */
function viewIncome() {
  const f = S.inc;
  return `
  <div class="page-head"><div><h2>Entradas</h2><p>Gerencie suas fontes de renda</p></div>
    <div class="page-actions">${f.all ? '' : monthPicker()}<button class="btn income" data-act="add-tx" data-type="in"><i data-lucide="plus"></i> Nova entrada</button></div></div>
  <div class="card">
    <div class="filters" style="margin-bottom:16px">
      <div class="field grow"><span>Pesquisar</span><div class="search-field"><i data-lucide="search"></i><input class="input" data-f="inc.q" value="${esc(f.q)}" placeholder="Descrição ou observação..."></div></div>
      <label class="field"><span>Categoria</span><select class="input" data-f="inc.cat">${catOptions('in', f.cat, 'Todas')}</select></label>
      ${accFilter('inc')}
      <label class="field"><span>Tipo</span><select class="input" data-f="inc.kind"><option value="">Todas</option><option value="recurring" ${f.kind === 'recurring' ? 'selected' : ''}>Recorrentes</option><option value="occasional" ${f.kind === 'occasional' ? 'selected' : ''}>Eventuais</option></select></label>
      <label class="field"><span>Período</span><select class="input" data-f="inc.all" data-rerender><option value="">Mês selecionado</option><option value="1" ${f.all ? 'selected' : ''}>Todos os meses</option></select></label>
      <div class="field"><span>&nbsp;</span><button class="btn ghost" data-act="clear-filters" data-scope="inc"><i data-lucide="x"></i> Limpar</button></div>
    </div>
    <div id="listArea">${incomeList()}</div>
  </div>`;
}
function incomeList() {
  const f = S.inc;
  const base = F.txs.filter(t => t.type === 'in' && (f.all || t.date.slice(0, 7) === S.month));
  const list = sortTx(filterTx(base, f));
  const s = F.stats(list);
  return `<div class="summary-strip">
      <div class="pill"><small>Total ${f.all ? 'geral' : 'do mês'}</small><b class="pos">${fmt(s.inc)}</b></div>
      <div class="pill"><small>Recorrentes</small><b>${fmt(s.incRecurring)}</b></div>
      <div class="pill"><small>Eventuais</small><b>${fmt(s.incOccasional)}</b></div>
      <div class="pill"><small>Registros</small><b>${list.length}</b></div></div>
    ${list.length ? `<div class="tx-list">${list.map(txRow).join('')}</div>` : empty('circle-arrow-down', 'Nenhuma entrada encontrada', f.q || f.cat || f.kind ? 'Ajuste os filtros para ver mais resultados.' : `Nenhuma receita em ${monthLabel(S.month)}.`, '<button class="btn income" data-act="add-tx" data-type="in"><i data-lucide="plus"></i> Nova entrada</button>')}`;
}

/* ======================================================================
   VIEW: Saídas
   ====================================================================== */
function viewExpense() {
  const f = S.exp;
  return `
  <div class="page-head"><div><h2>Saídas</h2><p>Despesas, pagamentos e contas a pagar</p></div>
    <div class="page-actions">${f.all ? '' : monthPicker()}<button class="btn expense" data-act="add-tx" data-type="out"><i data-lucide="plus"></i> Nova saída</button></div></div>
  <div class="card">
    <div class="filters f6" style="margin-bottom:16px">
      <div class="field grow"><span>Pesquisar</span><div class="search-field"><i data-lucide="search"></i><input class="input" data-f="exp.q" value="${esc(f.q)}" placeholder="Nome ou descrição..."></div></div>
      <label class="field"><span>Categoria</span><select class="input" data-f="exp.cat">${catOptions('out', f.cat, 'Todas')}</select></label>
      ${accFilter('exp')}
      <label class="field"><span>Status</span><select class="input" data-f="exp.status"><option value="">Todos</option><option value="paid" ${f.status === 'paid' ? 'selected' : ''}>Pagas</option><option value="pending" ${f.status === 'pending' ? 'selected' : ''}>Pendentes</option><option value="overdue" ${f.status === 'overdue' ? 'selected' : ''}>Vencidas</option></select></label>
      <label class="field"><span>Natureza</span><select class="input" data-f="exp.kind"><option value="">Todas</option><option value="fixed" ${f.kind === 'fixed' ? 'selected' : ''}>Fixas</option><option value="variable" ${f.kind === 'variable' ? 'selected' : ''}>Variáveis</option></select></label>
      <label class="field"><span>Período</span><select class="input" data-f="exp.all" data-rerender><option value="">Mês selecionado</option><option value="1" ${f.all ? 'selected' : ''}>Todos os meses</option></select></label>
      <div class="field"><span>&nbsp;</span><button class="btn ghost" data-act="clear-filters" data-scope="exp"><i data-lucide="x"></i> Limpar</button></div>
    </div>
    <div id="listArea">${expenseList()}</div>
  </div>`;
}
function expenseList() {
  const f = S.exp;
  const base = F.txs.filter(t => t.type === 'out' && (f.all || t.date.slice(0, 7) === S.month));
  const list = sortTx(filterTx(base, f));
  const s = F.stats(list);
  return `<div class="summary-strip">
      <div class="pill"><small>Total</small><b class="neg">${fmt(s.exp)}</b></div>
      <div class="pill"><small>Pagas</small><b class="pos">${fmt(s.paid)}</b></div>
      <div class="pill"><small>Pendentes</small><b class="warn-t">${fmt(s.pending)}</b></div>
      <div class="pill"><small>Fixas</small><b>${fmt(s.fixed)}</b></div>
      <div class="pill"><small>Variáveis</small><b>${fmt(s.variable)}</b></div></div>
    ${list.length ? `<div class="tx-list">${list.map(txRow).join('')}</div>` : empty('circle-arrow-up', 'Nenhuma saída encontrada', f.q || f.cat || f.status || f.kind ? 'Ajuste os filtros para ver mais resultados.' : `Nenhuma despesa em ${monthLabel(S.month)}.`, '<button class="btn expense" data-act="add-tx" data-type="out"><i data-lucide="plus"></i> Nova saída</button>')}`;
}

/* ======================================================================
   VIEW: Histórico
   ====================================================================== */
function viewHistory() {
  const f = S.hist;
  return `
  <div class="page-head"><div><h2>Histórico de transações</h2><p>Todas as suas movimentações em um só lugar</p></div>
    <div class="page-actions">
      <button class="btn ghost" data-act="export-pdf" data-scope="hist"><i data-lucide="file-text"></i> PDF</button>
      <button class="btn ghost" data-act="export-xlsx" data-scope="hist"><i data-lucide="file-spreadsheet"></i> Excel</button>
      <button class="btn primary hide-mobile" data-act="quick-add"><i data-lucide="plus"></i> Nova</button>
    </div></div>
  <div class="card">
    <div class="filters" style="margin-bottom:12px">
      <div class="field grow"><span>Pesquisar</span><div class="search-field"><i data-lucide="search"></i><input class="input" data-f="hist.q" value="${esc(f.q)}" placeholder="Nome, descrição ou categoria..."></div></div>
      <label class="field"><span>Tipo</span><select class="input" data-f="hist.type"><option value="">Entradas e saídas</option><option value="in" ${f.type === 'in' ? 'selected' : ''}>Entradas</option><option value="out" ${f.type === 'out' ? 'selected' : ''}>Saídas</option></select></label>
      <label class="field"><span>Categoria</span><select class="input" data-f="hist.cat">${catOptions(null, f.cat, 'Todas')}</select></label>
      ${accFilter('hist')}
      <label class="field"><span>Status</span><select class="input" data-f="hist.status"><option value="">Todos</option><option value="paid" ${f.status === 'paid' ? 'selected' : ''}>Pagas</option><option value="pending" ${f.status === 'pending' ? 'selected' : ''}>Pendentes</option></select></label>
      <label class="field"><span>Ordenar por</span><select class="input" data-f="hist.sort">
        ${[['date-desc', 'Data (mais recente)'], ['date-asc', 'Data (mais antiga)'], ['amount-desc', 'Valor (maior)'], ['amount-asc', 'Valor (menor)']].map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="filters" style="margin-bottom:16px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))">
      <div class="field"><span>De</span>${dateField('from', f.from, { attrs: 'data-f="hist.from"' })}</div>
      <div class="field"><span>Até</span>${dateField('to', f.to, { attrs: 'data-f="hist.to"' })}</div>
      <div class="field"><span>Atalhos</span><select class="input" data-act-change="hist-range"><option value="">Período...</option><option value="month">Este mês</option><option value="last">Mês passado</option><option value="90">Últimos 90 dias</option><option value="year">Este ano</option><option value="all">Tudo</option></select></div>
      <div class="field"><span>&nbsp;</span><button class="btn ghost" data-act="clear-filters" data-scope="hist"><i data-lucide="x"></i> Limpar filtros</button></div>
    </div>
    <div id="listArea">${historyList()}</div>
  </div>`;
}
function historyFiltered() { return sortTx(filterTx(F.txs, S.hist), S.hist.sort); }
function historyList() {
  const list = historyFiltered(), s = F.stats(list), shown = list.slice(0, S.hist.limit);
  return `<div class="summary-strip">
      <div class="pill"><small>Entradas</small><b class="pos">${fmt(s.inc)}</b></div>
      <div class="pill"><small>Saídas</small><b class="neg">${fmt(s.exp)}</b></div>
      <div class="pill"><small>Saldo</small><b class="${s.net >= 0 ? 'bal' : 'neg'}">${fmt(s.net)}</b></div>
      <div class="pill"><small>Transações</small><b>${list.length}</b></div></div>
    ${list.length ? `<div class="tx-list">${shown.map(txRow).join('')}</div>
      ${list.length > shown.length ? `<div class="list-foot"><button class="btn soft" data-act="hist-more">Carregar mais (${list.length - shown.length} restantes)</button></div>` : ''}`
      : empty('search', 'Nenhuma transação encontrada', F.txs.length ? 'Tente ajustar os filtros.' : 'Você ainda não cadastrou movimentações.')}`;
}

/* ======================================================================
   VIEW: Orçamento & Metas
   ====================================================================== */
function viewBudget() {
  const k = S.month, st = F.budgetStatus(k), withLimit = st.filter(b => b.limit);
  const tl = sum(withLimit, b => b.limit), ts = sum(withLimit, b => b.spent);
  const alerts = st.filter(b => b.level === 'over' || b.level === 'warn');
  const goals = D().goals;
  return `
  <div class="page-head"><div><h2>Planejamento e orçamento</h2><p>Limites mensais por categoria e metas de economia</p></div>
    <div class="page-actions">${monthPicker()}</div></div>
  <div class="grid c3">
    ${stat('net', 'Total orçado no mês', tl, 'target')}
    ${stat('expense', 'Gasto nas categorias orçadas', ts, 'circle-arrow-up', tl ? `${fmtPct(ts / tl)} do orçamento utilizado` : 'Defina limites abaixo', 'neg')}
    ${stat('balance', 'Disponível para gastar', tl - ts, 'wallet', tl - ts < 0 ? 'Orçamento total ultrapassado' : 'Dentro do planejado', tl - ts >= 0 ? 'bal' : 'neg')}
  </div>
  ${alerts.length ? `<div class="card" style="margin-bottom:18px"><div class="card-head"><h3><i data-lucide="triangle-alert"></i> Alertas de orçamento</h3></div>
    ${alerts.map(a => `<div class="alert ${a.level}"><i data-lucide="triangle-alert"></i><p><b>${a.cat.name}</b>: ${a.level === 'over' ? `limite ultrapassado em <b>${fmt(-a.left)}</b> (${fmtPct(a.ratio)} usado).` : `você já usou <b>${fmtPct(a.ratio)}</b> do limite — restam ${fmt(a.left)}.`}</p></div>`).join('')}</div>` : ''}
  <div class="grid c2">
    <div class="card"><div class="card-head"><h3><i data-lucide="piggy-bank"></i> Limites por categoria</h3><small class="muted">Vale para todos os meses · deixe vazio para não limitar</small></div>
      ${st.map(b => `<div class="budget-row">
        <div class="cat-ico" style="--c:${b.cat.color}"><i data-lucide="${b.cat.icon}"></i></div>
        <div class="b-info"><div class="b-top"><b>${b.cat.name}</b><span class="${b.level === 'over' ? 'neg' : b.level === 'warn' ? 'warn-t' : 'muted'}">${fmt(b.spent)}${b.limit ? ` de ${fmt(b.limit)}` : ''}</span></div>
          <div class="progress ${b.level}"><span style="width:${b.limit ? Math.min(100, b.ratio * 100) : 0}%"></span></div>
          <div class="b-sub"><span>${b.limit ? fmtPct(b.ratio) + ' utilizado' : 'Sem limite definido'}</span><span>${b.limit ? (b.left >= 0 ? `Restam <b class="pos">${fmt(b.left)}</b>` : `Excedido <b class="neg">${fmt(-b.left)}</b>`) : ''}</span></div></div>
        <div class="b-limit">${moneyField('', b.limit || '', `data-budget="${b.cat.id}" aria-label="Limite de ${b.cat.name}"`, 'Sem limite')}</div>
      </div>`).join('')}
    </div>
    <div class="card"><div class="card-head"><h3><i data-lucide="target"></i> Metas de economia</h3><button class="btn primary sm" data-act="add-goal"><i data-lucide="plus"></i> Nova meta</button></div>
      ${goals.length ? `<div class="goals-grid">${goals.map(goalCard).join('')}</div>` : empty('target', 'Nenhuma meta criada', 'Crie metas como reserva de emergência, viagem ou um novo notebook.', '<button class="btn primary" data-act="add-goal"><i data-lucide="plus"></i> Criar meta</button>')}
    </div>
  </div>`;
}
function goalCard(g) {
  const pct = g.target ? Math.min(1, g.saved / g.target) : 0, done = g.saved >= g.target;
  let info = '';
  if (done) info = '<span class="tag paid">Meta concluída</span>';
  else if (g.deadline) {
    const days = daysBetween(todayISO(), g.deadline);
    if (days < 0) info = `<span class="tag overdue">Prazo encerrado em ${fmtDate(g.deadline)}</span>`;
    else { const months = Math.max(1, Math.ceil(days / 30.44)); info = `<small class="muted">Prazo ${fmtDate(g.deadline)} · guarde ${fmt((g.target - g.saved) / months)}/mês</small>`; }
  } else info = `<small class="muted">Faltam ${fmt(g.target - g.saved)}</small>`;
  return `<div class="goal">
    <div class="goal-head"><div><h4>${esc(g.name)}</h4><div class="goal-amt">${fmt(g.saved)}</div><small class="muted">de ${fmt(g.target)}</small></div>
      <div class="ring" style="--p:${Math.round(pct * 100)}"><span>${Math.round(pct * 100)}%</span></div></div>
    <div class="progress"><span style="width:${pct * 100}%"></span></div>
    <div>${info}</div>
    <div class="goal-actions">
      <button class="btn sm income" data-act="goal-in" data-id="${g.id}"><i data-lucide="plus"></i> Guardar</button>
      <button class="btn sm ghost" data-act="goal-out" data-id="${g.id}"><i data-lucide="minus"></i> Retirar</button>
      <button class="icon-btn sm" data-act="edit-goal" data-id="${g.id}" title="Editar"><i data-lucide="pencil"></i></button>
      <button class="icon-btn sm" data-act="del-goal" data-id="${g.id}" title="Excluir"><i data-lucide="trash-2"></i></button>
    </div></div>`;
}

/* ======================================================================
   VIEW: Recorrentes
   ====================================================================== */
function viewRecurring() {
  const recs = D().recurrences;
  const act = recs.filter(r => r.active);
  const mi = sum(act.filter(r => r.type === 'in'), r => F.monthlyImpact(r)), mo = sum(act.filter(r => r.type === 'out'), r => F.monthlyImpact(r));
  const due = F.dueItems(30);
  const row = r => {
    const c = catById(r.category);
    return `<div class="tx-row">
      <div class="cat-ico" style="--c:${c.color}"><i data-lucide="${c.icon}"></i></div>
      <div class="tx-main"><div class="tx-desc">${esc(r.desc)}</div>
        <div class="tx-meta"><span class="tag rec"><i data-lucide="repeat"></i>${FREQ[r.freq]}</span><span>${c.name}</span>·
          <span>${r.active ? `Próximo: <b>${fmtDate(r.next)}</b>` : r.finished ? 'Encerrada' : 'Pausada'}</span>
          ${r.end ? `<span>· até ${fmtDate(r.end)}</span>` : ''}${r.type === 'out' ? `<span class="tag">${r.fixed ? 'Fixa' : 'Variável'}</span>${r.autoPay ? '<span class="tag paid">Débito automático</span>' : ''}` : ''}
          ${!r.active ? `<span class="tag pending">${r.finished ? 'Encerrada' : 'Pausada'}</span>` : ''}</div></div>
      <div class="tx-amt ${r.type}">${r.type === 'in' ? '+' : '−'} ${fmt(r.amount)}</div>
      <div class="tx-actions">
        ${!r.finished ? `<button class="icon-btn sm" data-act="toggle-rec" data-id="${r.id}" title="${r.active ? 'Pausar' : 'Retomar'}"><i data-lucide="${r.active ? 'pause' : 'play'}"></i></button>` : ''}
        <button class="icon-btn sm" data-act="edit-rec" data-id="${r.id}" title="Editar"><i data-lucide="pencil"></i></button>
        <button class="icon-btn sm" data-act="del-rec" data-id="${r.id}" title="Excluir"><i data-lucide="trash-2"></i></button>
      </div></div>`;
  };
  const ins = recs.filter(r => r.type === 'in'), outs = recs.filter(r => r.type === 'out');
  return `
  <div class="page-head"><div><h2>Receitas e despesas recorrentes</h2><p>Lançamentos automáticos diários, semanais, mensais ou anuais</p></div>
    <div class="page-actions"><button class="btn primary" data-act="add-rec"><i data-lucide="plus"></i> Nova recorrência</button></div></div>
  <div class="grid c3">
    ${stat('income', 'Receitas recorrentes / mês', mi, 'circle-arrow-down', `${act.filter(r => r.type === 'in').length} ativa(s)`, 'pos')}
    ${stat('expense', 'Despesas recorrentes / mês', mo, 'circle-arrow-up', `${act.filter(r => r.type === 'out').length} ativa(s)`, 'neg')}
    ${stat('net', 'Saldo recorrente estimado', mi - mo, 'scale', mi ? `${fmtPct(mo / mi)} da renda recorrente comprometida` : 'Estimativa mensal', mi - mo >= 0 ? 'bal' : 'neg')}
  </div>
  <div class="grid c21">
    <div class="card"><div class="card-head"><h3><i data-lucide="repeat"></i> Suas recorrências</h3></div>
      ${recs.length ? `${ins.length ? `<div class="nav-label" style="margin:4px 0 4px;color:var(--muted);font-size:12px;font-weight:700;text-transform:uppercase">Receitas</div><div class="tx-list">${ins.map(row).join('')}</div>` : ''}
        ${outs.length ? `<div class="nav-label" style="margin:14px 0 4px;color:var(--muted);font-size:12px;font-weight:700;text-transform:uppercase">Despesas</div><div class="tx-list">${outs.map(row).join('')}</div>` : ''}`
      : empty('repeat', 'Nenhuma recorrência', 'Cadastre salário, aluguel, assinaturas e outras contas que se repetem. Os lançamentos são gerados automaticamente no vencimento.', '<button class="btn primary" data-act="add-rec"><i data-lucide="plus"></i> Nova recorrência</button>')}
    </div>
    <div class="card"><div class="card-head"><h3><i data-lucide="calendar-clock"></i> Vencimentos (30 dias)</h3></div>
      ${due.length ? due.map(i => `<div class="notif-item"><div class="dot ${i.overdue ? 'danger' : i.days <= 3 ? 'warn' : 'info'}"><i data-lucide="${i.overdue ? 'triangle-alert' : 'calendar'}"></i></div><div style="flex:1;min-width:0"><p class="tx-desc">${esc(i.desc)}</p><small>${i.overdue ? `Vencida em ${fmtDate(i.date)}` : i.days === 0 ? 'Vence hoje' : `${fmtDate(i.date)} · em ${i.days} dia(s)`}</small></div><b class="neg nowrap">${fmt(i.amount)}</b></div>`).join('')
      : `<div class="alert ok"><i data-lucide="circle-check"></i><p>Nenhum vencimento pendente nos próximos 30 dias.</p></div>`}
      ${'Notification' in window && Notification.permission !== 'granted' ? `<button class="btn soft sm" style="margin-top:12px" data-act="enable-notif"><i data-lucide="bell-ring"></i> Ativar notificações</button>` : ''}
    </div>
  </div>`;
}

/* ======================================================================
   VIEW: Relatórios
   ====================================================================== */
function reportScope() {
  if (S.reportMode === 'year') {
    const y = S.year;
    return { title: 'Relatório anual', period: String(y), list: F.rangeList(`${y}-01-01`, `${y}-12-31`), keys: F.yearMonths(y) };
  }
  return { title: 'Relatório mensal', period: monthLabel(S.month), list: F.monthList(S.month), keys: F.lastMonths(6, S.month), balKeys: F.lastMonths(12, S.month) };
}
function viewReports() {
  const r = reportScope(), s = F.stats(r.list), cats = F.byCategory(r.list), top = F.topExpenses(r.list, 10);
  flowChart('chRepFlow', r.keys);
  balanceChart('chRepBal', r.balKeys || r.keys);
  if (cats.length) catChart('chRepCat', cats);
  const prevList = S.reportMode === 'year' ? F.rangeList(`${S.year - 1}-01-01`, `${S.year - 1}-12-31`) : F.monthList(addMonths(S.month, -1));
  const prevCats = Object.fromEntries(F.byCategory(prevList).map(c => [c.cat.id, c.total]));
  const yearRows = S.reportMode === 'year' ? r.keys.map(k => ({ k, s: F.monthStats(k) })) : null;
  return `
  <div class="page-head"><div><h2>Relatórios e gráficos</h2><p>${r.title} · ${r.period}</p></div>
    <div class="page-actions">
      <div class="seg"><button class="${S.reportMode === 'month' ? 'active' : ''}" data-act="report-mode" data-mode="month">Mensal</button><button class="${S.reportMode === 'year' ? 'active' : ''}" data-act="report-mode" data-mode="year">Anual</button></div>
      ${S.reportMode === 'year' ? yearPicker() : monthPicker()}
      <button class="btn ghost" data-act="export-pdf" data-scope="report"><i data-lucide="file-text"></i> PDF</button>
      <button class="btn ghost" data-act="export-xlsx" data-scope="report"><i data-lucide="file-spreadsheet"></i> Excel</button>
    </div></div>
  <div class="grid c4">
    ${stat('income', 'Total recebido', s.inc, 'circle-arrow-down', '', 'pos')}
    ${stat('expense', 'Total gasto', s.exp, 'circle-arrow-up', s.pending ? `${fmt(s.pending)} pendentes` : '', 'neg')}
    ${stat('balance', 'Total economizado', s.net, 'piggy-bank', '', s.net >= 0 ? 'bal' : 'neg')}
    <div class="card stat net"><div class="s-top"><span class="s-label">Taxa de economia</span><span class="s-ico"><i data-lucide="percent"></i></span></div><div class="s-val ${s.rate >= 0 ? 'pos' : 'neg'}">${s.inc ? fmtPct(s.rate) : '—'}</div><div class="s-foot">Referência saudável: 20% ou mais</div></div>
  </div>
  <div class="grid c2">
    <div class="card"><div class="card-head"><h3><i data-lucide="chart-column"></i> Receitas x Despesas</h3><span class="muted" style="font-size:13px">${S.reportMode === 'year' ? `Meses de ${S.year}` : 'Últimos 6 meses'}</span></div><div class="chart-box"><canvas id="chRepFlow"></canvas></div></div>
    <div class="card"><div class="card-head"><h3><i data-lucide="chart-line"></i> Evolução do saldo</h3><span class="muted" style="font-size:13px">Saldo acumulado ao fim de cada mês</span></div><div class="chart-box"><canvas id="chRepBal"></canvas></div></div>
  </div>
  <div class="grid c2">
    <div class="card"><div class="card-head"><h3><i data-lucide="chart-pie"></i> Gastos por categoria</h3></div>
      ${cats.length ? `<div class="chart-box sm"><canvas id="chRepCat"></canvas></div>
        <div class="table-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>Categoria</th><th class="r">Total</th><th class="r">%</th><th class="r">vs anterior</th></tr></thead><tbody>
        ${cats.map(c => { const pv = prevCats[c.cat.id] || 0; return `<tr><td><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${c.cat.color};margin-right:8px"></span>${c.cat.name}</td><td class="r">${fmt(c.total)}</td><td class="r">${fmtPct(c.pct)}</td><td class="r">${pv ? `<span class="${c.total > pv ? 'neg' : 'pos'}">${c.total >= pv ? '+' : ''}${fmtPct((c.total - pv) / pv)}</span>` : '<span class="muted">novo</span>'}</td></tr>`; }).join('')}
        </tbody></table></div>` : empty('chart-pie', 'Sem despesas no período', 'Os gráficos aparecem quando houver dados.')}
    </div>
    <div class="card"><div class="card-head"><h3><i data-lucide="flame"></i> Maiores despesas</h3></div>
      ${top.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Descrição</th><th>Data</th><th class="r">Valor</th></tr></thead><tbody>
        ${top.map((t, i) => `<tr><td class="muted">${i + 1}</td><td><b>${esc(t.desc)}</b><br><small class="muted">${catById(t.category).name}</small></td><td class="nowrap">${fmtDate(t.date)}</td><td class="r neg nowrap"><b>${fmt(t.amount)}</b></td></tr>`).join('')}
        </tbody></table></div>` : empty('flame', 'Nenhuma despesa', 'Sem despesas registradas no período.')}
    </div>
  </div>
  ${yearRows ? `<div class="card"><div class="card-head"><h3><i data-lucide="calendar"></i> Resumo mês a mês — ${S.year}</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Mês</th><th class="r">Recebido</th><th class="r">Gasto</th><th class="r">Economizado</th><th class="r">Taxa</th></tr></thead><tbody>
    ${yearRows.map(({ k, s }) => `<tr><td>${monthLabel(k)}</td><td class="r pos">${fmt(s.inc)}</td><td class="r neg">${fmt(s.exp)}</td><td class="r ${s.net >= 0 ? 'bal' : 'neg'}"><b>${fmt(s.net)}</b></td><td class="r">${s.inc ? fmtPct(s.rate) : '—'}</td></tr>`).join('')}
    <tr><td><b>Total</b></td><td class="r pos"><b>${fmt(s.inc)}</b></td><td class="r neg"><b>${fmt(s.exp)}</b></td><td class="r ${s.net >= 0 ? 'bal' : 'neg'}"><b>${fmt(s.net)}</b></td><td class="r"><b>${s.inc ? fmtPct(s.rate) : '—'}</b></td></tr>
    </tbody></table></div></div>` : ''}`;
}

/* ======================================================================
   VIEW: Assistente
   ====================================================================== */
function viewAssistant() {
  if (!S.chat.length) S.chat.push({ from: 'bot', html: Assistant.answer('ajuda') });
  after(() => { const b = $('#chatBody'); if (b) b.scrollTop = b.scrollHeight; if (matchMedia('(min-width: 961px)').matches) $('#chatInput')?.focus(); });
  return `<div class="card chat">
    <div class="chat-head"><div class="bot"><i data-lucide="sparkles"></i></div><div><h3 style="font-size:16px">Assistente financeiro</h3><p>Respostas calculadas com os seus dados reais</p></div>
      <button class="btn sm ghost" style="margin-left:auto" data-act="chat-clear"><i data-lucide="rotate-ccw"></i> Limpar</button></div>
    <div class="chat-body" id="chatBody">${S.chat.map(m => `<div class="msg ${m.from}">${m.html}</div>`).join('')}</div>
    <div class="chat-sugs">${Assistant.SUGGESTIONS.map(q => `<button data-act="chat-sug" data-q="${esc(q)}">${q}</button>`).join('')}</div>
    <form class="chat-input" id="chatForm" autocomplete="off"><input class="input" id="chatInput" placeholder="Pergunte algo sobre suas finanças..." maxlength="300"><button class="btn primary" type="submit" aria-label="Enviar"><i data-lucide="send"></i></button></form>
  </div>`;
}
function askAssistant(q) {
  q = q.trim(); if (!q) return;
  S.chat.push({ from: 'user', html: esc(q) });
  const body = $('#chatBody');
  body.insertAdjacentHTML('beforeend', `<div class="msg user">${esc(q)}</div><div class="msg bot" id="typing"><span class="typing"><i></i><i></i><i></i></span></div>`);
  body.scrollTop = body.scrollHeight;
  setTimeout(() => {
    let html;
    try { html = Assistant.answer(q); } catch (e) { console.error(e); html = 'Desculpe, não consegui analisar isso agora.'; }
    S.chat.push({ from: 'bot', html });
    const t = $('#typing'); if (t) { t.removeAttribute('id'); t.innerHTML = html; }
    body.scrollTop = body.scrollHeight;
  }, 450);
}

/* ======================================================================
   VIEW: Configurações
   ====================================================================== */
function viewSettings() {
  const u = Store.current, theme = document.documentElement.dataset.theme;
  const notif = !('Notification' in window) ? 'Não suportado neste navegador' : Notification.permission === 'granted' ? (D().settings.notifications ? 'Ativadas' : 'Permitidas, mas desativadas') : Notification.permission === 'denied' ? 'Bloqueadas no navegador' : 'Desativadas';
  return `
  <div class="page-head"><div><h2>Configurações</h2><p>Conta, preferências e seus dados</p></div></div>
  <div class="settings-grid">
    <div class="card"><div class="card-head"><h3><i data-lucide="user"></i> Perfil</h3></div>
      <form id="profileForm"><label class="field"><span>Nome</span><input class="input" name="name" value="${esc(u.name)}" required></label>
      <label class="field"><span>E-mail</span><input class="input" value="${esc(u.email)}" disabled></label>
      <button class="btn primary" type="submit"><i data-lucide="check"></i> Salvar perfil</button></form></div>
    <div class="card"><div class="card-head"><h3><i data-lucide="palette"></i> Preferências</h3></div>
      <div class="set-row"><div><b>Tema</b><p>Aparência do aplicativo</p></div><div class="seg"><button class="${theme === 'light' ? 'active' : ''}" data-act="theme" data-theme="light"><i data-lucide="sun"></i> Claro</button><button class="${theme === 'dark' ? 'active' : ''}" data-act="theme" data-theme="dark"><i data-lucide="moon"></i> Escuro</button></div></div>
      <div class="set-row"><div><b>Notificações de vencimento</b><p>${notif}</p></div>${'Notification' in window ? (D().settings.notifications && Notification.permission === 'granted' ? '<button class="btn ghost sm" data-act="disable-notif">Desativar</button>' : '<button class="btn soft sm" data-act="enable-notif"><i data-lucide="bell-ring"></i> Ativar</button>') : ''}</div>
      <div class="set-row"><div><b>Moeda e datas</b><p>Real brasileiro (R$) · DD/MM/AAAA</p></div></div>
      <div class="set-row"><div><b>Instalar no celular</b><p>No navegador do celular, use “Adicionar à tela inicial”.</p></div>${S.installPrompt ? '<button class="btn soft sm" data-act="install"><i data-lucide="download"></i> Instalar</button>' : ''}</div>
    </div>
    <div class="card"><div class="card-head"><h3><i data-lucide="file-down"></i> Exportar relatórios</h3></div>
      <div class="set-row"><div><b>Relatório completo</b><p>Todas as ${F.txs.length} movimentações</p></div><div style="display:flex;gap:8px"><button class="btn ghost sm" data-act="export-pdf" data-scope="all"><i data-lucide="file-text"></i> PDF</button><button class="btn ghost sm" data-act="export-xlsx" data-scope="all"><i data-lucide="file-spreadsheet"></i> Excel</button><button class="btn ghost sm" data-act="export-csv" data-scope="all">CSV</button></div></div>
      <div class="set-row"><div><b>Backup dos dados</b><p>Arquivo JSON para restaurar em outro dispositivo</p></div><div style="display:flex;gap:8px"><button class="btn ghost sm" data-act="backup"><i data-lucide="download"></i> Exportar</button><button class="btn ghost sm" data-act="import-backup"><i data-lucide="upload"></i> Importar</button></div></div>
      <input type="file" id="importFile" accept="application/json,.json" class="hidden">
    </div>
    <div class="card"><div class="card-head"><h3><i data-lucide="shield-check"></i> Segurança</h3></div>
      <div class="set-row"><div><b>Criptografia</b><p>Seus dados são criptografados com AES-256 usando uma chave derivada da sua senha (PBKDF2). Outros usuários deste dispositivo não conseguem lê-los.</p></div></div>
      <div class="set-row"><div><b>Senha</b><p>Altere sua senha de acesso</p></div><button class="btn ghost sm" data-act="change-pw"><i data-lucide="key-round"></i> Alterar senha</button></div>
      <div class="set-row"><div><b>Sair</b><p>Encerrar a sessão neste dispositivo</p></div><button class="btn ghost sm" data-act="logout"><i data-lucide="log-out"></i> Sair</button></div>
      <div class="set-row"><div><b>Apagar movimentações</b><p>Remove transações, recorrências, orçamentos e metas</p></div><button class="btn danger-soft sm" data-act="clear-data"><i data-lucide="trash-2"></i> Apagar dados</button></div>
      <div class="set-row"><div><b>Excluir conta</b><p>Remove definitivamente sua conta e seus dados</p></div><button class="btn danger sm" data-act="delete-account"><i data-lucide="user-x"></i> Excluir conta</button></div>
    </div>
  </div>`;
}

/* ======================================================================
   Modais
   ====================================================================== */
function openModal({ title, body, submit = 'Salvar', danger = false, onSubmit, onMount, onClose, wide = false, cancel = 'Cancelar' }) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-overlay"><form class="modal${wide ? ' wide' : ''}" novalidate autocomplete="off">
    <div class="modal-head"><h3>${title}</h3><button type="button" class="icon-btn sm" data-close aria-label="Fechar"><i data-lucide="x"></i></button></div>
    <div class="modal-body">${body}<p class="form-error" data-error></p></div>
    <div class="modal-foot"><button type="button" class="btn ghost" data-close>${cancel}</button>${submit ? `<button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${submit}</button>` : ''}</div>
  </form></div>`;
  const ov = root.firstElementChild, form = $('form', ov);
  icons();
  requestAnimationFrame(() => ov.classList.add('show'));
  let closed = false;
  const close = () => { if (closed) return; closed = true; if (onClose) setTimeout(onClose, 0); ov.classList.remove('show'); setTimeout(() => { if (root.firstElementChild === ov) root.innerHTML = ''; }, 200); document.removeEventListener('keydown', esc_); };
  const esc_ = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc_);
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  $$('[data-close]', ov).forEach(b => b.addEventListener('click', close));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('[data-error]', form); err.textContent = '';
    $$('.invalid', form).forEach(x => x.classList.remove('invalid'));
    const btn = $('[type=submit]', form); if (!btn) return; btn.disabled = true;
    try { const r = await onSubmit(form); if (r !== false) close(); }
    catch (ex) { err.textContent = ex.message; if (ex.field) { const f = form.elements[ex.field]; if (f) { f.classList.add('invalid'); f.focus(); } } }
    finally { btn.disabled = false; }
  });
  if (onMount) onMount(form);
  const first = $('input:not([type=hidden]):not([type=radio]):not(.date-native), select', form);
  if (first && matchMedia('(min-width: 961px)').matches) setTimeout(() => first.focus(), 60);
}
function fail(msg, field) { const e = new Error(msg); e.field = field; throw e; }

function confirmModal(title, text, onYes, label = 'Excluir', extra = '') {
  openModal({ title, body: `<p style="margin-top:0">${text}</p>${extra}`, submit: label, danger: true, onSubmit: onYes });
}

function txFields(type, t) {
  if (type === 'in') return `
    <div class="field"><span>Tipo de receita</span><div class="seg full">
      <label><input type="radio" name="recurring" value="1" ${t.recurring ? 'checked' : ''}><i data-lucide="repeat"></i> Recorrente</label>
      <label><input type="radio" name="recurring" value="0" ${!t.recurring ? 'checked' : ''}><i data-lucide="zap"></i> Eventual</label></div></div>`;
  return `<div class="row2">
    <div class="field"><span>Natureza</span><div class="seg full">
      <label><input type="radio" name="fixed" value="1" ${t.fixed ? 'checked' : ''}>Fixa</label>
      <label><input type="radio" name="fixed" value="0" ${!t.fixed ? 'checked' : ''}>Variável</label></div></div>
    <div class="field"><span>Status</span><div class="seg full">
      <label><input type="radio" name="paid" value="1" ${t.paid ? 'checked' : ''}><i data-lucide="check"></i> Pago</label>
      <label><input type="radio" name="paid" value="0" ${!t.paid ? 'checked' : ''}><i data-lucide="clock"></i> Pendente</label></div></div></div>`;
}

function txModal(id, type = 'out') {
  const t = id ? F.txs.find(x => x.id === id) : { type, desc: '', amount: '', date: todayISO(), category: CATS[type][0].id, recurring: false, fixed: false, paid: true, notes: '', accountId: S.lastAccount || (S.route === 'historico' && S.hist.acc !== 'none' ? S.hist.acc : '') };
  if (!t) return;
  openModal({
    title: id ? 'Editar transação' : 'Nova transação',
    body: `
      <div class="seg type full"><label><input type="radio" name="type" value="in" ${t.type === 'in' ? 'checked' : ''}><i data-lucide="circle-arrow-down"></i> Entrada</label><label><input type="radio" name="type" value="out" ${t.type === 'out' ? 'checked' : ''}><i data-lucide="circle-arrow-up"></i> Saída</label></div>
      <label class="field"><span data-lbl-desc>${t.type === 'in' ? 'Descrição' : 'Nome da despesa'}</span><input class="input" name="desc" maxlength="80" value="${esc(t.desc)}" placeholder="${t.type === 'in' ? 'Ex.: Salário de outubro' : 'Ex.: Supermercado'}" required></label>
      <div class="row2">
        <div class="field"><span>Valor</span>${moneyField('amount', t.amount)}</div>
        <div class="field"><span data-lbl-date>${t.type === 'in' ? 'Data' : 'Data / vencimento'}</span>${dateField('date', t.date, { required: true })}</div>
      </div>
      <div class="row2">
        <label class="field"><span>Categoria</span><select class="input" name="category">${catOptions(t.type, t.category)}</select></label>
        <label class="field"><span>Conta / cartão</span><select class="input" name="accountId">${accOptions(t.accountId || '')}</select></label>
      </div>
      <div id="typeFields">${txFields(t.type, t)}</div>
      <label class="field"><span>Observações <small>(opcional)</small></span><textarea class="input" name="notes" maxlength="300" rows="2">${esc(t.notes || '')}</textarea></label>`,
    onMount: form => {
      form.addEventListener('change', e => {
        if (e.target.name !== 'type') return;
        const ty = e.target.value;
        form.category.innerHTML = catOptions(ty);
        $('#typeFields', form).innerHTML = txFields(ty, { recurring: false, fixed: false, paid: true });
        $('[data-lbl-desc]', form).textContent = ty === 'in' ? 'Descrição' : 'Nome da despesa';
        $('[data-lbl-date]', form).textContent = ty === 'in' ? 'Data' : 'Data / vencimento';
        icons();
      });
    },
    onSubmit: async form => {
      const fd = new FormData(form);
      const ty = fd.get('type'), desc = String(fd.get('desc')).trim(), amount = parseMoney(fd.get('amount')), date = parseBRDate(fd.get('date'));
      if (!desc) fail('Informe a descrição.', 'desc');
      if (!(amount > 0)) fail('Informe um valor maior que zero.', 'amount');
      if (amount > 1e10) fail('Valor muito alto.', 'amount');
      if (!date) fail('Informe uma data válida no formato DD/MM/AAAA.', 'date');
      const data = {
        type: ty, desc, amount, date, category: fd.get('category'), accountId: fd.get('accountId') || '', notes: String(fd.get('notes') || '').trim(),
        recurring: ty === 'in' ? fd.get('recurring') === '1' : !!t.recId,
        fixed: ty === 'out' ? fd.get('fixed') === '1' : false,
        paid: ty === 'out' ? fd.get('paid') === '1' : true
      };
      if (id) Object.assign(t, data, { updatedAt: new Date().toISOString() });
      else F.txs.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
      S.lastAccount = data.accountId;
      if (!id && ty === 'out' && !data.paid) {
        // nada extra — aparece em "Contas a vencer"
      }
      await commit(id ? 'Transação atualizada.' : (ty === 'in' ? 'Entrada registrada.' : 'Saída registrada.'));
      if (!id && ty === 'out') checkBudget(data.category, date.slice(0, 7));
    }
  });
}

function checkBudget(cat, key) {
  const b = F.budgetStatus(key).find(x => x.cat.id === cat);
  if (!b || !b.limit) return;
  if (b.level === 'over') toast(`Atenção: orçamento de ${b.cat.name} ultrapassado (${fmtPct(b.ratio)}).`, 'error');
  else if (b.level === 'warn') toast(`Você já usou ${fmtPct(b.ratio)} do orçamento de ${b.cat.name}.`, 'warning');
}

function recModal(id) {
  const r = id ? D().recurrences.find(x => x.id === id) : { type: 'out', desc: '', amount: '', category: 'contas', freq: 'monthly', next: todayISO(), end: '', fixed: true, autoPay: false };
  if (!r) return;
  const outFields = rr => `<label class="check"><input type="checkbox" name="fixed" ${rr.fixed ? 'checked' : ''}> Despesa fixa</label>
    <label class="check"><input type="checkbox" name="autoPay" ${rr.autoPay ? 'checked' : ''}> Débito automático (lançar já como pago)</label>`;
  openModal({
    title: id ? 'Editar recorrência' : 'Nova recorrência',
    body: `
      <div class="seg type full"><label><input type="radio" name="type" value="in" ${r.type === 'in' ? 'checked' : ''}><i data-lucide="circle-arrow-down"></i> Receita</label><label><input type="radio" name="type" value="out" ${r.type === 'out' ? 'checked' : ''}><i data-lucide="circle-arrow-up"></i> Despesa</label></div>
      <label class="field"><span>Descrição</span><input class="input" name="desc" maxlength="80" value="${esc(r.desc)}" placeholder="Ex.: Aluguel, Salário, Netflix" required></label>
      <div class="row2">
        <div class="field"><span>Valor</span>${moneyField('amount', r.amount)}</div>
        <label class="field"><span>Frequência</span><select class="input" name="freq">${Object.entries(FREQ).map(([k, v]) => `<option value="${k}" ${r.freq === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      </div>
      <div class="row2">
        <label class="field"><span>Categoria</span><select class="input" name="category">${catOptions(r.type, r.category)}</select></label>
        <label class="field"><span>Conta / cartão</span><select class="input" name="accountId">${accOptions(r.accountId || '')}</select></label>
      </div>
      <div class="row2">
        <div class="field"><span>${id ? 'Próximo vencimento' : 'Primeiro vencimento'}</span>${dateField('next', r.next, { required: true })}</div>
        <div class="field"><span>Termina em <small>(opcional)</small></span>${dateField('end', r.end)}</div>
      </div>
      <div id="recOut">${r.type === 'out' ? outFields(r) : ''}</div>
      <p class="muted" style="font-size:12.5px;margin:4px 0 8px"><i data-lucide="info" style="width:14px;height:14px;vertical-align:-2px"></i> Os lançamentos são criados automaticamente na data de cada vencimento. Datas passadas geram os lançamentos retroativos.</p>`,
    onMount: form => form.addEventListener('change', e => {
      if (e.target.name !== 'type') return;
      form.category.innerHTML = catOptions(e.target.value);
      $('#recOut', form).innerHTML = e.target.value === 'out' ? outFields({ fixed: true, autoPay: false }) : '';
    }),
    onSubmit: async form => {
      const fd = new FormData(form);
      const desc = String(fd.get('desc')).trim(), amount = parseMoney(fd.get('amount')), next = parseBRDate(fd.get('next'));
      const endRaw = String(fd.get('end') || '').trim(), end = endRaw ? parseBRDate(endRaw) : '';
      if (!desc) fail('Informe a descrição.', 'desc');
      if (!(amount > 0)) fail('Informe um valor maior que zero.', 'amount');
      if (!next) fail('Informe uma data de vencimento válida (DD/MM/AAAA).', 'next');
      if (endRaw && !end) fail('Data final inválida.', 'end');
      if (end && end < next) fail('A data final deve ser posterior ao vencimento.', 'end');
      const freq = fd.get('freq');
      if (freq === 'daily' && daysBetween(next, todayISO()) > 400) fail('Para recorrência diária, use um início mais recente (até 400 dias atrás).', 'next');
      const d = parseISO(next);
      const data = { type: fd.get('type'), desc, amount, freq, category: fd.get('category'), accountId: fd.get('accountId') || '', next, end, day: d.getDate(), month: d.getMonth(), fixed: fd.get('fixed') === 'on', autoPay: fd.get('autoPay') === 'on' };
      if (id) { Object.assign(r, data); if (r.finished && (!end || next <= end)) { r.finished = false; r.active = true; } }
      else D().recurrences.push({ id: uid(), ...data, active: true, createdAt: new Date().toISOString() });
      const n = F.processRecurrences();
      await commit(id ? 'Recorrência atualizada.' : `Recorrência criada${n ? ` — ${n} lançamento(s) gerado(s)` : ''}.`);
    }
  });
}

function goalModal(id) {
  const g = id ? D().goals.find(x => x.id === id) : { name: '', target: '', saved: '', deadline: '' };
  openModal({
    title: id ? 'Editar meta' : 'Nova meta de economia',
    body: `<label class="field"><span>Nome da meta</span><input class="input" name="name" maxlength="60" value="${esc(g.name)}" placeholder="Ex.: Reserva de emergência" required></label>
      <div class="row2"><div class="field"><span>Valor da meta</span>${moneyField('target', g.target)}</div><div class="field"><span>Já guardado</span>${moneyField('saved', g.saved)}</div></div>
      <div class="field"><span>Prazo <small>(opcional)</small></span>${dateField('deadline', g.deadline)}</div>`,
    onSubmit: async form => {
      const name = form.name.value.trim(), target = parseMoney(form.target.value), saved = form.saved.value ? parseMoney(form.saved.value) : 0;
      const dl = form.deadline.value.trim(), deadline = dl ? parseBRDate(dl) : '';
      if (!name) fail('Informe o nome da meta.', 'name');
      if (!(target > 0)) fail('Informe o valor da meta.', 'target');
      if (!(saved >= 0)) fail('Valor guardado inválido.', 'saved');
      if (dl && !deadline) fail('Prazo inválido (DD/MM/AAAA).', 'deadline');
      if (id) Object.assign(g, { name, target, saved, deadline });
      else D().goals.push({ id: uid(), name, target, saved, deadline, history: [], createdAt: new Date().toISOString() });
      await commit(id ? 'Meta atualizada.' : 'Meta criada.');
    }
  });
}

function goalMoveModal(id, dir) {
  const g = D().goals.find(x => x.id === id); if (!g) return;
  openModal({
    title: dir > 0 ? `Guardar em “${esc(g.name)}”` : `Retirar de “${esc(g.name)}”`,
    body: `<p class="muted" style="margin-top:0">Saldo atual da meta: <b>${fmt(g.saved)}</b> de ${fmt(g.target)}</p>
      <div class="field"><span>Valor</span>${moneyField('amount', '')}</div>
      ${dir > 0 ? '<label class="check"><input type="checkbox" name="asTx"> Registrar também como saída (categoria Outros)</label>' : ''}`,
    submit: dir > 0 ? 'Guardar' : 'Retirar',
    onSubmit: async form => {
      const v = parseMoney(form.amount.value);
      if (!(v > 0)) fail('Informe um valor maior que zero.', 'amount');
      if (dir < 0 && v > g.saved) fail('Valor maior que o saldo da meta.', 'amount');
      g.saved = Math.round((g.saved + dir * v) * 100) / 100;
      (g.history = g.history || []).push({ date: todayISO(), amount: dir * v });
      if (dir > 0 && form.asTx && form.asTx.checked) F.txs.push({ id: uid(), type: 'out', desc: `Meta: ${g.name}`, amount: v, date: todayISO(), category: 'outros_out', fixed: false, paid: true, recurring: false, notes: 'Aporte em meta de economia', createdAt: new Date().toISOString() });
      await commit(g.saved >= g.target ? `Parabéns! Meta “${g.name}” concluída!` : dir > 0 ? 'Valor guardado na meta.' : 'Valor retirado da meta.');
    }
  });
}

function passwordModal() {
  openModal({
    title: 'Alterar senha',
    body: `<label class="field"><span>Senha atual</span><input class="input" type="password" name="old" autocomplete="current-password"></label>
      <label class="field"><span>Nova senha</span><input class="input" type="password" name="pw" autocomplete="new-password" placeholder="Mínimo de 6 caracteres"></label>
      <label class="field"><span>Confirmar nova senha</span><input class="input" type="password" name="pw2" autocomplete="new-password"></label>`,
    onSubmit: async form => {
      if (!form.old.value) fail('Informe a senha atual.', 'old');
      if (form.pw.value.length < 6) fail('A nova senha deve ter pelo menos 6 caracteres.', 'pw');
      if (form.pw.value !== form.pw2.value) fail('As senhas não coincidem.', 'pw2');
      await Store.changePassword(form.old.value, form.pw.value);
      toast('Senha alterada com sucesso.');
    }
  });
}

/* ======================================================================
   Ações (delegação de eventos)
   ====================================================================== */
function exportScope(scope) {
  if (scope === 'hist') {
    const f = S.hist;
    const period = f.from || f.to ? `${f.from ? fmtDate(f.from) : 'início'} a ${f.to ? fmtDate(f.to) : 'hoje'}` : 'Todo o período';
    return { title: 'Histórico de transações', period, list: historyFiltered() };
  }
  if (scope === 'report') { const r = reportScope(); return { title: r.title, period: r.period, list: r.list }; }
  return { title: 'Relatório completo', period: 'Todo o período', list: F.txs };
}

const ACTIONS = {
  'month-prev': () => { S.month = addMonths(S.month, -1); refresh(); },
  'month-next': () => { S.month = addMonths(S.month, 1); refresh(); },
  'year-prev': () => { S.year--; refresh(); },
  'year-next': () => { S.year++; refresh(); },
  'report-mode': el => { S.reportMode = el.dataset.mode; if (S.reportMode === 'year') S.year = +S.month.slice(0, 4); refresh(); },
  'quick-add': () => txModal(null, S.route === 'entradas' ? 'in' : 'out'),
  'add-tx': el => txModal(null, el.dataset.type),
  'edit-tx': el => txModal(el.dataset.id),
  'del-tx': el => {
    const t = F.txs.find(x => x.id === el.dataset.id); if (!t) return;
    confirmModal('Excluir transação', `Deseja excluir <b>${esc(t.desc)}</b> (${fmt(t.amount)}) de ${fmtDate(t.date)}? Esta ação não pode ser desfeita.`, async () => {
      D().transactions = F.txs.filter(x => x.id !== t.id); await commit('Transação excluída.');
    });
  },
  'toggle-paid': async el => {
    const t = F.txs.find(x => x.id === el.dataset.id); if (!t) return;
    t.paid = !t.paid; t.paidAt = t.paid ? todayISO() : null;
    await commit(t.paid ? `“${t.desc}” marcada como paga.` : `“${t.desc}” marcada como pendente.`);
  },
  'add-rec': () => recModal(),
  'edit-rec': el => recModal(el.dataset.id),
  'toggle-rec': async el => {
    const r = D().recurrences.find(x => x.id === el.dataset.id); if (!r) return;
    r.active = !r.active;
    if (r.active && r.next < todayISO()) {
      // ao retomar, não gera retroativos do período pausado
      while (r.next < todayISO()) r.next = F.nextOccurrence(r.next, r.freq, r.day, r.month);
    }
    F.processRecurrences();
    await commit(r.active ? 'Recorrência retomada.' : 'Recorrência pausada.');
  },
  'del-rec': el => {
    const r = D().recurrences.find(x => x.id === el.dataset.id); if (!r) return;
    const n = F.txs.filter(t => t.recId === r.id).length;
    confirmModal('Excluir recorrência', `Excluir a recorrência <b>${esc(r.desc)}</b>? Novos lançamentos deixarão de ser gerados.`, async form => {
      const also = form.alsoTx && form.alsoTx.checked;
      D().recurrences = D().recurrences.filter(x => x.id !== r.id);
      if (also) D().transactions = F.txs.filter(t => t.recId !== r.id);
      await commit('Recorrência excluída.');
    }, 'Excluir', n ? `<label class="check"><input type="checkbox" name="alsoTx"> Excluir também os ${n} lançamento(s) já gerados</label>` : '');
  },
  'add-acc': () => accountModal(),
  'edit-acc': el => accountModal(el.dataset.id),
  'del-acc': el => {
    const a = F.accountById(el.dataset.id); if (!a) return;
    const n = F.accountTx(a.id).length;
    confirmModal('Excluir conta', `Excluir a conta <b>${esc(a.name)}</b>?${n ? ' Os lançamentos serão mantidos como “Sem conta”, a menos que você marque a opção abaixo.' : ''}`, async form => {
      const also = form.alsoTx && form.alsoTx.checked;
      D().accounts = F.accounts.filter(x => x.id !== a.id);
      if (also) D().transactions = F.txs.filter(t => t.accountId !== a.id);
      else F.txs.forEach(t => { if (t.accountId === a.id) t.accountId = ''; });
      D().recurrences.forEach(r => { if (r.accountId === a.id) r.accountId = ''; });
      D().imports = D().imports.filter(i => i.accountId !== a.id || !also);
      await commit('Conta excluída.');
    }, 'Excluir', n ? `<label class="check"><input type="checkbox" name="alsoTx"> Excluir também os ${n} lançamento(s) desta conta</label>` : '');
  },
  'acc-tx': el => { S.hist = { q: '', type: '', cat: '', status: '', acc: el.dataset.id, from: '', to: '', sort: 'date-desc', limit: 60 }; location.hash = '#/historico'; },
  'import-invoice': el => { S.importAcc = el.dataset.acc || ''; const inp = $('#invoiceFile'); inp.value = ''; inp.click(); },
  'undo-import': el => {
    const im = D().imports.find(x => x.id === el.dataset.id); if (!im) return;
    const n = F.txs.filter(t => t.importId === im.id).length;
    confirmModal('Desfazer importação', `Remover os <b>${n}</b> lançamento(s) importados de <b>${esc(im.fileName)}</b>?`, async () => {
      D().transactions = F.txs.filter(t => t.importId !== im.id);
      D().imports = D().imports.filter(x => x.id !== im.id);
      await commit('Importação desfeita.');
    }, 'Desfazer');
  },
  'add-goal': () => goalModal(),
  'edit-goal': el => goalModal(el.dataset.id),
  'goal-in': el => goalMoveModal(el.dataset.id, 1),
  'goal-out': el => goalMoveModal(el.dataset.id, -1),
  'del-goal': el => {
    const g = D().goals.find(x => x.id === el.dataset.id); if (!g) return;
    confirmModal('Excluir meta', `Excluir a meta <b>${esc(g.name)}</b>?`, async () => { D().goals = D().goals.filter(x => x.id !== g.id); await commit('Meta excluída.'); });
  },
  'hist-more': () => { S.hist.limit += 60; updateList(); },
  'clear-filters': el => {
    const sc = el.dataset.scope;
    if (sc === 'inc') S.inc = { q: '', cat: '', kind: '', acc: '', all: false };
    if (sc === 'exp') S.exp = { q: '', cat: '', status: '', kind: '', acc: '', all: false };
    if (sc === 'hist') S.hist = { q: '', type: '', cat: '', status: '', acc: '', from: '', to: '', sort: 'date-desc', limit: 60 };
    refresh();
  },
  'export-pdf': el => Exporter.pdf(exportScope(el.dataset.scope)),
  'export-xlsx': el => Exporter.excel(exportScope(el.dataset.scope)),
  'export-csv': el => Exporter.csv(exportScope(el.dataset.scope)),
  'toggle-theme': () => { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); refresh(); },
  'theme': el => { applyTheme(el.dataset.theme); refresh(); },
  'toggle-notif': () => $('#notifPanel').classList.toggle('hidden'),
  'notif-go': el => { $('#notifPanel').classList.add('hidden'); location.hash = `#/${el.dataset.go}`; },
  'enable-notif': async () => {
    if (!('Notification' in window)) return toast('Seu navegador não suporta notificações.', 'error');
    const p = await Notification.requestPermission();
    if (p === 'granted') { D().settings.notifications = true; await commit('Notificações ativadas.'); browserNotify(); }
    else toast('Permissão de notificação negada no navegador.', 'warning');
  },
  'disable-notif': async () => { D().settings.notifications = false; await commit('Notificações desativadas.'); },
  'install': async () => { if (S.installPrompt) { S.installPrompt.prompt(); S.installPrompt = null; refresh(); } },
  'open-drawer': () => openDrawer(),
  'close-drawer': () => closeDrawer(),
  'logout': () => logout(),
  'chat-sug': el => askAssistant(el.dataset.q),
  'chat-clear': () => { S.chat = []; refresh(); },
  'change-pw': () => passwordModal(),
  'backup': () => { Exporter.backup(); toast('Backup exportado. Guarde-o em local seguro — o arquivo não é criptografado.', 'info'); },
  'import-backup': () => $('#importFile').click(),
  'clear-data': () => confirmModal('Apagar todos os dados', 'Todas as transações, recorrências, orçamentos e metas serão removidos. Recomendamos exportar um backup antes. Deseja continuar?', async () => {
    const theme = D().settings; Object.assign(D(), Store.emptyData()); D().settings = theme; await commit('Dados apagados.');
  }, 'Apagar tudo'),
  'delete-account': () => openModal({
    title: 'Excluir conta', danger: true, submit: 'Excluir definitivamente',
    body: '<p style="margin-top:0">Sua conta e todos os seus dados financeiros serão apagados deste dispositivo. Confirme com sua senha:</p><label class="field"><span>Senha</span><input class="input" type="password" name="pw" autocomplete="current-password"></label>',
    onSubmit: async form => { if (!form.pw.value) fail('Informe sua senha.', 'pw'); await Store.deleteAccount(form.pw.value); destroyCharts(); history.replaceState(null, '', location.pathname); showAuth(); toast('Conta excluída.'); }
  })
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!e.target.closest('.notif-wrap')) $('#notifPanel')?.classList.add('hidden');
  if (!el || !ACTIONS[el.dataset.act]) return;
  if (el.tagName === 'A' && !el.getAttribute('href')) e.preventDefault();
  ACTIONS[el.dataset.act](el, e);
});

// Filtros: atualizam apenas a lista, mantendo o foco no campo
function updateList() {
  const area = $('#listArea'); if (!area) return;
  area.innerHTML = { entradas: incomeList, saidas: expenseList, historico: historyList }[S.route]?.() || '';
  icons();
}
const updateListDebounced = debounce(updateList, 150);
document.addEventListener('input', e => {
  const el = e.target, path = el.dataset && el.dataset.f;
  if (!path) return;
  const [grp, key] = path.split('.');
  let v = el.value;
  if (el.hasAttribute('data-datemask')) {
    if (v && v.length < 10) return;
    v = v ? parseBRDate(v) : '';
    el.classList.toggle('invalid', v === null);
    if (v === null) return;
  }
  if (key === 'all') v = !!v;
  S[grp][key] = v;
  if (grp === 'hist') S.hist.limit = 60;
  if (el.hasAttribute('data-rerender')) refresh(); else (el.tagName === 'SELECT' ? updateList : updateListDebounced)();
});
document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset && el.dataset.actChange === 'hist-range') {
    const t = todayISO(), cm = currentMonth(), v = el.value;
    const ranges = { month: [`${cm}-01`, monthEnd(cm)], last: [`${addMonths(cm, -1)}-01`, monthEnd(addMonths(cm, -1))], 90: [addDays(t, -89), t], year: [`${cm.slice(0, 4)}-01-01`, `${cm.slice(0, 4)}-12-31`], all: ['', ''] };
    if (ranges[v]) { [S.hist.from, S.hist.to] = ranges[v]; S.hist.limit = 60; refresh(); }
    return;
  }
  if (el.dataset && el.dataset.budget) {
    const v = el.value.trim() ? parseMoney(el.value) : 0;
    if (!(v >= 0)) { el.classList.add('invalid'); return toast('Valor de limite inválido.', 'error'); }
    if (v > 0) D().budgets[el.dataset.budget] = v; else delete D().budgets[el.dataset.budget];
    await commit(v > 0 ? `Limite de ${catById(el.dataset.budget).name} definido: ${fmt(v)}.` : `Limite de ${catById(el.dataset.budget).name} removido.`);
    return;
  }
  if (el.id === 'invoiceFile' && el.files.length) { importInvoices(el.files); return; }
  if (el.id === 'importFile' && el.files[0]) {
    try {
      const obj = JSON.parse(await el.files[0].text());
      const data = obj.data || obj;
      if (!Array.isArray(data.transactions)) throw new Error();
      data.transactions = data.transactions.filter(t => t && t.id && (t.type === 'in' || t.type === 'out') && typeof t.amount === 'number' && /^\d{4}-\d{2}-\d{2}$/.test(t.date));
      const m = Store.migrate(data);
      confirmModal('Importar backup', `O backup contém <b>${m.transactions.length}</b> transação(ões), ${m.recurrences.length} recorrência(s) e ${m.goals.length} meta(s). Seus dados atuais serão <b>substituídos</b>. Continuar?`, async () => {
        Object.assign(D(), m); F.processRecurrences(); await commit('Backup importado com sucesso.');
      }, 'Importar');
    } catch { toast('Arquivo de backup inválido.', 'error'); }
    el.value = '';
  }
});
document.addEventListener('submit', async e => {
  if (e.target.id === 'chatForm') { e.preventDefault(); const i = $('#chatInput'); askAssistant(i.value); i.value = ''; }
  if (e.target.id === 'profileForm') {
    e.preventDefault();
    const n = e.target.name.value.trim();
    if (n.length < 2) return toast('Informe um nome válido.', 'error');
    Store.updateName(n); renderShell(); refresh(); toast('Perfil atualizado.');
  }
});
document.addEventListener('keydown', e => {
  if (!Store.current || $('#modal-root').firstElementChild) return;
  if (e.key === 'n' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !e.ctrlKey && !e.metaKey) { e.preventDefault(); txModal(null, 'out'); }
});
['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => {
  const dz = e.target.closest && e.target.closest('#dropzone');
  if (dz) { e.preventDefault(); dz.classList.add('over'); }
}));
document.addEventListener('dragleave', e => { const dz = e.target.closest && e.target.closest('#dropzone'); if (dz && !dz.contains(e.relatedTarget)) dz.classList.remove('over'); });
document.addEventListener('drop', e => {
  const dz = e.target.closest && e.target.closest('#dropzone');
  if (!dz) return;
  e.preventDefault(); dz.classList.remove('over');
  if (e.dataTransfer.files.length) { S.importAcc = ''; importInvoices(e.dataTransfer.files); }
});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installPrompt = e; });

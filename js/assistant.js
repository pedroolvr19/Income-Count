/* Assistente financeiro: interpreta perguntas em português e responde com base nos dados do usuário */
'use strict';

const Assistant = (() => {
  const MONTHS_N = MONTHS.map(m => norm(m));
  const CAT_WORDS = {
    alimentacao: ['alimentacao', 'comida', 'mercado', 'supermercado', 'restaurante', 'ifood', 'lanche'],
    transporte: ['transporte', 'uber', 'gasolina', 'combustivel', 'onibus', 'carro', 'estacionamento'],
    moradia: ['moradia', 'aluguel', 'condominio', 'casa', 'financiamento'],
    saude: ['saude', 'farmacia', 'remedio', 'medico', 'plano de saude', 'academia'],
    lazer: ['lazer', 'diversao', 'cinema', 'viagem', 'streaming', 'bar'],
    educacao: ['educacao', 'curso', 'faculdade', 'escola', 'livro'],
    compras: ['compras', 'roupa', 'shopping', 'eletronico'],
    contas: ['contas', 'luz', 'agua', 'internet', 'telefone', 'celular', 'energia'],
    salario: ['salario'], freelance: ['freelance', 'freela'], investimentos: ['investimento', 'investimentos', 'rendimento', 'dividendos'], vendas: ['vendas', 'venda']
  };
  const TIPS = {
    alimentacao: 'Planeje o cardápio da semana, faça lista de compras e reduza pedidos por aplicativo — cozinhar em casa 2–3 vezes a mais por semana costuma cortar 20–30% da categoria.',
    transporte: 'Compare transporte público, caronas e apps; agrupe deslocamentos e mantenha a calibragem/manutenção do carro em dia para economizar combustível.',
    moradia: 'Renegocie aluguel ou condomínio na renovação, compare seguros e avalie portabilidade do financiamento para juros menores.',
    saude: 'Use genéricos, programas de desconto em farmácias e revise se o plano de saúde atual é o mais adequado ao seu uso.',
    lazer: 'Defina um teto semanal para lazer, priorize opções gratuitas e revise assinaturas de streaming que você pouco usa.',
    educacao: 'Busque cursos gratuitos ou com bolsa, compre livros usados ou use bibliotecas digitais.',
    compras: 'Aplique a regra das 48 horas antes de compras não essenciais e desative notificações de lojas.',
    contas: 'Revise o plano de internet/celular, evite aparelhos em standby e confira tarifas bancárias que podem ser zeradas.',
    outros_out: 'Classifique melhor essas despesas — o que não tem categoria costuma esconder gastos por impulso.'
  };
  const NEEDS = ['moradia', 'saude', 'contas', 'transporte', 'alimentacao', 'educacao'];

  const b = v => `<b>${v}</b>`;
  const money = (v, cls = '') => `<b class="${cls}">${fmt(v)}</b>`;

  function period(q) {
    const cm = currentMonth(), y = +cm.slice(0, 4), cmNum = +cm.slice(5);
    const yearMatch = q.match(/\b(20\d{2})\b/);
    if (/mes passado|mes anterior|ultimo mes/.test(q)) { const k = addMonths(cm, -1); return { key: k, label: monthLabel(k), list: F.monthList(k) }; }
    for (let i = 0; i < 12; i++) {
      const re = new RegExp(`\\b${MONTHS_N[i]}\\b`);
      if (re.test(q)) {
        const yy = yearMatch ? +yearMatch[1] : (i + 1 > cmNum ? y - 1 : y);
        const k = `${yy}-${pad(i + 1)}`; return { key: k, label: monthLabel(k), list: F.monthList(k) };
      }
    }
    if (yearMatch || /\b(este ano|esse ano|neste ano|nesse ano|no ano|anual|ano todo)\b/.test(q)) {
      const yy = yearMatch ? +yearMatch[1] : y;
      return { year: yy, label: `${yy}`, list: F.rangeList(`${yy}-01-01`, `${yy}-12-31`) };
    }
    if (/\bhoje\b/.test(q)) { const t = todayISO(); return { label: 'hoje', list: F.rangeList(t, t) }; }
    if (/\bsemana\b/.test(q)) { const t = todayISO(); return { label: 'nos últimos 7 dias', list: F.rangeList(addDays(t, -6), t) }; }
    return { key: cm, label: monthLabel(cm), list: F.monthList(cm), current: true };
  }

  function detectCat(q) {
    for (const [id, words] of Object.entries(CAT_WORDS)) if (words.some(w => new RegExp(`\\b${w}\\b`).test(q))) return id;
    return null;
  }

  const labelIn = p => p.key ? `em ${p.label}` : p.year ? `em ${p.label}` : p.label;

  /* ---------- respostas ---------- */
  function rExpenses(p, cat) {
    const outs = p.list.filter(F.isOut);
    if (cat && catById(cat)) {
      const c = catById(cat);
      const v = sum(outs.filter(t => t.category === cat));
      let txt = `Você gastou ${money(v, 'neg')} com ${b(c.name)} ${labelIn(p)}.`;
      if (p.key) {
        const lim = Number(F.d.budgets[cat]) || 0;
        if (lim) txt += ` Seu limite é ${fmt(lim)} — ${v > lim ? `ultrapassado em ${money(v - lim, 'neg')}` : `ainda restam ${money(lim - v, 'pos')}`} (${fmtPct(v / lim)} usado).`;
        const avg = F.avgMonthlyExpense(cat, p.key);
        if (avg) txt += ` A média dos 3 meses anteriores foi ${fmt(avg)}.`;
      }
      return txt;
    }
    const s = F.stats(p.list);
    if (!outs.length) return `Não encontrei despesas registradas ${labelIn(p)}.`;
    const cats = F.byCategory(p.list).slice(0, 3);
    return `Você gastou ${money(s.exp, 'neg')} ${labelIn(p)} em ${outs.length} despesa(s): ${fmt(s.paid)} já pagos e ${fmt(s.pending)} pendentes.
      <br>Principais categorias: ${cats.map(c => `${c.cat.name} (${fmt(c.total)} · ${fmtPct(c.pct)})`).join(', ')}.`;
  }

  function rIncome(p) {
    const s = F.stats(p.list);
    if (!s.inc) return `Não encontrei receitas registradas ${labelIn(p)}.`;
    const cats = F.byCategory(p.list, 'in');
    return `Você recebeu ${money(s.inc, 'pos')} ${labelIn(p)} — ${fmt(s.incRecurring)} de receitas recorrentes e ${fmt(s.incOccasional)} eventuais.
      <br>Origem: ${cats.map(c => `${c.cat.name} (${fmt(c.total)})`).join(', ')}.`;
  }

  function rTopCat(p) {
    const cats = F.byCategory(p.list);
    if (!cats.length) return `Não há despesas ${labelIn(p)} para comparar categorias.`;
    const t = cats[0];
    return `A categoria com mais despesas ${labelIn(p)} foi ${b(t.cat.name)}, com ${money(t.total, 'neg')} (${fmtPct(t.pct)} do total).
      <ol class="a-list">${cats.slice(0, 5).map(c => `<li>${c.cat.name}: ${fmt(c.total)} · ${fmtPct(c.pct)}</li>`).join('')}</ol>`;
  }

  function rSavings(p) {
    const s = F.stats(p.list);
    if (!s.inc && !s.exp) return `Ainda não há movimentações ${labelIn(p)}.`;
    const tone = s.net >= 0 ? 'pos' : 'neg';
    let txt = `${labelIn(p)[0].toUpperCase() + labelIn(p).slice(1)} você recebeu ${fmt(s.inc)} e gastou ${fmt(s.exp)}. `;
    txt += s.net >= 0 ? `Conseguiu economizar ${money(s.net, tone)} — ${fmtPct(s.rate)} da sua renda.` : `O saldo ficou negativo em ${money(-s.net, tone)}: as despesas superaram as receitas.`;
    if (s.net >= 0 && s.rate < 0.1 && s.inc) txt += ' Uma boa referência é guardar ao menos 10–20% da renda.';
    if (s.rate >= 0.2) txt += ' Excelente, acima da referência de 20%!';
    const goals = F.d.goals.filter(g => g.saved < g.target);
    if (goals.length && s.net > 0) txt += `<br>Que tal direcionar parte disso para a meta ${b(esc(goals[0].name))}? Faltam ${fmt(goals[0].target - goals[0].saved)}.`;
    return txt;
  }

  function rTop(p) {
    const top = F.topExpenses(p.list, 5);
    if (!top.length) return `Não há despesas ${labelIn(p)}.`;
    return `Seus maiores gastos ${labelIn(p)}:<ol class="a-list">${top.map(t => `<li>${esc(t.desc)} — <b class="neg">${fmt(t.amount)}</b> <small>(${catById(t.category).name}, ${fmtDate(t.date)})</small></li>`).join('')}</ol>`;
  }

  function rBalance() {
    const cm = currentMonth(), s = F.monthStats(cm);
    return `Seu saldo disponível agora é ${money(F.balance(), F.balance() >= 0 ? 'bal' : 'neg')}.<br>Em ${monthLabel(cm)}: receitas ${fmt(s.inc)}, despesas ${fmt(s.exp)}, saldo do mês ${money(s.net, s.net >= 0 ? 'pos' : 'neg')}${s.pending ? ` (há ${fmt(s.pending)} ainda pendentes)` : ''}.`;
  }

  function rBudget(p) {
    const key = p.key || currentMonth();
    const st = F.budgetStatus(key).filter(x => x.limit);
    if (!st.length) return 'Você ainda não definiu limites de orçamento. Acesse <a href="#/orcamento">Orçamento & Metas</a> para criar limites por categoria.';
    const over = st.filter(x => x.level === 'over'), warn = st.filter(x => x.level === 'warn');
    const tl = sum(st, x => x.limit), ts = sum(st, x => x.spent);
    let txt = `Em ${monthLabel(key)} você usou ${fmt(ts)} de ${fmt(tl)} orçados (${fmtPct(tl ? ts / tl : 0)}).`;
    if (over.length) txt += `<br>Acima do limite: ${over.map(x => `${x.cat.name} (+${fmt(-x.left)})`).join(', ')}.`;
    if (warn.length) txt += `<br>Perto do limite: ${warn.map(x => `${x.cat.name} (${fmtPct(x.ratio)})`).join(', ')}.`;
    if (!over.length && !warn.length) txt += ' Todas as categorias estão dentro do planejado.';
    return txt;
  }

  function rGoals() {
    const g = F.d.goals;
    if (!g.length) return 'Você ainda não tem metas de economia. Crie uma em <a href="#/orcamento">Orçamento & Metas</a>.';
    return `Suas metas:<ul class="a-list">${g.map(x => {
      const pct = x.target ? x.saved / x.target : 0;
      let extra = '';
      if (x.deadline && x.saved < x.target) {
        const months = Math.max(1, Math.ceil(daysBetween(todayISO(), x.deadline) / 30.44));
        extra = ` — guarde ~${fmt((x.target - x.saved) / months)}/mês até ${fmtDate(x.deadline)}`;
      }
      return `<li>${esc(x.name)}: ${fmt(x.saved)} de ${fmt(x.target)} (${fmtPct(pct)})${pct >= 1 ? ' — concluída' : extra}</li>`;
    }).join('')}</ul>`;
  }

  function rPending() {
    const items = F.dueItems(30);
    const over = items.filter(i => i.overdue);
    if (!items.length) return 'Nenhuma conta pendente para os próximos 30 dias. Tudo em dia!';
    return `Você tem ${b(items.length)} conta(s) pendentes ou a vencer nos próximos 30 dias, somando ${money(sum(items), 'neg')}${over.length ? `, sendo ${over.length} vencida(s)` : ''}:
      <ul class="a-list">${items.slice(0, 8).map(i => `<li>${esc(i.desc)} — ${fmt(i.amount)} · ${i.overdue ? `<b class="neg">vencida em ${fmtDate(i.date)}</b>` : `vence ${i.days === 0 ? 'hoje' : `em ${fmtDate(i.date)}`}`}</li>`).join('')}</ul>`;
  }

  function rCompare(p) {
    const key = p.key || currentMonth(), prev = addMonths(key, -1);
    const a = F.monthStats(key), b2 = F.monthStats(prev);
    const ch = (x, y) => y ? `${x >= y ? '+' : ''}${fmtPct((x - y) / y)}` : '—';
    return `Comparando ${monthLabel(key)} com ${monthLabel(prev)}:
      <ul class="a-list"><li>Receitas: ${fmt(a.inc)} vs ${fmt(b2.inc)} (${ch(a.inc, b2.inc)})</li>
      <li>Despesas: ${fmt(a.exp)} vs ${fmt(b2.exp)} (${ch(a.exp, b2.exp)})</li>
      <li>Saldo: ${fmt(a.net)} vs ${fmt(b2.net)}</li></ul>
      ${a.exp > b2.exp && b2.exp ? 'Seus gastos aumentaram — veja quais categorias cresceram em Relatórios.' : a.exp < b2.exp ? 'Boa! Você gastou menos que no mês anterior.' : ''}`;
  }

  function rForecast() {
    const cm = currentMonth(), s = F.monthStats(cm);
    const day = +todayISO().slice(8), dim = daysInMonth(cm);
    const variable = sum(F.monthList(cm).filter(t => F.isOut(t) && !t.fixed && t.date <= todayISO()));
    const fixed = sum(F.monthList(cm).filter(t => F.isOut(t) && t.fixed));
    const upcomingRec = sum(F.d.recurrences.filter(r => r.type === 'out'), r => F.upcomingOf(r, monthEnd(cm)).filter(d => d > todayISO()).length * r.amount);
    const projVar = day ? variable / day * dim : variable;
    const proj = fixed + projVar + upcomingRec + sum(F.monthList(cm).filter(t => F.isOut(t) && !t.fixed && t.date > todayISO()));
    const upcomingInc = sum(F.d.recurrences.filter(r => r.type === 'in'), r => F.upcomingOf(r, monthEnd(cm)).filter(d => d > todayISO()).length * r.amount);
    const projInc = s.inc + upcomingInc;
    return `Projeção para o fim de ${monthLabel(cm)} (mantendo o ritmo atual de gastos variáveis de ${fmt(day ? variable / day : 0)}/dia):
      <ul class="a-list"><li>Despesas estimadas: <b class="neg">${fmt(proj)}</b></li><li>Receitas previstas: <b class="pos">${fmt(projInc)}</b></li>
      <li>Saldo estimado do mês: <b class="${projInc - proj >= 0 ? 'pos' : 'neg'}">${fmt(projInc - proj)}</b></li></ul>`;
  }

  function rReduce() {
    const cm = currentMonth();
    let key = cm; if (!F.monthList(cm).some(F.isOut)) key = addMonths(cm, -1);
    const list = F.monthList(key), s = F.stats(list);
    if (!s.exp) return 'Registre algumas despesas para que eu possa analisar onde dá para economizar.';
    const cats = F.byCategory(list);
    const parts = [];
    parts.push(`Analisei suas despesas de ${b(monthLabel(key))} (${fmt(s.exp)}). Aqui vão sugestões personalizadas:`);
    const items = [];
    // Crescimento acima da média
    cats.forEach(c => {
      const avg = F.avgMonthlyExpense(c.cat.id, key);
      if (avg && c.total > avg * 1.15) items.push(`<b>${c.cat.name}</b> está ${fmtPct(c.total / avg - 1)} acima da sua média (${fmt(avg)}). Voltar à média liberaria ${fmt(c.total - avg)}.`);
    });
    // Orçamento estourado
    F.budgetStatus(key).filter(x => x.level === 'over').forEach(x => items.push(`<b>${x.cat.name}</b> passou do limite em ${fmt(-x.left)}.`));
    // Maiores categorias com dicas
    cats.slice(0, 3).forEach(c => { if (TIPS[c.cat.id]) items.push(`<b>${c.cat.name}</b> (${fmtPct(c.pct)} dos gastos): ${TIPS[c.cat.id]}`); });
    // Regra 50/30/20
    if (s.inc) {
      const needs = sum(list.filter(t => F.isOut(t) && NEEDS.includes(t.category)));
      const wants = s.exp - needs;
      items.push(`Regra 50/30/20: necessidades ${fmtPct(needs / s.inc)} (ideal ≤ 50%), desejos ${fmtPct(wants / s.inc)} (ideal ≤ 30%), economia ${fmtPct(Math.max(0, s.rate))} (ideal ≥ 20%).`);
      if (wants / s.inc > 0.3) items.push(`Reduzir desejos para 30% da renda economizaria cerca de ${fmt(wants - s.inc * 0.3)} por mês.`);
    }
    // Variáveis
    if (s.exp && s.variable / s.exp > 0.5) items.push(`${fmtPct(s.variable / s.exp)} dos gastos são variáveis — são os mais fáceis de cortar. Defina limites semanais para eles.`);
    // Recorrências
    const recOut = F.d.recurrences.filter(r => r.type === 'out' && r.active);
    if (recOut.length) items.push(`Você tem ${recOut.length} despesa(s) recorrente(s) somando ~${fmt(sum(recOut, r => F.monthlyImpact(r)))}/mês. Revise assinaturas e contratos que podem ser cancelados ou renegociados.`);
    parts.push(`<ul class="a-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>`);
    return parts.join('');
  }

  function rByAccount(p) {
    if (!F.accounts.length) return 'Você ainda não cadastrou contas. Vá em <a href="#/contas">Contas & Cartões</a> para cadastrar seus bancos e importar faturas.';
    const by = F.byAccount(p.list);
    if (!by.length) return `Não há despesas ${labelIn(p)}.`;
    return `Gastos por conta ${labelIn(p)}:<ol class="a-list">${by.map(b => `<li>${esc(b.acc.name)}: <b class="neg">${fmt(b.total)}</b> (${fmtPct(b.pct)})</li>`).join('')}</ol>${by.length > 1 ? `A conta com mais gastos foi <b>${esc(by[0].acc.name)}</b>.` : ''}`;
  }

  function rHelp() {
    return `Olá, ${esc(Store.current.name.split(' ')[0])}! Sou seu assistente financeiro e respondo com base nos dados que você cadastrou. Você pode perguntar, por exemplo:
      <ul class="a-list"><li>Quanto gastei neste mês? / em setembro? / com alimentação?</li><li>Qual categoria teve mais despesas?</li><li>Quanto consegui economizar?</li>
      <li>Quais são meus maiores gastos?</li><li>Quanto gastei em cada cartão? / Quanto gastei no Nubank?</li><li>Como posso reduzir minhas despesas?</li><li>Quais contas estão pendentes?</li><li>Como está meu orçamento? E minhas metas?</li><li>Compare com o mês passado / Qual a previsão para o fim do mês?</li></ul>`;
  }

  function answer(text) {
    let q = norm(text).replace(/[?!.,;]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!q) return rHelp();
    if (!F.txs.length && !/ajuda|oi|ola/.test(q)) return 'Você ainda não tem movimentações cadastradas. Adicione suas entradas e saídas e eu consigo analisar tudo para você.';
    const acc = F.accounts.find(a => new RegExp(`\\b${norm(a.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(q)) || F.accounts.find(a => a.bank && a.bank !== 'Outro' && q.includes(norm(a.bank)));
    if (acc) q = q.replace(norm(acc.name), ' ').replace(norm(acc.bank || '\u0000'), ' ');
    if (/(por|cada|em qual|qual|quais|entre as?) (conta|cartao|cartoes|banco|bancos|contas)/.test(q) || /gastos? (dos|nos|por) (cartoes|bancos|contas)/.test(q)) return rByAccount(period(q));
    const p = period(q), cat = detectCat(q);
    if (acc) { p.list = p.list.filter(t => t.accountId === acc.id); p.label += ` (${acc.name})`; }
    if (/^(oi|ola|bom dia|boa tarde|boa noite|ajuda|help)\b|o que voce|como funciona|o que posso/.test(q)) return rHelp();
    if (/reduz|diminu|cortar|corte|dica|conselho|gastar menos|economizar mais|melhorar|onde posso economizar/.test(q)) return rReduce();
    if (/previs|projec|fim do mes|final do mes|vou fechar/.test(q)) return rForecast();
    if (/compar|em relacao|versus|\bvs\b/.test(q)) return rCompare(/mes passado|mes anterior|ultimo mes/.test(q) ? { key: currentMonth() } : p);
    if (/pendente|vencend|vencer|vencimento|a pagar|atrasad|em aberto/.test(q)) return rPending();
    if (/orcamento|limite/.test(q)) return rBudget(p);
    if (/\bmetas?\b|objetivo/.test(q)) return rGoals();
    if (/categoria/.test(q) && /mais|maior|top|principal/.test(q)) return rTopCat(p);
    if (/maior(es)? (gasto|despesa)|gastos? maior|mais caro|top/.test(q)) return rTop(p);
    if (/economiz|poupe|poupar|poupanca|sobrou|guardei|consegui guardar/.test(q)) return rSavings(p);
    if (/saldo|quanto tenho|disponivel|dinheiro tenho/.test(q)) return rBalance();
    if (cat && CATS.in.some(c => c.id === cat) && !/gast|despes|pague/.test(q)) return rIncome(p);
    if (/recebi|receita|ganhei|renda|entrada|entrou|faturei|salario/.test(q)) return rIncome(p);
    if (/gast|despes|pague|saida|saiu|custou/.test(q) || cat) return rExpenses(p, cat && CATS.out.some(c => c.id === cat) ? cat : null);
    if (/resumo|situacao|como estou|como esta/.test(q)) return `${rBalance()}<br><br>${rSavings(p)}`;
    return `Não entendi bem a pergunta. ${rHelp()}`;
  }

  const SUGGESTIONS = ['Quanto gastei neste mês?', 'Qual categoria teve mais despesas?', 'Quanto consegui economizar?', 'Quais são meus maiores gastos?', 'Quanto gastei em cada conta?', 'Como posso reduzir minhas despesas?', 'Quais contas estão pendentes?', 'Compare com o mês passado', 'Previsão para o fim do mês'];

  return { answer, SUGGESTIONS };
})();

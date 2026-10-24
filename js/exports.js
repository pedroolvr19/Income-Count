/* Exportação de relatórios: PDF (jsPDF + AutoTable), Excel (SheetJS) e CSV */
'use strict';

const Exporter = {
  txRow(t) {
    return {
      'Data': fmtDate(t.date),
      'Tipo': t.type === 'in' ? 'Entrada' : 'Saída',
      'Descrição': t.desc,
      'Categoria': catById(t.category).name,
      'Conta': (t.accountId && F.accountById(t.accountId)?.name) || '—',
      'Classificação': t.type === 'in' ? (t.recurring ? 'Recorrente' : 'Eventual') : (t.fixed ? 'Fixa' : 'Variável'),
      'Status': t.type === 'in' ? 'Recebido' : (t.paid ? 'Pago' : 'Pendente'),
      'Valor (R$)': Math.round((t.type === 'in' ? t.amount : -t.amount) * 100) / 100
    };
  },

  build({ title, period, list }) {
    const s = F.stats(list);
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    return {
      title, period, sorted, s,
      summary: [
        ['Total recebido', s.inc], ['Total gasto', s.exp], ['Despesas pagas', s.paid],
        ['Despesas pendentes', s.pending], ['Economizado (saldo do período)', s.net], ['Taxa de economia', null, fmtPct(s.rate)]
      ],
      cats: F.byCategory(list, 'out'),
      incCats: F.byCategory(list, 'in'),
      accs: F.accounts.length ? F.byAccount(list) : [],
      top: F.topExpenses(list, 10)
    };
  },

  excel(opts) {
    const r = this.build(opts);
    if (!window.XLSX) return this.csv(opts);
    const wb = XLSX.utils.book_new();
    const money = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

    const sumRows = [[r.title], [`Período: ${r.period}`], [`Gerado em ${fmtDate(todayISO())} — ${Store.current.name}`], [], ['Indicador', 'Valor']];
    r.summary.forEach(([k, v, txt]) => sumRows.push([k, txt ?? v]));
    sumRows.push([], ['Despesas por categoria', 'Total', '%']);
    r.cats.forEach(c => sumRows.push([c.cat.name, c.total, Math.round(c.pct * 1000) / 10 + '%']));
    if (r.accs.length) { sumRows.push([], ['Gastos por conta', 'Total', '%']); r.accs.forEach(c => sumRows.push([c.acc.name, c.total, Math.round(c.pct * 1000) / 10 + '%'])); }
    sumRows.push([], ['Receitas por categoria', 'Total', '%']);
    r.incCats.forEach(c => sumRows.push([c.cat.name, c.total, Math.round(c.pct * 1000) / 10 + '%']));
    const ws1 = XLSX.utils.aoa_to_sheet(sumRows);
    Object.keys(ws1).forEach(a => { if (a[0] !== '!' && a[0] === 'B' && typeof ws1[a].v === 'number') ws1[a].z = money; });
    ws1['!cols'] = [{ wch: 34 }, { wch: 18 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumo');

    const ws2 = XLSX.utils.json_to_sheet(r.sorted.map(t => this.txRow(t)));
    Object.keys(ws2).forEach(a => { if (a[0] === 'H' && typeof ws2[a].v === 'number') ws2[a].z = money; });
    ws2['!cols'] = [{ wch: 12 }, { wch: 9 }, { wch: 32 }, { wch: 16 }, { wch: 16 }, { wch: 13 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Transações');

    const ws3 = XLSX.utils.json_to_sheet(r.top.map(t => this.txRow(t)));
    Object.keys(ws3).forEach(a => { if (a[0] === 'H' && typeof ws3[a].v === 'number') ws3[a].z = money; });
    ws3['!cols'] = ws2['!cols'];
    XLSX.utils.book_append_sheet(wb, ws3, 'Maiores despesas');

    XLSX.writeFile(wb, `${slug(r.title + ' ' + r.period)}.xlsx`);
    toast('Planilha Excel gerada.');
  },

  csv(opts) {
    const r = this.build(opts);
    const rows = r.sorted.map(t => this.txRow(t));
    const head = Object.keys(this.txRow({ date: '', type: 'in', desc: '', category: '', amount: 0 }));
    const line = v => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [head.map(line).join(';'), ...rows.map(o => head.map(h => line(typeof o[h] === 'number' ? fmtNum(o[h]) : o[h])).join(';'))].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${slug(r.title + ' ' + r.period)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Arquivo CSV gerado.');
  },

  pdf(opts) {
    if (!window.jspdf) { toast('Biblioteca de PDF indisponível.', 'error'); return; }
    const r = this.build(opts);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const green = [5, 150, 105], dark = [17, 24, 39];

    doc.setFillColor(...green); doc.rect(0, 0, W, 86, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
    doc.text('Finance Manager', 40, 40);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    doc.text(`${r.title} — ${r.period}`, 40, 62);
    doc.text(`${Store.current.name} · gerado em ${fmtDate(todayISO())}`, W - 40, 62, { align: 'right' });

    // Cartões de resumo
    const cards = [['Recebido', r.s.inc, [22, 163, 74]], ['Gasto', r.s.exp, [220, 38, 38]], ['Economizado', r.s.net, [37, 99, 235]]];
    const cw = (W - 80 - 20) / 3;
    cards.forEach(([label, v, c], i) => {
      const x = 40 + i * (cw + 10);
      doc.setDrawColor(229, 231, 235); doc.setFillColor(248, 250, 249); doc.roundedRect(x, 106, cw, 58, 6, 6, 'FD');
      doc.setTextColor(107, 114, 128); doc.setFontSize(9); doc.text(label.toUpperCase(), x + 12, 126);
      doc.setTextColor(...c); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(fmt(v), x + 12, 150);
      doc.setFont('helvetica', 'normal');
    });

    const tableBase = { theme: 'grid', styles: { fontSize: 9, cellPadding: 5, textColor: dark }, headStyles: { fillColor: green, textColor: 255 }, margin: { left: 40, right: 40 } };
    doc.autoTable({ ...tableBase, startY: 184, head: [['Indicador', 'Valor']], body: r.summary.map(([k, v, t]) => [k, t ?? fmt(v)]), columnStyles: { 1: { halign: 'right' } } });
    if (r.cats.length) doc.autoTable({ ...tableBase, startY: doc.lastAutoTable.finalY + 18, head: [['Despesas por categoria', 'Total', '%']], body: r.cats.map(c => [c.cat.name, fmt(c.total), fmtPct(c.pct)]), columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } } });
    if (r.accs.length) doc.autoTable({ ...tableBase, startY: doc.lastAutoTable.finalY + 18, head: [['Gastos por conta', 'Total', '%']], body: r.accs.map(c => [c.acc.name, fmt(c.total), fmtPct(c.pct)]), columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } } });
    if (r.top.length) doc.autoTable({ ...tableBase, startY: doc.lastAutoTable.finalY + 18, head: [['Maiores despesas', 'Data', 'Categoria', 'Valor']], body: r.top.map(t => [t.desc, fmtDate(t.date), catById(t.category).name, fmt(t.amount)]), columnStyles: { 3: { halign: 'right' } } });
    doc.autoTable({
      ...tableBase, startY: doc.lastAutoTable.finalY + 18,
      head: [['Data', 'Descrição', 'Categoria', 'Conta', 'Status', 'Valor']],
      body: r.sorted.map(t => [fmtDate(t.date), t.desc, catById(t.category).name, (t.accountId && F.accountById(t.accountId)?.name) || '—', t.type === 'in' ? 'Recebido' : (t.paid ? 'Pago' : 'Pendente'), (t.type === 'in' ? '+ ' : '- ') + fmt(t.amount)]),
      columnStyles: { 5: { halign: 'right' } },
      didParseCell: d => { if (d.section === 'body' && d.column.index === 5) d.cell.styles.textColor = r.sorted[d.row.index].type === 'in' ? [22, 163, 74] : [220, 38, 38]; }
    });

    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150);
      doc.text(`Página ${i} de ${pages}`, W - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
    }
    doc.save(`${slug(r.title + ' ' + r.period)}.pdf`);
    toast('Relatório PDF gerado.');
  },

  backup() {
    const blob = new Blob([JSON.stringify({ app: 'finance-manager', exportedAt: new Date().toISOString(), data: Store.data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `backup-finance-manager-${todayISO()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
};

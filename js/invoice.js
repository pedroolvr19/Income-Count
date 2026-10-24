/* Importação de faturas em PDF: extração de texto (pdf.js) + reconhecimento de lançamentos */
'use strict';

const Invoice = (() => {
  const MON = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
  const MON_RE = 'jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez';
  const DATE = `(?:\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?|\\d{1,2}\\s?(?:de\\s)?(?:${MON_RE})[a-zç]*\\.?(?:\\s?(?:de\\s)?\\d{4})?)`;
  const AMT = '[-−–]?\\s?(?:R\\$\\s?)?[-−–]?\\s?\\d{1,3}(?:\\.\\d{3})*,\\d{2}(?:\\s?[-−–])?';
  const dateAt = new RegExp(`(?:^|\\s)(${DATE})(?=\\s)`, 'gi');
  const amtRe = new RegExp(`(?:^|\\s)(${AMT})(?=\\s|$)`, 'gi');

  const SKIP = /^(sub)?total|^saldo|^limite|^pagamento m[ií]nimo|^valor (m[ií]nimo|total)|^encargos|^juros (do|de) |^taxa (de juros|efetiva)|^cet\b|^cust[oa] efetivo|^fatura (anterior|atual)|^vencimento|^melhor data|^resumo|^pr[oó]xim[oa]s? fatura|^lan[cç]amentos futuros/i;
  const PAYMENT = /pagamento|pagto|pgto|pag\.? fatura/i;
  const CREDIT = /pagamento|pagto|pgto|estorno|cr[eé]dito|desconto|cashback|reembolso|devolu[cç][aã]o|ajuste a cr/i;

  const BANK_HINTS = [
    ['Nubank', /nubank|nu pagamentos/i], ['Bradesco', /bradesco|bradescard/i], ['Itaú', /ita[uú]\b|itaucard/i],
    ['Santander', /santander/i], ['Banco do Brasil', /banco do brasil|ourocard/i], ['Caixa', /caixa econ[oô]mica|cart[aã]o caixa/i],
    ['Inter', /banco inter\b|inter&co/i], ['C6 Bank', /c6 bank|banco c6/i], ['PicPay', /picpay/i], ['Mercado Pago', /mercado pago/i],
    ['Neon', /\bneon\b/i], ['XP', /\bxp (investimentos|visa|card)/i], ['Sicredi', /sicredi/i], ['Sicoob', /sicoob/i]
  ];

  const CAT_KEYS = {
    alimentacao: ['ifood', 'rappi', 'restaurante', 'restaur', 'lanchonete', 'lanches', 'padaria', 'panificadora', 'mercado', 'supermerc', 'supermercado', 'atacadao', 'atacadista', 'assai', 'carrefour', 'pao de acucar', 'hortifruti', 'burger', 'mcdonalds', 'mc donalds', 'subway', 'pizza', 'pizzaria', 'cafe', 'cafeteria', 'starbucks', 'acougue', 'emporio', 'sorveteria', 'doceria', 'food', 'churrascaria', 'outback', 'bobs', 'habibs', 'ze delivery'],
    transporte: ['uber', '99app', '99 app', '99pop', '99 tecnologia', 'cabify', 'posto', 'auto posto', 'shell', 'ipiranga', 'petrobras', 'combustivel', 'estacionamento', 'estapar', 'sem parar', 'conectcar', 'veloe', 'pedagio', 'metro', 'bilhete unico', 'buser', 'clickbus', 'oficina', 'autopecas'],
    moradia: ['aluguel', 'condominio', 'quintoandar', 'quinto andar', 'leroy', 'telhanorte', 'tok stok', 'tokstok', 'material de construcao', 'imobiliaria'],
    saude: ['drogasil', 'droga raia', 'drogaria', 'raia', 'pague menos', 'farmacia', 'farma', 'panvel', 'hospital', 'clinica', 'laboratorio', 'unimed', 'amil', 'hapvida', 'smartfit', 'smart fit', 'bluefit', 'academia', 'odonto', 'dentista', 'medico', 'gympass', 'wellhub', 'totalpass'],
    lazer: ['netflix', 'spotify', 'disney', 'hbo', 'hbomax', 'prime video', 'primevideo', 'youtube', 'cinema', 'cinemark', 'ingresso', 'ingresso.com', 'sympla', 'steam', 'playstation', 'xbox', 'nintendo', 'twitch', 'deezer', 'globoplay', 'paramount', 'crunchyroll', 'airbnb', 'booking', 'decolar', 'latam', 'gol linhas', 'azul linhas', 'hotel', 'pousada', 'bar ', 'cervejaria', 'show'],
    educacao: ['udemy', 'alura', 'coursera', 'escola', 'colegio', 'faculdade', 'universidade', 'curso', 'livraria', 'saraiva', 'kindle', 'duolingo', 'domestika', 'hotmart', 'papelaria'],
    compras: ['amazon', 'amzn', 'mercadolivre', 'mercado livre', 'mercadolibre', 'magalu', 'magazine', 'shopee', 'shein', 'aliexpress', 'americanas', 'casas bahia', 'renner', 'riachuelo', 'c&a', 'cea ', 'zara', 'centauro', 'netshoes', 'kabum', 'fast shop', 'apple.com', 'google play', 'decathlon', 'havan', 'shopping', 'loja', 'boticario', 'natura', 'sephora', 'pet', 'petz', 'cobasi'],
    contas: ['claro', 'vivo', 'tim ', 'oi ', 'internet', 'enel', 'light', 'sabesp', 'cemig', 'copel', 'coelba', 'celpe', 'energia', 'agua', 'iof', 'anuidade', 'seguro', 'tarifa', 'juros', 'multa', 'encargo', 'google one', 'icloud', 'microsoft', 'chatgpt', 'openai', 'anthropic', 'claude']
  };

  // pares (categoria, palavra) ordenados do mais específico (mais longo) ao mais genérico
  const KEY_LIST = Object.entries(CAT_KEYS).flatMap(([cat, keys]) => keys.map(k => [cat, norm(k).replace(/[*_\-./]+/g, ' ')])).sort((a, b) => b[1].length - a[1].length);
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&');
  function guessCategory(desc) {
    const d = ' ' + norm(desc).replace(/[*_\-./]+/g, ' ').replace(/\s+/g, ' ') + ' ';
    for (const [cat, k] of KEY_LIST) {
      if (k.endsWith(' ') ? d.includes(' ' + k) : new RegExp(`\\s${reEsc(k)}`).test(d)) return cat;
    }
    return 'outros_out';
  }

  function detectBank(text) { for (const [name, re] of BANK_HINTS) if (re.test(text)) return name; return null; }

  function toISO2(y, m, d) { const dt = new Date(y, m - 1, d); return dt.getMonth() === m - 1 && dt.getDate() === d ? toISO(dt) : null; }

  /** Converte a data do lançamento para ISO, inferindo o ano pelo vencimento da fatura */
  function parseDate(s, ref) {
    s = norm(s).replace(/\s+/g, ' ').trim();
    const [ry, rm] = ref.split('-').map(Number);
    let d, m, y = null;
    let mm = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (mm) { d = +mm[1]; m = +mm[2]; if (mm[3]) y = +mm[3] < 100 ? 2000 + +mm[3] : +mm[3]; }
    else {
      mm = s.match(new RegExp(`^(\\d{1,2})\\s?(?:de\\s)?(${MON_RE})[a-z]*\\.?(?:\\s?(?:de\\s)?(\\d{4}))?$`));
      if (!mm) return null;
      d = +mm[1]; m = MON[mm[2]]; if (mm[3]) y = +mm[3];
    }
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    if (!y) y = m > rm + 1 ? ry - 1 : ry; // compras de meses "depois" do vencimento são do ano anterior (ex.: fatura de jan com compras de dez)
    return toISO2(y, m, d);
  }

  function parseAmount(s) {
    return { value: parseMoney(s.replace(/[-−–]/g, '')), negative: /[-−–]/.test(s) };
  }

  function findDue(text) {
    const t = text.replace(/\s+/g, ' ');
    let m = t.match(/vencimento[^0-9]{0,40}(\d{2})\/(\d{2})\/(\d{4})/i) || t.match(/(\d{2})\/(\d{2})\/(\d{4})[^0-9]{0,15}vencimento/i);
    if (m) return toISO2(+m[3], +m[2], +m[1]);
    m = t.match(new RegExp(`vencimento[^0-9]{0,40}(\\d{1,2})\\s?(?:de\\s)?(${MON_RE})[a-zç]*\\.?\\s?(?:de\\s)?(\\d{4})`, 'i'));
    if (m) return toISO2(+m[3], MON[norm(m[2]).slice(0, 3)], +m[1]);
    return null;
  }
  function findTotal(text) {
    const t = text.replace(/\s+/g, ' ');
    const m = t.match(/total (?:da|desta|de sua|dessa) fatura[^0-9]{0,40}?(?:R\$\s?)?(\d{1,3}(?:\.\d{3})*,\d{2})/i) || t.match(/valor (?:total )?(?:da|desta) fatura[^0-9]{0,40}?(?:R\$\s?)?(\d{1,3}(?:\.\d{3})*,\d{2})/i) || t.match(/total a pagar[^0-9]{0,40}?(?:R\$\s?)?(\d{1,3}(?:\.\d{3})*,\d{2})/i);
    return m ? parseMoney(m[1]) : null;
  }

  function cleanDesc(s) {
    return s.replace(/[•·*]{2,}\s?\d{4}/g, ' ').replace(/\bfinal\s?\d{4}\b/gi, ' ').replace(/\bR\$\s*$/i, '').replace(/\bUS\$\s*$/i, '').replace(/\s{2,}/g, ' ').replace(/^[-–:|\s]+|[-–:|\s]+$/g, '').trim();
  }

  /** Reconhece lançamentos em linhas de texto */
  function parseLines(lines) {
    const text = lines.join('\n');
    const due = findDue(text), total = findTotal(text), bank = detectBank(text);
    const ref = due || todayISO();
    const items = [];
    lines.forEach(raw => {
      const s = raw.replace(/\s+/g, ' ').trim();
      if (s.length < 8) return;
      const dates = [...s.matchAll(dateAt)].map(m => ({ idx: m.index + (m[0].length - m[1].length), str: m[1] }));
      if (!dates.length || dates[0].idx !== 0) return;
      // Inícios de lançamento: a 1ª data e qualquer data que apareça depois de um valor (faturas em duas colunas)
      const starts = [dates[0]];
      for (let i = 1; i < dates.length; i++) {
        const prev = starts[starts.length - 1];
        const between = s.slice(prev.idx + prev.str.length, dates[i].idx);
        if (new RegExp(`(?:^|\\s)${AMT}\\s*$`, 'i').test(between)) starts.push(dates[i]);
      }
      starts.forEach((st, i) => {
        const end = i + 1 < starts.length ? starts[i + 1].idx : s.length;
        const rest = s.slice(st.idx + st.str.length, end);
        const amts = [...rest.matchAll(amtRe)];
        if (!amts.length) return;
        const first = amts[0], last = amts[amts.length - 1];
        let desc = cleanDesc(rest.slice(0, first.index));
        if (desc.length < 2 || SKIP.test(desc)) return;
        const date = parseDate(st.str, ref);
        if (!date) return;
        const { value, negative } = parseAmount(last[1]);
        if (!(value > 0)) return;
        const credit = negative || CREDIT.test(desc);
        const inst = desc.match(/(?:parc(?:ela)?\.?\s*)?(\d{1,2})\s?(?:\/|de)\s?(\d{1,2})$/i);
        items.push({ date, desc, amount: value, credit, category: credit ? 'outros_in' : guessCategory(desc), installment: inst && +inst[1] <= +inst[2] ? `${inst[1]}/${inst[2]}` : null });
      });
    });
    return { items, due, total, bank };
  }

  async function extractLines(file, password) {
    if (!window.pdfjsLib) throw new Error('Leitor de PDF indisponível.');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data, password, isEvalSupported: false }).promise;
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || 8 }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const rows = [];
      items.forEach(it => {
        const row = rows.find(r => Math.abs(r.y - it.y) <= Math.max(2.5, it.h * 0.35));
        if (row) row.items.push(it); else rows.push({ y: it.y, items: [it] });
      });
      rows.sort((a, b) => b.y - a.y).forEach(r => {
        r.items.sort((a, b) => a.x - b.x);
        let line = '', prev = null;
        r.items.forEach(it => {
          if (prev) { const gap = it.x - (prev.x + prev.w); line += gap > it.h * 1.5 ? '   ' : gap > 0.8 ? ' ' : ''; }
          line += it.s; prev = it;
        });
        lines.push(line);
      });
    }
    await pdf.destroy();
    return lines;
  }

  async function read(file, password) {
    const lines = await extractLines(file, password);
    const chars = lines.join('').replace(/\s/g, '').length;
    if (chars < 30) { const e = new Error('Este PDF não contém texto (parece ser uma imagem digitalizada). Baixe a fatura em PDF pelo app ou site do banco.'); e.code = 'NOTEXT'; throw e; }
    return { ...parseLines(lines), lines };
  }

  /** Chave para detectar lançamentos já importados */
  const fingerprint = (accountId, date, amount, desc) => `${accountId}|${date}|${Math.round(amount * 100)}|${norm(desc).replace(/[^a-z0-9]/g, '').slice(0, 24)}`;

  return { PAYMENT, read, parseLines, guessCategory, detectBank, fingerprint };
})();

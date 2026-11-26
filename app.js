'use strict';
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const nf = (v, d) => {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-4 || a >= 1e8)) return v.toExponential(3);
  return v.toFixed(d === undefined ? 6 : d);
};
const short = v => { const r = Math.round(v * 1e6) / 1e6; return String(r); };
function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 380); }, 2800);
}
function download(name, data, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const FUNCS = { sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt, exp: Math.exp,
  ln: Math.log, log: Math.log, abs: Math.abs, sinh: Math.sinh, cosh: Math.cosh, atan: Math.atan };
const NAMES = Object.keys(FUNCS).concat(['x', 'pi', 'e']).sort((a, b) => b.length - a.length);

/* ═══ Limpia prefijos tipo f(x)=, g(x)=, y= antes de parsear ═══ */
function cleanExpr(src) {
  let s = String(src == null ? '' : src).trim();
  s = s.replace(/^\s*[fFgGyY]\s*\(\s*x\s*\)\s*=\s*/, '');
  s = s.replace(/^\s*[yY]\s*=\s*/, '');
  return s.trim();
}

function tokenize(src) {
  const s = String(src).replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/\*\*/g, '^')
    .replace(/,/g, '.').replace(/\s+/g, '').toLowerCase();
  const raw = [];  let i = 0;
  const isD = c => (c >= '0' && c <= '9') || c === '.';
  const isA = c => c >= 'a' && c <= 'z';
  while (i < s.length) {
    const c = s[i];
    if (isD(c)) { let j = i; while (j < s.length && isD(s[j])) j++; const v = parseFloat(s.slice(i, j));
      if (!isFinite(v)) throw new Error('Número inválido'); raw.push({ t: 'num', v }); i = j; }
    else if (isA(c)) {
      let j = i; while (j < s.length && isA(s[j])) j++;
      let run = s.slice(i, j);
      while (run.length) {
        let hit = null;
        for (const n of NAMES) if (run.indexOf(n) === 0) { hit = n; break; }
        if (!hit) throw new Error('No reconozco «' + run + '»');
        raw.push({ t: 'id', v: hit }); run = run.slice(hit.length);
      }
      i = j;
    }
    else if ('+-/^()'.indexOf(c) >= 0) { raw.push({ t: c }); i++; }
    else throw new Error('Símbolo no admitido: «' + c + '»');
  }
  // ✅ Multiplicación implícita ahora usa '*' (único tipo de nodo producto)
  const out = [];
  for (let k = 0; k < raw.length; k++) {
    const cur = raw[k], prev = out[out.length - 1];
    if (prev) {
      const end = prev.t === 'num' || prev.t === ')' || (prev.t === 'id' && !FUNCS[prev.v]);
      const start = cur.t === 'num' || cur.t === 'id' || cur.t === '(';
      if (end && start) out.push({ t: '*' });
    }
    out.push(cur);
  }
  return out;
}
function parse(src) {
  const cleaned = cleanExpr(src);
  if (!cleaned) throw new Error('Expresión incompleta');
  const tk = tokenize(cleaned); let p = 0;
  const peek = () => tk[p];
  const eat = t => (tk[p] && tk[p].t === t ? tk[p++] : null);
  function expr() { let n = term(); while (peek() && (peek().t === '+' || peek().t === '-')) { const o = tk[p++].t; n = { t: o, a: n, b: term() }; } return n; }
  function term() { let n = unary(); while (peek() && (peek().t === '*' || peek().t === '/')) { const o = tk[p++].t; n = { t: o, a: n, b: unary() }; } return n; }
  function unary() { if (eat('-')) return { t: 'neg', a: unary() }; if (eat('+')) return unary(); return power(); }
  function power() { const b = atom(); if (eat('^')) return { t: '^', a: b, b: unary() }; return b; }
  function atom() {
    const t = peek();
    if (!t) throw new Error('Expresión incompleta');
    if (t.t === 'num') { p++; return { t: 'num', v: t.v }; }
    if (t.t === '(') { p++; const n = expr(); if (!eat(')')) throw new Error('Falta cerrar «)»'); return n; }
    if (t.t === 'id') {
      p++;
      if (t.v === 'x') return { t: 'var' };
      if (t.v === 'pi' || t.v === 'e') return { t: 'const', name: t.v };
      if (!eat('(')) throw new Error('Escribe ' + t.v + '( … )');
      const a = expr(); if (!eat(')')) throw new Error('Falta cerrar «)»');
      return { t: 'f', n: t.v === 'log' ? 'ln' : t.v, a };
    }
    throw new Error('Expresión mal formada');
  }
  const n = expr();
  if (p < tk.length) throw new Error('Sobra texto al final');
  return n;
}
function evalNode(n, x) {
  if (!n) return NaN;
  switch (n.t) {
    case 'num': return n.v;
    case 'var': return x;
    case 'const': return n.name === 'pi' ? Math.PI : Math.E;
    case 'neg': return -evalNode(n.a, x);
    case '+': return evalNode(n.a, x) + evalNode(n.b, x);
    case '-': return evalNode(n.a, x) - evalNode(n.b, x);
    case '*': return evalNode(n.a, x) * evalNode(n.b, x);   // ✅ único caso producto
    case '/': return evalNode(n.a, x) / evalNode(n.b, x);
    case '^': return Math.pow(evalNode(n.a, x), evalNode(n.b, x));
    case 'f': return FUNCS[n.n](evalNode(n.a, x));
  }
  return NaN;
}
const num = v => ({ t: 'num', v });
const VAR = { t: 'var' };
const PI = { t: 'const', name: 'pi' };
const add = (a, b) => ({ t: '+', a, b }), sub = (a, b) => ({ t: '-', a, b });
const mul = (a, b) => ({ t: '*', a, b }), div = (a, b) => ({ t: '/', a, b });
const pow = (a, b) => ({ t: '^', a, b }), neg = a => ({ t: 'neg', a });
const fn = (n, a) => ({ t: 'f', n, a });
function cst(n) {
  if (!n) return null;
  if (n.t === 'num') return n.v;
  if (n.t === 'const') return n.name === 'pi' ? Math.PI : Math.E;
  if (n.t === 'neg') { const a = cst(n.a); return a === null ? null : -a; }
  if ('+-*/^'.indexOf(n.t) >= 0 && n.a && n.b) {
    const a = cst(n.a), b = cst(n.b); if (a === null || b === null) return null;
    return n.t === '+' ? a + b : n.t === '-' ? a - b : n.t === '*' ? a * b : n.t === '/' ? a / b : Math.pow(a, b);
  }
  return null;
}
const constVal = n => cst(n);
function simp(n) {
  if (!n) return num(0);                                   // ✅ guarda
  if (n.t === 'num' || n.t === 'var' || n.t === 'const') return n;
  if (n.t === 'f') return fn(n.n, simp(n.a));
  if (n.t === 'neg') { const a = simp(n.a); if (a.t === 'num') return num(-a.v); if (a.t === 'neg') return a.a; return neg(a); }
  const a = simp(n.a), b = simp(n.b);
  const ca = a.t === 'num' ? a.v : null, cb = b.t === 'num' ? b.v : null;
  switch (n.t) {
    case '+': if (ca === 0) return b; if (cb === 0) return a;
      if (ca !== null && cb !== null) return num(ca + cb);
      if (b.t === 'neg') return simp(sub(a, b.a)); return add(a, b);
    case '-': if (cb === 0) return a; if (ca === 0) return simp(neg(b));
      if (ca !== null && cb !== null) return num(ca - cb); return sub(a, b);
    case '*': if (ca === 0 || cb === 0) return num(0); if (ca === 1) return b; if (cb === 1) return a;
      if (ca !== null && cb !== null) return num(ca * cb);
      if (ca !== null && b.t === '*' && b.a.t === 'num') return simp(mul(num(ca * b.a.v), b.b));
      if (cb !== null && a.t !== 'num') return mul(num(cb), a);
      return mul(a, b);
    case '/': if (cb === 1) return a; if (ca === 0) return num(0);
      if (ca !== null && cb !== null && cb !== 0) return num(ca / cb); return div(a, b);
    case '^': if (cb === 1) return a; if (cb === 0) return num(1);
      if (ca !== null && cb !== null) return num(Math.pow(ca, cb));
      if (a.t === 'f' && a.n === 'sqrt' && cb === 2) return a.a;
      if (a.t === '^') { const e = cst(a.b); if (e !== null && cb !== null) return simp(pow(a.a, num(e * cb))); }
      return pow(a, b);
  }
  return n;
}
function xPow(n) {
  if (!n) return null;
  if (n.t === 'var') return 1;
  if (n.t === '^' && n.a.t === 'var') return cst(n.b);
  if (n.t === 'f' && n.n === 'sqrt' && n.a.t === 'var') return 0.5;
  return null;
}
function termsOf(n) {
  if (!n) return [num(0)];                                 // ✅ guarda
  if (n.t === '+') return termsOf(n.a).concat(termsOf(n.b));
  if (n.t === '-') return termsOf(n.a).concat(termsOf(n.b).map(neg));
  if (n.t === 'neg') return termsOf(n.a).map(neg);
  return [n];
}
function factors(n) { return n && n.t === '*' ? factors(n.a).concat(factors(n.b)) : [n]; }
function ser(n) {
  if (!n) return '?';
  if (n.t === 'num') return short(n.v);
  if (n.t === 'var') return 'x';
  if (n.t === 'const') return n.name;
  if (n.t === 'f') return n.n + '(' + ser(n.a) + ')';
  if (n.t === 'neg') return '-' + ser(n.a);
  return '(' + ser(n.a) + n.t + ser(n.b) + ')';
}
function mulTerm(u, v) {
  const pu = xPow(u), pv = xPow(v);
  if (pu !== null && pv !== null) return simp(pow(VAR, num(pu + pv)));
  return simp(mul(u, v));
}
function expand(n) {
  if (!n) return num(0);
  n = simp(n);
  if (n.t === '+') return simp(add(expand(n.a), expand(n.b)));
  if (n.t === '-') return simp(sub(expand(n.a), expand(n.b)));
  if (n.t === 'neg') return simp(neg(expand(n.a)));
  if (n.t === '^') {
    const e = cst(n.b);
    if (n.a.t === 'f' && n.a.n === 'sqrt' && e === 2) return expand(n.a.a);
    if (n.a.t === 'f' && (n.a.n === 'sin' || n.a.n === 'cos') && e === 2) {
      const dbl = fn('cos', simp(mul(num(2), n.a.a)));
      return expand(mul(num(0.5), n.a.n === 'sin' ? sub(num(1), dbl) : add(num(1), dbl)));
    }
    if (e !== null && Number.isInteger(e) && e >= 2 && e <= 4) {
      let acc = expand(n.a);
      for (let i = 1; i < e; i++) { acc = expand(mul(acc, n.a)); if (termsOf(acc).length > 70) break; }
      return acc;
    }
    return simp(pow(expand(n.a), n.b));
  }
  if (n.t === '*') {                                        // ✅ ahora maneja '*'
    const A = termsOf(expand(n.a)), B = termsOf(expand(n.b));
    if (A.length * B.length > 140) return simp(mul(expand(n.a), expand(n.b)));
    let acc = null;
    for (const u of A) for (const v of B) { const p = mulTerm(u, v); acc = acc ? add(acc, p) : p; }
    return simp(acc);
  }
  if (n.t === '/') {
    const d = cst(n.b);
    if (d !== null && d !== 0) return expand(mul(num(1 / d), n.a));
    const p = xPow(n.b);
    if (p !== null) return expand(mul(n.a, pow(VAR, num(-p))));
    return simp(div(expand(n.a), n.b));
  }
  if (n.t === 'f') return fn(n.n, simp(n.a));
  return n;
}
function collectTerms(n) {
  const map = new Map();
  for (const t of termsOf(simp(n))) {
    let coef = 1, xp = 0; const others = [];
    for (const f of factors(t)) {
      if (f.t === 'num') { coef *= f.v; continue; }         // ✅ coef *= (antes era '=')
      const p = xPow(f);
      if (p !== null) { xp += p; continue; }
      others.push(f);
    }
    const key = xp + '|' + others.map(ser).sort().join('*');
    const cur = map.get(key) || { coef: 0, xp, others };
    cur.coef += coef; map.set(key, cur);
  }
  return Array.from(map.values()).filter(t => Math.abs(t.coef) > 1e-14)
    .sort((a, b) => b.xp - a.xp || ser(a.others[0] || num(0)).localeCompare(ser(b.others[0] || num(0))));
}
function termNode(t, absCoef) {
  let node = num(absCoef === undefined ? t.coef : Math.abs(t.coef));
  if (t.xp !== 0) node = mul(node, t.xp === 1 ? VAR : pow(VAR, num(t.xp)));
  for (const o of t.others) node = mul(node, o);
  return simp(node);
}
function termsNode(ts) {
  let acc = null;
  for (const t of ts) {
    const negative = t.coef < 0, node = termNode(t, true);
    if (!acc) acc = negative ? neg(node) : node;
    else acc = negative ? sub(acc, node) : add(acc, node);
  }
  return acc || num(0);
}
const collect = n => termsNode(collectTerms(n));
function linOf(n) {
  let a = 0, b = 0;
  for (const t of termsOf(simp(n))) {
    let coef = 1, hasX = false;
    for (const f of factors(t)) {
      if (f.t === 'var') { if (hasX) return null; hasX = true; }
      else { const c = cst(f); if (c === null) return null; coef *= c; }
    }
    if (hasX) a += coef; else b += coef;
  }
  return { a, b };
}
const linNode = L => (L.b === 0 ? (L.a === 1 ? VAR : mul(num(L.a), VAR)) : add(mul(num(L.a), VAR), num(L.b)));
function byParts(n, f, L) {
  const a = L.a, u = linNode(L);
  if (Math.abs(n) < 1e-12) {
    if (f === 'sin') return simp(div(neg(fn('cos', u)), num(a)));
    if (f === 'cos') return simp(div(fn('sin', u), num(a)));
    if (f === 'exp') return simp(div(fn('exp', u), num(a)));
    return null;
  }
  if (!Number.isInteger(n) || n < 0 || n > 6) return null;
  const nxt = f === 'sin' ? 'cos' : f === 'cos' ? 'sin' : 'exp';
  const low = byParts(n - 1, nxt, L); if (!low) return null;
  const xn = pow(VAR, num(n));
  if (f === 'sin') return simp(add(div(neg(mul(xn, fn('cos', u))), num(a)), mul(num(n / a), low)));
  if (f === 'cos') return simp(sub(div(mul(xn, fn('sin', u)), num(a)), mul(num(n / a), low)));
  return simp(sub(div(mul(xn, fn('exp', u)), num(a)), mul(num(n / a), low)));
}
function integrateTerm(term) {
  let coef = 1, xp = 0, f = null, L = null; const sym = [], rest = [];
  for (const g of factors(simp(term))) {
    if (g.t === 'num') { coef *= g.v; continue; }
    if (g.t === 'const') { sym.push(g); continue; }
    if (g.t === 'f' && g.n === 'sqrt') { const l = linOf(g.a); if (l && l.a !== 0) { xp += 0.5; L = l; continue; } }
    const p = xPow(g); if (p !== null) { xp += p; continue; }
    if (g.t === 'f' && ['sin', 'cos', 'exp', 'ln'].indexOf(g.n) >= 0 && !f) {
      const l = linOf(g.a); if (l && l.a !== 0) { f = g.n; L = l; continue; }
    }
    rest.push(g);
  }
  if (rest.length) return null;
  let K = num(coef); for (const s of sym) K = mul(K, s);
  let core = null;
  if (!f) {
    if (L) {
      if (Math.abs(xp - 0.5) < 1e-12) core = div(pow(linNode(L), num(1.5)), num(1.5 * L.a));
      else return null;
    } else if (Math.abs(xp + 1) < 1e-12) core = fn('ln', fn('abs', VAR));
    else core = div(pow(VAR, num(xp + 1)), num(xp + 1));
  } else if (f === 'ln') {
    if (Math.abs(xp) > 1e-12) return null;
    const u = linNode(L); core = div(sub(mul(u, fn('ln', u)), u), num(L.a));
  } else { core = byParts(xp, f, L); if (!core) return null; }
  return simp(mul(K, core));
}
function integrate(n) {
  const ts = termsOf(collect(expand(n)));
  let acc = null;
  for (const t of ts) { const it = integrateTerm(t); if (!it) return null; acc = acc ? add(acc, it) : it; }
  return acc ? collect(acc) : num(0);
}
function rat(v) {
  if (!isFinite(v)) return null;
  for (let q = 1; q <= 24; q++) { const p = Math.round(v * q); if (Math.abs(v - p / q) < 1e-10) return [p, q]; }
  return null;
}
function numHTML(v) {
  const r = rat(v);
  if (r && r[1] > 1 && Math.abs(r[0]) < 1000)
    return '<span class="mfrac"><span>' + Math.abs(r[0]) + '</span><span>' + r[1] + '</span></span>';
  return short(v);
}
function mh(n, prec) {
  if (!n) return '';                                        // ✅ guarda
  prec = prec || 0;
  const wrap = (s, p) => (p > prec ? '(' + s + ')' : s);
  switch (n.t) {
    case 'num': return n.v < 0 ? wrap('−' + numHTML(-n.v), 1) : numHTML(n.v);
    case 'var': return '<i>x</i>';
    case 'const': return n.name === 'pi' ? 'π' : '<i>e</i>';
    case 'neg': return wrap('−' + mh(n.a, 3), 1);
    case '+': return wrap(mh(n.a, 1) + ' + ' + mh(n.b, 1), 1);
    case '-': return wrap(mh(n.a, 1) + ' − ' + mh(n.b, 2), 1);
    case '*': {
      const a = mh(n.a, 2), b = mh(n.b, 2);
      const juxt = (n.a.t === 'num' || n.a.t === 'const') && (n.b.t === 'var' || n.b.t === 'f' || n.b.t === '^' || n.b.t === 'const');
      return wrap(a + (juxt ? '' : '·') + b, 2);
    }
    case '/': return '<span class="mfrac"><span>' + mh(n.a, 0) + '</span><span>' + mh(n.b, 0) + '</span></span>';
    case '^': return mh(n.a, 4) + '<span class="msup">' + mh(n.b, 0) + '</span>';
    case 'f':
      if (n.n === 'sqrt') return '√<span class="msqrt">' + mh(n.a, 0) + '</span>';
      if (n.n === 'abs') return '|' + mh(n.a, 0) + '|';
      if (n.n === 'exp') return '<i>e</i><span class="msup">' + mh(n.a, 0) + '</span>';
      return n.n + '(' + mh(n.a, 0) + ')';
  }
  return '';
}
const integralHTML = (body, a, b) =>
  '<span class="mint"><span class="msign">∫</span><span class="mlim"><b>' + b + '</b><i>' + a + '</i></span></span>' + body + ' d<i>x</i>';
function closedForm(v) {
  if (!isFinite(v)) return null;
  const bases = [[1, ''], [Math.PI, 'π'], [Math.PI ** 2, 'π²'], [Math.PI ** 3, 'π³'], [Math.PI ** 4, 'π⁴'],
    [Math.SQRT2, '√2'], [Math.sqrt(3), '√3'], [Math.LN2, 'ln 2'], [Math.E, 'e']];
  for (const [b, sym] of bases) {
    const r = rat(v / b);
    if (r && Math.abs(v - (r[0] / r[1]) * b) < 1e-9) {
      if (r[0] === 0) return '0';
      const sign = r[0] < 0 ? '−' : '', p = Math.abs(r[0]);
      const numTxt = (p === 1 ? '' : p) + sym || String(p);
      return sign + (r[1] === 1 ? numTxt : numTxt + '/' + r[1]);
    }
  }
  return null;
}
const GL_X = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498,
  0.1834346424956498, 0.5255324099163290, 0.7966664774136267, 0.9602898564975363];
const GL_W = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.3626837833783620,
  0.3626837833783620, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
function gaussQuad(f, a, b, panels) {
  panels = panels || 220;
  const h = (b - a) / panels; let s = 0;
  for (let i = 0; i < panels; i++) {
    const mid = a + h * (i + 0.5), r = h / 2;
    for (let k = 0; k < 8; k++) s += GL_W[k] * f(mid + r * GL_X[k]) * r;
  }
  return s;
}
function analyze(method, fStr, gStr, aStr, bStr, c) {
  const fc = cleanExpr(fStr), gc = cleanExpr(gStr), ac = cleanExpr(aStr), bc = cleanExpr(bStr);
  if (!fc) throw new Error('Escribe la función f(x), por ejemplo: 2x');
  const fNode = parse(fc);
  const gNode = method === 'discos' ? num(0) : parse(gc || '0');   // ✅ vacío = 0
  const a = constVal(parse(ac || '0')), b = constVal(parse(bc || '0'));
  if (a === null || b === null) throw new Error('Los límites deben ser constantes (0, 4, pi, 3/2…)');
  if (!(b > a)) throw new Error('Se requiere b > a');
  const f = x => evalNode(fNode, x), g = x => evalNode(gNode, x);
  for (let i = 0; i <= 120; i++) {
    const x = a + (b - a) * i / 120;
    if (!isFinite(f(x)) || !isFinite(g(x))) throw new Error('Alguna función no está definida en todo [a, b]');
  }
  const cN = num(c);
  const integrand = method === 'discos' ? mul(PI, pow(sub(fNode, cN), 2))
    : method === 'arandelas' ? mul(PI, sub(pow(sub(fNode, cN), 2), pow(sub(gNode, cN), 2)))
    : mul(mul(num(2), PI), mul(sub(VAR, cN), sub(fNode, gNode)));
  const expanded = collect(expand(integrand));
  const F = integrate(expanded);
  const dens = x => evalNode(integrand, x);
  const quad = gaussQuad(dens, a, b);
  const V = F ? evalNode(F, b) - evalNode(F, a) : quad;
  const warns = [];
  if (method === 'cascarones') {
    if (c > a + 1e-9) warns.push('En cascarones el eje x = c debe cumplir c ≤ a; si no, el radio x − c es negativo.');
    for (let i = 0; i <= 60; i++) { const x = a + (b - a) * i / 60; if (f(x) - g(x) < -1e-9) { warns.push('Se requiere f(x) ≥ g(x) en [a, b] para que la altura no sea negativa.'); break; } }
  } else if (method === 'arandelas') {
    for (let i = 0; i <= 60; i++) { const x = a + (b - a) * i / 60; if (f(x) < g(x) - 1e-9) { warns.push('En arandelas f debe ser el radio exterior: f(x) ≥ g(x).'); break; } }
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i <= 60; i++) { const x = a + (b - a) * i / 60; lo = Math.min(lo, g(x)); hi = Math.max(hi, f(x)); }
    if (c > lo + 1e-9 && c < hi - 1e-9) warns.push('El eje y = c atraviesa la región: la fórmula R² − r² no es válida ahí.');
  }
  return { method, fStr: fc, gStr: gc, aStr: ac, bStr: bc, a, b, c, f, g, fNode, gNode, integrand, expanded, F, V, quad, warns, elemental: !!F };
}
function riemann(M, N, rule) {
  const dx = (M.b - M.a) / N, edges = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) edges[i] = M.a + dx * i;
  const dens = x => M.method === 'discos' ? Math.PI * Math.pow(M.f(x) - M.c, 2)
    : M.method === 'arandelas' ? Math.PI * (Math.pow(M.f(x) - M.c, 2) - Math.pow(M.g(x) - M.c, 2))
    : TAU * (x - M.c) * (M.f(x) - M.g(x));
  const pts = new Float64Array(N), dv = new Float64Array(N), acc = new Float64Array(N);
  let total = 0;
  for (let i = 0; i < N; i++) {
    let x, d;
    if (rule === 'trap') { x = edges[i] + dx / 2; d = (dens(edges[i]) + dens(edges[i + 1])) / 2; }
    else { x = rule === 'izq' ? edges[i] : rule === 'der' ? edges[i + 1] : edges[i] + dx / 2; d = dens(x); }
    pts[i] = x; dv[i] = d * dx; total += dv[i]; acc[i] = total;
  }
  return { N, dx, edges, pts, dv, acc, total, rule };
}
const RULE_NAME = { medio: 'punto medio', izq: 'extremo izquierdo', der: 'extremo derecho', trap: 'trapecio' };
const PRESETS = {
  lente: {
    id: 'lente', method: 'discos', f: 'sqrt(x)', g: '0', a: '0', b: '4', c: 0, N: 12,
    unit: 'mm', unitV: 'mm³', title: 'Microlente parabólica de acoplamiento',
    badge: 'Microlente · fibra óptica', closed: '8π',
    context: 'Colimador de perfil parabólico que acopla el haz láser al núcleo de la fibra. Se fabrica por torneado de precisión girando el perfil alrededor del eje óptico.',
    limits: 'El vértice está en x = 0 y la longitud de diseño es x = 4 mm (radio máximo f(4) = 2 mm).',
    why: 'El corte perpendicular al eje óptico es un disco macizo de radio f(x): no hay cavidad. Es exactamente el slicing con el que un renderizador o una impresora 3D descompone un objeto en capas.',
    eng: ['Sílice fundida · 2.20 g/cm³', 2.2, true, '0.0553 g por lente · 0.553 kg por lote de 10 000 unidades'],
    pappus: 'A = 16/3, ȳ = 3/4 ⇒ V = 2π·(3/4)·(16/3) = 8π ✔'
  },
  buffer: {
    id: 'buffer', method: 'arandelas', f: '3 - x/2', g: '1', a: '0', b: '4', c: 0, N: 12,
    unit: 'cm', unitV: 'cm³', title: 'Funda (buffer) cónica de cable de fibra óptica',
    badge: 'Funda cónica · cableado', closed: '40π/3',
    context: 'Recubrimiento protector inyectado en un molde cónico: el radio exterior decrece linealmente mientras el canal que aloja la fibra permanece cilíndrico.',
    limits: 'El límite superior no es un dato: el cono termina donde el exterior alcanza el canal, R(x) = r(x) ⇒ 3 − x/2 = 1 ⇒ x = 4 cm.',
    why: 'Cada corte perpendicular al eje es una arandela de área π(R² − r²). Es la misma operación booleana de diferencia que ejecuta un CAD al perforar una pieza.',
    eng: ['Polímero LSZH · 1.20 g/cm³', 1.2, false, '50.27 g de recubrimiento por tramo'],
    pappus: 'A = 4, ȳ = 5/3 ⇒ V = 2π·(5/3)·4 = 40π/3 ✔'
  },
  hub: {
    id: 'hub', method: 'cascarones', f: 'x + sin(x)', g: '0', a: '0', b: 'pi', c: 0, N: 14,
    unit: 'cm', unitV: 'cm³', title: 'Base ondulada de un hub IoT impresa en 3D',
    badge: 'Base de hub IoT · FDM', closed: '2π⁴/3 + 2π²',
    context: 'La base de un hub IoT se imprime en FDM. La pared tiene perfil ondulado f(x) = x + sen(x), donde x es la distancia al eje central, y la pieza se obtiene girando la región alrededor del eje vertical.',
    limits: 'El radio útil de la pieza va del eje (x = 0) al borde exterior x = π cm, donde la pared alcanza su altura máxima f(π) = π.',
    why: 'Ventaja analítica explícita: por arandelas habría que despejar x de y = x + sen(x), ecuación trascendente sin inversa elemental, y partir la región en tramos. Con cascarones basta una integral en dx resuelta por partes. Cada cascarón es una pared concéntrica del recorrido de la boquilla.',
    eng: ['Filamento PLA · 1.24 g/cm³', 1.24, false, '105.00 g de PLA · 35.2 m de filamento de 1.75 mm'],
    pappus: 'A = π²/2 + 2, x̄·A = π³/3 + π ⇒ V = 2π(π³/3 + π) ✔'
  }
};
const QUALITY = {
  baja: { ang: 24, ax: 16, sec: 20, part: 40 },
  normal: { ang: 40, ax: 28, sec: 32, part: 90 },
  alta: { ang: 62, ax: 44, sec: 44, part: 150 },
  ultra: { ang: 86, ax: 62, sec: 56, part: 220 }
};
const PALETTES = {
  optica: { bg: [6, 10, 22], solid: [56, 189, 248], inner: [167, 139, 250], axis: [52, 211, 153], grid: [70, 100, 160], part: [180, 220, 255],
    ramp: [[56, 189, 248], [96, 165, 250], [167, 139, 250], [244, 114, 182], [251, 191, 36]] },
  filamento: { bg: [21, 10, 16], solid: [251, 146, 60], inner: [244, 114, 182], axis: [253, 224, 71], grid: [140, 80, 110], part: [255, 214, 190],
    ramp: [[253, 224, 71], [251, 146, 60], [244, 114, 182], [192, 132, 252], [96, 165, 250]] },
  circuito: { bg: [4, 18, 15], solid: [163, 230, 53], inner: [45, 212, 191], axis: [250, 204, 21], grid: [60, 120, 105], part: [190, 255, 220],
    ramp: [[163, 230, 53], [45, 212, 191], [56, 189, 248], [96, 165, 250], [244, 114, 182]] }
};
const S = {
  caseId: 'hub', method: 'cascarones', f: 'x + sin(x)', g: '0', a: '0', b: 'pi', c: 0,
  N: 14, k: 14, rule: 'medio', speed: 6, gap: 0.08, opacity: 0.92,
  solid: true, wire: false, grid: true, particles: true, orbit: true, orbitSpeed: 0.25,
  light: 38, lightInt: 1, glow: 0.55, quality: 'normal', palette: 'optica',
  sound: true, playing: false, selected: -1, hover: -1
};
let MODEL = null, RIE = null, CONV = null, CLOSED = null;
const dirty = { math: true, scene: true, panels: true };
function invalidate(kind) {
  if (kind === 'math') { dirty.math = dirty.scene = dirty.panels = true; }
  else if (kind === 'scene') { dirty.scene = true; dirty.panels = true; }
  else dirty.panels = true;
}
function saveState() {
  try { localStorage.setItem('revolve.state', JSON.stringify(S)); } catch (e) {}
}
function loadState() {
  try {
    const raw = localStorage.getItem('revolve.state');
    if (raw) { const o = JSON.parse(raw); for (const k in S) if (k in o && typeof o[k] === typeof S[k]) S[k] = o[k]; }
  } catch (e) {}
}
function Mesh() { this.v = []; this.f = []; }
Mesh.prototype.vert = function (x, y, z) { this.v.push(x, y, z); return this.v.length / 3 - 1; };
Mesh.prototype.quad = function (a, b, c, d, col, slice, two, emi) {
  const v = this.v;
  const ax = v[a * 3], ay = v[a * 3 + 1], az = v[a * 3 + 2];
  const bx = v[b * 3], by = v[b * 3 + 1], bz = v[b * 3 + 2];
  const cx = v[c * 3], cy = v[c * 3 + 1], cz = v[c * 3 + 2];
  const dx = v[d * 3], dy = v[d * 3 + 1], dz = v[d * 3 + 2];
  const ux = bx - ax, uy = by - ay, uz = bz - az, wx = dx - ax, wy = dy - ay, wz = dz - az;
  let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  const len = Math.hypot(nx, ny, nz) || 1;
  this.f.push({ a, b, c, d, nx: nx / len, ny: ny / len, nz: nz / len,
    cx: (ax + bx + cx + dx) / 4, cy: (ay + by + cy + dy) / 4, cz: (az + bz + cz + dz) / 4,
    col, slice, two: !!two, emi: emi || 0, z: 0, style: '', vis: false });
};
function ring(mesh, axis, pos, r, h, ang, c) {
  const ids = []; r = Math.max(0, r);
  for (let j = 0; j < ang; j++) {
    const t = j / ang * TAU, ct = Math.cos(t), st = Math.sin(t);
    ids.push(axis === 'x' ? mesh.vert(pos, c + r * ct, r * st) : mesh.vert(c + r * ct, h, r * st));
  }
  return ids;
}
function bridge(mesh, A, B, col, slice, two, emi) {
  const n = A.length;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; mesh.quad(A[i], A[j], B[j], B[i], col, slice, two, emi); }
}
function rampColor(t) {
  const ramp = PALETTES[S.palette].ramp;
  const s = clamp(t, 0, 1) * (ramp.length - 1), i = Math.floor(s), f = s - i;
  const a = ramp[i], b = ramp[Math.min(i + 1, ramp.length - 1)];
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}
const SCENE = { meshes: [], bounds: null, key: '' };
function buildScene() {
  if (!MODEL || !RIE) return;
  const q = QUALITY[S.quality], M = MODEL, axis = M.method === 'cascarones' ? 'y' : 'x';
  const pal = PALETTES[S.palette], meshes = [];
  const rad = (x, which) => Math.max(0, (which === 'g' ? M.g(x) : M.f(x)) - (axis === 'x' ? M.c : 0));
  if (S.solid) {
    const mesh = new Mesh(), AX = q.ax, AN = q.ang;
    if (axis === 'x') {
      const out = [], inn = [];
      for (let i = 0; i <= AX; i++) {
        const x = M.a + (M.b - M.a) * i / AX;
        out.push(ring(mesh, 'x', x, rad(x, 'f'), 0, AN, M.c));
        if (M.method === 'arandelas') inn.push(ring(mesh, 'x', x, rad(x, 'g'), 0, AN, M.c));
      }
      for (let i = 0; i < AX; i++) {
        bridge(mesh, out[i], out[i + 1], pal.solid, -1, false, 0);
        if (inn.length) bridge(mesh, inn[i + 1], inn[i], pal.inner, -1, false, 0);
      }
      for (const e of [0, AX]) {
        const x = M.a + (M.b - M.a) * e / AX;
        const ri = M.method === 'arandelas' ? rad(x, 'g') : 0;
        bridge(mesh, ring(mesh, 'x', x, ri, 0, AN, M.c), ring(mesh, 'x', x, rad(x, 'f'), 0, AN, M.c), pal.solid, -1, true, 0);
      }
    } else {
      const top = [], bot = [];
      for (let i = 0; i <= AX; i++) {
        const x = M.a + (M.b - M.a) * i / AX, r = Math.max(0, x - M.c);
        top.push(ring(mesh, 'y', 0, r, M.f(x), AN, M.c));
        bot.push(ring(mesh, 'y', 0, r, M.g(x), AN, M.c));
      }
      for (let i = 0; i < AX; i++) {
        bridge(mesh, top[i], top[i + 1], pal.solid, -1, false, 0);
        bridge(mesh, bot[i + 1], bot[i], pal.inner, -1, false, 0);
      }
      const rb = Math.max(0, M.b - M.c), ra = Math.max(0, M.a - M.c);
      bridge(mesh, ring(mesh, 'y', 0, rb, M.g(M.b), AN, M.c), ring(mesh, 'y', 0, rb, M.f(M.b), AN, M.c), pal.solid, -1, false, 0);
      if (ra > 1e-6) bridge(mesh, ring(mesh, 'y', 0, ra, M.f(M.a), AN, M.c), ring(mesh, 'y', 0, ra, M.g(M.a), AN, M.c), pal.inner, -1, false, 0);
    }
    meshes.push(mesh);
  }
  const N = RIE.N, k = clamp(S.k, 1, N);
  const ANS = clamp(Math.round(2800 / (N * 4)), 12, q.sec);
  const sm = new Mesh(), gap = S.gap * RIE.dx;
  for (let i = 0; i < k; i++) {
    const x0 = RIE.edges[i], x1 = RIE.edges[i + 1], xm = RIE.pts[i];
    const col = rampColor(N === 1 ? 0 : i / (N - 1));
    if (axis === 'x') {
      const a0 = x0 + gap / 2, a1 = x1 - gap / 2;
      const R = rad(xm, 'f'), r = M.method === 'arandelas' ? rad(xm, 'g') : 0;
      const o0 = ring(sm, 'x', a0, R, 0, ANS, M.c), o1 = ring(sm, 'x', a1, R, 0, ANS, M.c);
      bridge(sm, o0, o1, col, i, true, 0.15);
      if (r > 1e-6) {
        const i0 = ring(sm, 'x', a0, r, 0, ANS, M.c), i1 = ring(sm, 'x', a1, r, 0, ANS, M.c);
        bridge(sm, i1, i0, pal.inner, i, true, 0);
        bridge(sm, i0, o0, col, i, true, 0.35); bridge(sm, o1, i1, col, i, true, 0.35);
      } else {
        bridge(sm, ring(sm, 'x', a0, 0, 0, ANS, M.c), o0, col, i, true, 0.2);
        bridge(sm, o1, ring(sm, 'x', a1, 0, 0, ANS, M.c), col, i, true, 0.35);
      }
    } else {
      const ri = Math.max(0, x0 - M.c + gap / 2), ro = Math.max(0, x1 - M.c - gap / 2);
      const h0 = M.g(xm), h1 = M.f(xm);
      const oi0 = ring(sm, 'y', 0, ro, h0, ANS, M.c), oi1 = ring(sm, 'y', 0, ro, h1, ANS, M.c);
      bridge(sm, oi0, oi1, col, i, true, 0.15);
      if (ri > 1e-6) {
        const ii0 = ring(sm, 'y', 0, ri, h0, ANS, M.c), ii1 = ring(sm, 'y', 0, ri, h1, ANS, M.c);
        bridge(sm, ii1, ii0, pal.inner, i, true, 0);
        bridge(sm, ii1, oi1, col, i, true, 0.4); bridge(sm, oi0, ii0, col, i, true, 0.1);
      } else {
        bridge(sm, ring(sm, 'y', 0, 0, h1, ANS, M.c), oi1, col, i, true, 0.4);
        bridge(sm, oi0, ring(sm, 'y', 0, 0, h0, ANS, M.c), col, i, true, 0.1);
      }
    }
  }
  meshes.push(sm);
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) for (let i = 0; i < m.v.length; i += 3)
    for (let j = 0; j < 3; j++) { lo[j] = Math.min(lo[j], m.v[i + j]); hi[j] = Math.max(hi[j], m.v[i + j]); }
  if (!isFinite(lo[0])) { lo = [-1, -1, -1]; hi = [1, 1, 1]; }
  const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const radius = Math.max(0.6, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
  SCENE.meshes = meshes; SCENE.bounds = { lo, hi, center, radius };
  const key = M.method + '|' + M.a + '|' + M.b + '|' + M.c + '|' + M.fStr + '|' + M.gStr;
  if (key !== SCENE.key) { SCENE.key = key; CAM.tdist = radius * 3.1; CAM.target = center.slice(); }
  for (const m of meshes) { m.px = new Float64Array(m.v.length / 3); m.py = new Float64Array(m.v.length / 3); m.pz = new Float64Array(m.v.length / 3); }
  initParticles();
}
const CAM = { yaw: 0.85, pitch: 0.42, dist: 10, tyaw: 0.85, tpitch: 0.42, tdist: 10, target: [0, 0, 0] };
const VIEW = { w: 800, h: 500, dpr: 1, cx: 0, cy: 0, cz: 0, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, fx: 0, fy: 0, fz: 1, s: 500 };
let canvas, ctx, glowCv, glowCtx, particles = [], dragging = false, lastPointer = null, moved = 0, faces = [], fps = 60, frameAcc = 0, frameCount = 0, hudTimer = 0;
const pointers = new Map(); let pinchDist = 0;
function initParticles() {
  const q = QUALITY[S.quality], b = SCENE.bounds; if (!b) return;
  particles = [];
  for (let i = 0; i < q.part; i++) {
    particles.push({
      x: b.center[0] + (Math.random() - 0.5) * b.radius * 4.4,
      y: b.center[1] + (Math.random() - 0.5) * b.radius * 3.6,
      z: b.center[2] + (Math.random() - 0.5) * b.radius * 4.4,
      vy: (Math.random() * 0.5 + 0.12) * b.radius * 0.09, ph: Math.random() * TAU, sp: 0.4 + Math.random()
    });
  }
}
function resize() {
  if (!canvas) return;
  const vp = $('#viewport'), r = vp.getBoundingClientRect();
  VIEW.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  VIEW.w = Math.max(240, r.width); VIEW.h = Math.max(220, r.height);
  canvas.width = Math.round(VIEW.w * VIEW.dpr); canvas.height = Math.round(VIEW.h * VIEW.dpr);
  canvas.style.width = VIEW.w + 'px'; canvas.style.height = VIEW.h + 'px';
  ctx.setTransform(VIEW.dpr, 0, 0, VIEW.dpr, 0, 0);
  glowCv.width = Math.max(80, Math.round(VIEW.w / 2)); glowCv.height = Math.max(60, Math.round(VIEW.h / 2));
  invalidate('panels');
}
function updateCamera(dt) {
  if (S.orbit && !dragging) CAM.tyaw += S.orbitSpeed * dt * 0.42;
  const s = 1 - Math.pow(0.0016, dt);
  CAM.yaw += (CAM.tyaw - CAM.yaw) * s;
  CAM.pitch += (CAM.tpitch - CAM.pitch) * s;
  CAM.dist += (CAM.tdist - CAM.dist) * s;
  const cp = Math.cos(CAM.pitch), sp = Math.sin(CAM.pitch);
  const t = CAM.target;
  VIEW.cx = t[0] + CAM.dist * cp * Math.sin(CAM.yaw);
  VIEW.cy = t[1] + CAM.dist * sp;
  VIEW.cz = t[2] + CAM.dist * cp * Math.cos(CAM.yaw);
  let fx = t[0] - VIEW.cx, fy = t[1] - VIEW.cy, fz = t[2] - VIEW.cz;
  const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  let rx = fz, ry = 0, rz = -fx;
  const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  VIEW.fx = fx; VIEW.fy = fy; VIEW.fz = fz; VIEW.rx = rx; VIEW.ry = ry; VIEW.rz = rz;
  VIEW.ux = ux; VIEW.uy = uy; VIEW.uz = uz;
  VIEW.s = (VIEW.h / 2) / Math.tan(0.42);
}
function project(x, y, z) {
  const dx = x - VIEW.cx, dy = y - VIEW.cy, dz = z - VIEW.cz;
  const Z = dx * VIEW.fx + dy * VIEW.fy + dz * VIEW.fz;
  if (Z <= 0.02) return null;
  const X = dx * VIEW.rx + dy * VIEW.ry + dz * VIEW.rz;
  const Y = dx * VIEW.ux + dy * VIEW.uy + dz * VIEW.uz;
  return [VIEW.w / 2 + X * VIEW.s / Z, VIEW.h / 2 - Y * VIEW.s / Z, Z];
}
function render3D(dt) {
  if (!ctx || !SCENE.bounds) return;
  const pal = PALETTES[S.palette], W = VIEW.w, H = VIEW.h;
  updateCamera(dt);
  const bgGrad = ctx.createRadialGradient(W * 0.5, H * 0.28, 10, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
  bgGrad.addColorStop(0, 'rgb(' + (pal.bg[0] + 16) + ',' + (pal.bg[1] + 20) + ',' + (pal.bg[2] + 34) + ')');
  bgGrad.addColorStop(1, 'rgb(' + pal.bg[0] + ',' + pal.bg[1] + ',' + pal.bg[2] + ')');
  ctx.fillStyle = bgGrad; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  const shaft = ctx.createLinearGradient(W * 0.15, 0, W * 0.75, H);
  shaft.addColorStop(0, 'rgba(' + pal.solid.join(',') + ',0.10)');
  shaft.addColorStop(0.5, 'rgba(' + pal.inner.join(',') + ',0.04)');
  shaft.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shaft; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  if (glowCtx) { glowCtx.setTransform(1, 0, 0, 1, 0, 0); glowCtx.clearRect(0, 0, glowCv.width, glowCv.height); }
  if (S.grid) drawGrid(pal);
  const centerZ = CAM.dist;
  if (S.particles) drawParticles(dt, pal, true, centerZ);
  const la = S.light * Math.PI / 180;
  const Lx = Math.cos(la) * 0.72, Ly = 0.62, Lz = Math.sin(la) * 0.72;
  const ll = Math.hypot(Lx, Ly, Lz);
  const lx = Lx / ll, ly = Ly / ll, lz = Lz / ll;
  faces.length = 0;
  const fogNear = CAM.dist * 0.55, fogFar = CAM.dist * 2.1;
  for (const m of SCENE.meshes) {
    const n = m.px.length, v = m.v;
    for (let i = 0; i < n; i++) {
      const dx = v[i * 3] - VIEW.cx, dy = v[i * 3 + 1] - VIEW.cy, dz = v[i * 3 + 2] - VIEW.cz;
      const Z = dx * VIEW.fx + dy * VIEW.fy + dz * VIEW.fz;
      m.pz[i] = Z;
      if (Z <= 0.02) { m.px[i] = NaN; continue; }
      const X = dx * VIEW.rx + dy * VIEW.ry + dz * VIEW.rz, Y = dx * VIEW.ux + dy * VIEW.uy + dz * VIEW.uz;
      m.px[i] = W / 2 + X * VIEW.s / Z; m.py[i] = H / 2 - Y * VIEW.s / Z;
    }
    for (const f of m.f) {
      if (isNaN(m.px[f.a]) || isNaN(m.px[f.b]) || isNaN(m.px[f.c]) || isNaN(m.px[f.d])) continue;
      let vx = VIEW.cx - f.cx, vy = VIEW.cy - f.cy, vz = VIEW.cz - f.cz;
      const vl = Math.hypot(vx, vy, vz) || 1; vx /= vl; vy /= vl; vz /= vl;
      let nx = f.nx, ny = f.ny, nz = f.nz;
      let dot = nx * vx + ny * vy + nz * vz;
      if (dot < 0) { if (!f.two) continue; nx = -nx; ny = -ny; nz = -nz; dot = -dot; }
      const z = (m.pz[f.a] + m.pz[f.b] + m.pz[f.c] + m.pz[f.d]) / 4;
      const key = Math.max(0, nx * lx + ny * ly + nz * lz) * S.lightInt;
      const fill = Math.max(0, -nx * lx * 0.4 + ny * -0.2 + nz * -lz * 0.4) * 0.32;
      const rim = Math.pow(1 - clamp(dot, 0, 1), 2.6) * 0.85;
      let hx = lx + vx, hy = ly + vy, hz = lz + vz;
      const hl = Math.hypot(hx, hy, hz) || 1;
      const spec = Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), 46) * 0.75 * S.lightInt;
      let base = f.col, boost = 1;
      if (f.slice >= 0 && f.slice === S.selected) boost = 1.55;
      else if (f.slice >= 0 && f.slice === S.hover) boost = 1.25;
      const alpha = f.slice >= 0 ? S.opacity : Math.min(0.34, S.opacity * 0.36);
      const amb = 0.24;
      let r = base[0] * (amb + key * 0.85 + fill) * boost + pal.inner[0] * rim * 0.5 + 255 * spec + base[0] * f.emi * 0.5;
      let g = base[1] * (amb + key * 0.85 + fill) * boost + pal.inner[1] * rim * 0.5 + 255 * spec + base[1] * f.emi * 0.5;
      let bl = base[2] * (amb + key * 0.85 + fill) * boost + pal.inner[2] * rim * 0.5 + 255 * spec + base[2] * f.emi * 0.5;
      const fog = clamp((z - fogNear) / (fogFar - fogNear), 0, 1) * 0.62;
      r = lerp(r, pal.bg[0] + 8, fog); g = lerp(g, pal.bg[1] + 10, fog); bl = lerp(bl, pal.bg[2] + 18, fog);
      f.style = 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (bl | 0) + ',' + alpha.toFixed(3) + ')';
      f.z = z; f.mesh = m; faces.push(f);
    }
  }
  faces.sort((a, b) => b.z - a.z);
  const stroke = S.quality !== 'baja';
  ctx.lineJoin = 'round';
  for (const f of faces) {
    const m = f.mesh;
    ctx.beginPath();
    ctx.moveTo(m.px[f.a], m.py[f.a]); ctx.lineTo(m.px[f.b], m.py[f.b]);
    ctx.lineTo(m.px[f.c], m.py[f.c]); ctx.lineTo(m.px[f.d], m.py[f.d]); ctx.closePath();
    ctx.fillStyle = f.style; ctx.fill();
    if (stroke) { ctx.strokeStyle = f.style; ctx.lineWidth = 0.7; ctx.stroke(); }
    if (S.wire) { ctx.strokeStyle = 'rgba(' + pal.part.join(',') + ',0.16)'; ctx.lineWidth = 0.5; ctx.stroke(); }
  }
  drawAxis(pal);
  if (S.particles) drawParticles(dt, pal, false, centerZ);
  if (S.glow > 0.01 && glowCtx && typeof ctx.filter === 'string') {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.filter = 'blur(' + (6 + S.glow * 8).toFixed(1) + 'px)';
    ctx.globalAlpha = clamp(S.glow, 0, 1.2) * 0.85;
    ctx.drawImage(glowCv, 0, 0, W, H); ctx.restore(); ctx.filter = 'none'; ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}
function drawGrid(pal) {
  const b = SCENE.bounds, step = Math.max(0.25, Math.pow(10, Math.floor(Math.log10(b.radius))) / 2);
  const y = b.lo[1] - b.radius * 0.12, ext = b.radius * 2.4;
  ctx.lineWidth = 1;
  for (let t = -ext; t <= ext + 1e-9; t += step) {
    const fade = 1 - Math.abs(t) / (ext + step);
    ctx.strokeStyle = 'rgba(' + pal.grid.join(',') + ',' + (0.05 + fade * 0.16).toFixed(3) + ')';
    let p = project(b.center[0] + t, y, b.center[2] - ext), q = project(b.center[0] + t, y, b.center[2] + ext);
    if (p && q) { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
    p = project(b.center[0] - ext, y, b.center[2] + t); q = project(b.center[0] + ext, y, b.center[2] + t);
    if (p && q) { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
  }
}
function drawAxis(pal) {
  if (!MODEL) return;
  const b = SCENE.bounds, e = b.radius * 1.5;
  let p, q, label;
  if (MODEL.method === 'cascarones') {
    p = project(MODEL.c, b.lo[1] - e * 0.4, 0); q = project(MODEL.c, b.hi[1] + e * 0.5, 0);
    label = 'eje de giro  x = ' + short(MODEL.c);
  } else {
    p = project(b.lo[0] - e * 0.5, MODEL.c, 0); q = project(b.hi[0] + e * 0.5, MODEL.c, 0);
    label = 'eje de giro  y = ' + short(MODEL.c);
  }
  if (!p || !q) return;
  ctx.save();
  ctx.setLineDash([9, 6]); ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(' + pal.axis.join(',') + ',0.85)';
  ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '12px ui-sans-serif,system-ui,sans-serif';
  ctx.fillStyle = 'rgba(' + pal.axis.join(',') + ',0.95)';
  ctx.fillText(label, q[0] - 60, clamp(q[1] - 10, 16, VIEW.h - 8));
  ctx.restore();
  if (glowCtx) {
    glowCtx.save(); glowCtx.scale(0.5, 0.5);
    glowCtx.strokeStyle = 'rgba(' + pal.axis.join(',') + ',0.75)'; glowCtx.lineWidth = 3;
    glowCtx.beginPath(); glowCtx.moveTo(p[0], p[1]); glowCtx.lineTo(q[0], q[1]); glowCtx.stroke();
    glowCtx.restore();
  }
  if (RIE && glowCtx) {
    glowCtx.save(); glowCtx.scale(0.5, 0.5); glowCtx.lineWidth = 2.4;
    const k = clamp(S.k, 1, RIE.N), AN = 34;
    for (let i = 0; i < k; i++) {
      const col = rampColor(RIE.N === 1 ? 0 : i / (RIE.N - 1));
      glowCtx.strokeStyle = 'rgba(' + (col[0] | 0) + ',' + (col[1] | 0) + ',' + (col[2] | 0) + ',' + (i === S.selected ? 0.95 : 0.4) + ')';
      glowCtx.beginPath();
      let started = false;
      for (let j = 0; j <= AN; j++) {
        const t = j / AN * TAU, ct = Math.cos(t), st = Math.sin(t);
        let pt;
        if (MODEL.method === 'cascarones') {
          const r = Math.max(0, RIE.edges[i + 1] - MODEL.c);
          pt = project(MODEL.c + r * ct, MODEL.f(RIE.pts[i]), r * st);
        } else {
          const r = Math.max(0, MODEL.f(RIE.pts[i]) - MODEL.c);
          pt = project(RIE.edges[i + 1], MODEL.c + r * ct, r * st);
        }
        if (!pt) { started = false; continue; }
        if (!started) { glowCtx.moveTo(pt[0], pt[1]); started = true; } else glowCtx.lineTo(pt[0], pt[1]);
      }
      glowCtx.stroke();
    }
    glowCtx.restore();
  }
}
function drawParticles(dt, pal, behind, centerZ) {
  const b = SCENE.bounds;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    if (!behind) {
      p.y += p.vy * dt; p.ph += dt * p.sp;
      p.x += Math.sin(p.ph * 0.6) * dt * b.radius * 0.05;
      if (p.y > b.center[1] + b.radius * 2) p.y = b.center[1] - b.radius * 2;
    }
    const pr = project(p.x, p.y, p.z); if (!pr) continue;
    if ((pr[2] > centerZ) !== behind) continue;
    const size = clamp(b.radius * 0.035 * VIEW.s / pr[2], 0.4, 3.4);
    const alpha = clamp(0.42 - (pr[2] / (CAM.dist * 2.4)) * 0.3, 0.04, 0.42);
    ctx.fillStyle = 'rgba(' + pal.part.join(',') + ',' + alpha.toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(pr[0], pr[1], size, 0, TAU); ctx.fill();
    if (glowCtx && size > 1.4) {
      glowCtx.fillStyle = 'rgba(' + pal.part.join(',') + ',0.5)';
      glowCtx.beginPath(); glowCtx.arc(pr[0] / 2, pr[1] / 2, size * 0.7, 0, TAU); glowCtx.fill();
    }
  }
  ctx.restore();
}
function pickSlice(mx, my) {
  for (let i = faces.length - 1; i >= 0; i--) {
    const f = faces[i]; if (f.slice < 0) continue;
    const m = f.mesh;
    const xs = [m.px[f.a], m.px[f.b], m.px[f.c], m.px[f.d]], ys = [m.py[f.a], m.py[f.b], m.py[f.c], m.py[f.d]];
    let inside = false;
    for (let a = 0, b = 3; a < 4; b = a++) {
      if (((ys[a] > my) !== (ys[b] > my)) && (mx < (xs[b] - xs[a]) * (my - ys[a]) / ((ys[b] - ys[a]) || 1e-9) + xs[a])) inside = !inside;
    }
    if (inside) return f.slice;
  }
  return -1;
}
function setupPlot(cv, h) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cv.clientWidth || 600, hh = h || cv.clientHeight || 300;
  cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr);
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, hh);
  return { c, w, h: hh };
}
function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function drawRegion() {
  const cv = $('#regionCanvas'); if (!cv || !MODEL || !RIE) return;
  const { c, w, h } = setupPlot(cv);
  const M = MODEL, pad = { l: 46, r: 16, t: 18, b: 30 };
  let ymin = Math.min(0, M.c), ymax = Math.max(0, M.c);
  for (let i = 0; i <= 200; i++) { const x = M.a + (M.b - M.a) * i / 200; ymin = Math.min(ymin, M.f(x), M.g(x)); ymax = Math.max(ymax, M.f(x), M.g(x)); }
  const padY = (ymax - ymin) * 0.14 || 1; ymin -= padY; ymax += padY;
  const xmin = M.a - (M.b - M.a) * 0.08, xmax = M.b + (M.b - M.a) * 0.08;
  const X = x => pad.l + (x - xmin) / (xmax - xmin) * (w - pad.l - pad.r);
  const Y = y => h - pad.b - (y - ymin) / (ymax - ymin) * (h - pad.t - pad.b);
  const c1 = css('--c1'), c2 = css('--c2'), c3 = css('--c3'), dim = css('--dim2'), line = css('--line');
  c.strokeStyle = line; c.lineWidth = 1; c.font = '10px ui-sans-serif,system-ui,sans-serif'; c.fillStyle = dim;
  const stepX = (xmax - xmin) / 6, stepY = (ymax - ymin) / 5;
  for (let i = 0; i <= 6; i++) { const x = xmin + stepX * i; c.globalAlpha = 0.5; c.beginPath(); c.moveTo(X(x), pad.t); c.lineTo(X(x), h - pad.b); c.stroke(); c.globalAlpha = 1; c.fillText(short(Math.round(x * 100) / 100), X(x) - 8, h - pad.b + 14); }
  for (let i = 0; i <= 5; i++) { const y = ymin + stepY * i; c.globalAlpha = 0.5; c.beginPath(); c.moveTo(pad.l, Y(y)); c.lineTo(w - pad.r, Y(y)); c.stroke(); c.globalAlpha = 1; c.fillText(short(Math.round(y * 100) / 100), 6, Y(y) + 3); }
  const k = clamp(S.k, 1, RIE.N);
  for (let i = 0; i < RIE.N; i++) {
    const x0 = RIE.edges[i], x1 = RIE.edges[i + 1], xm = RIE.pts[i];
    const y0 = M.method === 'discos' ? M.c : M.g(xm), y1 = M.f(xm);
    const col = rampColor(RIE.N === 1 ? 0 : i / (RIE.N - 1));
    c.fillStyle = 'rgba(' + (col[0] | 0) + ',' + (col[1] | 0) + ',' + (col[2] | 0) + ',' + (i < k ? (i === S.selected ? 0.75 : 0.4) : 0.1) + ')';
    c.fillRect(X(x0), Math.min(Y(y0), Y(y1)), Math.max(1, X(x1) - X(x0) - 1), Math.abs(Y(y1) - Y(y0)));
  }
  const grad = c.createLinearGradient(0, pad.t, 0, h - pad.b);
  grad.addColorStop(0, c1 + '55'); grad.addColorStop(1, c3 + '22');
  c.beginPath(); c.moveTo(X(M.a), Y(M.method === 'discos' ? M.c : M.g(M.a)));
  for (let i = 0; i <= 240; i++) { const x = M.a + (M.b - M.a) * i / 240; c.lineTo(X(x), Y(M.method === 'discos' ? M.c : M.g(x))); }
  for (let i = 240; i >= 0; i--) { const x = M.a + (M.b - M.a) * i / 240; c.lineTo(X(x), Y(M.f(x))); }
  c.closePath(); c.fillStyle = grad; c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1;
  const curve = (fx, color, dash) => {
    c.beginPath(); c.setLineDash(dash || []);
    for (let i = 0; i <= 300; i++) { const x = M.a + (M.b - M.a) * i / 300, y = fx(x); if (i === 0) c.moveTo(X(x), Y(y)); else c.lineTo(X(x), Y(y)); }
    c.strokeStyle = color; c.lineWidth = 2.4; c.stroke(); c.setLineDash([]);
  };
  curve(M.f, c1);
  if (M.method !== 'discos') curve(M.g, c3, [6, 4]);
  c.setLineDash([8, 5]); c.strokeStyle = css('--ok'); c.lineWidth = 1.8; c.beginPath();
  if (M.method === 'cascarones') { c.moveTo(X(M.c), pad.t); c.lineTo(X(M.c), h - pad.b); }
  else { c.moveTo(pad.l, Y(M.c)); c.lineTo(w - pad.r, Y(M.c)); }
  c.stroke(); c.setLineDash([]);
  c.fillStyle = c1; c.font = '12px ui-sans-serif,system-ui,sans-serif';
  c.fillText('f(x) = ' + M.fStr, pad.l + 8, pad.t + 14);
  if (M.method !== 'discos') { c.fillStyle = c3; c.fillText('g(x) = ' + M.gStr, pad.l + 8, pad.t + 30); }
  c.fillStyle = css('--ok');
  c.fillText(M.method === 'cascarones' ? 'eje x = ' + short(M.c) : 'eje y = ' + short(M.c), w - pad.r - 92, pad.t + 14);
  if (S.selected >= 0 && S.selected < RIE.N) {
    const xm = RIE.pts[S.selected];
    c.strokeStyle = c2; c.lineWidth = 1.4; c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(X(xm), pad.t); c.lineTo(X(xm), h - pad.b); c.stroke(); c.setLineDash([]);
    c.fillStyle = c2; c.beginPath(); c.arc(X(xm), Y(M.f(xm)), 4, 0, TAU); c.fill();
  }
  cv._map = { X, Y, xmin, xmax, pad, w, h };
}
function drawBars() {
  const cv = $('#barsCanvas'); if (!cv || !RIE) return;
  const { c, w, h } = setupPlot(cv);
  const pad = { l: 48, r: 48, t: 16, b: 26 };
  const maxD = Math.max.apply(null, Array.from(RIE.dv).map(Math.abs)) || 1;
  const maxA = Math.max(Math.abs(MODEL.V), Math.abs(RIE.total)) || 1;
  const X = i => pad.l + (i + 0.5) / RIE.N * (w - pad.l - pad.r);
  const YD = v => h - pad.b - (v / maxD) * (h - pad.t - pad.b) * 0.92;
  const YA = v => h - pad.b - (v / maxA) * (h - pad.t - pad.b) * 0.92;
  c.strokeStyle = css('--line'); c.beginPath(); c.moveTo(pad.l, h - pad.b); c.lineTo(w - pad.r, h - pad.b); c.stroke();
  const k = clamp(S.k, 1, RIE.N), bw = Math.max(2, (w - pad.l - pad.r) / RIE.N - 3);
  for (let i = 0; i < RIE.N; i++) {
    const col = rampColor(RIE.N === 1 ? 0 : i / (RIE.N - 1));
    c.fillStyle = 'rgba(' + (col[0] | 0) + ',' + (col[1] | 0) + ',' + (col[2] | 0) + ',' + (i < k ? 0.85 : 0.2) + ')';
    const y = YD(Math.abs(RIE.dv[i]));
    c.fillRect(X(i) - bw / 2, y, bw, h - pad.b - y);
  }
  c.beginPath(); c.lineWidth = 2.4; c.strokeStyle = css('--c3');
  for (let i = 0; i < k; i++) { const x = X(i), y = YA(RIE.acc[i]); if (i === 0) c.moveTo(x, y); else c.lineTo(x, y); }
  c.stroke();
  c.setLineDash([7, 5]); c.strokeStyle = css('--ok'); c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(pad.l, YA(Math.abs(MODEL.V))); c.lineTo(w - pad.r, YA(Math.abs(MODEL.V))); c.stroke(); c.setLineDash([]);
  c.font = '10px ui-sans-serif,system-ui,sans-serif'; c.fillStyle = css('--dim2');
  c.fillText('ΔV', 6, pad.t + 8); c.fillText('V acum.', w - 44, pad.t + 8);
  c.fillStyle = css('--ok'); c.fillText('exacto ' + nf(MODEL.V, 3), pad.l + 6, YA(Math.abs(MODEL.V)) - 6);
  c.fillStyle = css('--dim2'); c.fillText('elemento i', w / 2 - 22, h - 8);
}
function computeConvergence() {
  const ns = [2, 4, 8, 16, 32, 64, 128, 256];
  const rules = ['medio', 'trap', 'izq', 'der'];
  CONV = rules.map(r => ({ rule: r, ns, err: ns.map(n => Math.abs(MODEL.V - riemann(MODEL, n, r).total)) }));
}
function drawConv() {
  const cv = $('#convCanvas'); if (!cv || !CONV) return;
  const { c, w, h } = setupPlot(cv);
  const pad = { l: 62, r: 96, t: 18, b: 34 };
  let lo = 0, hi = -30;
  CONV.forEach(s => s.err.forEach(e => { const v = Math.log10(Math.max(e, 1e-16)); lo = Math.min(lo, v); hi = Math.max(hi, v); }));
  lo = Math.floor(lo) - 0.4; hi = Math.ceil(hi) + 0.4;
  const lx0 = Math.log10(2), lx1 = Math.log10(256);
  const X = n => pad.l + (Math.log10(n) - lx0) / (lx1 - lx0) * (w - pad.l - pad.r);
  const Y = e => h - pad.b - (Math.log10(Math.max(e, 1e-16)) - lo) / (hi - lo) * (h - pad.t - pad.b);
  const colors = [css('--c1'), css('--c2'), css('--c3'), css('--c4')];
  const dashes = [[], [7, 4], [2, 3], [10, 4, 2, 4]];
  c.strokeStyle = css('--line'); c.font = '10px ui-sans-serif,system-ui,sans-serif';
  for (let e = Math.ceil(lo); e <= Math.floor(hi); e++) {
    c.globalAlpha = 0.45; c.beginPath(); c.moveTo(pad.l, Y(Math.pow(10, e))); c.lineTo(w - pad.r, Y(Math.pow(10, e))); c.stroke(); c.globalAlpha = 1;
    c.fillStyle = css('--dim2'); c.fillText('1e' + e, 8, Y(Math.pow(10, e)) + 3);
  }
  [2, 4, 8, 16, 32, 64, 128, 256].forEach(n => {
    c.globalAlpha = 0.35; c.beginPath(); c.moveTo(X(n), pad.t); c.lineTo(X(n), h - pad.b); c.stroke(); c.globalAlpha = 1;
    c.fillStyle = css('--dim2'); c.fillText(String(n), X(n) - 7, h - pad.b + 15);
  });
  CONV.forEach((s, i) => {
    c.beginPath(); c.setLineDash(dashes[i]); c.strokeStyle = colors[i]; c.lineWidth = 2.3;
    s.ns.forEach((n, j) => { const x = X(n), y = Y(s.err[j]); if (j === 0) c.moveTo(x, y); else c.lineTo(x, y); });
    c.stroke(); c.setLineDash([]);
    s.ns.forEach((n, j) => { c.fillStyle = colors[i]; c.beginPath(); c.arc(X(n), Y(s.err[j]), 2.6, 0, TAU); c.fill(); });
    const last = s.err[s.err.length - 1];
    c.fillStyle = colors[i]; c.font = '11px ui-sans-serif,system-ui,sans-serif';
    c.fillText(RULE_NAME[s.rule], w - pad.r + 8, clamp(Y(last) + 4, pad.t + 10, h - pad.b));
  });
  c.fillStyle = css('--dim'); c.font = '11px ui-sans-serif,system-ui,sans-serif';
  c.fillText('N (elementos)', w / 2 - 30, h - 6);
  c.save(); c.translate(14, h / 2 + 30); c.rotate(-Math.PI / 2); c.fillText('error absoluto', 0, 0); c.restore();
  const n0 = 8, n1 = 16;
  const e0 = CONV[0].err[CONV[0].ns.indexOf(n0)], e1 = CONV[0].err[CONV[0].ns.indexOf(n1)];
  const ratio = e1 > 1e-14 ? e0 / e1 : null;
  $('#convNote').innerHTML = 'Curvas en escala log-log. <b>Punto medio</b> y <b>trapecio</b> son O(Δx²): al duplicar N el error se divide entre ≈4' +
    (ratio ? ' (aquí ' + ratio.toFixed(2) + '× entre N=8 y N=16)' : '') +
    '. Los <b>extremos</b> son O(Δx): solo se divide entre 2. Cuando el integrando es lineal, el punto medio es exacto y su error cae al ruido de máquina (~1e-14).';
}
function renderDeriv() {
  if (!MODEL) return;
  const M = MODEL, box = $('#derivBox');
  const aS = mh(num(M.a)), bS = mh(num(M.b));
  const formula = M.method === 'discos' ? 'π ' + integralHTML('[' + mh(M.fNode) + (M.c ? ' − ' + short(M.c) : '') + '] <span class="msup">2</span>', aS, bS)
    : M.method === 'arandelas' ? 'π ' + integralHTML('([' + mh(M.fNode) + (M.c ? ' − ' + short(M.c) : '') + '] <span class="msup">2</span> − [' + mh(M.gNode) + (M.c ? ' − ' + short(M.c) : '') + '] <span class="msup">2</span>)', aS, bS)
    : '2π ' + integralHTML('(' + (M.c ? 'x − ' + short(M.c) : 'x') + ')·(' + mh(M.fNode) + ' − ' + mh(M.gNode) + ')', aS, bS);
  const preset = PRESETS[S.caseId];
  let html = '';
  if (preset) html += '<h4>Contexto de ingeniería</h4><div class="step"><small>' + preset.context + ' <b>' + preset.why + '</b></small></div>';
  html += '<h4>1 · Elemento diferencial y límites</h4><div class="step"><small>' +
    (preset ? preset.limits + ' ' : '') + 'Intervalo [' + short(M.a) + ', ' + short(M.b) + '], eje ' +
    (M.method === 'cascarones' ? 'x = ' : 'y = ') + short(M.c) + ', espesor Δx = (b − a)/N.</small></div>';
  html += '<h4>2 · Integral planteada</h4><div class="step">V = ' + formula + '</div>';
  html += '<h4>3 · Integrando expandido y agrupado</h4><div class="step">V = ' + integralHTML(mh(M.expanded), aS, bS) + '</div>';
  if (M.F) {
    html += '<h4>4 · Antiderivada (motor simbólico)</h4><div class="step">F(x) = ' + mh(M.F) + '</div>';
    html += '<h4>5 · Teorema fundamental del cálculo</h4><div class="step">V = F(' + bS + ') − F(' + aS + ') = ' +
      nf(evalNode(M.F, M.b), 8) + ' − (' + nf(evalNode(M.F, M.a), 8) + ')</div>';
  } else {
    html += '<h4>4 · Antiderivada</h4><div class="step"><small>El integrando no tiene primitiva elemental con las reglas del motor. Se toma como referencia la cuadratura Gauss–Legendre compuesta (220 paneles × 8 nodos).</small></div>';
  }
  html += '<h4>6 · Resultado</h4><div class="step res">V = ' + (CLOSED ? CLOSED + ' ≈ ' : '') + nf(M.V, 10) + ' ' + unitV() + '</div>';
  html += '<h4>7 · Verificación independiente</h4><div class="step"><small>Cuadratura de control: ' + nf(M.quad, 10) +
    ' · discrepancia ' + Math.abs(M.quad - M.V).toExponential(2) + (preset ? '<br>Teorema de Pappus: ' + preset.pappus : '') + '</small></div>';
  box.innerHTML = html;
  $('#quadNote').innerHTML = 'El valor exacto proviene de la antiderivada simbólica; la aproximación del software es la suma de Riemann con <b>' +
    RULE_NAME[S.rule] + '</b> y N = ' + S.N + '. Error absoluto ' + Math.abs(M.V - RIE.total).toExponential(3) +
    ' · relativo ' + (100 * Math.abs(M.V - RIE.total) / Math.abs(M.V || 1)).toFixed(5) + ' %.';
}
const unitV = () => (PRESETS[S.caseId] ? PRESETS[S.caseId].unitV : 'u³');
function syncUI() {
  if (!MODEL || !RIE) return;
  const M = MODEL, err = Math.abs(M.V - RIE.total), rel = 100 * err / Math.abs(M.V || 1);
  $('#kpiExact').textContent = nf(M.V, 6);
  $('#kpiUnit').textContent = unitV() + (CLOSED ? ' · ' + CLOSED : '');
  $('#kpiApprox').textContent = nf(RIE.total, 6);
  $('#kpiRule').textContent = RULE_NAME[S.rule] + ' · N = ' + S.N;
  $('#kpiError').textContent = rel < 1e-6 ? '< 1e-6 %' : rel.toFixed(5) + ' %';
  $('#kpiN').textContent = clamp(S.k, 1, S.N) + ' / ' + S.N;
  $('#kpiDx').textContent = 'Δx = ' + nf(RIE.dx, 5);
  $('#resExact').textContent = nf(M.V, 8);
  $('#resApprox').textContent = nf(RIE.total, 8);
  $('#resAbs').textContent = err.toExponential(3);
  $('#resRel').textContent = rel.toFixed(5) + ' %';
  $('#methodBadge').textContent = M.method === 'discos' ? 'Método de discos' : M.method === 'arandelas' ? 'Método de arandelas' : 'Cascarones cilíndricos';
  $('#caseBadge').textContent = PRESETS[S.caseId] ? PRESETS[S.caseId].badge : 'Modelo personalizado';
  $('#nVal').textContent = S.N; $('#kVal').textContent = clamp(S.k, 1, S.N);
  $('#kRange').max = S.N; $('#kRange').value = clamp(S.k, 1, S.N); $('#nRange').value = S.N;
  $('#gapVal').textContent = Math.round(S.gap * 100) + '%';
  $('#opVal').textContent = Math.round(S.opacity * 100) + '%';
  $('#speedVal').textContent = S.speed; $('#orbVal').textContent = S.orbitSpeed.toFixed(2);
  $('#lightVal').textContent = S.light + '°'; $('#intVal').textContent = S.lightInt.toFixed(2);
  $('#glowVal').textContent = S.glow.toFixed(2);
  $('#cLabel').textContent = (M.method === 'cascarones' ? 'x = ' : 'y = ') + short(S.c);
  $('#gInput').disabled = M.method === 'discos';
  $('#playBtn').textContent = S.playing ? '⏸ Pausar' : (S.k >= S.N ? '▶ Reconstruir' : '▶ Construir');
  $$('#methodSeg button').forEach(b => b.classList.toggle('on', b.dataset.method === S.method));
  const warn = $('#warnBox');
  if (M.warns.length) { warn.hidden = false; warn.textContent = '⚠ ' + M.warns.join(' '); } else warn.hidden = true;
  const body = $('#sliceBody');
  let rows = '';
  for (let i = 0; i < RIE.N; i++) {
    const x = RIE.pts[i], fv = M.f(x), gv = M.g(x);
    const geo = M.method === 'cascarones' ? 'r=' + nf(x - M.c, 3) + ' h=' + nf(fv - gv, 3)
      : 'R=' + nf(fv - M.c, 3) + (M.method === 'arandelas' ? ' r=' + nf(gv - M.c, 3) : '');
    rows += '<tr data-i="' + i + '" class="' + (i === S.selected ? 'sel' : '') + (i < S.k ? 'done' : 'todo') + '">' +
      '<td>' + (i + 1) + '</td><td>' + nf(x, 4) + '</td><td>' + nf(fv, 4) + '</td><td>' + nf(gv, 4) + '</td><td>' + geo + '</td>' +
      '<td>' + nf(RIE.dv[i], 5) + '</td><td>' + nf(RIE.acc[i], 5) + '</td></tr>';
  }
  body.innerHTML = rows;
  $('#legend').innerHTML = '<span>elemento 1</span><span class="bar"></span><span>elemento ' + S.N + '</span>';
  updateSliceCard();
}
function updateSliceCard() {
  const card = $('#sliceCard');
  if (S.selected < 0 || !RIE || S.selected >= RIE.N) { card.hidden = true; return; }
  const i = S.selected, M = MODEL, x = RIE.pts[i];
  card.hidden = false;
  $('#scTitle').textContent = (M.method === 'discos' ? 'Disco ' : M.method === 'arandelas' ? 'Arandela ' : 'Cascarón ') + (i + 1);
  const fv = M.f(x), gv = M.g(x);
  const rows = [['x*', nf(x, 5)], ['f(x*)', nf(fv, 5)], ['g(x*)', nf(gv, 5)],
    [M.method === 'cascarones' ? 'radio' : 'R ext.', nf(M.method === 'cascarones' ? x - M.c : fv - M.c, 5)],
    [M.method === 'cascarones' ? 'altura' : 'r int.', nf(M.method === 'cascarones' ? fv - gv : gv - M.c, 5)],
    ['Δx', nf(RIE.dx, 5)], ['ΔV', nf(RIE.dv[i], 6)], ['V acum.', nf(RIE.acc[i], 6)]];
  $('#scBody').innerHTML = '<dl>' + rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('') + '</dl>';
}
function selectSlice(i, quiet) {
  S.selected = i;
  invalidate('panels'); invalidate('scene');
  if (i >= 0 && !quiet) Sound.tick(i, S.N);
}
const Sound = {
  ctx: null, master: null,
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = S.sound ? 0.16 : 0;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  set(on) { S.sound = on; if (this.master) this.master.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.03); },
  tone(freq, dur, type, gain) {
    if (!S.sound) return; this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.5, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  tick(i, N) {
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const n = scale[Math.round((i / Math.max(1, N - 1)) * (scale.length - 1))];
    this.tone(261.63 * Math.pow(2, n / 12), 0.22, 'triangle', 0.35);
  },
  chord() { [0, 4, 7, 12].forEach((n, i) => setTimeout(() => this.tone(196 * Math.pow(2, n / 12), 0.7, 'sine', 0.28), i * 70)); },
  click() { this.tone(880, 0.05, 'square', 0.10); }
};
function exportPNG() {
  if (!canvas) return;
  const out = document.createElement('canvas');
  const W = canvas.width, H = canvas.height + Math.round(78 * VIEW.dpr);
  out.width = W; out.height = H;
  const c = out.getContext('2d');
  const pal = PALETTES[S.palette];
  c.fillStyle = 'rgb(' + pal.bg.join(',') + ')'; c.fillRect(0, 0, W, H);
  c.drawImage(canvas, 0, Math.round(78 * VIEW.dpr));
  c.scale(VIEW.dpr, VIEW.dpr);
  c.fillStyle = '#e8eeff'; c.font = '600 20px ui-sans-serif,system-ui,sans-serif';
  c.fillText('REVOLVE lab · ' + $('#methodBadge').textContent, 20, 32);
  c.fillStyle = '#9fb0d8'; c.font = '13px ui-sans-serif,system-ui,sans-serif';
  c.fillText(($('#caseBadge').textContent) + '  ·  V exacto = ' + nf(MODEL.V, 6) + ' ' + unitV() +
    '  ·  Riemann N=' + S.N + ' (' + RULE_NAME[S.rule] + ') = ' + nf(RIE.total, 6), 20, 56);
  out.toBlob(b => { download('revolve-' + S.method + '-' + S.caseId + '.png', b, 'image/png'); toast('Imagen PNG exportada', 'ok'); });
}
function exportCSV() {
  if (!RIE) return;
  const M = MODEL;
  const head = ['i', 'x_muestra', 'f(x)', 'g(x)', 'dx', 'delta_V', 'V_acumulado'];
  const lines = [head.join(',')];
  for (let i = 0; i < RIE.N; i++) {
    const x = RIE.pts[i];
    lines.push([i + 1, x, M.f(x), M.g(x), RIE.dx, RIE.dv[i], RIE.acc[i]].map(v => String(v)).join(','));
  }
  lines.push('');
  lines.push('# metodo,' + S.method + ',regla,' + S.rule + ',N,' + S.N);
  lines.push('# V_exacto,' + M.V + ',V_aprox,' + RIE.total + ',error_abs,' + Math.abs(M.V - RIE.total));
  download('revolve-elementos-' + S.caseId + '.csv', lines.join('\n'), 'text/csv;charset=utf-8');
  toast('Tabla CSV exportada', 'ok');
}
function exportJSON() {
  const cfg = Object.assign({}, S);
  cfg.resultado = { exacto: MODEL ? MODEL.V : null, aproximado: RIE ? RIE.total : null, forma_cerrada: CLOSED };
  download('revolve-config.json', JSON.stringify(cfg, null, 2), 'application/json');
  toast('Configuración JSON exportada', 'ok');
}
function deliveryData() {
  const g = id => ($('#' + id).value || '').trim();
  return { members: g('dMembers') || 'Equipo de Ingeniería de Sistemas', group: g('dGroup') || 'Cálculo Integral · Ingeniería de Sistemas',
    repo: g('dRepo'), app: g('dApp'), video: g('dVideo') };
}
function buildReport() {
  const d = deliveryData();
  const P = [];
  P.push('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Informe · Sólidos de revolución</title>');
  P.push('<style>@page{margin:18mm}body{font:12pt/1.6 Georgia,serif;color:#111;max-width:900px;margin:0 auto;padding:24px}');
  P.push('h1{font-size:26pt;line-height:1.15;margin:0 0 6px}h2{font-size:16pt;margin:26px 0 8px;border-bottom:2px solid #38bdf8;padding-bottom:4px}');
  P.push('h3{font-size:13pt;margin:18px 0 6px;color:#0b4f6c}.cover{text-align:center;border:3px double #0b4f6c;padding:34px;margin-bottom:26px}');
  P.push('.eq{font-size:13pt;background:#f2f7fb;border-left:4px solid #38bdf8;padding:9px 13px;margin:9px 0;overflow-x:auto}');
  P.push('table{border-collapse:collapse;width:100%;font-size:10pt;margin:10px 0}th,td{border:1px solid #bbb;padding:5px 7px;text-align:right}');
  P.push('th{background:#e8f2fa}td:first-child,th:first-child{text-align:left}small{color:#555}.mfrac{display:inline-flex;flex-direction:column;vertical-align:middle;text-align:center;font-size:.85em}');
  P.push('.mfrac>span:last-child{border-top:1px solid currentColor}.mint{display:inline-flex;align-items:center}.msign{font-size:1.6em}.mlim{display:inline-flex;flex-direction:column;font-size:.55em}');
  P.push('.msup{font-size:.72em;vertical-align:super}.msqrt{border-top:1px solid currentColor}ul{margin:6px 0 6px 18px}</style></head><body>');
  P.push('<div class="cover"><p>' + d.group + '</p><h1>Simulador Computacional de Sólidos de Revolución</h1>');
  P.push('<p><b>Modelado 3D y cálculo de volúmenes aplicado a Ingeniería de Sistemas</b></p>');
  P.push('<p>Integrantes: ' + d.members + '</p><p>Proyecto integrador · ' + new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }) + '</p></div>');
  P.push('<h2>1. Introducción</h2><p>El cálculo de volúmenes de sólidos de revolución aparece de forma recurrente en Ingeniería de Sistemas: diseño de componentes ópticos, estimación de material en fabricación aditiva y modelado geométrico de los motores de renderizado. Este proyecto integra la teoría del Cálculo Integral con la programación y la computación gráfica mediante una aplicación web que plantea, resuelve y visualiza los tres métodos clásicos.</p>');
  P.push('<p>La conexión conceptual es directa: un <i>slicer</i> de impresión 3D aproxima un objeto por capas (discos y arandelas) y un motor gráfico aproxima superficies por mallas. Ambos son la misma idea de la integral definida: dividir, aproximar y sumar hasta el límite.</p>');
  P.push('<h2>2. Marco teórico</h2>');
  P.push('<h3>2.1 Discos</h3><div class="eq">V = π ∫ₐᵇ [f(x)]² dx</div>');
  P.push('<h3>2.2 Arandelas</h3><div class="eq">V = π ∫ₐᵇ ([R(x)]² − [r(x)]²) dx</div>');
  P.push('<h3>2.3 Cascarones cilíndricos</h3><div class="eq">V = 2π ∫ₐᵇ x·f(x) dx</div>');
  P.push('<h2>3. Desarrollo de los ejemplos</h2>');
  ['lente', 'buffer', 'hub'].forEach((id, idx) => {
    const p = PRESETS[id], M = analyze(p.method, p.f, p.g, p.a, p.b, p.c);
    const R = riemann(M, p.N, 'medio');
    P.push('<h3>3.' + (idx + 1) + ' ' + p.title + '</h3>');
    P.push('<div class="eq"><b>V = ' + p.closed + ' ≈ ' + nf(M.V, 10) + ' ' + p.unitV + '</b></div>');
    P.push('<p><small>Aproximación N=' + p.N + ': ' + nf(R.total, 8) + ' · error ' + (100 * Math.abs(M.V - R.total) / Math.abs(M.V)).toFixed(5) + ' %.</small></p>');
  });
  P.push('<h3>3.4 Tabla de convergencia del caso actual</h3>');
  P.push('<table><tr><th>N</th><th>V aproximado</th><th>error absoluto</th><th>error relativo %</th></tr>');
  [4, 8, 16, 32, 64, 128, 256].forEach(n => {
    const r = riemann(MODEL, n, S.rule), e = Math.abs(MODEL.V - r.total);
    P.push('<tr><td>' + n + '</td><td>' + nf(r.total, 8) + '</td><td>' + e.toExponential(3) + '</td><td>' + (100 * e / Math.abs(MODEL.V || 1)).toFixed(6) + '</td></tr>');
  });
  P.push('</table></body></html>');
  return P.join('');
}
function exportReport() {
  try {
    download('informe-solidos-de-revolucion.html', buildReport(), 'text/html;charset=utf-8');
    toast('Informe generado. Ábrelo y usa Imprimir → Guardar como PDF.', 'ok');
  } catch (e) { toast('No se pudo generar el informe: ' + e.message, 'bad'); }
}
const TUTOR = {
  step: 0, total: 11, auto: false, autoTimer: null, voice: true, steps: [],
  build() {
    if (!MODEL || !RIE) return;
    const M = MODEL, P = PRESETS[S.caseId];
    const axis = M.method === 'cascarones' ? 'x' : 'y';
    const axisEq = axis + ' = ' + short(M.c);
    const methodLabel = M.method === 'discos' ? 'discos' : M.method === 'arandelas' ? 'arandelas' : 'cascarones cilíndricos';
    const aS = mh(num(M.a)), bS = mh(num(M.b));
    const integral = M.method === 'discos'
      ? 'π ∫<sub>' + aS + '</sub><sup>' + bS + '</sup> [' + mh(M.fNode) + (M.c ? ' − ' + short(M.c) : '') + ']² dx'
      : M.method === 'arandelas'
        ? 'π ∫<sub>' + aS + '</sub><sup>' + bS + '</sup> ([' + mh(M.fNode) + (M.c ? '−' + short(M.c) : '') + ']² − [' + mh(M.gNode) + (M.c ? '−' + short(M.c) : '') + ']²) dx'
        : '2π ∫<sub>' + aS + '</sub><sup>' + bS + '</sup> (' + (M.c ? 'x − ' + short(M.c) : 'x') + ')·(' + mh(M.fNode) + ' − ' + mh(M.gNode) + ') dx';
    const dV = M.method === 'discos' ? 'ΔV = π·[f(x*) − c]²·Δx'
      : M.method === 'arandelas' ? 'ΔV = π·([R(x*) − c]² − [r(x*) − c]²)·Δx'
        : 'ΔV = 2π·(x − c)·[f(x*) − g(x*)]·Δx';
    const closed = P ? P.closed : closedForm(M.V);
    const err = Math.abs(M.V - RIE.total), rel = 100 * err / Math.abs(M.V || 1);
    this.steps = [
      { t: 'Identificar el problema',
        b: (P ? '<b>' + P.title + '.</b> ' + P.context : 'Modelo personalizado con f(x) = ' + M.fStr + (M.method !== 'discos' ? ' y g(x) = ' + M.gStr : '') + '.') +
          '<div class="math">f(x) = ' + mh(M.fNode) + (M.method !== 'discos' ? '<br>g(x) = ' + mh(M.gNode) : '') + '</div>' +
          '<div class="tip">💡 Primero entendemos qué pieza física estamos modelando y qué funciones describen su perfil.</div>' },
      { t: 'Determinar el eje de giro',
        b: 'El sólido se obtiene al girar la región alrededor del eje <b>' + axisEq + '</b>.' +
          '<div class="math">Eje de revolución: ' + axisEq + '</div>' +
          (M.method === 'cascarones' ? '<div class="tip">💡 Eje vertical ⇒ usaremos cascarones cilíndricos (franjas verticales).</div>' :
            '<div class="tip">💡 Eje horizontal ⇒ usaremos discos o arandelas (franjas horizontales).</div>') },
      { t: 'Fijar los límites de integración',
        b: 'El intervalo de integración es <b>[' + short(M.a) + ', ' + short(M.b) + ']</b>.' +
          '<div class="math">a = ' + short(M.a) + ', b = ' + short(M.b) + '</div>' +
          (M.warns.length ? '<div class="warn">⚠ ' + M.warns.join(' ') + '</div>' : '') },
      { t: 'Elegir el método adecuado',
        b: 'Aplicamos el <b>método de ' + methodLabel + '</b>.' +
          (P ? '<div class="tip">💡 ' + P.why + '</div>' :
            (M.method === 'cascarones' ? '<div class="tip">💡 Ventaja: no necesitamos despejar x de y = f(x).</div>' :
              M.method === 'arandelas' ? '<div class="tip">💡 Hay una cavidad interior, por eso usamos arandelas y no discos.</div>' :
                '<div class="tip">💡 La región toca al eje de giro, por eso basta con discos macizos.</div>')) },
      { t: 'Plantear el elemento diferencial ΔV',
        b: 'Cada elemento diferencial tiene volumen:' +
          '<div class="math hi">' + dV + '</div>' +
          '<div class="tip">💡 Este es el "ladrillo" que vamos a sumar. Al pasar al límite Δx → 0 obtenemos la integral.</div>' },
      { t: 'Escribir la integral del volumen',
        b: 'Sumando todos los elementos y tomando el límite:' +
          '<div class="math hi">V = ' + integral + '</div>' },
      { t: 'Expandir el integrando',
        b: 'Desarrollamos productos y potencias, y agrupamos términos semejantes:' +
          '<div class="math">Integrando expandido:<br>' + mh(M.expanded) + '</div>' +
          '<div class="tip">💡 Esto nos permite integrar término a término usando las reglas básicas.</div>' },
      { t: 'Calcular la antiderivada F(x)',
        b: M.F
          ? 'El motor simbólico encuentra la primitiva:' +
            '<div class="math hi">F(x) = ' + mh(M.F) + '</div>' +
            '<div class="tip">💡 Se obtiene aplicando regla de la potencia, trigonométricas y, si hace falta, integración por partes.</div>'
          : '<div class="warn">⚠ El integrando no tiene primitiva elemental con las reglas del motor. Se usará cuadratura numérica Gauss–Legendre como referencia.</div>' },
      { t: 'Aplicar el Teorema Fundamental del Cálculo',
        b: 'Evaluamos F en los extremos y restamos:' +
          '<div class="math">V = F(' + bS + ') − F(' + aS + ')</div>' +
          (M.F ? '<div class="math">V = ' + nf(evalNode(M.F, M.b), 8) + ' − (' + nf(evalNode(M.F, M.a), 8) + ')</div>' : '') },
      { t: 'Obtener el resultado exacto',
        b: '<div class="result">V = ' + (closed ? closed + ' ≈ ' : '') + nf(M.V, 10) + ' ' + (P ? P.unitV : 'u³') + '</div>' +
          '<div class="tip">💡 Verificación independiente — Cuadratura de control: ' + nf(M.quad, 10) +
          ' · discrepancia ' + Math.abs(M.quad - M.V).toExponential(2) +
          (P ? '<br>📐 Pappus: ' + P.pappus : '') + '</div>' },
      { t: 'Interpretación de ingeniería',
        b: (P ? '<b>' + P.eng[0] + '</b> → ' + P.eng[3] + '.' :
          'El volumen calculado permite estimar masa, coste y tiempo de fabricación de la pieza modelada.') +
          '<div class="math">Aproximación del software (N=' + S.N + ', ' + RULE_NAME[S.rule] + '):<br>' +
          'V ≈ ' + nf(RIE.total, 8) + '</div>' +
          '<div class="math">Error absoluto = ' + err.toExponential(3) + '<br>Error relativo = ' + rel.toFixed(5) + ' %</div>' +
          '<div class="tip">✅ ¡Problema resuelto! Puedes volver a cualquier paso haciendo clic sobre él.</div>' }
    ];
    this.total = this.steps.length;
    this.step = 0;
    this.render();
  },
  render() {
    const body = $('#tutorBody'); if (!body || !this.steps.length) return;
    body.innerHTML = this.steps.map((s, i) =>
      '<div class="tutor-step ' + (i < this.step ? 'done' : i === this.step ? 'current' : '') + '" data-step="' + i + '">' +
      '<div class="tutor-step-head"><span class="tutor-step-num">' + (i + 1) + '</span>' + s.t + '</div>' +
      '<div class="tutor-step-body">' + s.b + '</div>' +
      '</div>'
    ).join('');
    body.querySelectorAll('.tutor-step').forEach(el => {
      el.addEventListener('click', () => this.go(parseInt(el.dataset.step, 10)));
    });
    const dots = $('#tutorDots');
    if (dots) dots.innerHTML = this.steps.map((_, i) =>
      '<span data-step="' + i + '" title="Paso ' + (i + 1) + ': ' + this.steps[i].t + '" class="' + (i < this.step ? 'done' : i === this.step ? 'current' : '') + '"></span>'
    ).join('');
    dots && dots.querySelectorAll('span').forEach(d => d.addEventListener('click', () => this.go(parseInt(d.dataset.step, 10))));
    const pct = ((this.step + 1) / this.total) * 100;
    $('#tutorBar').style.width = pct + '%';
    $('#tutorStepLabel').textContent = 'Paso ' + (this.step + 1) + ' / ' + this.total;
    $('#tutorPrev').disabled = this.step === 0;
    $('#tutorNext').textContent = this.step === this.total - 1 ? '✓ Finalizar' : 'Siguiente →';
    const cur = body.querySelector('.tutor-step.current');
    if (cur) cur.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (this.voice && window.speechSynthesis) this.speak(this.steps[this.step].t);
  },
  go(i) { this.step = clamp(Math.round(i), 0, this.total - 1); this.render(); Sound.click(); },
  next() {
    if (this.step < this.total - 1) this.go(this.step + 1);
    else { this.stopAuto(); toast('¡Resolución completa!', 'ok'); Sound.chord(); }
  },
  prev() { if (this.step > 0) this.go(this.step - 1); },
  startAuto() {
    this.auto = true; $('#tutorAuto').textContent = '⏸ Pausar';
    const tick = () => {
      if (!this.auto) return;
      if (this.step < this.total - 1) { this.next(); this.autoTimer = setTimeout(tick, 4200); }
      else this.stopAuto();
    };
    tick();
  },
  stopAuto() {
    this.auto = false; $('#tutorAuto').textContent = '▶ Modo guiado';
    if (this.autoTimer) { clearTimeout(this.autoTimer); this.autoTimer = null; }
  },
  toggleAuto() { this.auto ? this.stopAuto() : this.startAuto(); },
  reset() { this.stopAuto(); this.go(0); toast('Asistente reiniciado', 'ok'); },
  speak(text) {
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES'; u.rate = 1.02; u.pitch = 1; u.volume = 0.8;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  },
  exportSteps() {
    if (!this.steps.length) return;
    const P = PRESETS[S.caseId];
    let md = '# Resolución paso a paso\n\n';
    md += '> Problema: ' + (P ? P.title : 'Modelo personalizado') + '\n\n';
    md += '> Método: ' + (MODEL.method === 'discos' ? 'Discos' : MODEL.method === 'arandelas' ? 'Arandelas' : 'Cascarones cilíndricos') + '\n\n';
    md += '---\n\n';
    this.steps.forEach((s, i) => {
      md += '## Paso ' + (i + 1) + ': ' + s.t + '\n\n';
      md += s.b.replace(/<[^>]+>/g, '').replace(/ /g, ' ') + '\n\n';
    });
    download('asistente-pasos.md', md, 'text/markdown;charset=utf-8');
    toast('Pasos exportados a Markdown', 'ok');
  }
};
function bindTutor() {
  $('#tutorToggle').addEventListener('click', () => {
    const t = $('#tutor');
    t.classList.toggle('hidden');
    $('#tutorToggle').classList.toggle('on', !t.classList.contains('hidden'));
    Sound.click();
  });
  $('#tutorClose').addEventListener('click', () => {
    $('#tutor').classList.add('hidden');
    $('#tutorToggle').classList.remove('on');
  });
  $('#tutorNext').addEventListener('click', () => TUTOR.next());
  $('#tutorPrev').addEventListener('click', () => TUTOR.prev());
  $('#tutorAuto').addEventListener('click', () => TUTOR.toggleAuto());
  $('#tutorReset').addEventListener('click', () => TUTOR.reset());
  $('#tutorExport').addEventListener('click', () => TUTOR.exportSteps());
  $('#tutorVoice').addEventListener('change', e => {
    TUTOR.voice = e.target.checked;
    if (!TUTOR.voice && window.speechSynthesis) window.speechSynthesis.cancel();
  });
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.key.toLowerCase() === 't') { $('#tutorToggle').click(); return; }
    if ($('#tutor').classList.contains('hidden')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); TUTOR.next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); TUTOR.prev(); }
  });
}
const _origInvalidate = invalidate;
invalidate = function (kind) {
  _origInvalidate(kind);
  if (kind === 'math') {
    requestAnimationFrame(() => { if (MODEL && RIE) TUTOR.build(); });
  }
};
function applyPreset(id, announce) {
  const p = PRESETS[id]; if (!p) return;
  S.caseId = id; S.method = p.method; S.f = p.f; S.g = p.g; S.a = p.a; S.b = p.b; S.c = p.c;
  S.N = p.N; S.k = p.N; S.selected = -1; S.playing = false;
  $('#fInput').value = p.f; $('#gInput').value = p.g; $('#aInput').value = p.a; $('#bInput').value = p.b;
  $('#cRange').value = p.c; $('#cNum').value = p.c; $('#caseSelect').value = id;
  invalidate('math'); saveState();
  if (announce) { Sound.chord(); toast('Caso cargado: ' + p.title, 'ok'); }
}
function recompute() {
  try {
    MODEL = analyze(S.method, S.f, S.g, S.a, S.b, S.c);
    S.N = clamp(Math.round(S.N), 2, 48); S.k = clamp(Math.round(S.k), 1, S.N);
    RIE = riemann(MODEL, S.N, S.rule);
    CLOSED = PRESETS[S.caseId] ? PRESETS[S.caseId].closed : closedForm(MODEL.V);
    computeConvergence();
    $('#exprError').hidden = true;
  } catch (e) {
    $('#exprError').hidden = false;
    $('#exprError').textContent = '✕ ' + e.message;
    if (!MODEL) { MODEL = analyze('cascarones', 'x + sin(x)', '0', '0', 'pi', 0); RIE = riemann(MODEL, S.N, S.rule); computeConvergence(); }
  }
}
function bindUI() {
  $('#caseSelect').addEventListener('change', e => {
    const v = e.target.value;
    if (v === 'custom') { S.caseId = 'custom'; invalidate('math'); toast('Modo personalizado: escribe tu función', ''); }
    else applyPreset(v, true);
  });
  $$('#methodSeg button').forEach(b => b.addEventListener('click', () => {
    S.method = b.dataset.method; S.caseId = 'custom'; $('#caseSelect').value = 'custom';
    if (S.method === 'cascarones' && S.c > constVal(parse(S.a || '0') || num(0))) { S.c = 0; $('#cRange').value = 0; $('#cNum').value = 0; }
    Sound.click(); invalidate('math'); saveState();
  }));
  const textBind = (id, key) => $('#' + id).addEventListener('input', e => {
    S[key] = e.target.value; S.caseId = 'custom'; $('#caseSelect').value = 'custom'; invalidate('math'); saveState();
  });
  textBind('fInput', 'f'); textBind('gInput', 'g'); textBind('aInput', 'a'); textBind('bInput', 'b');
  $$('.chips button').forEach(b => b.addEventListener('click', () => {
    const inp = $('#fInput'); inp.value = (inp.value.trim() ? inp.value.trim() + ' + ' : '') + b.dataset.insert;
    S.f = inp.value; S.caseId = 'custom'; $('#caseSelect').value = 'custom'; Sound.click(); invalidate('math'); saveState();
  }));
  const setC = v => { S.c = v; $('#cRange').value = v; $('#cNum').value = v; invalidate('math'); saveState(); };
  $('#cRange').addEventListener('input', e => setC(parseFloat(e.target.value)));
  $('#cNum').addEventListener('input', e => setC(parseFloat(e.target.value) || 0));
  $('#nRange').addEventListener('input', e => {
    S.N = parseInt(e.target.value, 10); S.k = Math.min(S.k, S.N); RIE = riemann(MODEL, S.N, S.rule);
    if (S.selected >= S.N) S.selected = -1;
    invalidate('scene'); saveState();
  });
  $('#kRange').addEventListener('input', e => { S.k = parseInt(e.target.value, 10); S.playing = false; invalidate('scene'); });
  $('#playBtn').addEventListener('click', () => {
    if (S.playing) { S.playing = false; }
    else { if (S.k >= S.N) S.k = 1; S.playing = true; Sound.ensure(); }
    invalidate('panels');
  });
  $('#speedRange').addEventListener('input', e => { S.speed = parseInt(e.target.value, 10); invalidate('panels'); });
  $('#ruleSelect').addEventListener('change', e => { S.rule = e.target.value; RIE = riemann(MODEL, S.N, S.rule); computeConvergence(); invalidate('scene'); saveState(); });
  const rangeBind = (id, key, kind) => $('#' + id).addEventListener('input', e => {
    S[key] = parseFloat(e.target.value);
    invalidate(kind); saveState();
  });
  rangeBind('gapRange', 'gap', 'scene'); rangeBind('opacityRange', 'opacity', 'scene');
  rangeBind('orbitSpeed', 'orbitSpeed', 'panels'); rangeBind('lightRange', 'light', 'panels');
  rangeBind('lightInt', 'lightInt', 'panels'); rangeBind('glowRange', 'glow', 'panels');
  const toggleBind = (id, key, kind) => $('#' + id).addEventListener('change', e => { S[key] = e.target.checked; Sound.click(); invalidate(kind); saveState(); });
  toggleBind('solidToggle', 'solid', 'scene'); toggleBind('wireToggle', 'wire', 'panels');
  toggleBind('gridToggle', 'grid', 'panels'); toggleBind('partToggle', 'particles', 'scene');
  toggleBind('orbitToggle', 'orbit', 'panels');
  $('#qualitySelect').addEventListener('change', e => { S.quality = e.target.value; invalidate('scene'); saveState(); });
  $('#paletteSelect').addEventListener('change', e => {
    S.palette = e.target.value; document.documentElement.dataset.palette = S.palette;
    invalidate('scene'); saveState();
  });
  $('#resetBtn').addEventListener('click', () => {
    applyPreset('hub', false);
    S.rule = 'medio'; S.gap = 0.08; S.opacity = 0.92; S.quality = 'normal'; S.palette = 'optica';
    S.solid = true; S.wire = false; S.grid = true; S.particles = true; S.orbit = true; S.orbitSpeed = 0.25;
    S.light = 38; S.lightInt = 1; S.glow = 0.55; S.speed = 6;
    document.documentElement.dataset.palette = 'optica';
    syncControls(); CAM.tyaw = 0.85; CAM.tpitch = 0.42; SCENE.key = '';
    invalidate('math'); toast('Simulador reiniciado', 'ok'); Sound.chord();
  });
  $('#randomBtn').addEventListener('click', () => {
    const fs = ['sqrt(x)', 'x^2/4 + 1', '2 + sin(2x)', 'x + sin(x)', 'exp(-x^2/4)*3', '3 - x/2', 'cos(x) + 2', 'x^3/8 + 0.5'];
    const methods = ['discos', 'arandelas', 'cascarones'];
    S.method = methods[Math.floor(Math.random() * 3)];
    S.f = fs[Math.floor(Math.random() * fs.length)];
    S.g = S.method === 'arandelas' ? '0.5' : '0';
    S.a = '0'; S.b = String(2 + Math.floor(Math.random() * 4)); S.c = 0;
    S.N = 6 + Math.floor(Math.random() * 20); S.k = S.N; S.caseId = 'custom'; S.selected = -1;
    S.light = Math.round(Math.random() * 360 - 180);
    $('#fInput').value = S.f; $('#gInput').value = S.g; $('#aInput').value = S.a; $('#bInput').value = S.b;
    $('#cRange').value = 0; $('#cNum').value = 0; $('#caseSelect').value = 'custom';
    syncControls(); invalidate('math'); saveState(); Sound.chord();
    toast('Modelo aleatorio generado', 'ok');
  });
  $$('[data-load]').forEach(b => b.addEventListener('click', () => {
    applyPreset(b.dataset.load, true);
    document.getElementById('lab').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  $$('[data-tab]').forEach(b => b.addEventListener('click', () => {
    $$('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
    $$('.panel').forEach(p => p.classList.toggle('on', p.dataset.panel === b.dataset.tab));
    Sound.click(); invalidate('panels');
  }));
  $('#sliceBody').addEventListener('click', e => {
    const tr = e.target.closest('tr'); if (!tr) return;
    selectSlice(parseInt(tr.dataset.i, 10));
  });
  $('#scClose').addEventListener('click', () => selectSlice(-1, true));
  $('#scPrev').addEventListener('click', () => selectSlice(Math.max(0, S.selected - 1)));
  $('#scNext').addEventListener('click', () => selectSlice(Math.min(S.N - 1, S.selected + 1)));
  $('#soundBtn').addEventListener('click', () => {
    Sound.ensure(); Sound.set(!S.sound);
    $('#soundBtn').setAttribute('aria-pressed', String(S.sound));
    $('#soundLabel').textContent = S.sound ? 'Sonido' : 'Silencio';
    if (S.sound) Sound.click();
    saveState();
  });
  const pop = $('#exportPop'), eb = $('#exportBtn');
  eb.addEventListener('click', e => {
    e.stopPropagation(); const open = pop.hidden; pop.hidden = !open; eb.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', () => { pop.hidden = true; eb.setAttribute('aria-expanded', 'false'); });
  pop.addEventListener('click', e => e.stopPropagation());
  $$('[data-export]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.export; pop.hidden = true;
    if (k === 'png') exportPNG(); else if (k === 'csv') exportCSV(); else if (k === 'json') exportJSON(); else exportReport();
  }));
  $('#csvBtn').addEventListener('click', exportCSV);
  $('#csvBtn2').addEventListener('click', exportCSV);
  $('#jsonBtn2').addEventListener('click', exportJSON);
  $('#pngBtn2').addEventListener('click', exportPNG);
  $('#reportBtn').addEventListener('click', exportReport);
  ['dMembers', 'dGroup', 'dRepo', 'dApp', 'dVideo'].forEach(id => {
    const el = $('#' + id);
    try { el.value = localStorage.getItem('revolve.' + id) || ''; } catch (e) { el.value = ''; }
    el.addEventListener('input', () => { try { localStorage.setItem('revolve.' + id, el.value); } catch (e) {} });
  });
  $('#delivForm').addEventListener('submit', e => e.preventDefault());
  $$('[data-view]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.view;
    if (v === 'front') { CAM.tyaw = 0; CAM.tpitch = 0.02; }
    else if (v === 'top') { CAM.tyaw = 0.001; CAM.tpitch = 1.35; }
    else { CAM.tyaw = 0.85; CAM.tpitch = 0.42; }
    if (v === 'reset' && SCENE.bounds) CAM.tdist = SCENE.bounds.radius * 3.1;
    Sound.click();
  }));
  document.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); $('#playBtn').click(); }
    else if (k === 'r') { CAM.tyaw = 0.85; CAM.tpitch = 0.42; if (SCENE.bounds) CAM.tdist = SCENE.bounds.radius * 3.1; }
    else if (k === 'w') { $('#wireToggle').checked = !S.wire; S.wire = !S.wire; invalidate('panels'); }
    else if (k === 'g') { $('#gridToggle').checked = !S.grid; S.grid = !S.grid; invalidate('panels'); }
    else if (k === 'm') $('#soundBtn').click();
    else if (k === 'arrowleft') CAM.tyaw -= 0.12;
    else if (k === 'arrowright') CAM.tyaw += 0.12;
    else if (k === 'arrowup') CAM.tpitch = clamp(CAM.tpitch + 0.08, -1.4, 1.4);
    else if (k === 'arrowdown') CAM.tpitch = clamp(CAM.tpitch - 0.08, -1.4, 1.4);
  });
  const rc = $('#regionCanvas');
  rc.addEventListener('mousemove', e => {
    if (!MODEL || !rc._map) return;
    const r = rc.getBoundingClientRect(), m = rc._map;
    const x = m.xmin + (e.clientX - r.left - m.pad.l) / (m.w - m.pad.l - m.pad.r) * (m.xmax - m.xmin);
    if (x < MODEL.a || x > MODEL.b) { $('#regionRead').textContent = 'Fuera del intervalo de integración.'; return; }
    $('#regionRead').innerHTML = 'x = <b>' + nf(x, 4) + '</b> · f(x) = <b>' + nf(MODEL.f(x), 4) + '</b>' +
      (MODEL.method !== 'discos' ? ' · g(x) = <b>' + nf(MODEL.g(x), 4) + '</b>' : '') +
      ' · ' + (MODEL.method === 'cascarones' ? 'altura = ' + nf(MODEL.f(x) - MODEL.g(x), 4) + ', radio = ' + nf(x - MODEL.c, 4)
        : 'radio exterior = ' + nf(MODEL.f(x) - MODEL.c, 4));
  });
  rc.addEventListener('click', e => {
    if (!RIE || !rc._map) return;
    const r = rc.getBoundingClientRect(), m = rc._map;
    const x = m.xmin + (e.clientX - r.left - m.pad.l) / (m.w - m.pad.l - m.pad.r) * (m.xmax - m.xmin);
    const i = clamp(Math.floor((x - MODEL.a) / RIE.dx), 0, RIE.N - 1);
    selectSlice(i);
  });
}
function syncControls() {
  $('#fInput').value = S.f; $('#gInput').value = S.g; $('#aInput').value = S.a; $('#bInput').value = S.b;
  $('#cRange').value = S.c; $('#cNum').value = S.c; $('#caseSelect').value = PRESETS[S.caseId] ? S.caseId : 'custom';
  $('#nRange').value = S.N; $('#kRange').max = S.N; $('#kRange').value = S.k;
  $('#ruleSelect').value = S.rule; $('#speedRange').value = S.speed; $('#gapRange').value = S.gap;
  $('#opacityRange').value = S.opacity; $('#solidToggle').checked = S.solid; $('#wireToggle').checked = S.wire;
  $('#gridToggle').checked = S.grid; $('#partToggle').checked = S.particles; $('#orbitToggle').checked = S.orbit;
  $('#orbitSpeed').value = S.orbitSpeed; $('#lightRange').value = S.light; $('#lightInt').value = S.lightInt;
  $('#glowRange').value = S.glow; $('#qualitySelect').value = S.quality; $('#paletteSelect').value = S.palette;
  $('#soundBtn').setAttribute('aria-pressed', String(S.sound));
  $('#soundLabel').textContent = S.sound ? 'Sonido' : 'Silencio';
  document.documentElement.dataset.palette = S.palette;
}
function bindViewport() {
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragging = true; moved = 0; lastPointer = { x: e.clientX, y: e.clientY };
    Sound.ensure();
  });
  canvas.addEventListener('pointermove', e => {
    const rect = canvas.getBoundingClientRect();
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const p = Array.from(pointers.values());
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (pinchDist) CAM.tdist = clamp(CAM.tdist * (pinchDist / d), 0.6, 400);
      pinchDist = d; return;
    }
    if (dragging && lastPointer) {
      const dx = e.clientX - lastPointer.x, dy = e.clientY - lastPointer.y;
      moved += Math.abs(dx) + Math.abs(dy);
      CAM.tyaw -= dx * 0.008; CAM.tpitch = clamp(CAM.tpitch + dy * 0.006, -1.4, 1.4);
      lastPointer = { x: e.clientX, y: e.clientY };
      $('#tip').hidden = true;
    } else {
      const i = pickSlice(e.clientX - rect.left, e.clientY - rect.top);
      if (i !== S.hover) { S.hover = i; }
      const tip = $('#tip');
      if (i >= 0 && RIE) {
        tip.hidden = false;
        tip.innerHTML = 'elemento ' + (i + 1) + ' · x* = ' + nf(RIE.pts[i], 3) + '<br>ΔV = ' + nf(RIE.dv[i], 5) + ' ' + unitV();
        tip.style.left = clamp(e.clientX - rect.left + 14, 8, VIEW.w - 170) + 'px';
        tip.style.top = clamp(e.clientY - rect.top + 14, 8, VIEW.h - 60) + 'px';
      } else tip.hidden = true;
    }
  });
  const endPointer = e => {
    pointers.delete(e.pointerId); if (pointers.size < 2) pinchDist = 0;
    if (dragging && moved < 5) {
      const rect = canvas.getBoundingClientRect();
      const i = pickSlice(e.clientX - rect.left, e.clientY - rect.top);
      selectSlice(i);
    }
    dragging = pointers.size > 0; lastPointer = null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { S.hover = -1; $('#tip').hidden = true; });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    CAM.tdist = clamp(CAM.tdist * (1 + Math.sign(e.deltaY) * 0.12), 0.6, 400);
  }, { passive: false });
}
function observeSections() {
  const links = $$('[data-nav]');
  const secs = ['lab', 'metodos', 'casos', 'informe'].map(id => document.getElementById(id));
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) links.forEach(l => l.classList.toggle('on', l.dataset.nav === en.target.id));
    });
  }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });
  secs.forEach(s => s && io.observe(s));
  const reveal = new IntersectionObserver(entries => {
    entries.forEach((en, i) => { if (en.isIntersecting) { setTimeout(() => en.target.classList.add('in'), i * 90); reveal.unobserve(en.target); } });
  }, { threshold: 0.12 });
  $$('.mcard,.ccard').forEach(c => reveal.observe(c));
}
let last = 0, playAcc = 0, running = true;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!running) { last = ts; return; }
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
  if (dirty.math) { recompute(); dirty.math = false; dirty.scene = true; dirty.panels = true; }
  if (S.playing) {
    playAcc += dt;
    const step = 1 / clamp(S.speed, 1, 24);
    while (playAcc >= step) {
      playAcc -= step;
      if (S.k < S.N) { S.k++; Sound.tick(S.k - 1, S.N); dirty.scene = true; dirty.panels = true; }
      else { S.playing = false; Sound.chord(); dirty.panels = true; break; }
    }
  }
  if (dirty.scene) { buildScene(); dirty.scene = false; }
  if (dirty.panels) { drawRegion(); drawBars(); drawConv(); renderDeriv(); syncUI(); dirty.panels = false; }
  render3D(dt);
  frameAcc += dt; frameCount++; hudTimer += dt;
  if (hudTimer > 0.5) {
    fps = frameCount / frameAcc; frameAcc = 0; frameCount = 0; hudTimer = 0;
    $('#hud').textContent = Math.round(fps) + ' fps · ' + faces.length + ' caras · ' +
      Math.round(CAM.yaw * 180 / Math.PI % 360) + '° / ' + Math.round(CAM.pitch * 180 / Math.PI) + '° · zoom ' + CAM.dist.toFixed(1);
  }
}
function init() {
  loadState();
  canvas = $('#scene'); ctx = canvas.getContext('2d');
  glowCv = document.createElement('canvas'); glowCtx = glowCv.getContext('2d');
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { S.orbit = false; S.particles = false; }
  syncControls(); bindUI(); bindViewport(); bindTutor(); observeSections();
  resize();
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe($('#viewport'));
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { running = !document.hidden; });
  window.addEventListener('pointerdown', () => Sound.ensure(), { once: true });
  invalidate('math');
  requestAnimationFrame(frame);
  requestAnimationFrame(() => TUTOR.build());
  setTimeout(() => toast('Arrastra el sólido para orbitar · clic en un elemento para inspeccionarlo · T para el asistente', ''), 900);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
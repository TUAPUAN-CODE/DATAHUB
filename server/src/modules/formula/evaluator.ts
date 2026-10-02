import { toBool, toDate, toNumber, toText, DAY_MS } from './convert';
import { getFunction } from './functions';
import { DateV, EvalCtx, FormulaEvalError, FValue, isDateV, Node } from './types';

const isDate = (v: FValue): v is DateV => isDateV(v);

function compare(op: string, l: FValue, r: FValue): boolean {
  if (l === null || r === null) {
    const bothEmpty = (l === null || l === '') && (r === null || r === '');
    if (op === '=') return bothEmpty;
    if (op === '<>') return !bothEmpty;
    return false;
  }
  let c: number;
  if (isDate(l) || isDate(r)) {
    const a = toDate(l); const b = toDate(r);
    if (!a || !b) return op === '<>';
    c = a.ms - b.ms;
  } else if (typeof l === 'string' && typeof r === 'string') {
    c = op === '=' || op === '<>' ? (l.toLowerCase() === r.toLowerCase() ? 0 : 1) : l.localeCompare(r, 'th');
  } else if (typeof l === 'boolean' && typeof r === 'boolean') {
    c = Number(l) - Number(r);
  } else {
    const a = toNumber(l); const b = toNumber(r);
    if (a === null || b === null) return op === '<>' ? toText(l) !== toText(r) : op === '=' ? toText(l) === toText(r) : false;
    c = a - b;
  }
  switch (op) {
    case '=': return c === 0;
    case '<>': return c !== 0;
    case '<': return c < 0;
    case '<=': return c <= 0;
    case '>': return c > 0;
    default: return c >= 0;
  }
}

function arithmetic(op: string, l: FValue, r: FValue): FValue {
  if (l === null || r === null) return null;
  // dates: date - date = days, date ± days = date
  if (isDate(l) && isDate(r) && op === '-') return (l.ms - r.ms) / DAY_MS;
  if (isDate(l) && !isDate(r) && (op === '+' || op === '-')) { const n = toNumber(r); return n === null ? null : { kind: l.kind === 'date' && !Number.isInteger(n) ? 'datetime' : l.kind, ms: l.ms + (op === '+' ? n : -n) * DAY_MS }; }
  if (isDate(r) && !isDate(l) && op === '+') { const n = toNumber(l); return n === null ? null : { kind: r.kind, ms: r.ms + n * DAY_MS }; }
  const a = toNumber(l); const b = toNumber(r);
  if (a === null || b === null) return null;
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? null : a / b;
    default: return b === 0 ? null : a % b;
  }
}

/** Evaluates a parsed (and resolved) formula for one row. Throws FormulaEvalError for a value that makes no sense. */
export function evaluate(n: Node, ctx: EvalCtx): FValue {
  switch (n.t) {
    case 'num': return n.v;
    case 'str': return n.v;
    case 'bool': return n.v;
    case 'null': return null;
    case 'ref':
      if (!n.id) throw new FormulaEvalError(`คอลัมน์ [${n.raw}] ยังไม่ได้ผูก`);
      return ctx.get(n.id);
    case 'un': {
      const v = evaluate(n.arg, ctx);
      if (v === null) return null;
      const x = toNumber(v);
      return x === null ? null : n.op === '-' ? -x : x;
    }
    case 'bin': {
      const l = evaluate(n.l, ctx);
      const r = evaluate(n.r, ctx);
      if (n.op === '&') return toText(l) + toText(r);
      if (['=', '<>', '<', '<=', '>', '>='].includes(n.op)) return compare(n.op, l, r);
      return arithmetic(n.op, l, r);
    }
    case 'call': {
      const f = getFunction(n.name);
      if (!f) throw new FormulaEvalError(`ไม่มีฟังก์ชัน ${n.name}`);
      const args = f.lazy ? n.args.map((a) => () => evaluate(a, ctx)) : n.args.map((a) => evaluate(a, ctx));
      return f.fn(args, ctx);
    }
  }
}

export { toBool };

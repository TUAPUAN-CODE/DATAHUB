import { FormulaSyntaxError, Node } from './types';

type Tok =
  | { k: 'num'; v: number; pos: number }
  | { k: 'str'; v: string; pos: number }
  | { k: 'id'; v: string; pos: number }
  | { k: 'ref'; v: string; pos: number; end: number }
  | { k: 'op'; v: string; pos: number }
  | { k: 'eof'; pos: number };

/** [Column name] or [#column-id]; a literal "]" inside a name is written "]]" */
function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '[') {
      const start = i;
      let j = i + 1, name = '';
      for (;;) {
        if (j >= src.length) throw new FormulaSyntaxError('ชื่อคอลัมน์ในวงเล็บ [ ] ไม่ครบ (ขาด ])', start);
        if (src[j] === ']') { if (src[j + 1] === ']') { name += ']'; j += 2; continue; } break; }
        name += src[j++];
      }
      out.push({ k: 'ref', v: name.trim(), pos: start, end: j + 1 });
      i = j + 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1, s = '';
      for (;;) {
        if (j >= src.length) throw new FormulaSyntaxError('ข้อความในเครื่องหมายคำพูดไม่ครบ', i);
        if (src[j] === ch) { if (src[j + 1] === ch) { s += ch; j += 2; continue; } break; }
        s += src[j++];
      }
      out.push({ k: 'str', v: s, pos: i });
      i = j + 1;
      continue;
    }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) { out.push({ k: 'num', v: Number(num[0]), pos: i }); i += num[0].length; continue; }
    const id = /^[\p{L}_][\p{L}\p{N}_.]*/u.exec(src.slice(i));
    if (id) { out.push({ k: 'id', v: id[0], pos: i }); i += id[0].length; continue; }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '<>', '!='].includes(two)) { out.push({ k: 'op', v: two === '!=' ? '<>' : two, pos: i }); i += 2; continue; }
    if ('+-*/%&=<>(),'.includes(ch)) { out.push({ k: 'op', v: ch, pos: i }); i++; continue; }
    throw new FormulaSyntaxError(`อักขระที่ใช้ไม่ได้: "${ch}"`, i);
  }
  out.push({ k: 'eof', pos: src.length });
  return out;
}

/**
 * Precedence (low → high):  = <> < <= > >=   |   &   |   + -   |   * / %   |   unary - +
 */
export function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => toks[p].k === 'op' && (toks[p] as { v: string }).v === v;
  const eat = (v: string) => { if (!isOp(v)) throw new FormulaSyntaxError(`ต้องมี "${v}"`, toks[p].pos); p++; };

  function cmp(): Node {
    let l = concat();
    while (peek().k === 'op' && ['=', '<>', '<', '<=', '>', '>='].includes((peek() as { v: string }).v)) {
      const op = (toks[p++] as { v: string }).v;
      l = { t: 'bin', op, l, r: concat() };
    }
    return l;
  }
  function concat(): Node {
    let l = add();
    while (isOp('&')) { p++; l = { t: 'bin', op: '&', l, r: add() }; }
    return l;
  }
  function add(): Node {
    let l = mul();
    while (isOp('+') || isOp('-')) { const op = (toks[p++] as { v: string }).v; l = { t: 'bin', op, l, r: mul() }; }
    return l;
  }
  function mul(): Node {
    let l = unary();
    while (isOp('*') || isOp('/') || isOp('%')) { const op = (toks[p++] as { v: string }).v; l = { t: 'bin', op, l, r: unary() }; }
    return l;
  }
  function unary(): Node {
    if (isOp('-') || isOp('+')) { const op = (toks[p++] as { v: string }).v as '-' | '+'; return { t: 'un', op, arg: unary() }; }
    return primary();
  }
  function primary(): Node {
    const t = toks[p];
    switch (t.k) {
      case 'num': p++; return { t: 'num', v: t.v };
      case 'str': p++; return { t: 'str', v: t.v };
      case 'ref': {
        p++;
        const m = /^#([0-9a-fA-F-]{36})$/.exec(t.v);
        return { t: 'ref', raw: t.v, id: m ? m[1].toLowerCase() : null, start: t.pos, end: t.end };
      }
      case 'id': {
        p++;
        const up = t.v.toUpperCase();
        if (isOp('(')) {
          p++;
          const args: Node[] = [];
          if (!isOp(')')) { for (;;) { args.push(cmp()); if (isOp(',')) { p++; continue; } break; } }
          eat(')');
          return { t: 'call', name: up, args, pos: t.pos };
        }
        if (up === 'TRUE') return { t: 'bool', v: true };
        if (up === 'FALSE') return { t: 'bool', v: false };
        if (up === 'NULL' || up === 'BLANK') return { t: 'null' };
        throw new FormulaSyntaxError(`"${t.v}" ไม่ใช่ฟังก์ชันหรือค่าที่รู้จัก (ถ้าเป็นชื่อคอลัมน์ให้ใส่ใน [ ])`, t.pos);
      }
      case 'op':
        if (t.v === '(') { p++; const n = cmp(); eat(')'); return n; }
        throw new FormulaSyntaxError(`ไม่ควรมี "${t.v}" ตรงนี้`, t.pos);
      case 'eof':
        throw new FormulaSyntaxError('สูตรไม่สมบูรณ์', t.pos);
    }
  }

  if (!src.trim()) throw new FormulaSyntaxError('กรุณาใส่สูตร', 0);
  const ast = cmp();
  if (peek().k !== 'eof') throw new FormulaSyntaxError(`ไม่ควรมี "${(peek() as { v?: string }).v ?? ''}" ตรงนี้`, peek().pos);
  return ast;
}

/** All column references of a parsed formula */
export function collectRefs(n: Node, out: Node[] = []): Node[] {
  switch (n.t) {
    case 'ref': out.push(n); break;
    case 'call': n.args.forEach((a) => collectRefs(a, out)); break;
    case 'un': collectRefs(n.arg, out); break;
    case 'bin': collectRefs(n.l, out); collectRefs(n.r, out); break;
  }
  return out;
}

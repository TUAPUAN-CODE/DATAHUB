import { collectRefs, parse } from './parser';
import { getFunction } from './functions';
import { FormulaSyntaxError, Node } from './types';

export interface ColumnRef { id: string; name: string; dataType: string }
export interface Compiled {
  /** stored form: columns referenced by id, so renaming a column never breaks the formula */
  canonical: string;
  /** shown to the user: columns referenced by their current name */
  display: string;
  deps: string[];
  ast: Node;
}

const norm = (s: string) => s.trim().toLowerCase();

const escapeName = (n: string) => n.replace(/\]/g, ']]');

/** Parses `source`, binds [Column name] → [#id], and checks function names / argument counts */
export function compileFormula(source: string, cols: ColumnRef[], opts: { selfId?: string } = {}): Compiled {
  const ast = parse(source);
  const byName = new Map<string, ColumnRef[]>();
  for (const c of cols) { const k = norm(c.name); byName.set(k, [...(byName.get(k) ?? []), c]); }
  const byId = new Map(cols.map((c) => [c.id.toLowerCase(), c]));

  const refs = collectRefs(ast) as Extract<Node, { t: 'ref' }>[];
  for (const r of refs) {
    if (r.id) {
      if (!byId.has(r.id)) throw new FormulaSyntaxError(`ไม่พบคอลัมน์ที่อ้างอิง (อาจถูกลบแล้ว)`, r.start);
      continue;
    }
    const hit = byName.get(norm(r.raw)) ?? [];
    if (!hit.length) throw new FormulaSyntaxError(`ไม่พบคอลัมน์ชื่อ "${r.raw}"`, r.start);
    if (hit.length > 1) throw new FormulaSyntaxError(`มีคอลัมน์ชื่อ "${r.raw}" มากกว่าหนึ่งคอลัมน์`, r.start);
    r.id = hit[0].id.toLowerCase();
  }
  if (opts.selfId && refs.some((r) => r.id === opts.selfId!.toLowerCase())) throw new FormulaSyntaxError('สูตรอ้างอิงคอลัมน์ตัวเองไม่ได้', refs.find((r) => r.id === opts.selfId!.toLowerCase())!.start);

  const checkCalls = (n: Node) => {
    if (n.t === 'call') {
      const f = getFunction(n.name);
      if (!f) throw new FormulaSyntaxError(`ไม่มีฟังก์ชัน ${n.name}`, n.pos);
      if (n.args.length < f.minArgs || n.args.length > f.maxArgs) {
        const range = f.minArgs === f.maxArgs ? `${f.minArgs}` : Number.isFinite(f.maxArgs) ? `${f.minArgs}-${f.maxArgs}` : `อย่างน้อย ${f.minArgs}`;
        throw new FormulaSyntaxError(`${n.name} ต้องมี ${range} ค่า (ใส่มา ${n.args.length})`, n.pos);
      }
      n.args.forEach(checkCalls);
    } else if (n.t === 'un') checkCalls(n.arg);
    else if (n.t === 'bin') { checkCalls(n.l); checkCalls(n.r); }
  };
  checkCalls(ast);

  // rewrite the source text: every [..] reference → [#id] (canonical) / [Name] (display)
  const rewrite = (render: (id: string) => string) => {
    let out = ''; let last = 0;
    for (const r of [...refs].sort((a, b) => a.start - b.start)) { out += source.slice(last, r.start) + render(r.id!); last = r.end; }
    return out + source.slice(last);
  };
  return {
    canonical: rewrite((id) => `[#${id}]`),
    display: rewrite((id) => `[${escapeName(byId.get(id)!.name)}]`),
    deps: [...new Set(refs.map((r) => r.id!))],
    ast,
  };
}

/** Display text of an already stored formula (ids → current names). Unknown ids are shown as [?] */
export function displayFormula(canonical: string, cols: ColumnRef[]): string {
  const byId = new Map(cols.map((c) => [c.id.toLowerCase(), c.name]));
  return canonical.replace(/\[#([0-9a-fA-F-]{36})\]/g, (_m, id: string) => `[${escapeName(byId.get(id.toLowerCase()) ?? '?')}]`);
}

/** Order in which the formula columns of a sheet must be computed; throws on a circular reference */
export function topoOrder(formulas: { id: string; deps: string[] }[]): string[] {
  const ids = new Set(formulas.map((f) => f.id));
  const deps = new Map(formulas.map((f) => [f.id, f.deps.filter((d) => ids.has(d))]));
  const out: string[] = []; const state = new Map<string, 1 | 2>();
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) throw new FormulaSyntaxError('สูตรอ้างอิงกันเป็นวงกลม', 0);
    state.set(id, 1);
    for (const d of deps.get(id) ?? []) visit(d, [...path, id]);
    state.set(id, 2); out.push(id);
  };
  for (const f of formulas) visit(f.id, []);
  return out;
}

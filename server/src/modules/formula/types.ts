/** Runtime value of the formula language. Dates carry their kind so HOUR()/DATE() know whether a time zone applies. */
export interface DateV { kind: 'date' | 'datetime'; ms: number }
export type FValue = number | string | boolean | null | DateV;

export const isDateV = (v: unknown): v is DateV => !!v && typeof v === 'object' && 'ms' in (v as object);

export type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'null' }
  | { t: 'ref'; raw: string; id: string | null; start: number; end: number }
  | { t: 'call'; name: string; args: Node[]; pos: number }
  | { t: 'un'; op: '-' | '+' | 'NOT'; arg: Node }
  | { t: 'bin'; op: string; l: Node; r: Node };

export class FormulaSyntaxError extends Error {
  constructor(message: string, public pos: number) { super(message); this.name = 'FormulaSyntaxError'; }
}
/** Raised while evaluating one row; the cell simply becomes empty */
export class FormulaEvalError extends Error {}

export interface EvalCtx {
  /** value of a column of the current row */
  get(columnId: string): FValue;
  tzOffsetMinutes: number;
}

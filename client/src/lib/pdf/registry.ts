import type { BuildCtx } from './build';
import type { BlockBase } from './types';

/**
 * Extra block types plug in here without touching the document builder: a module says how to create the block
 * and how to turn it into pdfmake content. (The designer registers its editing form separately — see
 * components/pdf/formRegistry.ts — so this file stays free of React.)
 */
export interface BlockModule<B extends BlockBase = any> {
  type: string;
  label: string;
  /** where the block may be placed */
  scopes: ('body' | 'header' | 'footer')[];
  modes?: ('table' | 'perRow')[];
  create: () => B;
  build: (b: B, c: BuildCtx) => any | null;
  summary?: (b: B) => string;
}

const modules = new Map<string, BlockModule>();
export const registerBlockModule = <B extends BlockBase>(m: BlockModule<B>) => { modules.set(m.type, m as BlockModule); };
export const getBlockModule = (type: string) => modules.get(type);
export const listBlockModules = (scope: 'body' | 'header' | 'footer', mode: 'table' | 'perRow') =>
  [...modules.values()].filter((m) => m.scopes.includes(scope) && (!m.modes || m.modes.includes(mode)));

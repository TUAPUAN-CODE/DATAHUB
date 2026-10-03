import type { ComponentType } from 'react';
import type { PdfTemplate } from '@/lib/pdf/types';

/** The designer's editing form of a registered block type (the builder side lives in lib/pdf/registry.ts) */
export interface BlockFormProps<B = any> { block: B; template: PdfTemplate; onChange: (p: Partial<B>) => void }

const forms = new Map<string, ComponentType<BlockFormProps>>();
export const registerBlockForm = (type: string, form: ComponentType<BlockFormProps>) => { forms.set(type, form); };
export const getBlockForm = (type: string) => forms.get(type);

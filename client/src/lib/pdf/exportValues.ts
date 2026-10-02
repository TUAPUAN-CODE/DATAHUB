import type { ExportValues } from './build';
import { signatureSlotsOf } from './blocks/signature';
import type { PdfTemplate } from './types';
import { promptDefault } from './variables';

/** Does exporting this template need the dialog (questions, signature names, or the author asked for it)? */
export const needsExportDialog = (t: PdfTemplate) => !!(t.prompts?.length || signatureSlotsOf(t).length || t.askOnExport);

/** Starting answers: prompt defaults (@today, @shift …); signature names stay empty (the slot's own default name is used) */
export function defaultExportValues(t: PdfTemplate, user: string): Required<ExportValues> {
  const now = new Date();
  const prompts: Record<string, string> = {};
  for (const p of t.prompts ?? []) if (p.key) prompts[p.key] = promptDefault(p, { now, user, settings: t.settings });
  return { prompts, signers: {} };
}

/** Who signed what, for the archive record */
export function signersList(t: PdfTemplate, values: ExportValues): { label: string; name: string }[] {
  return signatureSlotsOf(t).map((s) => ({ label: s.label, name: values.signers?.[s.id] || s.defaultName || '' }));
}

import type { CandidateProfile } from '../types.js';
import type { DetectedField } from './formDetector.js';

export interface FillInput { profile: CandidateProfile; coverLetter: string; answers: Array<{ question: string; answer: string }>; resumePath: string | null; applicationUrl: string }
export interface FillReport { filled: Array<{ label: string; as: string }>; unexpected: DetectedField[]; resumeUploaded: boolean }

const split = (n: string) => { const p = n.trim().split(/\s+/); return { first: p[0] || '', last: p.slice(1).join(' ') }; };
function valueFor(f: DetectedField, inp: FillInput): { key: string; value: string } | null {
  const l = `${f.label} ${f.name}`.toLowerCase();
  const { first, last } = split(inp.profile.name);
  if (/first.?name|given name/.test(l)) return { key: 'first name', value: first };
  if (/last.?name|family name|surname/.test(l)) return { key: 'last name', value: last };
  if (/full.?name|^name|your name/.test(l) && !/company|school/.test(l)) return { key: 'name', value: inp.profile.name };
  if (/e-?mail/.test(l)) return { key: 'email', value: inp.profile.email };
  if (/phone|mobile|contact number/.test(l) && inp.profile.phone) return { key: 'phone', value: inp.profile.phone };
  if (/cover letter|covering letter|additional information|message to/.test(l) && f.tag === 'textarea') return { key: 'cover letter', value: inp.coverLetter };
  if (/college|university|school/.test(l) && inp.profile.education.college) return { key: 'college', value: inp.profile.education.college };
  for (const a of inp.answers) {
    const words = a.question.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter((w) => w.length > 4);
    if (f.tag === 'textarea' && words.filter((w) => l.includes(w)).length >= 2) return { key: `answer: ${a.question}`, value: a.answer };
  }
  if (/why (are you|do you).*(interest|want)|why this/.test(l)) { const a = inp.answers[0]; if (a) return { key: 'why interested', value: a.answer }; }
  return null;
}

/** Fills only fields it can map from approved data. Everything else is reported, never guessed. */
export async function fillForm(page: any, fields: DetectedField[], inp: FillInput): Promise<FillReport> {
  const report: FillReport = { filled: [], unexpected: [], resumeUploaded: false };
  for (const f of fields) {
    try {
      if (f.type === 'file') {
        if (/resume|cv/i.test(`${f.label} ${f.name}`) && inp.resumePath) { await page.setInputFiles(f.selector, inp.resumePath); report.resumeUploaded = true; report.filled.push({ label: f.label || f.name, as: 'resume file' }); }
        else if (f.required) report.unexpected.push(f);
        continue;
      }
      if (f.type === 'checkbox' || f.type === 'radio') { if (f.required) report.unexpected.push(f); continue; }
      const v = valueFor(f, inp);
      if (v && v.value) { await page.fill(f.selector, v.value); report.filled.push({ label: f.label || f.name, as: v.key }); }
      else if (f.required) report.unexpected.push(f);
    } catch { if (f.required) report.unexpected.push(f); }
  }
  return report;
}

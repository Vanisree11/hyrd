import type { CandidateProfile } from '../../types.js';
import type { NormalizedJob } from '../../connectors/types.js';
import { canonicalSkill, extractSkills } from '../../utils/skills.js';

export type Eligibility = 'Eligible' | 'Potentially Eligible' | 'Not Eligible' | 'Needs Review' | 'Unknown';
export interface EligibilityResult { status: Eligibility; notes: string[]; internshipOk: boolean | null }
export interface MatchResult {
  score: number;
  breakdown: { skills: number; eligibility: number; role: number; experience: number; location: number };
  matchedSkills: string[]; missingSkills: string[];
  eligibility: Eligibility; eligibilityNotes: string[];
}
export const WEIGHTS = { skills: 40, eligibility: 25, role: 15, experience: 10, location: 10 } as const;

const ROLE_SYNONYMS: Record<string, string[]> = {
  'software engineer': ['software engineer', 'software developer', 'sde', 'swe', 'software engineering', 'programmer'],
  'full stack': ['full stack', 'fullstack', 'full-stack'],
  frontend: ['frontend', 'front end', 'front-end', 'ui engineer', 'web developer'],
  backend: ['backend', 'back end', 'back-end', 'server'],
  'ai/ml': ['machine learning', 'ml engineer', 'ai engineer', 'ai/ml', 'data scientist', 'deep learning', 'ml '],
  data: ['data analyst', 'data engineer', 'analytics'],
  devops: ['devops', 'sre', 'platform engineer', 'cloud engineer'],
  mobile: ['android', 'ios', 'mobile', 'flutter', 'react native'],
};
const canonRole = (s: string) => {
  const t = ` ${s.toLowerCase()} `;
  for (const [canon, syn] of Object.entries(ROLE_SYNONYMS)) if (syn.some((x) => t.includes(x)) || t.includes(canon)) return canon;
  return s.toLowerCase().trim();
};

/** Eligibility is conservative: only hard, verifiable contradictions yield Not Eligible. Unverifiable → Unknown/Potentially. */
export function checkEligibility(p: CandidateProfile, job: NormalizedJob, goalTypes: string[] = []): EligibilityResult {
  const text = `${job.title}\n${job.description}`;
  const t = text.toLowerCase();
  const notes: string[] = [];
  let hardFail = false, soft = 0, verified = 0, needsReview = false, internshipOk: boolean | null = null;
  if (job.description.trim().length < 80) {
    notes.push('The listing has little or no requirements information; verify qualifications on the official application page.');
    needsReview = true;
  }

  // Graduation year
  const years = [...t.matchAll(/(?:batch|class|graduat\w*|pass(?:ing)?[- ]?out|passout)[^.\n]{0,40}?(20[2-4]\d)(?:\s*(?:,|and|\/|or|-|to|&)\s*(20[2-4]\d))?/g)];
  const reqYears = years.flatMap((m) => [m[1], m[2]].filter(Boolean).map(Number));
  if (reqYears.length) {
    if (p.education.gradYear) {
      if (reqYears.includes(p.education.gradYear) || (Math.min(...reqYears) <= p.education.gradYear && p.education.gradYear <= Math.max(...reqYears))) { notes.push(`Graduation year ${p.education.gradYear} fits (${[...new Set(reqYears)].join(', ')})`); verified++; }
      else { notes.push(`Wants graduation year ${[...new Set(reqYears)].join('/')}; yours is ${p.education.gradYear}`); hardFail = true; }
    } else { notes.push('Graduation year is required by the listing but is missing from your profile'); needsReview = true; }
  }

  // Degree / branch
  if (/\b(b\.?e|b\.?tech|bachelor|computer science|cs\/it|\bit\b|engineering degree)/.test(t)) {
    const degreeReq = /\b(b\.?e|b\.?tech|bachelor|engineering degree)/.test(t);
    const csReq = /computer science|information technology|\bcs\b|software engineering/.test(t);
    const csHave = /computer|information|software|data|artificial|cyber/i.test(p.education.branch);
    if (!p.education.degree && !p.education.branch) { notes.push('The listing mentions a degree or field requirement, but your education is missing from your profile'); needsReview = true; }
    else if (degreeReq && !p.education.degree) { notes.push('The listing asks for a degree, but your profile does not confirm one'); needsReview = true; }
    else if (csReq && !p.education.branch) { notes.push('The listing asks for a CS/IT-related field, but your field of study is missing from your profile'); needsReview = true; }
    else if (csReq && p.education.branch) { if (csHave) { notes.push(`Branch ${p.education.branch} fits`); verified++; } else { notes.push(`Prefers CS/IT background; yours is ${p.education.branch}`); soft++; } }
    else if (!csReq && p.education.degree) { notes.push(`Degree listed: ${p.education.degree}; confirm it meets the employer's requirement`); needsReview = true; }
  }

  // Experience
  const exp = t.match(/(\d{1,2})\s*\+?\s*(?:-|to)?\s*\d{0,2}\s*\+?\s*years?(?: of)?(?: relevant| professional| work| industry)?\s*(?:experience|exp)/);
  const needYears = exp ? Number(exp[1]) : job.experience ? Number(job.experience.match(/\d+/)?.[0] || 0) : 0;
  const haveYears = p.preferences.experienceYears || 0;
  if (needYears > 0) {
    if (haveYears >= needYears) { notes.push(`Experience ${haveYears}y meets ${needYears}y`); verified++; }
    else if (needYears - haveYears >= 2) { notes.push(`Requires ${needYears}+ years; you listed ${haveYears}`); hardFail = true; }
    else { notes.push(`Asks ${needYears}+ years; you listed ${haveYears}`); soft++; }
  }

  // Internship vs full-time
  const isIntern = job.employmentType === 'Internship';
  const wantsIntern = (goalTypes.length ? goalTypes : p.preferences.employmentTypes).includes('Internship');
  const wantsFT = (goalTypes.length ? goalTypes : p.preferences.employmentTypes).includes('Full-time');
  if (isIntern) { internshipOk = wantsIntern || (!wantsFT && !wantsIntern); notes.push(internshipOk ? 'Internship eligible' : 'Internship, but you prefer full-time'); if (!internshipOk) soft++; else verified++; }
  else if (job.employmentType === 'Full-time' && wantsIntern && !wantsFT) { notes.push('Full-time role; you prefer internships'); soft++; }

  // Work authorization (only when explicitly stated)
  if (/(must|need|require)[^.]{0,40}(work authori[sz]ation|right to work|visa sponsorship not|us citizen|green card)/.test(t)) { notes.push('Mentions work-authorization requirements — verify before applying'); needsReview = true; }

  let status: Eligibility;
  if (hardFail) {
    status = 'Not Eligible';
    const reason = notes.find((n) => /Requires \d+\+ years|Wants graduation year/i.test(n));
    if (reason) notes.unshift(`Not eligible: ${reason}`);
  }
  else if (needsReview) status = 'Needs Review';
  else if (soft > 0) status = 'Potentially Eligible';
  else if (verified > 0) status = 'Eligible';
  else { status = 'Needs Review'; notes.push('No explicit eligibility criteria found in the listing, so eligibility cannot be confirmed'); }
  if (status === 'Eligible') notes.unshift('Eligible based on the verified requirements and profile evidence below.');
  else if (status === 'Potentially Eligible') notes.unshift('Potentially eligible; review the qualification notes below before applying.');
  return { status, notes, internshipOk };
}

export function scoreJob(p: CandidateProfile, job: NormalizedJob, goalTypes: string[] = []): MatchResult {
  const have = new Set(p.skills.map((s) => canonicalSkill(s)));
  const jobSkills = [...new Set((job.skills.length ? job.skills : extractSkills(job.description)).map(canonicalSkill))];
  const matched = jobSkills.filter((s) => have.has(s));
  const missing = jobSkills.filter((s) => !have.has(s));
  // Skills (40): share of listed skills the candidate has. No listed skills → neutral 50%, since nothing can be verified.
  const skillsPct = jobSkills.length ? matched.length / jobSkills.length : 0.5;

  const elig = checkEligibility(p, job, goalTypes);
  const eligPct = { Eligible: 1, 'Potentially Eligible': 0.6, 'Needs Review': 0.4, Unknown: 0.4, 'Not Eligible': 0 }[elig.status];

  const prefRoles = [...p.preferences.roles, ...p.skills.length ? [] : []].map(canonRole);
  const jr = canonRole(job.title);
  const titleLc = job.title.toLowerCase();
  const rolePct = !prefRoles.length ? 0.5 : prefRoles.some((r) => r === jr || titleLc.includes(r)) ? 1 : prefRoles.some((r) => (ROLE_SYNONYMS[r] || []).some((x) => titleLc.includes(x))) ? 0.8 : /engineer|developer|intern|analyst|scientist/.test(titleLc) ? 0.3 : 0;

  const need = Number((job.experience || '').match(/\d+/)?.[0] || 0);
  const have_y = p.preferences.experienceYears || 0;
  const expPct = job.employmentType === 'Internship' && need === 0 ? 1 : need === 0 ? 0.8 : have_y >= need ? 1 : Math.max(0, 1 - (need - have_y) / Math.max(need, 1));

  const locs = p.preferences.locations.map((l) => l.toLowerCase());
  const wantsRemote = p.preferences.workModes.includes('Remote');
  const jl = `${job.location}`.toLowerCase();
  let locPct = 0.5;
  if (locs.length || p.preferences.workModes.length) {
    const locHit = locs.some((l) => jl.includes(l) || (l === 'india' && /india|bangalore|bengaluru|chennai|hyderabad|mumbai|pune|delhi|gurgaon|noida/.test(jl)));
    if (locHit) locPct = 1;
    else if (job.workMode === 'Remote' && wantsRemote) locPct = /worldwide|anywhere|global|india|apac|asia/.test(jl) || !jl ? 1 : 0.6;
    else if (job.workMode === 'Remote') locPct = 0.5;
    else locPct = 0.1;
  }
  const breakdown = {
    skills: Math.round(skillsPct * WEIGHTS.skills), eligibility: Math.round(eligPct * WEIGHTS.eligibility), role: Math.round(rolePct * WEIGHTS.role),
    experience: Math.round(expPct * WEIGHTS.experience), location: Math.round(locPct * WEIGHTS.location),
  };
  const score = Math.min(100, Object.values(breakdown).reduce((a, b) => a + b, 0));
  return { score, breakdown, matchedSkills: matched, missingSkills: missing, eligibility: elig.status, eligibilityNotes: elig.notes };
}

// ---- Deduplication ----
const norm = (s: string) => (s || '').toLowerCase().replace(/\[demo\]/g, '').replace(/\b(inc|llc|ltd|pvt|private|limited|corp|corporation|gmbh|co)\b\.?/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const normTitle = (s: string) => norm(s).replace(/\b(m f d|m w d|f m d|remote|hybrid|senior|sr|jr|junior)\b/g, (m) => (m === 'senior' || m === 'sr' || m === 'jr' || m === 'junior' ? m : '')).replace(/\s+/g, ' ').trim();
export const dedupeKey = (j: Pick<NormalizedJob, 'title' | 'company' | 'location'>) => `${norm(j.company)}|${normTitle(j.title)}|${norm((j.location || '').split(',')[0])}`;

export function dedupe(jobs: NormalizedJob[]): { unique: Array<NormalizedJob & { dedupeKey: string; alsoOn: string[] }>; removed: number } {
  const map = new Map<string, NormalizedJob & { dedupeKey: string; alsoOn: string[] }>();
  for (const job of jobs) {
    const key = dedupeKey(job);
    const ex = map.get(key) || map.get(`${norm(job.company)}|${normTitle(job.title)}|`);
    if (!ex) { map.set(key, { ...job, dedupeKey: key, alsoOn: [] }); continue; }
    if (ex.source !== job.source && !ex.alsoOn.includes(job.source)) ex.alsoOn.push(job.source);
    if ((job.description || '').length > (ex.description || '').length) ex.description = job.description;
  }
  return { unique: [...map.values()], removed: jobs.length - map.size };
}

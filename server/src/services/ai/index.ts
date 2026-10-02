import { config } from '../../config.js';
import type { CandidateProfile, ParsedGoal } from '../../types.js';
import { parseResumeText } from '../resume.js';

export interface JobLite { title: string; company: string; description: string; skills: string[]; location: string; employmentType: string }
export interface MatchLite { score: number; matchedSkills: string[]; missingSkills: string[]; eligibility: string }

/** AIProvider contract. Every method has a deterministic fallback so HYRD works without any API key. */
export interface AIProvider {
  readonly name: string;
  analyzeResume(text: string, fallback: { name: string; email: string }): Promise<CandidateProfile>;
  analyzeJob(job: JobLite): Promise<{ summary: string; keyRequirements: string[] }>;
  explainMatch(p: CandidateProfile, job: JobLite, m: MatchLite): Promise<string>;
  generateCoverLetter(p: CandidateProfile, job: JobLite, m: MatchLite): Promise<string>;
  generateApplicationAnswers(p: CandidateProfile, job: JobLite, m: MatchLite): Promise<Array<{ question: string; answer: string }>>;
  createPlan(goal: string, p: CandidateProfile): Promise<ParsedGoal>;
}

async function llm(system: string, user: string, json = false): Promise<string> {
  const { provider, geminiKey, geminiModel, groqKey, groqModel } = config.ai;
  if (provider === 'gemini' && geminiKey) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0.4, ...(json ? { responseMimeType: 'application/json' } : {}) } }),
    });
    if (!r.ok) throw new Error(`gemini ${r.status}`);
    const d: any = await r.json();
    return d.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
  }
  if (provider === 'groq' && groqKey) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({ model: groqModel, temperature: 0.4, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], ...(json ? { response_format: { type: 'json_object' } } : {}) }),
    });
    if (!r.ok) throw new Error(`groq ${r.status}`);
    const d: any = await r.json();
    return d.choices?.[0]?.message?.content || '';
  }
  throw new Error('no ai provider configured');
}
const hasLLM = () => (config.ai.provider === 'gemini' && !!config.ai.geminiKey) || (config.ai.provider === 'groq' && !!config.ai.groqKey);
const safeJson = (s: string) => { try { return JSON.parse(s.replace(/^```json|```$/g, '').trim()); } catch { return null; } };

const FACTS_RULE = 'Use ONLY facts present in the candidate JSON. Never invent employers, degrees, skills, numbers or experience. If something is missing, leave it out.';
const compactCandidate = (p: CandidateProfile) => JSON.stringify({ name: p.name, education: p.education, skills: p.skills, projects: p.projects.slice(0, 4), certifications: p.certifications.slice(0, 5), experience: p.experience.slice(0, 4), preferences: p.preferences });

// ---------- deterministic generators (also the source of truth when no LLM) ----------
const first = (p: CandidateProfile) => (p.name || 'Applicant').split(' ')[0];
const roleLine = (p: CandidateProfile) => {
  const e = p.education;
  return [e.degree && `${e.degree}${e.branch ? ' in ' + e.branch : ''}`, e.gradYear && `graduating ${e.gradYear}`].filter(Boolean).join(', ');
};
function templateCover(p: CandidateProfile, job: JobLite, m: MatchLite): string {
  const proj = p.projects[0];
  const skills = m.matchedSkills.slice(0, 5).join(', ');
  return [
    `Dear ${job.company} Hiring Team,`,
    ``,
    `I am writing to apply for the ${job.title} position at ${job.company}.${roleLine(p) ? ` I am pursuing ${roleLine(p)}${p.education.college ? ' at ' + p.education.college : ''}.` : ''}`,
    ``,
    skills ? `The role calls for ${skills}, which are skills I already work with.` : `I am keen to apply my technical background to this role.`,
    proj ? `For example, in my project "${proj.name}", ${proj.description.slice(0, 220).replace(/\s+/g, ' ')}` : '',
    ``,
    `I would welcome the chance to discuss how I can contribute to ${job.company}. Thank you for your time and consideration.`,
    ``,
    `Sincerely,`,
    p.name || '',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}
function templateAnswers(p: CandidateProfile, job: JobLite, m: MatchLite) {
  const proj = p.projects[0];
  const skills = m.matchedSkills.slice(0, 6).join(', ');
  const loc = p.preferences.locations.join(', ');
  return [
    { question: `Why are you interested in this ${job.title} role?`, answer: `The role matches my background${skills ? ` in ${skills}` : ''} and the work I want to grow into. ${job.description.slice(0, 160).replace(/\s+/g, ' ')}…` },
    { question: `Why ${job.company}?`, answer: `${job.company} is hiring for work that lines up with my skills${skills ? ` (${skills})` : ''}. I would like to contribute and learn from the team. (Edit to add a company-specific reason.)` },
    { question: 'Describe your relevant experience.', answer: [p.experience[0], roleLine(p) && `I am pursuing ${roleLine(p)}.`, skills && `My relevant skills include ${skills}.`].filter(Boolean).join(' ') || 'Please add your relevant experience.' },
    { question: 'Tell us about a relevant project.', answer: proj ? `${proj.name}: ${proj.description.slice(0, 350)}` : 'Please add a relevant project.' },
    { question: 'Why should we hire you?', answer: `${skills ? `I already work with ${skills}` : 'I bring relevant technical foundations'}${m.missingSkills.length ? `, and I am ready to pick up ${m.missingSkills.slice(0, 2).join(' and ')} quickly` : ''}. I am motivated, and I deliver projects end to end.` },
    { question: 'What is your availability?', answer: p.preferences.employmentTypes.includes('Internship') ? 'Available for an internship as per the programme schedule. (Edit with exact dates.)' : 'Available to start per the notice/joining timeline. (Edit with exact dates.)' },
    { question: 'Location preference?', answer: loc ? `Preferred: ${loc}${p.preferences.workModes.length ? ' (' + p.preferences.workModes.join(' / ') + ')' : ''}. Open to what ${job.company} requires: ${job.location}.` : `Open to ${job.location}.` },
  ];
}

const ROLE_WORDS = ['software engineer', 'software developer', 'full stack', 'frontend', 'front end', 'backend', 'back end', 'machine learning', 'ml', 'ai', 'data analyst', 'data scientist', 'devops', 'sde', 'web developer', 'mobile developer', 'qa', 'android', 'ios'];
export function deterministicGoal(goal: string, p: CandidateProfile): ParsedGoal {
  const g = goal.toLowerCase();
  const roles: string[] = [];
  for (const w of ROLE_WORDS) if (new RegExp(`\\b${w}\\b`).test(g)) roles.push(w);
  const labelled = [...goal.matchAll(/(?:find|search for|looking for)\s+([a-z/ +\-]+?)\s+(?:internships?|jobs?|roles?|positions?)/gi)].map((m) => m[1].trim());
  const finalRoles = [...new Set([...labelled, ...roles])].filter(Boolean);
  const employmentTypes = [/\bintern/.test(g) && 'Internship', /full[- ]time|\bjob\b/.test(g) && 'Full-time', /part[- ]time/.test(g) && 'Part-time'].filter(Boolean) as string[];
  const minMatch = Number(g.match(/(\d{2,3})\s*%/)?.[1] || 0) || 60;
  const locs: string[] = [];
  for (const m of goal.matchAll(/\b(?:in|at|near)\s+([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?)/g)) locs.push(m[1]);
  for (const c of ['Bangalore', 'Bengaluru', 'Chennai', 'Hyderabad', 'Mumbai', 'Pune', 'Delhi', 'Gurgaon', 'Noida', 'India', 'Remote']) if (g.includes(c.toLowerCase()) && !locs.includes(c)) locs.push(c);
  const roleFallback = finalRoles.length ? finalRoles : p.preferences.roles.length ? p.preferences.roles : ['software engineer'];
  return {
    roles: roleFallback, locations: [...new Set([...locs, ...p.preferences.locations])], remoteOk: /remote/.test(g) || p.preferences.workModes.includes('Remote'),
    employmentTypes: employmentTypes.length ? employmentTypes : p.preferences.employmentTypes, minMatch,
    action: /apply|prepare/.test(g) ? 'prepare' : 'search', keywords: [...new Set([...roleFallback, ...p.skills.slice(0, 3)])], raw: goal,
  };
}

class DeterministicProvider implements AIProvider {
  name = 'deterministic';
  async analyzeResume(text: string, f: { name: string; email: string }) { return parseResumeText(text, f.name, f.email); }
  async analyzeJob(job: JobLite) { return { summary: job.description.slice(0, 240).replace(/\s+/g, ' ') + (job.description.length > 240 ? '…' : ''), keyRequirements: job.skills.slice(0, 8) }; }
  async explainMatch(_p: CandidateProfile, job: JobLite, m: MatchLite) {
    return `${m.score}% match for ${job.title} at ${job.company}. ${m.matchedSkills.length ? `Matched skills: ${m.matchedSkills.join(', ')}. ` : 'No listed skills overlapped. '}${m.missingSkills.length ? `Gaps: ${m.missingSkills.join(', ')}. ` : ''}Eligibility: ${m.eligibility}.`;
  }
  async generateCoverLetter(p: CandidateProfile, job: JobLite, m: MatchLite) { return templateCover(p, job, m); }
  async generateApplicationAnswers(p: CandidateProfile, job: JobLite, m: MatchLite) { return templateAnswers(p, job, m); }
  async createPlan(goal: string, p: CandidateProfile) { return deterministicGoal(goal, p); }
}

/** Wraps an LLM; on any failure it degrades to the deterministic provider (and says so via `name`). */
class LLMProvider extends DeterministicProvider {
  name = config.ai.provider;
  async analyzeResume(text: string, f: { name: string; email: string }) {
    const base = parseResumeText(text, f.name, f.email);
    try {
      const out = safeJson(await llm('You extract structured resume data as JSON. Only include what is explicitly in the resume. No guessing.', `Return JSON with keys: name, email, phone, summary, education{degree,branch,college,gradYear(number|null),cgpa}, projects[{name,description}], certifications[], experience[], achievements[].\n\nRESUME:\n${text.slice(0, 12000)}`, true));
      if (!out) return base;
      return { ...base, ...pick(out, ['name', 'email', 'phone', 'summary']), education: { ...base.education, ...(out.education || {}) }, projects: Array.isArray(out.projects) && out.projects.length ? out.projects.slice(0, 8) : base.projects, certifications: out.certifications?.length ? out.certifications : base.certifications, experience: out.experience?.length ? out.experience : base.experience, achievements: out.achievements?.length ? out.achievements : base.achievements };
    } catch { return base; }
  }
  async explainMatch(p: CandidateProfile, job: JobLite, m: MatchLite) {
    try { return (await llm(`You explain job matches in 2 sentences. The score is already computed; do not change it. ${FACTS_RULE}`, `Candidate: ${compactCandidate(p)}\nJob: ${job.title} @ ${job.company}\nScore: ${m.score}; matched: ${m.matchedSkills}; missing: ${m.missingSkills}; eligibility: ${m.eligibility}`)).trim(); } catch { return super.explainMatch(p, job, m); }
  }
  async generateCoverLetter(p: CandidateProfile, job: JobLite, m: MatchLite) {
    try { return (await llm(`You write concise, authentic cover letters (150-220 words), no clichés. ${FACTS_RULE}`, `Candidate: ${compactCandidate(p)}\nJob: ${job.title} @ ${job.company}\nDescription: ${job.description.slice(0, 2500)}\nMatched skills: ${m.matchedSkills}`)).trim() || templateCover(p, job, m); } catch { return templateCover(p, job, m); }
  }
  async generateApplicationAnswers(p: CandidateProfile, job: JobLite, m: MatchLite) {
    const base = templateAnswers(p, job, m);
    try {
      const out = safeJson(await llm(`Answer application questions in first person, 2-4 sentences each. ${FACTS_RULE} Respond as JSON.`, `Candidate: ${compactCandidate(p)}\nJob: ${job.title} @ ${job.company}\nDescription: ${job.description.slice(0, 2000)}\nQuestions: ${JSON.stringify(base.map((b) => b.question))}\nReturn {"answers":[{"question":"","answer":""}]}`, true));
      return Array.isArray(out?.answers) && out.answers.length === base.length ? out.answers.map((a: any, i: number) => ({ question: base[i].question, answer: String(a.answer || base[i].answer) })) : base;
    } catch { return base; }
  }
  async createPlan(goal: string, p: CandidateProfile) {
    const base = deterministicGoal(goal, p);
    try {
      const out = safeJson(await llm('Convert a job-search goal to JSON. Do not add constraints the user did not state.', `Goal: ${goal}\nReturn {"roles":[],"locations":[],"remoteOk":bool,"employmentTypes":["Internship"|"Full-time"|"Part-time"|"Contract"],"minMatch":number,"action":"search"|"prepare","keywords":[]}`, true));
      if (!out) return base;
      return { ...base, roles: out.roles?.length ? out.roles : base.roles, locations: out.locations ?? base.locations, remoteOk: out.remoteOk ?? base.remoteOk, employmentTypes: out.employmentTypes ?? base.employmentTypes, minMatch: Number(out.minMatch) || base.minMatch, action: out.action === 'search' ? 'search' : base.action, keywords: out.keywords?.length ? out.keywords : base.keywords };
    } catch { return base; }
  }
}
const pick = (o: any, keys: string[]) => Object.fromEntries(keys.filter((k) => typeof o?.[k] === 'string' && o[k]).map((k) => [k, o[k]]));

export const ai: AIProvider = hasLLM() ? new LLMProvider() : new DeterministicProvider();
export const aiInfo = () => ({ provider: ai.name, llmConfigured: hasLLM() });

import fs from 'node:fs';
import path from 'node:path';
import mammoth from 'mammoth';
import { createRequire } from 'node:module';
import { extractSkills } from '../utils/skills.js';
import { CandidateProfile, emptyProfile } from '../types.js';

const require = createRequire(import.meta.url);

export const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

/** Validate magic bytes — never trust the client-declared MIME type. */
export function sniff(buf: Buffer): 'pdf' | 'docx' | null {
  if (buf.slice(0, 5).toString() === '%PDF-') return 'pdf';
  if (buf[0] === 0x50 && buf[1] === 0x4b) return 'docx';
  return null;
}

export async function extractText(file: string, kind: 'pdf' | 'docx'): Promise<string> {
  const buf = fs.readFileSync(file);
  if (kind === 'pdf') {
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    const out = await pdfParse(buf);
    return String(out.text || '').replace(/\u0000/g, '').trim();
  }
  const out = await mammoth.extractRawText({ buffer: buf });
  return String(out.value || '').trim();
}

const HEADINGS: Record<string, RegExp> = {
  education: /^(education|academic( background| qualifications?)?)\b/i,
  skills: /^(technical )?skills?\b|^technologies\b|^tech stack\b/i,
  projects: /^(academic |personal |key )?projects?\b/i,
  experience: /^(work |professional )?experience\b|^internships?\b|^employment\b/i,
  certifications: /^(certifications?|licenses?|courses?)\b/i,
  achievements: /^(achievements?|awards?|honou?rs|accomplishments|extracurricular)\b/i,
  summary: /^(summary|profile|objective|about)\b/i,
};

export function splitSections(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = { header: [] };
  let cur = 'header';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const bare = line.replace(/[:\-–—_*#|]+$/g, '').trim();
    const hit = bare.length < 40 ? Object.entries(HEADINGS).find(([, re]) => re.test(bare)) : undefined;
    if (hit && (bare.split(/\s+/).length <= 4)) { cur = hit[0]; out[cur] ||= []; continue; }
    (out[cur] ||= []).push(line);
  }
  return out;
}

const LANGS = ['Java', 'JavaScript', 'TypeScript', 'Python', 'C++', 'C', 'C#', 'Go', 'Rust', 'Kotlin', 'Swift', 'PHP', 'Ruby', 'SQL'];
const FRAMEWORKS = ['React', 'Next.js', 'Angular', 'Vue', 'Node.js', 'Express', 'Django', 'Flask', 'FastAPI', 'Spring', 'Tailwind', 'PyTorch', 'TensorFlow', 'Flutter', 'React Native'];
const stripBullet = (s: string) => s.replace(/^[\s•\-–—*▪●◦·]+/, '').trim();

/** Deterministic resume parser. Never invents values: anything not found stays empty. */
export function parseResumeText(text: string, fallbackName = '', fallbackEmail = ''): CandidateProfile {
  const p = emptyProfile(fallbackName, fallbackEmail);
  const sec = splitSections(text);
  const email = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0];
  const phone = text.match(/(\+?\d{1,3}[\s-]?)?(\(?\d{3,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,5}/)?.[0];
  if (email) p.email = email;
  if (phone && phone.replace(/\D/g, '').length >= 10) p.phone = phone.trim();
  const nameLine = (sec.header || []).find((l) => /^[A-Za-z][A-Za-z.'\- ]{2,40}$/.test(l) && l.split(/\s+/).length <= 4 && !/@|resume|curriculum/i.test(l));
  if (nameLine) p.name = nameLine.replace(/\s+/g, ' ');
  p.summary = (sec.summary || []).join(' ').slice(0, 500);

  const edu = (sec.education || []).join(' \n ');
  const degree = edu.match(/\b(B\.?\s?E\.?|B\.?\s?Tech|Bachelor[^,\n]{0,30}|BCA|B\.?\s?Sc|M\.?\s?Tech|M\.?\s?E\.?|MCA|M\.?\s?Sc|Master[^,\n]{0,30}|BBA|MBA)\b/i)?.[0];
  if (degree) p.education.degree = degree.replace(/\s+/g, ' ').trim();
  const branch = edu.match(/(Computer Science(?: (?:and|&) Engineering)?|Information Technology|Electronics(?: (?:and|&) Communication)?|Electrical[^,\n]{0,25}|Mechanical|Artificial Intelligence[^,\n]{0,25}|Data Science|Software Engineering|Cyber ?security)/i)?.[0];
  if (branch) p.education.branch = branch.trim();
  const college = (sec.education || []).find((l) => /(university|college|institute|school of|iit|nit|vit|srm)/i.test(l));
  if (college) p.education.college = stripBullet(college).slice(0, 120);
  const years = [...edu.matchAll(/\b(20[1-4]\d)\b/g)].map((m) => Number(m[1]));
  if (years.length) p.education.gradYear = Math.max(...years);
  const cgpa = (edu + ' ' + text).match(/(?:CGPA|GPA)[:\s-]*([0-9]\.[0-9]{1,2})(?:\s*\/\s*10)?/i)?.[1];
  if (cgpa) p.education.cgpa = cgpa;

  const skillText = (sec.skills || []).join(' ') + ' ' + text;
  p.skills = extractSkills(skillText);
  p.languages = p.skills.filter((s) => LANGS.includes(s));
  p.frameworks = p.skills.filter((s) => FRAMEWORKS.includes(s));

  // Projects: a non-bullet short line starts a project; following lines are its description.
  const projLines = sec.projects || [];
  let cur: { name: string; description: string } | null = null;
  for (const l of projLines) {
    const isBullet = /^[\s•\-–—*▪●◦·]/.test(l);
    if (!isBullet && l.length < 90) { if (cur) p.projects.push(cur); cur = { name: l.replace(/[|–—:].*$/, '').trim() || l, description: l }; }
    else if (cur) cur.description = `${cur.description} ${stripBullet(l)}`.trim();
    else cur = { name: stripBullet(l).slice(0, 60), description: stripBullet(l) };
  }
  if (cur) p.projects.push(cur);
  p.projects = p.projects.slice(0, 8).map((x) => ({ name: x.name.slice(0, 80), description: x.description.slice(0, 400) }));
  p.certifications = (sec.certifications || []).map(stripBullet).filter((l) => l.length > 3).slice(0, 12);
  p.experience = (sec.experience || []).map(stripBullet).filter((l) => l.length > 3).slice(0, 12);
  p.achievements = (sec.achievements || []).map(stripBullet).filter((l) => l.length > 3).slice(0, 12);
  return p;
}

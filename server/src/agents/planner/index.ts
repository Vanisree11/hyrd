import type { CandidateProfile, ParsedGoal } from '../../types.js';
import { ai } from '../../services/ai/index.js';

export interface PlanStep { key: string; label: string }
export const PLAN_STEPS: PlanStep[] = [
  { key: 'load_profile', label: 'Load candidate profile & resume' },
  { key: 'understand_goal', label: 'Understand goal and build execution plan' },
  { key: 'discover_sources', label: 'Discover connected job sources' },
  { key: 'search', label: 'Search sources for current listings' },
  { key: 'normalize', label: 'Normalize listings into a common schema' },
  { key: 'dedupe', label: 'Remove duplicate openings across sources' },
  { key: 'eligibility', label: 'Check eligibility against requirements' },
  { key: 'match', label: 'Score matches (transparent rule engine)' },
  { key: 'prepare', label: 'Prepare application packages for strong matches' },
  { key: 'approval', label: 'Queue applications for human approval' },
];

export async function createGoalPlan(goal: string, profile: CandidateProfile): Promise<ParsedGoal> {
  const parsed = await ai.createPlan(goal, profile);
  parsed.minMatch = Math.min(100, Math.max(0, parsed.minMatch || 60));
  return parsed;
}
export function describeGoal(g: ParsedGoal) {
  return {
    Role: g.roles.join(', ') || 'Any', Location: [...g.locations, g.remoteOk ? 'Remote' : ''].filter(Boolean).join(' / ') || 'Anywhere',
    Type: g.employmentTypes.join(', ') || 'Any', 'Minimum match': `${g.minMatch}%`, Action: g.action === 'prepare' ? 'Prepare applications' : 'Search & rank only',
    Approval: 'Required before any submission',
  };
}

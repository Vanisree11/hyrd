export interface Match { score: number; breakdown: Record<string, number>; matchedSkills: string[]; missingSkills: string[]; eligibility: string; eligibilityNotes: string[]; explanation?: string }
export interface Job {
  id: number; source: string; title: string; company: string; location: string; workMode: string; description: string; skills: string[]; experience: string | null; salary: string | null;
  employmentType: string; postedDate: string | null; applicationUrl: string; applicationMethod: string; alsoOn: string[]; isDemo: boolean; match: Match | null; application: { id: number; status: string } | null;
  applicationRequirements?: { method: string; notes: string } | null; sourceLabel?: string;
}
export interface Answer { id: number; question: string; answer: string; edited: number }
export interface Application { id: number; status: string; executionMethod: string | null; executionResult: string | null; humanActionRequired: string | null; updatedAt: string; job: Job; coverLetter: string; resume: { filename: string } | null; answers: Answer[] }
export interface Task { key: string; label: string; status: 'pending' | 'running' | 'done' | 'failed' | 'skipped' | 'waiting'; detail?: string; attempts?: number }
export interface Run { id: number; goal: string; parsedGoal: any; status: string; stats: any; error?: string; startedAt: string; finishedAt?: string; tasks: Task[]; connectorRuns: any[] }
export interface AgentEvent { id: number; runId: number | null; type: string; message: string; data: any; createdAt: string }
export interface Profile {
  name: string; email: string; phone: string; summary: string;
  education: { degree: string; branch: string; college: string; gradYear: number | null; cgpa: string };
  skills: string[]; languages: string[]; frameworks: string[]; projects: { name: string; description: string }[]; certifications: string[]; experience: string[]; achievements: string[];
  preferences: { roles: string[]; locations: string[]; workModes: string[]; employmentTypes: string[]; experienceYears: number; salaryPreference: string; other: string };
}
export interface Connector { source: string; label: string; kind: string; description: string; officialUrl: string; policy: string; enabled: boolean; status: string; message: string; hasCredentials: boolean }

export interface Project { name: string; description: string }
export interface CandidateProfile {
  name: string; email: string; phone: string; summary: string;
  education: { degree: string; branch: string; college: string; gradYear: number | null; cgpa: string };
  skills: string[]; languages: string[]; frameworks: string[];
  projects: Project[]; certifications: string[]; experience: string[]; achievements: string[];
  preferences: {
    roles: string[]; locations: string[]; workModes: string[]; employmentTypes: string[];
    experienceYears: number; salaryPreference: string; other: string;
  };
}
export const emptyProfile = (name = '', email = ''): CandidateProfile => ({
  name, email, phone: '', summary: '',
  education: { degree: '', branch: '', college: '', gradYear: null, cgpa: '' },
  skills: [], languages: [], frameworks: [], projects: [], certifications: [], experience: [], achievements: [],
  preferences: { roles: [], locations: [], workModes: [], employmentTypes: [], experienceYears: 0, salaryPreference: '', other: '' },
});
export interface ParsedGoal {
  roles: string[]; locations: string[]; remoteOk: boolean; employmentTypes: string[]; minMatch: number; action: 'search' | 'prepare'; keywords: string[]; raw: string;
}

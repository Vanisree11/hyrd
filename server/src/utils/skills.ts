// Canonical skill dictionary used for deterministic extraction from resumes and job descriptions.
const SKILLS: Record<string, string[]> = {
  Java: ['java'], JavaScript: ['javascript', 'js', 'ecmascript'], TypeScript: ['typescript'], Python: ['python'],
  'C++': ['c++', 'cpp'], C: ['c language', 'c programming'], 'C#': ['c#', 'csharp', '.net'], Go: ['golang', 'go lang'], Rust: ['rust'],
  Kotlin: ['kotlin'], Swift: ['swift'], PHP: ['php'], Ruby: ['ruby', 'rails'], SQL: ['sql', 'mysql', 'postgresql', 'postgres', 'sqlite', 'mssql'],
  NoSQL: ['nosql'], MongoDB: ['mongodb', 'mongo'], Redis: ['redis'], React: ['react', 'reactjs', 'react.js'], 'Next.js': ['next.js', 'nextjs'],
  Angular: ['angular'], Vue: ['vue', 'vue.js'], 'Node.js': ['node.js', 'nodejs', 'node'], Express: ['express', 'express.js'], Django: ['django'],
  Flask: ['flask'], FastAPI: ['fastapi'], Spring: ['spring', 'spring boot'], HTML: ['html', 'html5'], CSS: ['css', 'css3'], Tailwind: ['tailwind'],
  'REST APIs': ['rest', 'restful', 'rest api'], GraphQL: ['graphql'], Docker: ['docker'], Kubernetes: ['kubernetes', 'k8s'], AWS: ['aws', 'amazon web services'],
  Azure: ['azure'], GCP: ['gcp', 'google cloud'], Git: ['git', 'github'], 'CI/CD': ['ci/cd', 'jenkins', 'github actions'], Linux: ['linux'],
  'Machine Learning': ['machine learning', 'ml'], 'Deep Learning': ['deep learning', 'neural network'], 'Computer Vision': ['computer vision', 'opencv'],
  NLP: ['nlp', 'natural language processing'], LLMs: ['llm', 'llms', 'large language model', 'generative ai', 'genai'], PyTorch: ['pytorch'],
  TensorFlow: ['tensorflow', 'keras'], 'Scikit-learn': ['scikit-learn', 'sklearn'], Pandas: ['pandas'], NumPy: ['numpy'],
  'Data Structures': ['data structures', 'dsa', 'algorithms'], 'System Design': ['system design'], Firebase: ['firebase'], Supabase: ['supabase'],
  Figma: ['figma'], 'Data Analysis': ['data analysis', 'analytics'], Excel: ['excel'], Tableau: ['tableau'], 'Power BI': ['power bi', 'powerbi'],
  Android: ['android'], Flutter: ['flutter'], 'React Native': ['react native'], Selenium: ['selenium'], Testing: ['unit testing', 'jest', 'pytest', 'qa'],
  Agile: ['agile', 'scrum'], Spark: ['spark', 'pyspark'], Kafka: ['kafka'], Terraform: ['terraform'], DevOps: ['devops'],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.entries(SKILLS).map(([canon, aliases]) => ({
  canon,
  res: aliases.map((a) => new RegExp(`(^|[^a-z0-9+#.])${escapeRe(a)}(?![a-z0-9+#])`, 'i')),
}));

export function extractSkills(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const p of patterns) if (p.res.some((r) => r.test(text))) found.add(p.canon);
  return [...found];
}
export const normSkill = (s: string) => s.trim().toLowerCase();
export const canonicalSkill = (s: string): string => {
  const n = normSkill(s);
  for (const [canon, aliases] of Object.entries(SKILLS)) if (canon.toLowerCase() === n || aliases.includes(n)) return canon;
  return s.trim();
};
export const stripHtml = (h: string) => (h || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

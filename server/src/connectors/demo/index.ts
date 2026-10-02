import { BaseConnector } from '../base.js';
import type { ApplicationRequirements, NormalizedJob, SearchQuery } from '../types.js';
import { config } from '../../config.js';

/**
 * DEMO MODE ONLY (DEMO_MODE=true). Clearly labelled mock source so the full pipeline can be shown without live network.
 * It is never enabled in real mode and every job it returns is flagged isDemo and titled "[DEMO]".
 */
const T: Array<[string, string, string, string, string, string]> = [
  ['Software Engineering Intern', 'Acme Cloud', 'Bangalore, India', 'Hybrid', 'Internship', 'Build backend services in Java and Python with SQL databases. Currently pursuing B.E./B.Tech in Computer Science, batch of 2027 or 2028. React is a plus. Git, REST APIs, data structures.'],
  ['Full Stack Developer Intern', 'Orbit Labs', 'Remote, India', 'Remote', 'Internship', 'React, Node.js, TypeScript, MongoDB. Students graduating 2027-2028 welcome. Docker and AWS a plus.'],
  ['AI/ML Intern', 'Neuron Works', 'Chennai, India', 'Onsite', 'Internship', 'Machine learning, Python, PyTorch, computer vision and NLP. Pursuing CS/IT degree. TensorFlow, pandas, numpy.'],
  ['Backend Engineer', 'Ledgerly', 'Bangalore, India', 'Hybrid', 'Full-time', '3+ years experience building Java Spring services, Kafka, Kubernetes, AWS, SQL.'],
  ['Frontend Developer Intern', 'PixelForge', 'Remote', 'Remote', 'Internship', 'React, TypeScript, Tailwind CSS, HTML, CSS, Figma. Batch 2028.'],
  ['Data Analyst Intern', 'Insight Metrics', 'Hyderabad, India', 'Onsite', 'Internship', 'SQL, Excel, Python, Tableau, Power BI and data analysis. Final-year students only (batch 2026).'],
];
export class DemoConnector extends BaseConnector {
  info = { source: 'demo', label: 'Demo Source', kind: 'demo' as const, description: 'DEMO MODE: mock listings to demonstrate the pipeline. Not real jobs.', officialUrl: 'https://example.com', policy: 'Mock data. Disabled unless DEMO_MODE=true.' };
  async checkStatus() { return config.demoMode ? { status: 'connected' as const, message: 'DEMO MODE source (mock data)' } : { status: 'unsupported' as const, message: 'Set DEMO_MODE=true to enable' }; }
  async searchJobs(_q: SearchQuery): Promise<NormalizedJob[]> {
    return T.map(([title, company, location, workMode, employmentType, description], i) => this.finish({
      source: 'demo', sourceJobId: `demo-${i}`, title: `[DEMO] ${title}`, company, location, workMode: workMode as any, description, experience: null, salary: null,
      employmentType: employmentType as any, postedDate: new Date(Date.now() - i * 86400000).toISOString(), applicationUrl: `https://example.com/demo/${i}`, applicationMethod: 'API', sourceMetadata: { demo: true }, isDemo: true,
    }));
  }
  getApplicationRequirements(): ApplicationRequirements { return { method: 'API', requiresLogin: false, resumeRequired: true, fields: ['resume', 'cover_letter'], notes: 'DEMO: mock submission API' }; }
}

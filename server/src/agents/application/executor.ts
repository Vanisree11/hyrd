import fs from 'node:fs';
import { db } from '../../db/index.js';
import { config } from '../../config.js';
import { emit } from '../../utils/events.js';
import { getConnector } from '../../connectors/manager.js';
import { getJob, getProfile } from '../../services/store.js';
import { answersOf, coverOf, getApplication, setStatus } from '../../services/applications.js';
import { closeSession, getSession, openSession, playwrightAvailable } from '../../browser/browserManager.js';
import { detectHumanBarrier, openPage } from '../../browser/pageController.js';
import { detectForm } from '../../browser/formDetector.js';
import { fillForm } from '../../browser/formFiller.js';
import { clickSubmit, verifySubmission } from '../../browser/applicationVerifier.js';

export type ExecMethod = 'API' | 'MCP' | 'Browser' | 'External Redirect';
export interface ExecOutcome { method: ExecMethod; status: string; message: string; humanAction?: string | null; verified?: boolean; applicationUrl?: string }

/** Picks the most reliable *legitimate* method for the source; falls back down the ladder on failure. */
export async function chooseMethod(appId: number, userId: number): Promise<ExecMethod> {
  const a = getApplication(userId, appId)!;
  const job = a.job!;
  const req = getConnector(job.source)?.getApplicationRequirements(job as any);
  if (req?.method === 'API' && job.isDemo) return 'API';
  const ats = (job.sourceMetadata as any)?.ats;
  if ((ats === 'greenhouse' || ats === 'lever') && (await playwrightAvailable()).ok) return 'Browser';
  return 'External Redirect';
}

export class ApplicationExecutor {
  constructor(private userId: number) {}

  /** execute(): runs only for human-approved applications. `confirmSubmit` performs the final click after a browser fill. */
  async execute(appId: number, opts: { confirmSubmit?: boolean } = {}): Promise<ExecOutcome> {
    const a = getApplication(this.userId, appId);
    if (!a) throw Object.assign(new Error('Application not found'), { status: 404 });
    const paused = a.status === 'Applying' && opts.confirmSubmit && !!getSession(appId);
    if (a.status !== 'Approved' && !paused) {
      throw Object.assign(new Error(a.status === 'Applying' ? 'Already in progress — complete the pending human step' : `Application must be approved first (current: ${a.status})`), { status: 409 });
    }
    const job = a.job!;
    emit(this.userId, null, 'APPLICATION_STARTED', `Applying: ${job.title} @ ${job.company}`, { applicationId: appId });
    let method: ExecMethod = paused ? 'Browser' : await chooseMethod(appId, this.userId);
    try {
      if (method === 'API') return await this.viaApi(appId, job);
      if (method === 'Browser') return await this.viaBrowser(appId, job, !!paused);
      return this.viaRedirect(appId, job);
    } catch (e: any) {
      return await this.recover(appId, job, method, e);
    }
  }

  private async viaApi(appId: number, job: any): Promise<ExecOutcome> {
    // DEMO connector only: a mock submission API. Marked clearly so it is never mistaken for a real application.
    setStatus(appId, 'Applying', 'Submitting via API (DEMO mock endpoint)', { method: 'API' });
    const receipt = `DEMO-${Date.now().toString(36).toUpperCase()}`;
    setStatus(appId, 'Submitted', `DEMO submission accepted by mock API (receipt ${receipt}). No real application was sent.`, { method: 'API', result: receipt });
    const v = this.verify(appId, { evidence: `Mock API returned receipt ${receipt}`, verified: true });
    return { method: 'API', status: 'Submitted', message: 'DEMO submission recorded (mock API). No real application was sent.', verified: v.verified };
  }

  private viaRedirect(appId: number, job: any): ExecOutcome {
    const url = getConnector(job.source)?.getApplicationUrl(job) || job.applicationUrl;
    const human = `Open the official page and complete the final step: ${url}`;
    setStatus(appId, 'Applying', 'Prepared package ready; official application page must be completed by you (external site)', { method: 'External Redirect', human });
    emit(this.userId, null, 'HUMAN_ACTION_REQUIRED', `Complete application on ${job.source}: ${job.title} @ ${job.company}`, { applicationId: appId, url });
    return { method: 'External Redirect', status: 'Applying', message: 'HYRD does not submit on this source. Use the official page, then confirm here.', humanAction: human, applicationUrl: url };
  }

  private async viaBrowser(appId: number, job: any, confirm: boolean): Promise<ExecOutcome> {
    if (confirm) {
      const page = getSession(appId)!;
      setStatus(appId, 'Applying', 'Human confirmed final submit; submitting form', { method: 'Browser' });
      const clicked = await clickSubmit(page);
      if (!clicked) return this.viaRedirectFallback(appId, job, 'Could not find a submit button');
      const v = await verifySubmission(page);
      await closeSession(appId);
      return this.finishVerified(appId, 'Browser', v);
    }
    const profile = getProfile(this.userId);
    const resume: any = db.prepare(`SELECT r.stored_path FROM application_documents d JOIN resumes r ON r.id=d.resume_id WHERE d.application_id=? AND d.kind='resume'`).get(appId);
    const resumePath = resume?.stored_path && fs.existsSync(resume.stored_path) ? resume.stored_path : null;
    setStatus(appId, 'Applying', 'Opening the application page in a browser', { method: 'Browser' });
    const page = await openSession(appId);
    await openPage(page, job.applicationUrl);
    const barrier = await detectHumanBarrier(page);
    if (barrier) { await closeSession(appId); return this.viaRedirectFallback(appId, job, `Human action required: ${barrier}`); }
    const fields = await detectForm(page);
    if (!fields.length) { await closeSession(appId); return this.viaRedirectFallback(appId, job, 'No application form found on the page'); }
    const report = await fillForm(page, fields, { profile, coverLetter: coverOf(appId), answers: answersOf(appId), resumePath, applicationUrl: job.applicationUrl });
    if (report.unexpected.length) {
      const names = report.unexpected.map((f) => f.label || f.name).join('; ');
      const human = `Unexpected required fields need your input: ${names}`;
      await closeSession(appId);
      setStatus(appId, 'Applying', `Filled ${report.filled.length} fields; paused on unexpected fields (${names})`, { method: 'Browser', human: `${human}. Open ${job.applicationUrl} to finish.` });
      emit(this.userId, null, 'HUMAN_ACTION_REQUIRED', human, { applicationId: appId, url: job.applicationUrl });
      return { method: 'Browser', status: 'Applying', message: human, humanAction: human, applicationUrl: job.applicationUrl };
    }
    const human = 'Form filled with your approved content. Confirm to submit (final, irreversible step).';
    setStatus(appId, 'Applying', `Filled ${report.filled.length} fields${report.resumeUploaded ? ' + resume' : ''}; waiting for final submit confirmation`, { method: 'Browser', human });
    emit(this.userId, null, 'HUMAN_ACTION_REQUIRED', human, { applicationId: appId, filled: report.filled });
    return { method: 'Browser', status: 'Applying', message: human, humanAction: human };
  }

  private viaRedirectFallback(appId: number, job: any, why: string): ExecOutcome {
    const out = this.viaRedirect(appId, job);
    db.prepare('UPDATE applications SET human_action_required=? WHERE id=?').run(`${why}. ${out.humanAction}`, appId);
    return { ...out, message: why, humanAction: `${why}. ${out.humanAction}` };
  }

  /** verify(): record what evidence we have. Only evidence-backed results become "Submitted". */
  verify(appId: number, v: { verified: boolean; evidence: string }) {
    emit(this.userId, null, v.verified ? 'APPLICATION_VERIFIED' : 'INFO', v.verified ? `Submission verified: ${v.evidence}` : `Could not verify: ${v.evidence}`, { applicationId: appId });
    db.prepare(`INSERT INTO application_history (application_id,status,message) VALUES (?,?,?)`).run(appId, v.verified ? 'Submitted' : 'Applying', v.verified ? `Submission verified — ${v.evidence}` : `Verification inconclusive — ${v.evidence}`);
    return v;
  }
  private finishVerified(appId: number, method: ExecMethod, v: { verified: boolean; evidence: string }): ExecOutcome {
    if (v.verified) {
      setStatus(appId, 'Submitted', 'Application submitted via browser', { method, result: v.evidence });
      this.verify(appId, v);
      emit(this.userId, null, 'APPLICATION_SUBMITTED', 'Application submitted', { applicationId: appId });
      return { method, status: 'Submitted', message: 'Submitted and verified', verified: true };
    }
    const human = `Submission could not be verified (${v.evidence}). Please check the company's page.`;
    setStatus(appId, 'Applying', human, { method, human });
    return { method, status: 'Applying', message: human, humanAction: human, verified: false };
  }

  /** recover(): never leaves the app in limbo — degrade to a human-completed redirect, or mark Failed if nothing is possible. */
  async recover(appId: number, job: any, method: ExecMethod, e: Error): Promise<ExecOutcome> {
    await closeSession(appId).catch(() => {});
    emit(this.userId, null, 'INFO', `${method} execution failed (${e.message}); falling back to guided external application`, { applicationId: appId });
    if (job.applicationUrl) return this.viaRedirectFallback(appId, job, `${method} automation failed: ${e.message}`);
    setStatus(appId, 'Failed', `Execution failed: ${e.message}`, { method, result: e.message });
    return { method, status: 'Failed', message: e.message };
  }

  /** Human attests they completed the external step (HYRD cannot observe third-party sites). */
  markSubmitted(appId: number) {
    const a: any = db.prepare('SELECT status FROM applications WHERE id=? AND user_id=?').get(appId, this.userId);
    if (!a) throw Object.assign(new Error('Application not found'), { status: 404 });
    if (a.status !== 'Applying') throw Object.assign(new Error(`Nothing pending to confirm (status: ${a.status})`), { status: 409 });
    setStatus(appId, 'Submitted', 'You confirmed the application was submitted on the official site (user-attested)', { result: 'user-attested' });
    this.verify(appId, { verified: true, evidence: 'Confirmed by you (HYRD cannot observe this external site)' });
    emit(this.userId, null, 'APPLICATION_SUBMITTED', 'Application marked as submitted by you', { applicationId: appId });
  }
}

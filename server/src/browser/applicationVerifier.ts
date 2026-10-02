/** Verifies the post-submit state from page evidence; returns what it saw instead of assuming success. */
export async function verifySubmission(page: any): Promise<{ verified: boolean; evidence: string }> {
  await page.waitForTimeout(2500);
  const text: string = ((await page.evaluate(() => document.body?.innerText || '')) as string).toLowerCase();
  const hit = text.match(/(thank you for (applying|your application)|application (has been )?(submitted|received)|we('| ha)ve received your application|successfully (applied|submitted))/);
  if (hit) return { verified: true, evidence: `Confirmation text found: "${hit[0]}"` };
  const err = text.match(/(this field is required|please (fill|enter|complete)|invalid|error)/);
  return { verified: false, evidence: err ? `Page shows a validation message ("${err[0]}")` : 'No confirmation text found on the page' };
}
export async function clickSubmit(page: any): Promise<boolean> {
  const btn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Submit application"), button:has-text("Submit")').first();
  if (!(await btn.count())) return false;
  await btn.click(); return true;
}

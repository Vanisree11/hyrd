/** Navigation + detection of protections we must never bypass. */
export async function openPage(page: any, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
}
export async function detectHumanBarrier(page: any): Promise<string | null> {
  const html: string = (await page.content()).toLowerCase();
  const url: string = page.url().toLowerCase();
  if (/captcha|recaptcha|hcaptcha|cf-challenge|verify you are human|are you a robot/.test(html)) return 'CAPTCHA or bot-check detected';
  if (/\/(login|signin|sign-in|auth)\b|accounts\.google\.com/.test(url)) return 'Login required';
  if (/(one-time|verification) code|two-factor|2fa|mfa/.test(html) && /<input[^>]*(password|otp|code)/.test(html)) return 'MFA / verification code required';
  return null;
}

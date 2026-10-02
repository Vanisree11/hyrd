export interface DetectedField {
  index: number; tag: string; type: string; label: string; name: string; required: boolean; selector: string; options?: string[];
}
/** Extracts visible form controls with their human labels (runs in the page). */
export async function detectForm(page: any): Promise<DetectedField[]> {
  return page.evaluate(() => {
    const out: any[] = [];
    const els = Array.from(document.querySelectorAll('input, textarea, select')) as HTMLElement[];
    els.forEach((el: any, i) => {
      const type = (el.getAttribute('type') || el.tagName).toLowerCase();
      if (['hidden', 'submit', 'button', 'image', 'reset'].includes(type)) return;
      const rect = el.getBoundingClientRect();
      if (type !== 'file' && (rect.width === 0 || rect.height === 0)) return;
      let label = '';
      if (el.id) label = (document.querySelector(`label[for="${CSS.escape(el.id)}"]`) as HTMLElement)?.innerText || '';
      if (!label) label = el.closest('label')?.innerText || '';
      if (!label) label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '';
      el.setAttribute('data-hyrd-idx', String(i));
      out.push({
        index: i, tag: el.tagName.toLowerCase(), type, label: label.replace(/\s+/g, ' ').trim().slice(0, 140), name: el.getAttribute('name') || '',
        required: el.required || el.getAttribute('aria-required') === 'true' || /\*/.test(label), selector: `[data-hyrd-idx="${i}"]`,
        options: el.tagName === 'SELECT' ? Array.from(el.options).map((o: any) => o.text).slice(0, 30) : undefined,
      });
    });
    return out;
  });
}

import fs from 'node:fs';
import path from 'node:path';

const i18nBase = path.join(import.meta.dirname, '..', 'docs', 'i18n');
const langs = fs.readdirSync(i18nBase);

const ROOT = '../../../';

for (const lang of langs) {
  const faqPath = path.join(i18nBase, lang, 'FAQ.md');
  if (!fs.existsSync(faqPath)) continue;
  let c = fs.readFileSync(faqPath, 'utf-8');

  // Fix all plain root-relative links – anything in (...) that is just a filename with no leading ../
  // Target: (SECURITY.md) → (../../../SECURITY.md) and (CONTRIBUTING.md) → (../../../CONTRIBUTING.md)
  c = c.replace(/\(SECURITY\.md\)/g, '(' + ROOT + 'SECURITY.md)');
  c = c.replace(/\(CONTRIBUTING\.md\)/g, '(' + ROOT + 'CONTRIBUTING.md)');
  c = c.replace(/\(CHANGELOG\.md\)/g, '(' + ROOT + 'CHANGELOG.md)');
  c = c.replace(/\(CODE_OF_CONDUCT\.md\)/g, '(' + ROOT + 'CODE_OF_CONDUCT.md)');
  c = c.replace(/\(LICENSE\)/g, '(' + ROOT + 'LICENSE)');

  fs.writeFileSync(faqPath, c, 'utf-8');
  console.log('Fixed ' + lang);
}
console.log('All FAQ files fixed');

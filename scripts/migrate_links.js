import fs from 'node:fs';
import path from 'node:path';

const base = path.join(import.meta.dirname, '..');

// 1. Update root README.md
const rootReadmePath = path.join(base, 'README.md');
let rootReadme = fs.readFileSync(rootReadmePath, 'utf-8');
rootReadme = rootReadme.replace(/href="README\.([^.]+)\.md"/g, 'href="docs/i18n/$1/README.md"');
fs.writeFileSync(rootReadmePath, rootReadme, 'utf-8');
console.log('Updated root README.md links');

// 2. Update translated READMEs
const i18nBase = path.join(base, 'docs/i18n');
const langs = fs.readdirSync(i18nBase);

for (const lang of langs) {
  const readmePath = path.join(i18nBase, lang, 'README.md');
  if (fs.existsSync(readmePath)) {
    let content = fs.readFileSync(readmePath, 'utf-8');

    // Language selector replacements
    content = content.replace(/href="README\.md"/g, 'href="../../../README.md"')
                     .replace(/href="README\.([^.]+)\.md"/g, 'href="../$1/README.md"');

    // Root-relative files
    content = content.replace(/\(OVERVIEW\.md\)/g, '(../../../OVERVIEW.md)')
                     .replace(/\(FAQ\.md\)/g, '(FAQ.md)')
                     .replace(/\(SPECIFICATION\.md\)/g, '(../../../SPECIFICATION.md)')
                     .replace(/\(CONTRIBUTING\.md\)/g, '(../../../CONTRIBUTING.md)')
                     .replace(/\(LICENSE\)/g, '(../../../LICENSE)')
                     .replace(/\(NOTICE\)/g, '(../../../NOTICE)')
                     .replace(/\(\.nvmrc\)/g, '(../../../.nvmrc)')
                     .replace(/\(CONTRIBUTING\.md#running-the-suite\)/g, '(../../../CONTRIBUTING.md#running-the-suite)')
                     .replace(/\(CHANGELOG\.md\)/g, '(../../../CHANGELOG.md)')
                     .replace(/\(SECURITY\.md\)/g, '(../../../SECURITY.md)')
                     .replace(/\(CODE_OF_CONDUCT\.md\)/g, '(../../../CODE_OF_CONDUCT.md)')
                     .replace(/\(examples\/([^)]+)\)/g, '(../../../examples/$1)')
                     .replace(/src="assets\/([^"]+)"/g, 'src="../../../assets/$1"');

    // Docs-relative files
    content = content.replace(/\(docs\/installation\.md\)/g, '(installation.md)')
                     .replace(/\(docs\/quickstart\.md\)/g, '(quickstart.md)')
                     .replace(/\(docs\/([^)]+)\)/g, '(../../$1)');

    fs.writeFileSync(readmePath, content, 'utf-8');
  }
}
console.log('Updated translated README.md files');

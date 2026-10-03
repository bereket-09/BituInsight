const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');

/**
 * Load an .xlsx into ExcelJS, tolerating package relationships written as
 * absolute part names.
 *
 * OOXML lets a .rels file point at its target either relative to the source part
 * ("../comments1.xml") or from the package root ("/xl/comments1.xml"). Excel
 * accepts both. ExcelJS only resolves the relative form: it looks comments and
 * VML drawings up by the literal Target string, misses, and throws "Cannot read
 * properties of undefined (reading 'comments')". Some CMG exports write every
 * target absolute, so any sheet carrying a cell comment fails to load.
 *
 * Rewriting absolute targets to relative ones before ExcelJS sees the package
 * changes nothing about the content, and files that are already relative pass
 * through untouched.
 */
async function normalizeRelationshipTargets(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const relsFiles = Object.keys(zip.files).filter((name) => name.endsWith('.rels'));
  let changed = false;

  for (const relsPath of relsFiles) {
    const xml = await zip.file(relsPath).async('string');
    if (!xml.includes('Target="/')) continue;

    // xl/worksheets/_rels/sheet5.xml.rels describes xl/worksheets/sheet5.xml,
    // so its relative targets resolve against xl/worksheets.
    const sourceDir = path.posix.dirname(path.posix.dirname(relsPath));
    const rewritten = xml.replace(/<Relationship\b[^>]*>/g, (element) => {
      // External links (TargetMode="External") are URLs, not part names.
      if (/TargetMode="External"/.test(element)) return element;
      return element.replace(/\bTarget="\/([^"]*)"/, (_m, target) => {
        const relative = sourceDir === '.' ? target : path.posix.relative(sourceDir, target);
        return `Target="${relative}"`;
      });
    });

    if (rewritten !== xml) {
      zip.file(relsPath, rewritten);
      changed = true;
    }
  }

  if (!changed) return buffer;
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function loadWorkbook(filePath) {
  const buffer = await normalizeRelationshipTargets(await fs.promises.readFile(filePath));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

module.exports = { loadWorkbook, normalizeRelationshipTargets };

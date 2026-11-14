import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const registry = 'components/Icon.tsx';
// Exact SVG hosts, not directory-wide exemptions. These draw data/content.
const svgContent = {
  'gwira/activity/WorkActivity.tsx': 'work-progress__data-chart',
  'gwira/timeline/TimelineView.tsx': 'gwira-timeline__links',
  'gwira/doats/ui/DoatAvatar.tsx': 'viewBox="0 0 100 90"',
};
const family = /^(?:lucide(?:-react)?|@lucide\/|@radix-ui\/react-icons|@heroicons\/|react-icons(?:\/|$)|@phosphor-icons\/|@tabler\/icons|iconamoon|@iconify\/)/;

export function inspectIconSource(source, file) {
  const violations = [];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const report = (node, reason) => violations.push({ file, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1, reason });
  function checkModule(node, value) {
    if (file !== registry && family.test(value)) report(node, 'Import icon families only through components/Icon.tsx');
    if (/(?:^|\/)(?:NavIcons|Icons)(?:\.[cm]?[jt]sx?)?$/.test(value)) report(node, 'Retired icon module');
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) checkModule(node, node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === 'require') && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) checkModule(node, node.arguments[0].text);
    if (ts.isCallExpression(node) && /^(?:React\.)?createElement$/.test(node.expression.getText(ast)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'svg' && file !== registry) report(node, 'Unregistered UI SVG');
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (node.tagName.getText(ast) === 'svg') {
        const expected = svgContent[file];
        if (file !== registry && !(expected && node.getText(ast).includes(expected))) report(node, 'Unregistered UI SVG');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return violations;
}

export function checkIcons(root = fileURLToPath(new URL('../src/renderer/', import.meta.url))) {
  const violations = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) violations.push(...inspectIconSource(fs.readFileSync(full, 'utf8'), path.relative(root, full).split(path.sep).join('/')));
    }
  }
  walk(root);
  return violations;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = checkIcons();
  console.log(JSON.stringify({ violations }, null, 2));
  if (violations.length) process.exitCode = 1;
}

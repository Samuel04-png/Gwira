import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const rendererRoot = fileURLToPath(new URL('../src/renderer/', import.meta.url));
const paintPattern = /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\([^)]*\)/gi;

// These exact values are existing serialized appearance data, not interface
// paint. Keep them stable: replacing them with CSS variables changes saved data
// and standalone SVG output. Counts prevent adding new uses under an exemption.
export const appearanceDataExceptions = {
  'gwira/doats/ui/avatarModel.ts': ['#61c7d7', '#b0eff4', '#8874d7', '#d4cafc', '#5ea989', '#caefd5', '#cd9071', '#f5d5aa', '#4f91d4', '#b9dfff'],
  'gwira/doats/visual/avatar.ts': ['#65d7e7', '#244a64', '#d9fbff', '#102335', '#a99af7', '#40396e', '#f0edff', '#211c43', '#74d5b2', '#26564c', '#e2fff4', '#11342d', '#e8b76c', '#664b2b', '#fff3d8', '#352313'],
  'gwira/doats/ui/DoatCreationWizard.tsx': ['#61c7d7', '#b0eff4'],
  'gwira/graph/DevNodeGallery.tsx': ['#75899b', '#b7c5c8'],
  // Bundled third-party artwork retains its original colors. Exact counted
  // exceptions avoid exempting authored controls or future SVGs.
  "auth/google.svg": ["#4285F4", "#34A853", "#FBBC05", "#EA4335"],
  "gwira/integrations/ui/logos/crm.svg": ["#45535e", "#f8761f"],
  "gwira/integrations/ui/logos/customer-support.svg": ["#03363d"],
  "gwira/integrations/ui/logos/discord.svg": ["#5865f2"],
  "gwira/integrations/ui/logos/ecommerce.svg": ["#95bf46", "#5e8e3e", "#fff"],
  "gwira/integrations/ui/logos/email.svg": ["#60d673", "#42c868", "#0ebc5f", "#00a9bb", "#3c90ff", "#3186ff", "#ff63a0", "#fc413d", "#fc413d", "#fc413d", "#fc5c30", "#feb10c", "#fec700", "#ffdb0f", "#fc413d"],
  "gwira/integrations/ui/logos/github.svg": ["#161614"],
  "gwira/integrations/ui/logos/gitlab.svg": ["#e24329", "#fc6d26", "#fca326", "#fc6d26"],
  "gwira/integrations/ui/logos/google-calendar.svg": ["#4fa0ff", "#3186ff", "#a9a8ff", "#3c90ff", "#3c90ff", "#3186ff", "#bbe2ff", "#3c90ff", "#fff"],
  "gwira/integrations/ui/logos/google-drive.svg": ["#ffe921", "#fec700", "#a9a8ff", "#6d97ff", "#3186ff", "#0ebc5f", "#78c9ff", "#fff"],
  "gwira/integrations/ui/logos/microsoft-365.svg": ["#706d6e", "#f1511b", "#80cc28", "#00adef", "#fbbc09"],
  "gwira/integrations/ui/logos/mobile-money.svg": ["#27346a", "#27346a", "#2790c3", "#1f264f"],
  "gwira/integrations/ui/logos/payment-service-providers.svg": ["#635bff"],
  "gwira/integrations/ui/logos/slack.svg": ["#e01e5a", "#36c5f0", "#2eb67d", "#ecb22e"],
  "gwira/integrations/ui/logos/whatsapp-business.svg": ["#1faf38", "#60d669", "#f9f9f9", "#fff", "#fff"]
};

/** Find literal paints without mistaking CSS IDs or TS regex literals for paint. */
export function findRawPaints(source, fileName) {
  const hits = [];
  const scan = (text, offset) => {
    for (const match of text.matchAll(paintPattern)) {
      hits.push({ value: match[0], line: source.slice(0, offset + match.index).split('\n').length });
    }
  };
  if (fileName.endsWith('.css')) {
    // Mask comments while retaining positions; scan declaration values only.
    const clean = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
    const declarations = /(?:^|[;{])\s*(?:--[\w-]+|[a-z][\w-]*)\s*:\s*([^;{}]+)/gi;
    for (const d of clean.matchAll(declarations)) {
      const offset = d.index + d[0].indexOf(':') + 1;
      scan(clean.slice(offset, d.index + d[0].length), offset);
    }
    return hits;
  }
  const kind = /\.[jt]sx$/.test(fileName) ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(fileName) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  function visit(node) {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      scan(node.text, node.getStart(tree));
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return hits;
}

export function checkRendererPaints(root = rendererRoot) {
  const violations = [];
  const exceptionsUsed = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(css|[cm]?[jt]sx?|svg)$/.test(entry.name)) continue;
      const relative = path.relative(root, full).split(path.sep).join('/');
      if (relative === 'tokens.css') continue;
      // SVG image assets are content, not UI control declarations. They are
      // deliberately still scanned when authored under the renderer.
      const source = fs.readFileSync(full, 'utf8');
      const remaining = [...(appearanceDataExceptions[relative] ?? [])];
      const hits = entry.name.endsWith('.svg')
        ? [...source.matchAll(paintPattern)].map((m) => ({ value: m[0], line: source.slice(0, m.index).split('\n').length }))
        : findRawPaints(source, relative);
      for (const hit of hits) {
        const allowed = remaining.indexOf(hit.value);
        if (allowed >= 0) { remaining.splice(allowed, 1); exceptionsUsed.push({ file: relative, ...hit }); }
        else violations.push({ file: relative, ...hit });
      }
    }
  }
  walk(root);
  return { violations, exceptionsUsed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkRendererPaints();
  console.log(JSON.stringify(result, null, 2));
  if (result.violations.length) process.exitCode = 1;
}

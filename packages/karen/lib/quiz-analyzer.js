import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const JS_LIKE_EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/i;
const CONFIG_FILE_PATTERN = /(^|\/)(package\.json|tsconfig\.json|jsconfig\.json|vite\.config\.[cm]?[jt]s|eslint\.config\.[cm]?[jt]s|next\.config\.[cm]?[jt]s|tailwind\.config\.[cm]?[jt]s|convex\/schema\.ts|convex\/http\.ts|dockerfile|compose\.ya?ml|\.env\.example)$/i;
const TEST_FILE_PATTERN = /(^|[/.])(?:__tests__|test|spec|tests|specs)([/.]|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/i;
const CALL_IGNORE = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'function',
  'return',
  'typeof',
  'sizeof',
  'new',
  'class',
]);

export const isTestFile = (filePath) => TEST_FILE_PATTERN.test(filePath || '');
export const isConfigFile = (filePath) => CONFIG_FILE_PATTERN.test(filePath || '');
export const isJavaScriptLikeFile = (filePath) => JS_LIKE_EXTENSIONS.test(filePath || '');

export const extractSymbols = (lineText) => {
  const symbols = [];
  const patterns = [
    /\b(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|enum|def|struct|trait)\s+([A-Za-z_$][\w$-]*)/g,
    /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$-]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
    /\b([A-Za-z_$][\w$-]*)\s*[:=]\s*(?:async\s*)?\([^)]*\)\s*=>/g,
    /\bfunc\s+(?:\([^)]+\)\s*)?([A-Za-z_$][\w$-]*)\s*\(/g,
    /\bfn\s+([A-Za-z_$][\w$-]*)\s*\(/g,
  ];

  for (const pattern of patterns) {
    for (const match of lineText.matchAll(pattern)) {
      if (match[1]) symbols.push(match[1]);
    }
  }
  return symbols;
};

const sourceKindForFile = (filePath) => {
  if (/\.tsx$/i.test(filePath)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(filePath)) return ts.ScriptKind.JSX;
  if (/\.ts$/i.test(filePath) || /\.mts$/i.test(filePath) || /\.cts$/i.test(filePath)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
};

const lineNumberForPosition = (source, position) => source.getLineAndCharacterOfPosition(position).line + 1;

const nodeName = (node) => {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  if (node.name && ts.isStringLiteral(node.name)) return node.name.text;
  return null;
};

const hasExportModifier = (node) => Boolean(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export);

const changedLineSetForFile = (file) => new Set([
  ...(file.addedLineNumbers || []),
  ...(file.removedLineNumbers || []),
]);

const nodeTouchesChangedLines = (source, node, changedLines) => {
  if (!changedLines || changedLines.size === 0) return true;
  const start = lineNumberForPosition(source, node.getStart(source));
  const end = lineNumberForPosition(source, node.getEnd());
  for (let lineNumber = start; lineNumber <= end; lineNumber += 1) {
    if (changedLines.has(lineNumber)) return true;
  }
  return false;
};

const addUnique = (array, item, key = (value) => value) => {
  if (!item) return;
  const itemKey = key(item);
  if (!itemKey) return;
  if (!array.some((existing) => key(existing) === itemKey)) array.push(item);
};

const addEvidence = (impact, key, value, evidence) => {
  if (!value) return;
  impact[key].add(value);
  if (!impact.evidence.has(value)) impact.evidence.set(value, evidence);
};

const addDetailEvidence = (impact, value, evidence) => {
  if (!value || !evidence) return;
  if (!impact.evidence.has(value)) impact.evidence.set(value, evidence);
};

const isSafePathInside = (cwd, filePath) => {
  const root = path.resolve(cwd);
  const absolutePath = path.resolve(root, filePath);
  return absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`);
};

const normalizeImportSpecifiers = (node) => {
  const clause = node.importClause;
  if (!clause) return [];
  const specifiers = [];
  if (clause.name) specifiers.push(clause.name.text);
  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
    specifiers.push(`* as ${clause.namedBindings.name.text}`);
  }
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    for (const element of clause.namedBindings.elements) {
      specifiers.push(element.propertyName ? `${element.propertyName.text} as ${element.name.text}` : element.name.text);
    }
  }
  return specifiers;
};

const expressionName = (expression) => {
  if (ts.isIdentifier(expression)) return expression.text;
  if (expression.kind === ts.SyntaxKind.ThisKeyword) return 'this';
  if (expression.kind === ts.SyntaxKind.SuperKeyword) return 'super';
  if (ts.isPropertyAccessExpression(expression)) {
    const parent = expressionName(expression.expression);
    return parent ? `${parent}.${expression.name.text}` : expression.name.text;
  }
  if (ts.isElementAccessExpression(expression)) {
    const parent = expressionName(expression.expression);
    if (!parent) return '';
    if (expression.argumentExpression && ts.isStringLiteralLike(expression.argumentExpression)) {
      return `${parent}.${expression.argumentExpression.text}`;
    }
    return parent;
  }
  return '';
};

const exportNamesFromDeclaration = (node) => {
  if (!ts.isExportDeclaration(node) || !node.exportClause || !ts.isNamedExports(node.exportClause)) return [];
  return node.exportClause.elements.map((element) => (
    element.propertyName ? `${element.propertyName.text} as ${element.name.text}` : element.name.text
  ));
};

const createImpactBuckets = () => ({
  exports: new Set(),
  functions: new Set(),
  imports: new Set(),
  calls: new Set(),
  evidence: new Map(),
  exportDetails: [],
  changedFunctionDetails: [],
  importDetails: [],
  callSiteDetails: [],
});

const pushFunctionDetail = (impact, detail) => {
  addEvidence(impact, 'functions', detail.name, detail.evidence);
  if (detail.exported) addEvidence(impact, 'exports', detail.name, detail.evidence);
  addUnique(impact.changedFunctionDetails, detail, (item) => `${item.file}:${item.line}:${item.name}:${item.kind}`);
  if (detail.exported) {
    addUnique(impact.exportDetails, {
      name: detail.name,
      kind: detail.kind,
      file: detail.file,
      line: detail.line,
      evidence: detail.evidence,
    }, (item) => `${item.file}:${item.line}:${item.name}`);
  }
};

const pushImportDetail = (impact, detail) => {
  addEvidence(impact, 'imports', detail.module, detail.evidence);
  addUnique(impact.importDetails, detail, (item) => `${item.file}:${item.line}:${item.module}:${item.kind}`);
};

const pushCallDetail = (impact, detail) => {
  if (!detail.name || CALL_IGNORE.has(detail.name)) return;
  addEvidence(impact, 'calls', detail.name, detail.evidence);
  addUnique(impact.callSiteDetails, detail, (item) => `${item.file}:${item.line}:${item.name}`);
};

const analyzeJavaScriptFile = ({ cwd, file }) => {
  if (!cwd || !isJavaScriptLikeFile(file.path) || !isSafePathInside(cwd, file.path)) return null;
  let sourceText = '';
  try {
    sourceText = fs.readFileSync(path.resolve(cwd, file.path), 'utf8');
  } catch {
    return null;
  }

  const source = ts.createSourceFile(file.path, sourceText, ts.ScriptTarget.Latest, true, sourceKindForFile(file.path));
  const impact = createImpactBuckets();
  const changedLines = changedLineSetForFile(file);

  const visit = (node) => {
    const touchesChange = nodeTouchesChangedLines(source, node, changedLines);
    if (
      ts.isFunctionDeclaration(node)
      || ts.isClassDeclaration(node)
      || ts.isInterfaceDeclaration(node)
      || ts.isTypeAliasDeclaration(node)
      || ts.isEnumDeclaration(node)
    ) {
      const name = nodeName(node);
      if (name && touchesChange) {
        const line = lineNumberForPosition(source, node.getStart(source));
        pushFunctionDetail(impact, {
          name,
          kind: ts.SyntaxKind[node.kind],
          file: file.path,
          line,
          exported: hasExportModifier(node),
          evidence: `${file.path}:${line}`,
        });
      }
    }

    if (ts.isVariableStatement(node) && touchesChange) {
      const exported = hasExportModifier(node);
      for (const declaration of node.declarationList.declarations) {
        const name = nodeName(declaration);
        if (!name) continue;
        const line = lineNumberForPosition(source, declaration.getStart(source));
        const initializer = declaration.initializer;
        const functionLike = initializer && (
          ts.isArrowFunction(initializer)
          || ts.isFunctionExpression(initializer)
          || ts.isClassExpression(initializer)
        );
        if (functionLike || exported) {
          pushFunctionDetail(impact, {
            name,
            kind: functionLike ? ts.SyntaxKind[initializer.kind] : 'VariableStatement',
            file: file.path,
            line,
            exported,
            evidence: `${file.path}:${line}`,
          });
        }
      }
    }

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && touchesChange) {
      const line = lineNumberForPosition(source, node.getStart(source));
      pushImportDetail(impact, {
        module: node.moduleSpecifier.text,
        specifiers: normalizeImportSpecifiers(node),
        kind: 'import',
        file: file.path,
        line,
        evidence: `${file.path}:${line}`,
      });
    }

    if (ts.isExportDeclaration(node) && touchesChange) {
      const line = lineNumberForPosition(source, node.getStart(source));
      for (const exportedName of exportNamesFromDeclaration(node)) {
        addEvidence(impact, 'exports', exportedName, `${file.path}:${line}`);
        addUnique(impact.exportDetails, {
          name: exportedName,
          kind: 'ExportDeclaration',
          file: file.path,
          line,
          evidence: `${file.path}:${line}`,
        }, (item) => `${item.file}:${item.line}:${item.name}`);
      }
      if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        pushImportDetail(impact, {
          module: node.moduleSpecifier.text,
          specifiers: exportNamesFromDeclaration(node),
          kind: 're-export',
          file: file.path,
          line,
          evidence: `${file.path}:${line}`,
        });
      }
    }

    if (ts.isCallExpression(node) && touchesChange) {
      const line = lineNumberForPosition(source, node.getStart(source));
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
        pushImportDetail(impact, {
          module: node.arguments[0].text,
          specifiers: [],
          kind: 'dynamic-import',
          file: file.path,
          line,
          evidence: `${file.path}:${line}`,
        });
      }
      if (
        ts.isIdentifier(node.expression)
        && node.expression.text === 'require'
        && node.arguments[0]
        && ts.isStringLiteralLike(node.arguments[0])
      ) {
        pushImportDetail(impact, {
          module: node.arguments[0].text,
          specifiers: [],
          kind: 'require',
          file: file.path,
          line,
          evidence: `${file.path}:${line}`,
        });
      }
      pushCallDetail(impact, {
        name: expressionName(node.expression),
        file: file.path,
        line,
        evidence: `${file.path}:${line}`,
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return {
    adapter: 'typescript',
    file: file.path,
    exports: [...impact.exports],
    functions: [...impact.functions],
    imports: [...impact.imports],
    calls: [...impact.calls],
    evidence: Object.fromEntries(impact.evidence.entries()),
    exportDetails: impact.exportDetails,
    changedFunctionDetails: impact.changedFunctionDetails,
    importDetails: impact.importDetails,
    callSiteDetails: impact.callSiteDetails,
  };
};

const lineEvidence = (file, entry) => `${file.path}:${entry.lineNumber || '?'}`;

const collectGenericImports = (lineText) => {
  const imports = [];
  const patterns = [
    /\bimport\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+[^'"]+\s+from\s+['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bfrom\s+([A-Za-z_][\w.]*)\s+import\b/g,
    /^\s*import\s+([A-Za-z_][\w.]*)\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of lineText.matchAll(pattern)) {
      if (match[1]) imports.push(match[1]);
    }
  }
  return imports;
};

const collectGenericExports = (lineText) => {
  const exports = [];
  const patterns = [
    /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$-]*)/g,
    /\bexport\s*\{\s*([^}]+)\s*\}/g,
    /\bexports\.([A-Za-z_$][\w$-]*)\s*=/g,
    /\bmodule\.exports\s*=\s*([A-Za-z_$][\w$-]*)/g,
  ];
  for (const pattern of patterns) {
    for (const match of lineText.matchAll(pattern)) {
      if (!match[1]) continue;
      if (match[1].includes(',')) {
        exports.push(...match[1].split(',').map((part) => part.trim().replace(/\s+as\s+/, ' as ')).filter(Boolean));
      } else {
        exports.push(match[1]);
      }
    }
  }
  return exports;
};

const collectGenericCalls = (lineText) => {
  const calls = [];
  const pattern = /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*\(/g;
  for (const match of lineText.matchAll(pattern)) {
    const name = match[1];
    if (name && !CALL_IGNORE.has(name) && !/^(?:function|class)$/.test(name)) calls.push(name);
  }
  return calls;
};

const analyzeGenericFile = (file) => {
  const impact = createImpactBuckets();
  const entries = (file.addedEntries || []).concat(file.removedEntries || []);

  for (const entry of entries) {
    const text = entry.text || '';
    const evidence = lineEvidence(file, entry);
    for (const name of extractSymbols(text)) {
      pushFunctionDetail(impact, {
        name,
        kind: 'regex-symbol',
        file: file.path,
        line: entry.lineNumber || null,
        exported: /\bexport\b/.test(text),
        evidence,
      });
    }
    for (const name of collectGenericExports(text)) {
      addEvidence(impact, 'exports', name, evidence);
      addUnique(impact.exportDetails, {
        name,
        kind: 'regex-export',
        file: file.path,
        line: entry.lineNumber || null,
        evidence,
      }, (item) => `${item.file}:${item.line}:${item.name}`);
    }
    for (const moduleName of collectGenericImports(text)) {
      pushImportDetail(impact, {
        module: moduleName,
        specifiers: [],
        kind: 'regex-import',
        file: file.path,
        line: entry.lineNumber || null,
        evidence,
      });
    }
    for (const callName of collectGenericCalls(text)) {
      pushCallDetail(impact, {
        name: callName,
        file: file.path,
        line: entry.lineNumber || null,
        evidence,
      });
    }
  }

  return {
    adapter: 'generic',
    file: file.path,
    exports: [...impact.exports],
    functions: [...impact.functions],
    imports: [...impact.imports],
    calls: [...impact.calls],
    evidence: Object.fromEntries(impact.evidence.entries()),
    exportDetails: impact.exportDetails,
    changedFunctionDetails: impact.changedFunctionDetails,
    importDetails: impact.importDetails,
    callSiteDetails: impact.callSiteDetails,
  };
};

const classifyConfigChange = (file, entry) => {
  const text = entry.text || '';
  if (/package\.json$/.test(file.path)) {
    if (/"scripts"\s*:|"\w+"\s*:\s*"[^"]*(?:vite|next|bun|node|tsx|tsc|eslint|vitest|playwright)/.test(text)) return 'scripts';
    if (/"(?:dependencies|devDependencies|peerDependencies|optionalDependencies)"\s*:/.test(text) || /"[^"]+"\s*:\s*"[\^~]?\d/.test(text)) return 'dependencies';
  }
  if (/tsconfig|jsconfig/.test(file.path)) return 'compiler-options';
  if (/eslint/.test(file.path)) return 'lint-policy';
  if (/convex\/schema\.ts/.test(file.path)) return 'database-schema';
  if (/convex\/http\.ts/.test(file.path)) return 'http-actions';
  if (/dockerfile|compose\.ya?ml/i.test(file.path)) return 'runtime';
  if (/\.env\.example$/.test(file.path)) return 'environment';
  return 'configuration';
};

const analyzeConfigImpact = (files) => {
  const details = [];
  for (const file of files.filter((item) => isConfigFile(item.path))) {
    const entries = (file.addedEntries || []).concat(file.removedEntries || []);
    const areas = new Set(entries.map((entry) => classifyConfigChange(file, entry)));
    details.push({
      file: file.path,
      areas: [...areas],
      additions: file.additions,
      deletions: file.deletions,
      evidence: entries[0] ? lineEvidence(file, entries[0]) : file.path,
    });
  }
  return details;
};

const stripKnownSourceExtension = (filePath) => filePath
  .replace(/\.(?:test|spec)\.[cm]?[jt]sx?$/i, '')
  .replace(/\.[cm]?[jt]sx?$/i, '')
  .replace(/\.(?:py|rb|go|rs|java|kt|swift|php)$/i, '');

const candidateTestKeys = (filePath) => {
  const withoutExtension = stripKnownSourceExtension(filePath);
  const base = path.basename(withoutExtension).replace(/\.(?:test|spec)$/i, '');
  return new Set([
    withoutExtension.replace(/\.(?:test|spec)$/i, ''),
    withoutExtension.replace(/(^|\/)__tests__\//, '$1'),
    withoutExtension.replace(/(^|\/)(?:tests?|specs?)\//, '$1src/'),
    base,
  ].filter(Boolean));
};

const inferTestCoverage = (files) => {
  const sourceFiles = files
    .filter((file) => !isTestFile(file.path) && !isConfigFile(file.path))
    .map((file) => file.path);
  const testFiles = files.filter((file) => isTestFile(file.path)).map((file) => file.path);
  const testKeys = testFiles.map((filePath) => ({ filePath, keys: candidateTestKeys(filePath) }));
  const mappings = sourceFiles.map((sourceFile) => {
    const sourceKeys = candidateTestKeys(sourceFile);
    const relatedTestFiles = testKeys
      .filter((test) => [...sourceKeys].some((key) => test.keys.has(key)) || [...test.keys].some((key) => sourceKeys.has(key)))
      .map((test) => test.filePath);
    return {
      sourceFile,
      relatedTestFiles,
      status: relatedTestFiles.length > 0 ? 'touched' : testFiles.length > 0 ? 'tests-touched-elsewhere' : 'missing',
    };
  });

  return {
    sourceFiles,
    touchedTests: testFiles,
    mappings,
    coveredSourceFiles: mappings.filter((item) => item.relatedTestFiles.length > 0).map((item) => item.sourceFile),
    untestedSourceFiles: mappings.filter((item) => item.relatedTestFiles.length === 0).map((item) => item.sourceFile),
  };
};

const mergeFileImpact = (target, fileImpact) => {
  target.parsedFiles.add(fileImpact.file);
  for (const value of fileImpact.exports || []) target.exportedSymbols.add(value);
  for (const value of fileImpact.functions || []) target.changedFunctions.add(value);
  for (const value of fileImpact.imports || []) target.importedModules.add(value);
  for (const value of fileImpact.calls || []) target.calledSymbols.add(value);
  for (const [key, value] of Object.entries(fileImpact.evidence || {})) addDetailEvidence(target, key, value);
  for (const detail of fileImpact.exportDetails || []) addUnique(target.exportDetails, detail, (item) => `${item.file}:${item.line}:${item.name}`);
  for (const detail of fileImpact.changedFunctionDetails || []) addUnique(target.changedFunctionDetails, detail, (item) => `${item.file}:${item.line}:${item.name}:${item.kind}`);
  for (const detail of fileImpact.importDetails || []) addUnique(target.importDetails, detail, (item) => `${item.file}:${item.line}:${item.module}:${item.kind}`);
  for (const detail of fileImpact.callSiteDetails || []) addUnique(target.callSiteDetails, detail, (item) => `${item.file}:${item.line}:${item.name}`);
};

export const parseDiff = (diff) => {
  const files = [];
  let current = null;
  let oldLine = 0;
  let newLine = 0;
  const addedSymbols = new Set();
  const removedSymbols = new Set();
  let additions = 0;
  let deletions = 0;

  for (const diffLine of String(diff || '').split('\n')) {
    if (diffLine.startsWith('diff --git ')) {
      const match = diffLine.match(/^diff --git a\/(.+?) b\/(.+)$/);
      current = {
        oldPath: match?.[1] || 'unknown',
        newPath: match?.[2] || match?.[1] || 'unknown',
        path: match?.[2] || match?.[1] || 'unknown',
        status: 'modified',
        additions: 0,
        deletions: 0,
        hunks: [],
        addedLines: [],
        removedLines: [],
        addedEntries: [],
        removedEntries: [],
        addedLineNumbers: [],
        removedLineNumbers: [],
        modeChanges: [],
        binary: false,
      };
      oldLine = 0;
      newLine = 0;
      files.push(current);
      continue;
    }

    if (!current) continue;

    if (diffLine.startsWith('new file mode')) {
      current.status = 'added';
      current.modeChanges.push(diffLine);
      continue;
    }
    if (diffLine.startsWith('deleted file mode')) {
      current.status = 'deleted';
      current.modeChanges.push(diffLine);
      continue;
    }
    if (diffLine.startsWith('old mode ') || diffLine.startsWith('new mode ')) {
      current.modeChanges.push(diffLine);
      continue;
    }
    if (diffLine.startsWith('rename from ')) {
      current.status = 'renamed';
      current.oldPath = diffLine.slice('rename from '.length).trim();
      continue;
    }
    if (diffLine.startsWith('rename to ')) {
      current.status = 'renamed';
      current.newPath = diffLine.slice('rename to '.length).trim();
      current.path = current.newPath;
      continue;
    }
    if (diffLine.startsWith('Binary files ') || diffLine.startsWith('GIT binary patch')) {
      current.binary = true;
      continue;
    }
    if (diffLine.startsWith('--- ')) {
      const oldPath = diffLine.replace(/^---\s+/, '').replace(/^a\//, '');
      if (oldPath !== '/dev/null') current.oldPath = oldPath;
      continue;
    }
    if (diffLine.startsWith('+++ ')) {
      const newPathValue = diffLine.replace(/^\+\+\+\s+/, '').replace(/^b\//, '');
      if (newPathValue !== '/dev/null') {
        current.newPath = newPathValue;
        current.path = newPathValue;
      }
      continue;
    }

    if (diffLine.startsWith('@@')) {
      const label = diffLine.replace(/^@@[^@]*@@\s*/, '').trim();
      const match = diffLine.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      oldLine = Number(match?.[1] || 0);
      newLine = Number(match?.[2] || 0);
      current.hunks.push(label || current.path);
      continue;
    }

    if (diffLine.startsWith('+') && !diffLine.startsWith('+++')) {
      const value = diffLine.slice(1).trim();
      additions += 1;
      current.additions += 1;
      if (value) {
        current.addedLines.push(value);
        current.addedEntries.push({ text: value, lineNumber: newLine || null });
      }
      if (newLine > 0) current.addedLineNumbers.push(newLine);
      newLine += 1;
      for (const symbol of extractSymbols(value)) addedSymbols.add(symbol);
    } else if (diffLine.startsWith('-') && !diffLine.startsWith('---')) {
      const value = diffLine.slice(1).trim();
      deletions += 1;
      current.deletions += 1;
      if (value) {
        current.removedLines.push(value);
        current.removedEntries.push({ text: value, lineNumber: oldLine || null });
      }
      if (oldLine > 0) current.removedLineNumbers.push(oldLine);
      oldLine += 1;
      for (const symbol of extractSymbols(value)) removedSymbols.add(symbol);
    } else if (diffLine.startsWith(' ') || diffLine === '') {
      oldLine += 1;
      newLine += 1;
    }
  }

  return {
    files,
    additions,
    deletions,
    addedSymbols: [...addedSymbols],
    removedSymbols: [...removedSymbols],
  };
};

export const analyzeQuizEvidence = (summary, { cwd = null } = {}) => {
  const target = {
    testFiles: new Set(),
    configFiles: new Set(),
    exportedSymbols: new Set(),
    changedFunctions: new Set(),
    callSiteFiles: new Set(),
    importedModules: new Set(),
    calledSymbols: new Set(),
    parsedFiles: new Set(),
    evidence: new Map(),
    exportDetails: [],
    changedFunctionDetails: [],
    importDetails: [],
    callSiteDetails: [],
    fileImpacts: [],
  };

  for (const file of summary.files || []) {
    if (isTestFile(file.path)) target.testFiles.add(file.path);
    if (isConfigFile(file.path)) target.configFiles.add(file.path);

    const fileImpact = analyzeJavaScriptFile({ cwd, file }) || analyzeGenericFile(file);
    target.fileImpacts.push(fileImpact);
    mergeFileImpact(target, fileImpact);
    if (!isTestFile(file.path) && (fileImpact.calls.length > 0 || fileImpact.imports.length > 0)) {
      target.callSiteFiles.add(file.path);
    }
  }

  const configImpact = analyzeConfigImpact(summary.files || []);
  const testCoverage = inferTestCoverage(summary.files || []);

  for (const detail of configImpact) {
    addDetailEvidence(target, detail.file, detail.evidence);
  }
  for (const mapping of testCoverage.mappings) {
    if (mapping.relatedTestFiles[0]) addDetailEvidence(target, mapping.sourceFile, mapping.relatedTestFiles[0]);
  }

  return {
    testFiles: [...target.testFiles],
    configFiles: [...target.configFiles],
    exportedSymbols: [...target.exportedSymbols],
    changedFunctions: [...target.changedFunctions],
    callSiteFiles: [...target.callSiteFiles],
    importedModules: [...target.importedModules],
    calledSymbols: [...target.calledSymbols],
    parsedFiles: [...target.parsedFiles],
    evidence: target.evidence,
    exportDetails: target.exportDetails,
    changedFunctionDetails: target.changedFunctionDetails,
    importDetails: target.importDetails,
    callSiteDetails: target.callSiteDetails,
    configImpact,
    testCoverage,
    fileImpacts: target.fileImpacts,
  };
};

export const analyzeDiffImpact = analyzeQuizEvidence;

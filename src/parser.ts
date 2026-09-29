import type { DiscoveredFile, ParsedRule } from "./types.js";

const FIELD_RE: Record<"whatText" | "appliesToText" | "checkText" | "owner" | "reviewed", RegExp> = {
  whatText: /^What:\s*(.*)$/i,
  appliesToText: /^Applies to:\s*(.*)$/i,
  checkText: /^Check:\s*(.*)$/i,
  owner: /^Owner:\s*(.*)$/i,
  reviewed: /^Reviewed:\s*(.*)$/i,
};

interface Heading {
  line: number; // 1-indexed
  text: string;
  level: number;
}

/**
 * Marks every line inside a fenced code block (``` ... ```), the fence
 * delimiters included, so example rule shapes shown in a fence are never
 * parsed as real headings or real five-line fields.
 */
function computeFenceMask(lines: string[]): boolean[] {
  const mask: boolean[] = new Array(lines.length).fill(false);
  let inFence = false;
  lines.forEach((line, i) => {
    const isDelimiter = /^\s*(```|~~~)/.test(line);
    if (isDelimiter) {
      mask[i] = true;
      inFence = !inFence;
    } else {
      mask[i] = inFence;
    }
  });
  return mask;
}

/** Returns every level-2 (`## `) heading outside a fence — the level every template uses for rule blocks. */
function findHeadings(lines: string[], fenced: boolean[]): Heading[] {
  const out: Heading[] = [];
  lines.forEach((line, i) => {
    if (fenced[i]) return;
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m && m[1].length === 2) out.push({ line: i + 1, text: m[2].trim(), level: m[1].length });
  });
  return out;
}

interface BlockLine {
  text: string;
  lineNo: number;
  fenced: boolean;
}

function blockLines(lines: string[], fenced: boolean[], startLine: number, endLineExclusive: number): BlockLine[] {
  const out: BlockLine[] = [];
  for (let i = startLine; i < endLineExclusive; i++) {
    out.push({ text: lines[i], lineNo: i + 1, fenced: fenced[i] });
  }
  return out;
}

function extractFrontmatterName(lines: string[]): string | undefined {
  if (lines[0]?.trim() !== "---") return undefined;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") break;
    const m = /^name:\s*(.*)$/i.exec(lines[i]);
    if (m) return m[1].trim();
  }
  return undefined;
}

function parseFiveLineFields(lines: BlockLine[]) {
  const fields: Partial<Pick<ParsedRule, "whatText" | "appliesToText" | "checkText" | "owner" | "reviewed">> & {
    whatLine?: number;
    appliesToLine?: number;
    checkLine?: number;
  } = {};
  for (const { text, lineNo, fenced } of lines) {
    if (fenced) continue; // an example shape inside a fence is not a real field
    for (const [key, re] of Object.entries(FIELD_RE) as [keyof typeof FIELD_RE, RegExp][]) {
      const m = re.exec(text.trim());
      if (m) {
        (fields as Record<string, string>)[key] = m[1].trim();
        if (key === "whatText") fields.whatLine = lineNo;
        if (key === "appliesToText") fields.appliesToLine = lineNo;
        if (key === "checkText") fields.checkLine = lineNo;
      }
    }
  }
  return fields;
}

function findSection(
  lines: string[],
  fenced: boolean[],
  headings: Heading[],
  headingText: RegExp,
): { text: string; startLine: number } | undefined {
  const idx = headings.findIndex((h) => headingText.test(h.text));
  if (idx === -1) return undefined;
  const h = headings[idx];
  const nextLine = headings[idx + 1]?.line ?? lines.length + 1;
  const body = blockLines(lines, fenced, h.line, nextLine - 1);
  const text = body.map((b) => b.text).join("\n").trim();
  const firstNonEmpty = body.find((b) => b.text.trim().length > 0);
  return { text, startLine: firstNonEmpty?.lineNo ?? h.line };
}

export function parseFile(file: DiscoveredFile): ParsedRule[] {
  const lines = file.content.split(/\r?\n/);
  const fenced = computeFenceMask(lines);

  if (file.kind === "SKILL") {
    const headings = findHeadings(lines, fenced);
    const name = extractFrontmatterName(lines) ?? file.path;
    const what = findSection(lines, fenced, headings, /^What to do$/i);
    const check = findSection(lines, fenced, headings, /^Check$/i);
    const rule: ParsedRule = {
      file: file.path,
      kind: file.kind,
      shape: "skill",
      title: name,
      titleLine: 1,
      whatText: what?.text,
      whatLine: what?.startLine,
      checkText: check?.text,
      checkLine: check?.startLine,
      bodyText: file.content,
      bodyStartLine: 1,
    };
    return [rule];
  }

  const headings = findHeadings(lines, fenced);
  const ruleHeadings = headings.filter((h) => /^Rule:\s*/i.test(h.text));
  const usesFiveLineShape = ruleHeadings.length > 0;
  const blockHeadings = usesFiveLineShape ? ruleHeadings : headings;

  const rules: ParsedRule[] = [];
  blockHeadings.forEach((h) => {
    const allHeadingsIdx = headings.indexOf(h);
    const nextLine = headings[allHeadingsIdx + 1]?.line ?? lines.length + 1;
    const body = blockLines(lines, fenced, h.line, nextLine - 1);
    const bodyText = [h.text, ...body.map((b) => b.text)].join("\n");

    if (usesFiveLineShape) {
      const fields = parseFiveLineFields(body);
      rules.push({
        file: file.path,
        kind: file.kind,
        shape: "five-line",
        title: h.text.replace(/^Rule:\s*/i, "").trim(),
        titleLine: h.line,
        ...fields,
        bodyText,
        bodyStartLine: h.line,
      });
    } else {
      // Ownership and review dates are read here too, though the rest of the
      // five-line shape is not. The inventory counts owned and reviewed rules
      // without looking at the shape, so a repository whose instruction file
      // uses plain headings was told "0 of 8 name an owner" however many Owner
      // lines it had -- the count asked a question the parser never answered.
      //
      // What, Applies to and Check stay out on purpose: `scannableFields` says
      // heading blocks have no such fields and check 3 reads their whole body
      // instead. Owner and Reviewed are facts a heading block can state about
      // itself; the other three are the five-line shape's own contract.
      const { owner, reviewed } = parseFiveLineFields(body);
      rules.push({
        file: file.path,
        kind: file.kind,
        shape: "heading",
        title: h.text,
        titleLine: h.line,
        owner,
        reviewed,
        bodyText,
        bodyStartLine: h.line,
      });
    }
  });

  return rules;
}

export function parseFiles(files: DiscoveredFile[]): ParsedRule[] {
  return files.flatMap(parseFile);
}

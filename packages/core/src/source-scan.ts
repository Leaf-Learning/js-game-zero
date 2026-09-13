/**
 * A small lexical scan of zero-boilerplate game source, used by the typo
 * diagnostics to find the names a script actually *defines* at top level
 * (as opposed to every identifier it merely mentions). It is deliberately
 * not a parser: it tokenizes comments, strings, template literals (with
 * nested substitutions), regex literals, identifiers and punctuators while
 * tracking brace depth, and pattern-matches definitions on the token stream.
 *
 * On anything it cannot make sense of (an unterminated string, comment,
 * template or regex, or unbalanced braces/parens) the scan reports itself
 * incomplete and callers emit nothing: no diagnostic beats a wrong one.
 */

export type SourceTokenType = "identifier" | "punctuator" | "literal";

export type SourceToken = {
  readonly type: SourceTokenType;
  readonly value: string;
  /** Brace depth at the token: 0 means outside every `{…}` and `${…}`. */
  readonly depth: number;
  /** Parenthesis depth at the token: 0 means outside every `(…)`. */
  readonly parens: number;
  /** Square-bracket depth at the token: 0 means outside every `[…]`. */
  readonly brackets: number;
};

export type SourceScan = {
  /** False when the tokenizer gave up; the name lists are then empty. */
  readonly complete: boolean;
  /**
   * Names given a function value at depth 0: `function NAME(`, and
   * `NAME = function…`, `NAME = async …`, `NAME = (…) =>`, `NAME = x =>`
   * (with or without `const`/`let`/`var`).
   */
  readonly topLevelFunctions: readonly string[];
  /** Depth-0 assignment and declaration targets (`NAME = …`, `let NAME`). */
  readonly topLevelAssignments: readonly string[];
};

const punctuators = [
  ">>>=",
  "...",
  "===",
  "!==",
  "**=",
  "<<=",
  ">>=",
  ">>>",
  "&&=",
  "||=",
  "??=",
  "=>",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "??",
  "?.",
  "++",
  "--",
  "+=",
  "-=",
  "*=",
  "%=",
  "&=",
  "|=",
  "^=",
  "**",
  "<<",
  ">>",
] as const;

/** Keywords after which a `/` starts a regex literal rather than dividing. */
const regexPrecedingKeywords = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "case",
  "do",
  "else",
  "yield",
  "await",
]);

/** Tokens before `function` that make it an expression, not a declaration. */
const expressionPrecedingPunctuators = new Set([
  "=",
  "(",
  ",",
  ":",
  "[",
  "?",
  "=>",
  "!",
  "||",
  "&&",
  "??",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "&",
  "|",
  "^",
  "~",
]);

const expressionPrecedingKeywords = new Set([
  "return",
  "typeof",
  "void",
  "new",
  "throw",
  "yield",
  "await",
  "in",
  "of",
  "case",
  "delete",
  "instanceof",
]);

const identifierStart = /[\p{ID_Start}$_]/u;
const identifierPart = /[\p{ID_Continue}$\u200C\u200D]/u;
const numberPart = /[0-9A-Za-z_.]/;

/**
 * Splits `source` into tokens, or returns null when it cannot be tokenized
 * confidently. Comments vanish; strings, templates, regexes and numbers
 * become `literal` tokens (the code inside template substitutions is
 * tokenized normally, one brace deeper than the template).
 */
export function tokenizeSource(source: string): SourceToken[] | null {
  const tokens: SourceToken[] = [];
  const templateDepths: number[] = [];
  let depth = 0;
  let parens = 0;
  let brackets = 0;
  let index = 0;

  const push = (type: SourceTokenType, value: string): void => {
    tokens.push({ type, value, depth, parens, brackets });
  };
  const previous = (): SourceToken | undefined => tokens.at(-1);

  /** Scans template text after a backtick or a closing `}`; false on EOF. */
  const scanTemplateText = (): boolean => {
    while (index < source.length) {
      const char = source[index];
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === "`") {
        index += 1;
        return true;
      }
      if (char === "$" && source[index + 1] === "{") {
        index += 2;
        templateDepths.push(depth);
        depth += 1;
        return true;
      }
      index += 1;
    }
    return false;
  };

  if (source.startsWith("#!")) {
    const end = source.indexOf("\n");
    index = end === -1 ? source.length : end;
  }

  while (index < source.length) {
    const char = source[index] as string;
    const next = source[index + 1];

    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", index);
      index = end === -1 ? source.length : end;
      continue;
    }

    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", index + 2);
      if (end === -1) return null;
      index = end + 2;
      continue;
    }

    if (char === "'" || char === '"') {
      index += 1;
      let closed = false;
      while (index < source.length) {
        const current = source[index];
        if (current === "\\") {
          index += 2;
          continue;
        }
        if (current === "\n") return null;
        index += 1;
        if (current === char) {
          closed = true;
          break;
        }
      }
      if (!closed) return null;
      push("literal", "string");
      continue;
    }

    if (char === "`") {
      index += 1;
      push("literal", "template");
      if (!scanTemplateText()) return null;
      continue;
    }

    if (char === "}") {
      index += 1;
      const templateDepth = templateDepths.at(-1);
      if (templateDepth !== undefined && depth === templateDepth + 1) {
        templateDepths.pop();
        depth -= 1;
        if (!scanTemplateText()) return null;
        continue;
      }
      if (depth === 0) return null;
      depth -= 1;
      push("punctuator", "}");
      continue;
    }

    if (char === "{") {
      push("punctuator", "{");
      depth += 1;
      index += 1;
      continue;
    }

    if (char === "(") {
      push("punctuator", "(");
      parens += 1;
      index += 1;
      continue;
    }

    if (char === ")") {
      if (parens === 0) return null;
      parens -= 1;
      push("punctuator", ")");
      index += 1;
      continue;
    }

    if (char === "[") {
      push("punctuator", "[");
      brackets += 1;
      index += 1;
      continue;
    }

    if (char === "]") {
      if (brackets === 0) return null;
      brackets -= 1;
      push("punctuator", "]");
      index += 1;
      continue;
    }

    if (identifierStart.test(char)) {
      const start = index;
      index += 1;
      while (index < source.length && identifierPart.test(source[index] ?? ""))
        index += 1;
      push("identifier", source.slice(start, index));
      continue;
    }

    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(next ?? ""))) {
      index += 1;
      while (index < source.length && numberPart.test(source[index] ?? ""))
        index += 1;
      push("literal", "number");
      continue;
    }

    if (char === "/") {
      if (regexAllowedAfter(previous())) {
        index += 1;
        let inClass = false;
        let closed = false;
        while (index < source.length) {
          const current = source[index];
          if (current === "\n") return null;
          if (current === "\\") {
            index += 2;
            continue;
          }
          index += 1;
          if (inClass) {
            if (current === "]") inClass = false;
          } else if (current === "[") {
            inClass = true;
          } else if (current === "/") {
            closed = true;
            break;
          }
        }
        if (!closed) return null;
        while (index < source.length && /[a-z]/.test(source[index] ?? ""))
          index += 1;
        push("literal", "regex");
        continue;
      }
      if (next === "=") {
        push("punctuator", "/=");
        index += 2;
        continue;
      }
      push("punctuator", "/");
      index += 1;
      continue;
    }

    const punctuator = punctuators.find((candidate) =>
      source.startsWith(candidate, index),
    );
    if (punctuator) {
      push("punctuator", punctuator);
      index += punctuator.length;
      continue;
    }

    push("punctuator", char);
    index += 1;
  }

  if (
    templateDepths.length > 0 ||
    depth !== 0 ||
    parens !== 0 ||
    brackets !== 0
  )
    return null;
  return tokens;
}

function regexAllowedAfter(token: SourceToken | undefined): boolean {
  if (!token) return true;
  if (token.type === "literal") return false;
  if (token.type === "identifier")
    return regexPrecedingKeywords.has(token.value);
  return token.value !== ")" && token.value !== "]" && token.value !== "}";
}

const emptyScan: SourceScan = {
  complete: false,
  topLevelFunctions: [],
  topLevelAssignments: [],
};

/** Finds the names `source` defines at top level; see {@link SourceScan}. */
export function scanSource(source: string): SourceScan {
  const tokens = tokenizeSource(source);
  if (!tokens) return emptyScan;

  const functions = new Set<string>();
  const assignments = new Set<string>();
  const at = (index: number): SourceToken | undefined => tokens[index];
  const isPunctuator = (token: SourceToken | undefined, value: string) =>
    token?.type === "punctuator" && token.value === value;
  const isIdentifier = (token: SourceToken | undefined, value?: string) =>
    token?.type === "identifier" &&
    (value === undefined || token.value === value);

  const isFunctionValue = (index: number): boolean => {
    const token = at(index);
    if (!token) return false;
    if (isIdentifier(token, "function") || isIdentifier(token, "async"))
      return true;
    if (token.type === "identifier") return isPunctuator(at(index + 1), "=>");
    if (!isPunctuator(token, "(")) return false;
    let open = 0;
    for (let cursor = index; cursor < tokens.length; cursor += 1) {
      const current = at(cursor);
      if (isPunctuator(current, "(")) open += 1;
      else if (isPunctuator(current, ")")) {
        open -= 1;
        if (open === 0) return isPunctuator(at(cursor + 1), "=>");
      }
    }
    return false;
  };

  const collectDeclaration = (start: number): void => {
    let expectsName = true;
    for (let cursor = start; cursor < tokens.length; cursor += 1) {
      const current = at(cursor);
      if (!current) return;
      if (
        current.depth !== 0 ||
        current.parens !== 0 ||
        current.brackets !== 0
      ) {
        continue;
      }
      if (isPunctuator(current, ";")) return;
      if (expectsName) {
        if (!isIdentifier(current)) return;
        assignments.add(current.value);
        if (isPunctuator(at(cursor + 1), "=") && isFunctionValue(cursor + 2)) {
          functions.add(current.value);
        }
        expectsName = false;
        continue;
      }
      if (isPunctuator(current, ",")) expectsName = true;
    }
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = at(index);
    if (
      !token ||
      token.depth !== 0 ||
      token.parens !== 0 ||
      token.brackets !== 0
    )
      continue;
    if (token.type !== "identifier") continue;
    const before = at(index - 1);
    const after = at(index + 1);

    if (token.value === "function") {
      if (isExpressionContext(before)) continue;
      const nameIndex = isPunctuator(after, "*") ? index + 2 : index + 1;
      const name = at(nameIndex);
      if (isIdentifier(name) && isPunctuator(at(nameIndex + 1), "(")) {
        functions.add((name as SourceToken).value);
      }
      continue;
    }

    if (
      (token.value === "const" ||
        token.value === "let" ||
        token.value === "var") &&
      isIdentifier(after)
    ) {
      collectDeclaration(index + 1);
      continue;
    }

    if (isPunctuator(after, "=")) {
      if (isPunctuator(before, ".") || isPunctuator(before, "?.")) continue;
      assignments.add(token.value);
      if (isFunctionValue(index + 2)) functions.add(token.value);
    }
  }

  return {
    complete: true,
    topLevelFunctions: [...functions],
    topLevelAssignments: [...assignments],
  };
}

function isExpressionContext(token: SourceToken | undefined): boolean {
  if (!token) return false;
  if (token.type === "literal") return false;
  if (token.type === "identifier")
    return expressionPrecedingKeywords.has(token.value);
  return expressionPrecedingPunctuators.has(token.value);
}

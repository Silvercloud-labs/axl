// ============================================================================
// packages/compiler/lexer.ts — Character-by-character tokenizer for .flow
// ============================================================================
// No regex hacks. Pure character-level scanning with precise source tracking.
//
// The AXL lexer is intentionally minimal — .flow is a declarative spec
// language, not a programming language. There are no braces, parentheses,
// semicolons, or complex operator tokens.
//
// Supported lexemes:
//   Identifiers      [a-zA-Z_][a-zA-Z0-9_]*
//   Keywords         APP, ENTITY, ACTION, etc. (see KEYWORDS set)
//   String literals  "..."
//   Number literals  [0-9]+ or [0-9]+.[0-9]+
//   Version literals [0-9]+.[0-9]+.[0-9]+
//   Colon            :
//   Slash            /
//   < >              for generics like List<Product>
//   Comments         -- to end of line
//   Newlines         significant for line tracking
// ============================================================================

import {
  type Token,
  type SourceLocation,
  type Diagnostic,
  TokenType,
  DiagnosticSeverity,
  KEYWORDS,
} from "./types.js";

// ---------------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------------

export class Lexer {
  private readonly source: string;
  private readonly fileName: string;
  private pos: number = 0;
  private line: number = 1;
  private col: number = 1;
  private readonly diagnostics: Diagnostic[] = [];

  constructor(source: string, fileName: string) {
    this.source = source;
    this.fileName = fileName;
  }

  /** Tokenise the entire source. */
  tokenize(): { tokens: Token[]; diagnostics: Diagnostic[] } {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      this.skipWhitespaceExceptNewline();
      if (this.isAtEnd()) break;

      const token = this.nextToken();
      if (token !== null) {
        tokens.push(token);
      }
    }

    tokens.push(this.makeToken(TokenType.EOF, "", this.loc()));
    return { tokens, diagnostics: this.diagnostics };
  }

  // -------------------------------------------------------------------------
  // Core scanning
  // -------------------------------------------------------------------------

  private nextToken(): Token | null {
    const loc = this.loc();
    const ch = this.peek();

    // Newline
    if (ch === "\n") {
      this.advance();
      return this.makeToken(TokenType.Newline, "\n", loc);
    }

    // Carriage return (normalize \r\n to a single newline)
    if (ch === "\r") {
      this.advance();
      if (this.peek() === "\n") this.advance();
      return this.makeToken(TokenType.Newline, "\n", loc);
    }

    // Comment: -- to end of line
    if (ch === "-" && this.peekAt(1) === "-") {
      return this.scanComment(loc);
    }

    // String literal
    if (ch === '"') {
      return this.scanString(loc);
    }

    // Number or version literal
    if (this.isDigit(ch)) {
      return this.scanNumberOrVersion(loc);
    }

    // Punctuation
    if (ch === ":") { this.advance(); return this.makeToken(TokenType.Colon, ":", loc); }
    if (ch === "/") { this.advance(); return this.makeToken(TokenType.Slash, "/", loc); }
    if (ch === "<") { this.advance(); return this.makeToken(TokenType.LeftAngle, "<", loc); }
    if (ch === ">") { this.advance(); return this.makeToken(TokenType.RightAngle, ">", loc); }
    if (ch === "{") { this.advance(); return this.makeToken(TokenType.LeftBrace, "{", loc); }
    if (ch === "}") { this.advance(); return this.makeToken(TokenType.RightBrace, "}", loc); }
    if (ch === ".") { this.advance(); return this.makeToken(TokenType.Dot, ".", loc); }
    if (ch === "-") { this.advance(); return this.makeToken(TokenType.Dash, "-", loc); }
    if (ch === "?") { this.advance(); return this.makeToken(TokenType.Question, "?", loc); }
    if (ch === "=") { this.advance(); return this.makeToken(TokenType.Equals, "=", loc); }
    if (ch === "&") { this.advance(); return this.makeToken(TokenType.Ampersand, "&", loc); }
    if (ch === ",") { this.advance(); return this.makeToken(TokenType.Comma, ",", loc); }

    // Identifier or keyword
    if (this.isIdentStart(ch)) {
      return this.scanIdentifierOrKeyword(loc);
    }

    // Unknown character — emit diagnostic and skip
    this.diagnostics.push({
      severity: DiagnosticSeverity.Error,
      code: "AXL100",
      message: `Unexpected character '${ch}'`,
      location: loc,
    });
    this.advance();
    return null;
  }

  // -------------------------------------------------------------------------
  // Scanners
  // -------------------------------------------------------------------------

  private scanComment(loc: SourceLocation): Token {
    let value = "";
    // Consume everything until end of line
    while (!this.isAtEnd() && this.peek() !== "\n" && this.peek() !== "\r") {
      value += this.peek();
      this.advance();
    }
    return this.makeToken(TokenType.Comment, value.trim(), loc);
  }

  private scanString(loc: SourceLocation): Token {
    this.advance(); // consume opening "
    let value = "";
    while (!this.isAtEnd() && this.peek() !== '"') {
      if (this.peek() === "\n" || this.peek() === "\r") {
        this.diagnostics.push({
          severity: DiagnosticSeverity.Error,
          code: "AXL101",
          message: "Unterminated string literal",
          location: loc,
        });
        break;
      }
      if (this.peek() === "\\") {
        this.advance(); // consume backslash
        const escaped = this.peek();
        switch (escaped) {
          case "n": value += "\n"; break;
          case "t": value += "\t"; break;
          case "\\": value += "\\"; break;
          case '"': value += '"'; break;
          default:
            value += escaped;
        }
        this.advance();
      } else {
        value += this.peek();
        this.advance();
      }
    }
    if (!this.isAtEnd() && this.peek() === '"') {
      this.advance(); // consume closing "
    }
    return this.makeToken(TokenType.StringLiteral, value, loc);
  }

  private scanNumberOrVersion(loc: SourceLocation): Token {
    let value = "";
    let dotCount = 0;

    // Consume digits and dots
    while (!this.isAtEnd() && (this.isDigit(this.peek()) || this.peek() === ".")) {
      if (this.peek() === ".") {
        // Look ahead: if next char after dot is a digit, it's part of version/float
        if (this.peekAt(1) !== undefined && this.isDigit(this.peekAt(1)!)) {
          dotCount++;
          value += this.peek();
          this.advance();
        } else {
          break;
        }
      } else {
        value += this.peek();
        this.advance();
      }
    }

    // Three-segment like 1.0.0 → version literal
    if (dotCount >= 2) {
      return this.makeToken(TokenType.VersionLiteral, value, loc);
    }

    return this.makeToken(TokenType.NumberLiteral, value, loc);
  }

  private scanIdentifierOrKeyword(loc: SourceLocation): Token {
    let value = "";
    while (!this.isAtEnd() && this.isIdentPart(this.peek())) {
      value += this.peek();
      this.advance();
    }

    if (KEYWORDS.has(value)) {
      return this.makeToken(TokenType.Keyword, value, loc);
    }

    return this.makeToken(TokenType.Identifier, value, loc);
  }

  // -------------------------------------------------------------------------
  // Character helpers
  // -------------------------------------------------------------------------

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private peek(): string {
    return this.source[this.pos]!;
  }

  private peekAt(offset: number): string | undefined {
    return this.source[this.pos + offset];
  }

  private advance(): string {
    const ch = this.source[this.pos]!;
    this.pos++;
    if (ch === "\n") {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  private skipWhitespaceExceptNewline(): void {
    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (ch === " " || ch === "\t") {
        this.advance();
      } else {
        break;
      }
    }
  }

  private isDigit(ch: string): boolean {
    return ch >= "0" && ch <= "9";
  }

  private isAlpha(ch: string): boolean {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
  }

  private isIdentStart(ch: string): boolean {
    return this.isAlpha(ch) || ch === "_";
  }

  private isIdentPart(ch: string): boolean {
    return this.isAlpha(ch) || this.isDigit(ch) || ch === "_" || ch === "-";
  }

  // -------------------------------------------------------------------------
  // Token factory
  // -------------------------------------------------------------------------

  private loc(): SourceLocation {
    return { file: this.fileName, line: this.line, column: this.col, length: 1 };
  }

  private makeToken(type: TokenType, value: string, location: SourceLocation): Token {
    return { type, value, location: { ...location, length: Math.max(1, value.length) } };
  }
}

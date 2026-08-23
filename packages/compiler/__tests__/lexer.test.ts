import { describe, it, expect } from "vitest";
import { Lexer } from "../lexer.js";
import { TokenType } from "../types.js";

describe("Lexer", () => {
  it("tokenizes an app file", () => {
    const source = `
APP MyApp
NAME "My App"
VERSION 1.0.0
`;
    const lexer = new Lexer(source, "app.flow");
    const { tokens, diagnostics } = lexer.tokenize();

    expect(diagnostics).toHaveLength(0);

    const nonNewlines = tokens.filter(t => t.type !== TokenType.Newline && t.type !== TokenType.EOF);
    expect(nonNewlines).toHaveLength(6);
    expect(nonNewlines.map(t => t.value)).toEqual([
      "APP", "MyApp",
      "NAME", "My App",
      "VERSION", "1.0.0",
    ]);
  });

  it("handles comments", () => {
    const source = `
-- This is a comment
APP Test -- Inline comment
`;
    const lexer = new Lexer(source, "test.flow");
    const { tokens } = lexer.tokenize();
    const comments = tokens.filter(t => t.type === TokenType.Comment);
    expect(comments).toHaveLength(2);
    expect(comments[0]?.value).toBe("-- This is a comment");
    expect(comments[1]?.value).toBe("-- Inline comment");
  });

  it("tokenizes punctuation", () => {
    const source = `id : List<String>`;
    const lexer = new Lexer(source, "test.flow");
    const { tokens } = lexer.tokenize();
    const nonNewlines = tokens.filter(t => t.type !== TokenType.Newline && t.type !== TokenType.EOF);
    
    expect(nonNewlines.map(t => [t.type, t.value])).toEqual([
      [TokenType.Identifier, "id"],
      [TokenType.Colon, ":"],
      [TokenType.Identifier, "List"],
      [TokenType.LeftAngle, "<"],
      [TokenType.Identifier, "String"],
      [TokenType.RightAngle, ">"],
    ]);
  });

  it("handles hyphenated identifiers", () => {
    const source = `APP my-awesome-app
    ENTITY user-profile`;
    const lexer = new Lexer(source, "test.flow");
    const { tokens, diagnostics } = lexer.tokenize();
    expect(diagnostics).toHaveLength(0);
    const nonNewlines = tokens.filter(t => t.type !== TokenType.Newline && t.type !== TokenType.EOF);
    expect(nonNewlines.map(t => [t.type, t.value])).toEqual([
      [TokenType.Keyword, "APP"],
      [TokenType.Identifier, "my-awesome-app"],
      [TokenType.Keyword, "ENTITY"],
      [TokenType.Identifier, "user-profile"],
    ]);
  });
});

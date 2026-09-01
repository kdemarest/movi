register(() => {
  class ParserError extends Error {
    constructor(details) {
      super(details.message || "Parser error");
      this.name = "ParserError";
      this.category = "Parser";
      this.code = details.code || "MPARSE";
      this.file = details.file || "-";
      this.line = details.line || 1;
      this.column = details.column || 1;
      this.operation = details.operation || "parse-script";
    }
  }

  class Parser {
    static parseMarkdown(markdownText, filePath) {
      const section = Parser.extractScriptSection(markdownText, filePath);
      return Parser.parseScriptLines(section.lines, filePath, section.startLine);
    }

    static extractScriptSection(markdownText, filePath) {
      const text = String(markdownText || "");
      const lines = text.split(/\r?\n/);
      let start = -1;

      for (let i = 0; i < lines.length; i += 1) {
        if (/^#\s*Script\s*$/i.test(lines[i])) {
          start = i;
          break;
        }
      }

      if (start === -1) {
        throw new ParserError({
          code: "MPARSE001",
          file: filePath,
          line: 1,
          column: 1,
          message: "Missing required '# Script' section.",
        });
      }

      const body = [];
      for (let i = start + 1; i < lines.length; i += 1) {
        if (/^#\s+/.test(lines[i])) break;
        body.push(lines[i]);
      }

      return { lines: body, startLine: start + 2 };
    }

    static parseScriptLines(lines, filePath, startLine) {
      const actions = [];

      for (let i = 0; i < lines.length; i += 1) {
        const raw = lines[i];
        const trimmed = raw.trim();
        if (!trimmed) continue;
        if (/^#/.test(trimmed)) continue;

        const showMatch = trimmed.match(/^show\s+(.+?)\s+for\s+([0-9]*\.?[0-9]+s)$/i);
        if (showMatch) {
          const image = showMatch[1].trim();
          const duration = Parser.parseDuration(showMatch[2], filePath, startLine + i);
          actions.push({
            type: "show",
            image,
            durationSeconds: duration,
            line: startLine + i,
            column: 1,
          });
          continue;
        }

        throw new ParserError({
          code: "MPARSE002",
          file: filePath,
          line: startLine + i,
          column: 1,
          message: `Unknown or invalid script command: '${trimmed}'. Expected: show <image> for <duration>s`,
        });
      }

      if (actions.length === 0) {
        throw new ParserError({
          code: "MPARSE003",
          file: filePath,
          line: startLine,
          column: 1,
          message: "The '# Script' section is empty or contains no playable commands.",
        });
      }

      return { actions };
    }

    static parseDuration(token, filePath, line) {
      const m = String(token || "").match(/^([0-9]*\.?[0-9]+)s$/i);
      if (!m) {
        throw new ParserError({
          code: "MPARSE004",
          file: filePath,
          line,
          column: 1,
          message: `Invalid duration '${token}'. Expected number followed by 's' (example: 2.5s).`,
        });
      }

      const value = parseFloat(m[1]);
      if (!(value > 0)) {
        throw new ParserError({
          code: "MPARSE005",
          file: filePath,
          line,
          column: 1,
          message: `Duration must be greater than zero: '${token}'.`,
        });
      }
      return value;
    }
  }

  return {
    Parser,
    ParserError,
  };
});

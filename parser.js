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
        if (/^#{1,6}\s*Script\b.*$/i.test(lines[i])) {
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
        if (/^#{1,6}\s+/.test(lines[i])) break;
        body.push(lines[i]);
      }

      return { lines: body, startLine: start + 2 };
    }

    static parseScriptLines(lines, filePath, startLine) {
      const actions = [];
      const requiredAssets = [];
      const seenRequiredAssets = new Set();
      const showByName = {};
      let autoNameCounter = 1;

      for (let i = 0; i < lines.length; i += 1) {
        const raw = lines[i];
        const trimmed = raw.trim();
        if (!trimmed) continue;
        if (/^#/.test(trimmed)) continue;

        const showMatch = trimmed.match(/^show\s+(.+?)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s+for\s+([0-9]*\.?[0-9]+s)$/i);
        if (showMatch) {
          const image = showMatch[1].trim();
          const explicitName = showMatch[2] ? showMatch[2].trim() : "";
          const name = explicitName || `shot${autoNameCounter++}`;

          if (Object.prototype.hasOwnProperty.call(showByName, name)) {
            throw new ParserError({
              code: "MPARSE008",
              file: filePath,
              line: startLine + i,
              column: 1,
              message: `Duplicate show name '${name}'. Show names must be unique.`,
            });
          }

          const duration = Parser.parseDuration(showMatch[3], filePath, startLine + i);
          const action = {
            type: "show",
            image,
            name,
            durationSeconds: duration,
            line: startLine + i,
            column: 1,
          };
          actions.push(action);
          showByName[name] = action;

          const normalizedAsset = Parser.normalizeAssetRef(image);
          if (normalizedAsset && !seenRequiredAssets.has(normalizedAsset)) {
            seenRequiredAssets.add(normalizedAsset);
            requiredAssets.push(normalizedAsset);
          }
          continue;
        }

        const zoomMatch = trimmed.match(/^zoom\s+([A-Za-z_][A-Za-z0-9_]*)\s+to\s+([0-9]*\.?[0-9]+)\s+for\s+([0-9]*\.?[0-9]+s)$/i);
        if (zoomMatch) {
          const targetName = zoomMatch[1];
          const zoomEnd = Parser.parseZoomFactor(zoomMatch[2], filePath, startLine + i);
          const duration = Parser.parseDuration(zoomMatch[3], filePath, startLine + i);

          const lastShow = Parser.findLastShow(actions);
          if (!lastShow) {
            throw new ParserError({
              code: "MPARSE009",
              file: filePath,
              line: startLine + i,
              column: 1,
              message: `Zoom requires a prior show action.`,
            });
          }

          actions.push({
            type: "zoom",
            targetName,
            zoomEnd,
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
          message: `Unknown or invalid script command: '${trimmed}'. Expected: show <image> [as <name>] for <duration>s OR zoom <name> to <level> for <duration>s`,
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

      return {
        actions,
        requiredAssets,
      };
    }

    static normalizeAssetRef(assetRef) {
      const raw = String(assetRef || "").trim();
      if (!raw) {
        return "";
      }

      let cleaned = raw;
      const quoted = cleaned.match(/^(["'])(.*)\1$/);
      if (quoted) {
        cleaned = quoted[2];
      }

      const wiki = cleaned.match(/^\[\[(.+)\]\]$/);
      if (wiki) {
        cleaned = wiki[1].split("|")[0].trim();
      }

      cleaned = cleaned.replace(/^<|>$/g, "").trim();
      if (!cleaned) {
        return "";
      }

      const hasExtension = /\.[A-Za-z0-9]+$/.test(cleaned);
      return (hasExtension ? cleaned : `${cleaned}.png`).toLowerCase();
    }

    static getRequiredAssets(markdownText, filePath) {
      return Parser.parseMarkdown(markdownText, filePath).requiredAssets || [];
    }

    static findLastShow(actions) {
      for (let i = actions.length - 1; i >= 0; i -= 1) {
        if (actions[i] && actions[i].type === "show") return actions[i];
      }
      return null;
    }

    static parseZoomFactor(token, filePath, line) {
      const value = parseFloat(String(token || ""));
      if (!(value > 0)) {
        throw new ParserError({
          code: "MPARSE006",
          file: filePath,
          line,
          column: 1,
          message: `Zoom factor must be greater than zero: '${token}'.`,
        });
      }
      return value;
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

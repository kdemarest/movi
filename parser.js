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
      const usedLabels = new Set();
      let autoNameCounter = 1;
      let pendingAnchor = null;

      const claimLabel = (name, filePath, line) => {
        if (!name) return;
        if (usedLabels.has(name)) {
          throw new ParserError({
            code: "MPARSE008",
            file: filePath,
            line,
            column: 1,
            message: `Duplicate label '${name}'. Labels must be unique.`,
          });
        }
        usedLabels.add(name);
      };

      for (let i = 0; i < lines.length; i += 1) {
        const raw = lines[i];
        const trimmed = raw.trim();
        if (!trimmed) continue;
        if (/^#/.test(trimmed)) continue;

        const atMatch = trimmed.match(/^at\s+([A-Za-z_][A-Za-z0-9_]*)(?:([+-][0-9]*\.?[0-9]+)s|\s+([0-9]*\.?[0-9]+)%)?$/i);
        if (atMatch) {
          if (pendingAnchor) {
            throw new ParserError({
              code: "MPARSE012",
              file: filePath,
              line: startLine + i,
              column: 1,
              message: `Dangling 'at ${pendingAnchor.label}' at line ${pendingAnchor.line} has no following command to apply to.`,
            });
          }

          const label = atMatch[1];
          if (!usedLabels.has(label)) {
            throw new ParserError({
              code: "MPARSE011",
              file: filePath,
              line: startLine + i,
              column: 1,
              message: `Unknown label '${label}' referenced by 'at'. Labels must be defined with 'as <name>' before they can be used.`,
            });
          }

          pendingAnchor = {
            label,
            offsetSeconds: atMatch[2] !== undefined ? parseFloat(atMatch[2]) : null,
            percent: atMatch[3] !== undefined ? parseFloat(atMatch[3]) : null,
            line: startLine + i,
          };
          continue;
        }

        const showMatch = trimmed.match(/^show\s+(.+?)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s+for\s+([0-9]*\.?[0-9]+s)$/i);
        if (showMatch) {
          if (pendingAnchor) {
            throw new ParserError({
              code: "MPARSE013",
              file: filePath,
              line: startLine + i,
              column: 1,
              message: `'at ${pendingAnchor.label}' at line ${pendingAnchor.line} must be followed by 'caption'; found 'show' instead.`,
            });
          }

          const image = showMatch[1].trim();
          const explicitName = showMatch[2] ? showMatch[2].trim() : "";
          const name = explicitName || `shot${autoNameCounter++}`;

          claimLabel(name, filePath, startLine + i);

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

        const zoomMatch = trimmed.match(/^zoom\s+([A-Za-z_][A-Za-z0-9_]*)\s+to\s+([0-9]*\.?[0-9]+)\s+for\s+([0-9]*\.?[0-9]+s)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/i);
        if (zoomMatch) {
          if (pendingAnchor) {
            throw new ParserError({
              code: "MPARSE013",
              file: filePath,
              line: startLine + i,
              column: 1,
              message: `'at ${pendingAnchor.label}' at line ${pendingAnchor.line} must be followed by 'caption'; found 'zoom' instead.`,
            });
          }

          const targetName = zoomMatch[1];
          const zoomEnd = Parser.parseZoomFactor(zoomMatch[2], filePath, startLine + i);
          const duration = Parser.parseDuration(zoomMatch[3], filePath, startLine + i);
          const name = zoomMatch[4] || "";

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

          claimLabel(name, filePath, startLine + i);

          actions.push({
            type: "zoom",
            targetName,
            zoomEnd,
            durationSeconds: duration,
            name,
            line: startLine + i,
            column: 1,
          });
          continue;
        }

        const cutMatch = trimmed.match(/^cut(?:\s+([A-Za-z_][A-Za-z0-9_]*))?\s+at\s+([0-9]*\.?[0-9]+)\s+for\s+([0-9]*\.?[0-9]+s)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/i);
        if (cutMatch) {
          if (pendingAnchor) {
            throw new ParserError({
              code: "MPARSE013",
              file: filePath,
              line: startLine + i,
              column: 1,
              message: `'at ${pendingAnchor.label}' at line ${pendingAnchor.line} must be followed by 'caption'; found 'cut' instead.`,
            });
          }

          const targetName = cutMatch[1] || "";
          const zoomEnd = Parser.parseZoomFactor(cutMatch[2], filePath, startLine + i);
          const duration = Parser.parseDuration(cutMatch[3], filePath, startLine + i);
          const name = cutMatch[4] || "";

          const lastShow = Parser.findLastShow(actions);
          if (!lastShow) {
            throw new ParserError({
              code: "MPARSE010",
              file: filePath,
              line: startLine + i,
              column: 1,
              message: `Cut requires a prior show action.`,
            });
          }

          claimLabel(name, filePath, startLine + i);

          actions.push({
            type: "cut",
            targetName,
            zoomEnd,
            durationSeconds: duration,
            name,
            line: startLine + i,
            column: 1,
          });
          continue;
        }

        const captionMatch = trimmed.match(/^caption\s+([0-9]*\.?[0-9]+s)\s+([A-Za-z_][A-Za-z0-9_]*)\s+"((?:[^"\\]|\\.)*)"$/i);
        if (captionMatch) {
          const duration = Parser.parseDuration(captionMatch[1], filePath, startLine + i);
          const key = captionMatch[2];
          const text = captionMatch[3].replace(/\\(.)/g, (full, ch) => (ch === "n" ? "\n" : ch));

          actions.push({
            type: "caption",
            key,
            text,
            durationSeconds: duration,
            anchorLabel: pendingAnchor ? pendingAnchor.label : "",
            anchorOffsetSeconds: pendingAnchor ? pendingAnchor.offsetSeconds : null,
            anchorPercent: pendingAnchor ? pendingAnchor.percent : null,
            line: startLine + i,
            column: 1,
          });
          pendingAnchor = null;
          continue;
        }

        throw new ParserError({
          code: "MPARSE002",
          file: filePath,
          line: startLine + i,
          column: 1,
          message: `Unknown or invalid script command: '${trimmed}'. Expected: show <image> [as <name>] for <duration>s OR zoom <name> to <level> for <duration>s [as <name>] OR cut [<mark>] at <level> for <duration>s [as <name>] OR caption <duration>s <key> "<text>" OR at <label>[+/-<offset>s | <percent>%]`,
        });
      }

      if (pendingAnchor) {
        throw new ParserError({
          code: "MPARSE012",
          file: filePath,
          line: pendingAnchor.line,
          column: 1,
          message: `Dangling 'at ${pendingAnchor.label}' at line ${pendingAnchor.line} has no following command to apply to.`,
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

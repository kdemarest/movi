// The movi namespace; units add their exports to it.
const Movi = {};

unit("plugin", [], () => {
  const { Plugin, Notice, normalizePath } = require("obsidian");

  // Vault folder holding all content (markdown scripts, images, config, language files).
  const CONTENT_ROOT = "canvid";
  const contentPath = relativePath => `${CONTENT_ROOT}/${relativePath}`;

  class MoviPlugin extends Plugin {
    async onload() {
      this.errorModal = null;
      this.logger = new Movi.Logger(this.app, {
        logPath: "movi/movi.log",
        maxBytes: 6144,
      });

      await this.logger.appendRunHeader();
      await this.logger.info("plugin-load", "movi loaded", {
        category: "Lifecycle",
        code: "MLOAD",
      });

      this.lastPlayedScriptPath = null;

      this.playerViewStyle = document.createElement("style");
      this.playerViewStyle.textContent = `
        .movi-player-active .mobile-navbar {
          display: none !important;
        }
      `;
      document.head.appendChild(this.playerViewStyle);
      this.setPlayerViewActive(false);

      this.registerView(
        Movi.MOVI_PLAYER_VIEW_TYPE,
        (leaf) => new Movi.PlayerView(leaf, this.app, this.logger)
      );

      this.addCommand({
        id: "movi-play-active-script",
        name: "movi Play",
        callback: async () => {
          await this.playActiveScript();
        },
      });

      this.addCommand({
        id: "movi-run-smoke-tests",
        name: "movi Run Smoke Tests",
        callback: async () => {
          try {
            const report = await Movi.Test.runAll(this.logger);
            new Notice(`movi tests: ${report.passed} passed, ${report.failed} failed`);
          } catch (error) {
            this.reportError("running smoke tests", error);
          }
        },
      });

      this.addCommand({
        id: "movi-validate-active-script",
        name: "movi Validate Active Script",
        callback: async () => {
          await this.validateActiveScript();
        },
      });

      this.registerEvent(
        this.app.workspace.on("active-leaf-change", (leaf) => {
          this.setPlayerViewActive(this.isPlayerView(leaf && leaf.view));
        })
      );

      this.registerDomEvent(window, "gptviz:movie-mode-request", (event) => {
        this.handleMovieModeRequest(event).catch(async (error) => {
          const requestedPath = event.detail.filePath || "<active>";
          await this.reportScriptError(requestedPath, error, "movie-mode-request");
        });
      });

      this.registerDomEvent(window, "gptviz:script-required-assets-request", (event) => {
        this.handleScriptRequiredAssetsRequest(event).catch(async (error) => {
          const requestedPath = event.detail.filePath || "<unknown>";
          await this.reportScriptError(requestedPath, error, "script-required-assets-request");
        });
      });
    }

    isPlayerView(view) {
      // Class check: an unloaded tab holds a placeholder view that only reports this type.
      return view instanceof Movi.PlayerView;
    }

    setPlayerViewActive(active) {
      document.body.classList.toggle("movi-player-active", Boolean(active));
    }

    // gptviz contract: detail = { filePath, resolve({ requiredAssets }), reject(error) }.
    // Claim the request synchronously so gptviz knows movi is present.
    async handleScriptRequiredAssetsRequest(event) {
      event.preventDefault();
      const { filePath, resolve, reject } = event.detail;

      try {
        resolve({ requiredAssets: await this.getScriptRequiredAssetsForFilePath(filePath) });
      } catch (error) {
        reject(error);
      }
    }

    async getScriptRequiredAssetsForFilePath(filePath) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!file || file.extension !== "md") {
        throw new Error(`Script note not found: ${filePath}`);
      }

      const text = await this.app.vault.cachedRead(file);
      return Movi.Parser.parseMarkdown(text, file.path).requiredAssets;
    }

    async handleMovieModeRequest(event) {
      event.preventDefault();

      // filePath is optional: without it, play the active script. scriptLine (0-based, optional)
      // picks among several Script headings in that file.
      const requestedPath = event.detail.filePath || "";
      const scriptLine = event.detail.scriptLine;

      if (requestedPath) {
        const file = this.app.vault.getAbstractFileByPath(requestedPath);
        const extension = String(file && file.extension ? file.extension : "").toLowerCase();

        if (file && (extension === "md" || extension === "ms")) {
          try {
            await this.playScriptFile(file, scriptLine);
            return;
          } catch (error) {
            await this.reportScriptError(file.path, error, "movie-mode-request");
            return;
          }
        }
      }

      await this.playActiveScript();
    }

    async playScriptFile(file, scriptLine) {
      const text = await this.app.vault.cachedRead(file);
      const parsed = Movi.Parser.parseMarkdown(text, file.path, scriptLine);
      const { actions, captions } = await this.preparePlaybackActions(parsed, file.path);

      const view = await this.getOrCreatePlayerView();
      this.lastPlayedScriptPath = file.path;
      view.loadMovie({ sourcePath: file.path, actions, captions });
      view.play();

      await this.logger.info("play", "movi playback started", {
        category: "Player",
        code: "MPLAY_OK",
        file: file.path,
      });
    }

    async playActiveScript() {
      const file = this.app.workspace.getActiveFile();
      if (!file) {
        new Notice("movi: No active file to play.");
        return;
      }

      const ext = String(file.extension || "").toLowerCase();
      if (ext !== "md" && ext !== "ms") {
        new Notice("movi: Active file must be .md or .ms.");
        return;
      }

      try {
        await this.playScriptFile(file);
      } catch (error) {
        await this.reportScriptError(file.path, error, "play");
      }
    }

    async preparePlaybackActions(parsed, sourcePath) {
      const actions = parsed.actions;
      if (actions.length === 0) {
        throw {
          category: "Content",
          code: "MCONTENT002",
          line: 1,
          column: 1,
          message: "No playable actions were produced by the parser.",
        };
      }

      const out = [];
      const captions = [];
      const marksByImagePath = {};
      const labelToIndex = {};
      let currentShow = null;
      let lastVisualIndex = -1;
      const currentLanguage = await this.getCurrentLanguage();
      let languageTextMap = null;

      for (let i = 0; i < actions.length; i += 1) {
        const action = actions[i];

        if (action.type === "show") {
          const file = this.resolveImageFile(action.image, sourcePath);
          if (!file) {
            throw {
              category: "Content",
              code: "MCONTENT001",
              line: action.line || 1,
              column: action.column || 1,
              message: `Image not found: '${action.image}'. Checked script directory and vault root (for example VID-M01-01.PNG).`,
            };
          }

          out.push({
            type: "show",
            image: action.image,
            name: action.name,
            durationSeconds: action.durationSeconds,
            line: action.line,
            column: action.column,
            file,
          });

          currentShow = out[out.length - 1];
          lastVisualIndex = out.length - 1;
          if (action.name) {
            labelToIndex[action.name] = lastVisualIndex;
          }
          continue;
        }

        if (action.type === "zoom") {
          if (!currentShow || !currentShow.file) {
            throw {
              category: "Content",
              code: "MCONTENT004",
              line: action.line || 1,
              column: action.column || 1,
              message: "Zoom requires a current shown image.",
            };
          }

          const targetName = String(action.targetName || "").trim();
          const imagePath = currentShow.file.path;
          if (!Object.prototype.hasOwnProperty.call(marksByImagePath, imagePath)) {
            marksByImagePath[imagePath] = await this.readMarkSidecarForImage(currentShow.file);
          }
          const markMap = marksByImagePath[imagePath];
          const mark = targetName ? markMap[targetName] : null;

          if (!mark && targetName !== currentShow.name) {
            throw {
              category: "Content",
              code: "MCONTENT004",
              line: action.line || 1,
              column: action.column || 1,
              message: `Zoom target '${targetName}' was not found for image '${currentShow.image}'. Expected sidecar '${this.getMarkSidecarPathForImage(currentShow.file)}'.`,
            };
          }

          out.push({
            type: "zoom",
            image: currentShow.image,
            durationSeconds: action.durationSeconds,
            zoomStart: action.zoomStart,
            zoomEnd: action.zoomEnd,
            zoomTargetName: targetName,
            zoomAnchorX: mark ? mark.x : 0.5,
            zoomAnchorY: mark ? mark.y : 0.5,
            name: action.name || "",
            line: action.line,
            column: action.column,
            file: currentShow.file,
          });
          lastVisualIndex = out.length - 1;
          if (action.name) {
            labelToIndex[action.name] = lastVisualIndex;
          }
          continue;
        }

        if (action.type === "cut") {
          if (!currentShow || !currentShow.file) {
            throw {
              category: "Content",
              code: "MCONTENT008",
              line: action.line || 1,
              column: action.column || 1,
              message: "Cut requires a current shown image.",
            };
          }

          const targetName = String(action.targetName || "").trim();
          let anchorX = 0.5;
          let anchorY = 0.5;

          if (targetName) {
            const imagePath = currentShow.file.path;
            if (!Object.prototype.hasOwnProperty.call(marksByImagePath, imagePath)) {
              marksByImagePath[imagePath] = await this.readMarkSidecarForImage(currentShow.file);
            }
            const markMap = marksByImagePath[imagePath];
            const mark = markMap[targetName];

            if (!mark && targetName !== currentShow.name) {
              throw {
                category: "Content",
                code: "MCONTENT008",
                line: action.line || 1,
                column: action.column || 1,
                message: `Cut target '${targetName}' was not found for image '${currentShow.image}'. Expected sidecar '${this.getMarkSidecarPathForImage(currentShow.file)}'.`,
              };
            }

            if (mark) {
              anchorX = mark.x;
              anchorY = mark.y;
            }
          }

          out.push({
            type: "cut",
            image: currentShow.image,
            durationSeconds: action.durationSeconds,
            zoomEnd: action.zoomEnd,
            zoomTargetName: targetName,
            zoomAnchorX: anchorX,
            zoomAnchorY: anchorY,
            name: action.name || "",
            line: action.line,
            column: action.column,
            file: currentShow.file,
          });
          lastVisualIndex = out.length - 1;
          if (action.name) {
            labelToIndex[action.name] = lastVisualIndex;
          }
          continue;
        }

        if (action.type === "caption") {
          let text = action.text;

          if (currentLanguage !== "English") {
            if (languageTextMap === null) {
              languageTextMap = await this.readLanguageFile(currentLanguage);
            }
            if (Object.prototype.hasOwnProperty.call(languageTextMap, action.key)) {
              text = languageTextMap[action.key];
            }
          }

          let anchorIndex = lastVisualIndex;
          if (action.anchorLabel) {
            if (!Object.prototype.hasOwnProperty.call(labelToIndex, action.anchorLabel)) {
              throw {
                category: "Content",
                code: "MCONTENT012",
                line: action.line || 1,
                column: action.column || 1,
                message: `Internal error: label '${action.anchorLabel}' referenced by 'at' did not resolve to a visual action.`,
              };
            }
            anchorIndex = labelToIndex[action.anchorLabel];
          }

          captions.push({
            key: action.key,
            text,
            durationSeconds: action.durationSeconds,
            anchorIndex,
            anchorOffsetSeconds: action.anchorOffsetSeconds,
            anchorPercent: action.anchorPercent,
            line: action.line,
            column: action.column,
          });
          continue;
        }

        throw {
          category: "Content",
          code: "MCONTENT003",
          line: action.line || 1,
          column: action.column || 1,
          message: `Unsupported action type for v0 playback: ${action.type}`,
        };
      }

      return { actions: out, captions };
    }

    resolveImageFile(imageRef, sourcePath) {
      const raw = String(imageRef || "").trim();
      if (!raw) return null;

      const sourceDir = this.getDirectory(sourcePath);
      const candidates = [];

      const hasDotExt = /\.[A-Za-z0-9]+$/.test(raw);

      if (raw.startsWith("/")) {
        const abs = normalizePath(contentPath(raw.replace(/^\/+/, "")));
        candidates.push(abs);
        if (!hasDotExt) {
          candidates.push(`${abs}.PNG`);
          candidates.push(`${abs}.png`);
        }
      } else {
        if (sourceDir) {
          const rel = normalizePath(`${sourceDir}/${raw}`);
          candidates.push(rel);
          if (!hasDotExt) {
            candidates.push(`${rel}.PNG`);
            candidates.push(`${rel}.png`);
          }
        }

        const root = normalizePath(contentPath(raw));
        candidates.push(root);
        if (!hasDotExt) {
          candidates.push(`${root}.PNG`);
          candidates.push(`${root}.png`);
        }
      }

      for (let i = 0; i < candidates.length; i += 1) {
        const path = candidates[i];
        const exact = this.app.vault.getFileByPath(path);
        if (exact) return exact;

        const lower = path.toLowerCase();
        const files = this.app.vault.getFiles();
        for (let j = 0; j < files.length; j += 1) {
          if (files[j].path.toLowerCase() === lower) return files[j];
        }
      }

      return null;
    }

    getMarkSidecarPathForImage(imageFile) {
      const full = String(imageFile && imageFile.path ? imageFile.path : "");
      if (!full) return "";
      const slash = full.lastIndexOf("/");
      const dir = slash === -1 ? "" : full.substring(0, slash + 1);
      const name = slash === -1 ? full : full.substring(slash + 1);
      const dot = name.lastIndexOf(".");
      const base = dot === -1 ? name : name.substring(0, dot);
      return `${dir}${base}.marks.json`;
    }

    async readMarkSidecarForImage(imageFile) {
      const markPath = this.getMarkSidecarPathForImage(imageFile);
      if (!markPath) return {};

      if (!(await this.app.vault.adapter.exists(markPath))) {
        return {};
      }

      let text;
      try {
        text = await this.app.vault.adapter.read(markPath);
      } catch (error) {
        throw {
          category: "Content",
          code: "MCONTENT005",
          line: 1,
          column: 1,
          message: `Could not read mark sidecar '${markPath}'.`,
        };
      }

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw {
          category: "Content",
          code: "MCONTENT006",
          line: 1,
          column: 1,
          message: `Invalid JSON in mark sidecar '${markPath}'.`,
        };
      }

      if (!parsed || !Array.isArray(parsed.marks)) {
        throw {
          category: "Content",
          code: "MCONTENT013",
          line: 1,
          column: 1,
          message: `Mark sidecar '${markPath}' has no "marks" array.`,
        };
      }

      const map = {};
      for (const mark of parsed.marks) {
        const name = String((mark && mark.name) || "").trim();
        const x = Number(mark && mark.x);
        const y = Number(mark && mark.y);
        if (!name) {
          throw {
            category: "Content",
            code: "MCONTENT014",
            line: 1,
            column: 1,
            message: `Mark sidecar '${markPath}' has a mark with no name.`,
          };
        }
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
          throw {
            category: "Content",
            code: "MCONTENT007",
            line: 1,
            column: 1,
            message: `Invalid mark '${name}' in sidecar '${markPath}'. Coordinates must be normalized 0..1.`,
          };
        }
        map[name] = { x, y };
      }
      return map;
    }

    async getCurrentLanguage() {
      const configPath = contentPath("_config.json");

      if (!(await this.app.vault.adapter.exists(configPath))) {
        return "English";
      }

      let text;
      try {
        text = await this.app.vault.adapter.read(configPath);
      } catch (error) {
        throw {
          category: "Content",
          code: "MCONTENT009",
          line: 1,
          column: 1,
          message: `Could not read '${configPath}'.`,
        };
      }

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw {
          category: "Content",
          code: "MCONTENT010",
          line: 1,
          column: 1,
          message: `Invalid JSON in '${configPath}'.`,
        };
      }

      const language = parsed && typeof parsed.language === "string" ? parsed.language.trim() : "";
      return language || "English";
    }

    async readLanguageFile(language) {
      const name = String(language || "").trim();
      if (!name) return {};

      const languagePath = contentPath(`${name}.txt`);
      if (!(await this.app.vault.adapter.exists(languagePath))) {
        return {};
      }

      let text;
      try {
        text = await this.app.vault.adapter.read(languagePath);
      } catch (error) {
        throw {
          category: "Content",
          code: "MCONTENT011",
          line: 1,
          column: 1,
          message: `Could not read '${languagePath}'.`,
        };
      }

      return this.parseLangFile(text);
    }

    parseLangFile(text) {
      const lines = String(text || "").split(/\r?\n/);
      const map = {};
      let currentKey = null;
      let buffer = [];

      const flush = () => {
        if (currentKey !== null) {
          map[currentKey] = buffer.join("\n").trim();
        }
        buffer = [];
      };

      for (const line of lines) {
        const headerMatch = /^([A-Za-z_][A-Za-z0-9_]*):\s*$/.exec(line);
        if (headerMatch) {
          flush();
          currentKey = headerMatch[1];
          continue;
        }
        if (currentKey !== null) {
          buffer.push(line);
        }
      }
      flush();

      return map;
    }

    getDirectory(path) {
      const p = String(path || "");
      const idx = p.lastIndexOf("/");
      return idx === -1 ? "" : p.substring(0, idx);
    }

    async getOrCreatePlayerView() {
      const type = Movi.MOVI_PLAYER_VIEW_TYPE;
      let leaves = this.app.workspace.getLeavesOfType(type);

      if (leaves.length > 1) {
        for (let i = 1; i < leaves.length; i += 1) {
          leaves[i].detach();
        }
        leaves = this.app.workspace.getLeavesOfType(type);
      }

      let leaf = leaves[0];
      if (!leaf) {
        leaf = this.app.workspace.getLeaf("tab");
        await leaf.setViewState({ type, active: true });
      }

      await this.app.workspace.revealLeaf(leaf);
      this.setPlayerViewActive(true);
      return leaf.view;
    }

    async validateActiveScript() {
      const file = this.app.workspace.getActiveFile();
      if (!file) {
        new Notice("movi: No active file to validate.");
        return;
      }

      const ext = String(file.extension || "").toLowerCase();
      if (ext !== "md" && ext !== "ms") {
        new Notice("movi: Active file must be .md or .ms.");
        return;
      }

      try {
        const text = await this.app.vault.cachedRead(file);
        const parsed = Movi.Parser.parseMarkdown(text, file.path);
        const count = parsed && parsed.actions ? parsed.actions.length : 0;
        const msg = `movi: Parsed ${count} action${count === 1 ? "" : "s"}.`;
        new Notice(msg);
        await this.logger.info("validate-script", msg, {
          category: "Parser",
          code: "MPARSE_OK",
          file: file.path,
        });
      } catch (error) {
        await this.reportScriptError(file.path, error, "validate-script");
      }
    }

    // Script errors (Parser/Content, carrying category/code/line) are the author's to fix:
    // Notice + movi.log + _lastErr.log. Anything else is a code bug and goes to reportError.
    async reportScriptError(filePath, error, operation) {
      if (!error || !error.category) {
        this.reportError(operation, error);
        return;
      }

      const { category, code, message } = error;
      const line = error.line || 1;
      const notice = `movi ${category} ${code} at ${filePath}:${line} - ${message}`;
      new Notice(notice, 10000);

      await this.logger.error(operation, category, code, message, {
        file: filePath,
        line,
        column: error.column || 1,
      });
      await this.writeLastError(operation, "script", notice, new Date().toISOString());
    }

    async onunload() {
      if (this.errorModal) {
        this.errorModal.close();
        this.errorModal = null;
      }
      this.setPlayerViewActive(false);

      if (this.playerViewStyle) {
        this.playerViewStyle.remove();
        this.playerViewStyle = null;
      }

      const type = Movi.MOVI_PLAYER_VIEW_TYPE;
      const leaves = this.app.workspace.getLeavesOfType(type);
      for (let i = 0; i < leaves.length; i += 1) {
        leaves[i].detach();
      }

      if (this.logger) {
        await this.logger.info("plugin-unload", "movi unloaded", {
          category: "Lifecycle",
          code: "MUNLOAD",
        });
      }
    }
  }

  Object.assign(Movi, {
    MoviPlugin,
  });

  module.exports = Movi.MoviPlugin;
});

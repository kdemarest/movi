register(() => {
  const { Plugin, Notice, MarkdownView, Modal, normalizePath } = require("obsidian");

  // Vault folder holding all content (markdown scripts, images, config, language files).
  const CONTENT_ROOT = "canvid";
  const contentPath = relativePath => `${CONTENT_ROOT}/${relativePath}`;

  class ScriptUsageModal extends Modal {
    constructor(app, assetName, rows) {
      super(app);
      this.assetName = assetName;
      this.rows = Array.isArray(rows) ? rows : [];
    }

    onOpen() {
      const contentEl = this.contentEl;
      contentEl.empty();
      this.titleEl.textContent = `Movi scripts using ${this.assetName}`;

      if (this.rows.length === 0) {
        contentEl.createEl("p", {
          text: `No # Script declarations reference ${this.assetName}.`,
        });
        return;
      }

      const list = contentEl.createEl("div");
      list.style.maxHeight = "60vh";
      list.style.overflowY = "auto";

      for (const row of this.rows) {
        const item = list.createEl("div");
        item.style.display = "grid";
        item.style.gridTemplateColumns = "1fr";
        item.style.gap = "0.25em";
        item.style.padding = "0.6em 0";
        item.style.borderBottom = "1px solid var(--background-modifier-border)";

        const openButton = item.createEl("button", {
          text: row.name,
        });
        openButton.style.textAlign = "left";
        openButton.addEventListener("click", async () => {
          const file = this.app.vault.getAbstractFileByPath(row.path);
          if (!file) {
            new Notice(`movi: Script note not found: ${row.path}`);
            return;
          }

          await this.app.workspace.getLeaf(true).openFile(file);
          this.close();
        });

        item.createEl("div", {
          text: row.path,
        });
      }
    }

    onClose() {
      this.contentEl.empty();
    }
  }

  class MoviPlugin extends Plugin {
    async onload() {
      this.logger = new Movi.Logger(this.app, {
        logPath: "movi/movi.log",
        maxBytes: 6144,
      });

      await this.logger.appendRunHeader();
      await this.logger.info("plugin-load", "movi loaded", {
        category: "Lifecycle",
        code: "MLOAD",
      });

      this.markdownMoviPlayActionClass = "movi-play-action";
      this.candidateMoviPlayActionClass = "movi-candidate-play-action";
      this.playerMoviPlayActionClass = "movi-player-play-action";
      this.playerReturnActionClass = "movi-player-return-action";
      this.markdownActionRefreshTimer = null;
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
          const report = await Movi.Test.runAll(this.logger);
          const msg = `movi tests: ${report.passed} passed, ${report.failed} failed`;
          new Notice(msg);
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
        this.app.workspace.on("file-open", (file) => {
          if (file && file.extension === "md") {
            this.addMarkdownPlayActions();
          }
          this.addCandidateViewPlayActions();
          this.addPlayerViewPlayActions();
        })
      );

      this.registerEvent(
        this.app.workspace.on("active-leaf-change", (leaf) => {
          if (leaf && leaf.view instanceof MarkdownView) {
            this.addMarkdownPlayActions();
          }
          this.addCandidateViewPlayActions();
          this.addPlayerViewPlayActions();
          this.setPlayerViewActive(this.isPlayerView(leaf && leaf.view));
        })
      );

      this.registerEvent(
        this.app.workspace.on("layout-change", () => {
          this.addMarkdownPlayActions();
          this.addCandidateViewPlayActions();
          this.addPlayerViewPlayActions();
        })
      );

      this.registerEvent(
        this.app.workspace.on("editor-change", () => {
          this.scheduleMarkdownPlayActionStateRefresh();
        })
      );

      this.registerEvent(
        this.app.metadataCache.on("changed", (file) => {
          if (file && file.extension === "md") {
            this.updateMarkdownPlayActionStates();
          }
        })
      );

      this.registerDomEvent(window, "gptviz:movie-mode-request", (event) => {
        this.handleMovieModeRequest(event).catch(async (error) => {
          const requestedPath =
            event && event.detail && typeof event.detail.filePath === "string"
              ? event.detail.filePath
              : "<active>";
          await this.reportScriptError(requestedPath, error, "movie-mode-request");
        });
      });

      this.registerDomEvent(window, "gptviz:script-required-assets-request", (event) => {
        this.handleScriptRequiredAssetsRequest(event).catch(async (error) => {
          const requestedPath =
            event && event.detail && typeof event.detail.filePath === "string"
              ? event.detail.filePath
              : "<unknown>";
          await this.reportScriptError(requestedPath, error, "script-required-assets-request");
        });
      });

      this.addMarkdownPlayActions();
      this.addCandidateViewPlayActions();
      this.addPlayerViewPlayActions();

      this.app.workspace.onLayoutReady(() => {
        this.addMarkdownPlayActions();
        this.addCandidateViewPlayActions();
        this.addPlayerViewPlayActions();
      });
    }

    markdownFileHasScriptHeading(file) {
      if (!file || file.extension !== "md") {
        return false;
      }

      const cache = this.app.metadataCache.getFileCache(file);
      const headings = Array.isArray(cache?.headings) ? cache.headings : [];
      return headings.some(
        (heading) =>
          typeof heading?.heading === "string" &&
          heading.heading.trim().toLowerCase().startsWith("script")
      );
    }

    setMarkdownPlayActionEnabled(actionEl, enabled) {
      if (!actionEl) {
        return;
      }

      if (enabled) {
        actionEl.classList.remove("is-disabled");
        actionEl.removeAttribute("aria-disabled");
        actionEl.style.pointerEvents = "";
        actionEl.style.opacity = "";
        return;
      }

      actionEl.classList.add("is-disabled");
      actionEl.setAttribute("aria-disabled", "true");
      actionEl.style.pointerEvents = "none";
      actionEl.style.opacity = "0.45";
    }

    scheduleMarkdownPlayActionStateRefresh() {
      if (this.markdownActionRefreshTimer) {
        window.clearTimeout(this.markdownActionRefreshTimer);
      }

      this.markdownActionRefreshTimer = window.setTimeout(() => {
        this.markdownActionRefreshTimer = null;
        this.updateMarkdownPlayActionStates();
      }, 200);
    }

    updateMarkdownPlayActionStates() {
      for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
        const view = leaf.view;
        if (!(view instanceof MarkdownView) || !view.file) {
          continue;
        }

        const enabled = this.markdownFileHasScriptHeading(view.file);
        const actions = view.containerEl.querySelectorAll(
          `.${this.markdownMoviPlayActionClass}`
        );
        actions.forEach((action) => {
          this.setMarkdownPlayActionEnabled(action, enabled);
        });
      }
    }

    getFirstActionBySelector(actionsEl, selector) {
      if (!actionsEl || !selector) {
        return null;
      }

      return actionsEl.querySelector(selector);
    }

    enforceMoviActionOrder(view, moviActionClass) {
      if (!view || !view.containerEl || !moviActionClass) {
        return;
      }

      const actionsEl = view.containerEl.querySelector(".view-actions");
      if (!actionsEl) {
        return;
      }

      const markdownActionEl = this.getFirstActionBySelector(
        actionsEl,
        '.view-action.gptviz-return-to-note-action, .view-action[aria-label="Return to note"], .view-action[title="Return to note"], .view-action.mod-source-view, .view-action[aria-label*="Source mode"], .view-action[aria-label*="Live Preview"], .view-action[aria-label*="Reading view"], .view-action[aria-label*="Edit mode"]'
      );
      const imageActionEl = this.getFirstActionBySelector(
        actionsEl,
        '.view-action.gptviz-review-images-action, .view-action.gptviz-shared-review-action, .view-action[aria-label="GPTViz Candidate View"], .view-action[title="GPTViz Candidate View"]'
      );
      const moviActionEl = this.getFirstActionBySelector(
        actionsEl,
        `.${moviActionClass}, .view-action[aria-label="Movi Play"], .view-action[title="Movi Play"]`
      );
      const dependencyActionEl = this.getFirstActionBySelector(
        actionsEl,
        '.view-action.gptviz-dependency-check-action, .view-action.gptviz-shared-dependency-action, .view-action[aria-label="GPTViz Validate Dependencies"], .view-action[title="GPTViz Validate Dependencies"]'
      );
      const optionsActionEl = this.getFirstActionBySelector(
        actionsEl,
        '.view-action.mod-options, .view-action[aria-label*="More options"], .view-action[aria-label*="Options"]'
      );

      const orderedCore = [
        markdownActionEl,
        imageActionEl,
        moviActionEl,
        dependencyActionEl,
      ].filter(Boolean);

      if (orderedCore.length === 0) {
        return;
      }

      let insertBefore = optionsActionEl || null;
      for (let i = orderedCore.length - 1; i >= 0; i -= 1) {
        const actionEl = orderedCore[i];
        if (insertBefore) {
          actionsEl.insertBefore(actionEl, insertBefore);
        } else {
          actionsEl.appendChild(actionEl);
        }
        insertBefore = actionEl;
      }

      if (optionsActionEl && actionsEl.lastChild !== optionsActionEl) {
        actionsEl.appendChild(optionsActionEl);
      }
    }

    removeMarkdownPlayActions() {
      for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
        const view = leaf.view;
        if (!(view instanceof MarkdownView)) {
          continue;
        }

        view.containerEl
          .querySelectorAll(
            `.${this.markdownMoviPlayActionClass}, [aria-label="Movi Play"], [title="Movi Play"]`
          )
          .forEach((action) => action.remove());
      }
    }

    isGptvizCandidateView(view) {
      return (
        view &&
        typeof view.getViewType === "function" &&
        view.getViewType() === "gptviz-candidates"
      );
    }

    isPlayerView(view) {
      return (
        view &&
        typeof view.getViewType === "function" &&
        view.getViewType() === Movi.MOVI_PLAYER_VIEW_TYPE
      );
    }

    setPlayerViewActive(active) {
      document.body.classList.toggle("movi-player-active", Boolean(active));
    }

    normalizeAssetRef(assetRef) {
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

      const parts = cleaned.split("/");
      const fileName = parts[parts.length - 1].trim();
      if (!fileName) {
        return "";
      }

      if (/\.[A-Za-z0-9]+$/.test(fileName)) {
        return fileName.toLowerCase();
      }

      return `${fileName.toLowerCase()}.png`;
    }

    getAssetNameForCandidateView(view) {
      if (!this.isGptvizCandidateView(view)) {
        return null;
      }

      const index = Number(view.index);
      const candidates = Array.isArray(view.candidates) ? view.candidates : [];
      const candidate =
        Number.isFinite(index) && index >= 0 && index < candidates.length
          ? candidates[index]
          : null;
      const candidateName = candidate && candidate.file ? candidate.file.name : "";
      const normalizedCandidateName = this.normalizeAssetRef(candidateName);

      if (!normalizedCandidateName) {
        return null;
      }

      const candidateMatch = normalizedCandidateName.match(/^(.*)-[0-9]+\.png$/i);
      if (candidateMatch && candidateMatch[1]) {
        return `${candidateMatch[1]}.png`;
      }

      return normalizedCandidateName;
    }

    async findScriptsUsingAsset(assetName) {
      const target = this.normalizeAssetRef(assetName);
      if (!target) {
        return [];
      }

      const results = [];
      const markdownFiles = this.app.vault.getMarkdownFiles()
        .filter(file => file.path.startsWith(contentPath("")));

      for (const file of markdownFiles) {
        const text = await this.app.vault.cachedRead(file);
        const lines = String(text || "").split(/\r?\n/);
        let inScript = false;
        let hasMatch = false;

        for (let i = 0; i < lines.length; i += 1) {
          const rawLine = lines[i];
          const trimmed = rawLine.trim();

          if (/^#{1,6}\s*Script\b.*$/i.test(trimmed)) {
            inScript = true;
            continue;
          }

          if (inScript && /^#{1,6}\s+/.test(rawLine)) {
            inScript = false;
            continue;
          }

          if (!inScript) {
            continue;
          }

          if (!trimmed || /^#/.test(trimmed)) {
            continue;
          }

          const showMatch = trimmed.match(
            /^show\s+(.+?)(?:\s+as\s+[A-Za-z_][A-Za-z0-9_]*)?\s+for\s+[0-9]*\.?[0-9]+s(?:\s+#.*)?$/i
          );
          if (!showMatch) {
            continue;
          }

          if (this.normalizeAssetRef(showMatch[1]) === target) {
            hasMatch = true;
            break;
          }
        }

        if (hasMatch) {
          results.push({
            name: file.basename,
            path: file.path,
          });
        }
      }

      return results.sort((a, b) => a.name.localeCompare(b.name));
    }

    async showScriptsUsingCurrentCandidateAsset(view) {
      const assetName = this.getAssetNameForCandidateView(view);
      if (!assetName) {
        new Notice("movi: No current candidate asset selected.");
        return;
      }

      const rows = await this.findScriptsUsingAsset(assetName);
      new ScriptUsageModal(this.app, assetName, rows).open();
    }

    removeCandidateViewPlayActions() {
      for (const leaf of this.app.workspace.getLeavesOfType("gptviz-candidates")) {
        const view = leaf.view;
        if (!this.isGptvizCandidateView(view)) {
          continue;
        }

        view.containerEl
          .querySelectorAll(
            `.${this.candidateMoviPlayActionClass}, [aria-label="Movi Play"], [title="Movi Play"]`
          )
          .forEach((action) => action.remove());
      }
    }

    removePlayerViewPlayActions() {
      for (const leaf of this.app.workspace.getLeavesOfType(Movi.MOVI_PLAYER_VIEW_TYPE)) {
        const view = leaf.view;
        if (!this.isPlayerView(view)) {
          continue;
        }

        view.containerEl
          .querySelectorAll(
            `.${this.playerMoviPlayActionClass}, [aria-label="Movi Play"], [title="Movi Play"]`
          )
          .forEach((action) => action.remove());
      }
    }

    async playSourceFromPlayerView(view) {
      const sourcePath =
        (view && view.movie && view.movie.sourcePath) ||
        this.lastPlayedScriptPath;

      if (!sourcePath) {
        new Notice("movi: No source script is loaded in Player View.");
        return;
      }

      const file = this.app.vault.getAbstractFileByPath(sourcePath);
      if (!file) {
        new Notice(`movi: Source file not found: ${sourcePath}`);
        return;
      }

      await this.playScriptFile(file);
    }

    addPlayerViewPlayActions() {
      for (const leaf of this.app.workspace.getLeavesOfType(Movi.MOVI_PLAYER_VIEW_TYPE)) {
        const view = leaf.view;
        if (!this.isPlayerView(view)) {
          continue;
        }

        const existingActions = view.containerEl.querySelectorAll(
          `.${this.playerMoviPlayActionClass}, [aria-label="Movi Play"], [title="Movi Play"]`
        );
        existingActions.forEach((action) => action.remove());

        if (typeof view.startModeRibbonSync === "function") {
          view.startModeRibbonSync();
        } else if (typeof view.ensureModeRibbon === "function") {
          view.ensureModeRibbon();
        }
      }
    }

    addCandidateViewPlayActions() {
      for (const leaf of this.app.workspace.getLeavesOfType("gptviz-candidates")) {
        const view = leaf.view;
        if (!this.isGptvizCandidateView(view)) {
          continue;
        }

        const existingActions = view.containerEl.querySelectorAll(
          `.${this.candidateMoviPlayActionClass}, [aria-label="Movi Play"], [title="Movi Play"]`
        );
        existingActions.forEach((action) => action.remove());
      }
    }

    addMarkdownPlayActions() {
      for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
        const view = leaf.view;
        if (!(view instanceof MarkdownView) || !view.file) {
          continue;
        }

        const existingActions = view.containerEl.querySelectorAll(
          `.${this.markdownMoviPlayActionClass}, [aria-label="Movi Play"], [title="Movi Play"]`
        );
        existingActions.forEach((action) => action.remove());
      }
    }

    async handleScriptRequiredAssetsRequest(event) {
      const detail = event && event.detail ? event.detail : null;
      const filePath = detail && typeof detail.filePath === "string"
        ? detail.filePath
        : "";
      const resolve = detail && typeof detail.resolve === "function"
        ? detail.resolve
        : null;
      const reject = detail && typeof detail.reject === "function"
        ? detail.reject
        : null;

      try {
        const assets = await this.getScriptRequiredAssetsForFilePath(filePath);
        if (resolve) {
          resolve({
            ok: true,
            requiredAssets: assets,
          });
        }
      } catch (error) {
        if (reject) {
          reject(error);
          return;
        }
        throw error;
      }
    }

    async getScriptRequiredAssetsForFilePath(filePath) {
      const path = String(filePath || "").trim();
      if (!path) {
        return [];
      }

      const file = this.app.vault.getAbstractFileByPath(path);
      if (!file || file.extension !== "md") {
        return [];
      }

      const text = await this.app.vault.cachedRead(file);
      const parsed = Movi.Parser.parseMarkdown(text, file.path);
      return Array.isArray(parsed.requiredAssets) ? parsed.requiredAssets : [];
    }

    async handleMovieModeRequest(event) {
      if (event && typeof event.preventDefault === "function") {
        event.preventDefault();
      }

      const requestedPath =
        event && event.detail && typeof event.detail.filePath === "string"
          ? event.detail.filePath
          : "";

      if (requestedPath) {
        const file = this.app.vault.getAbstractFileByPath(requestedPath);
        const extension = String(file && file.extension ? file.extension : "").toLowerCase();

        if (file && (extension === "md" || extension === "ms")) {
          try {
            await this.playScriptFile(file);
            return;
          } catch (error) {
            await this.reportScriptError(file.path, error, "movie-mode-request");
            return;
          }
        }
      }

      await this.playActiveScript();
    }

    async playScriptFile(file) {
      const text = await this.app.vault.cachedRead(file);
      const parsed = Movi.Parser.parseMarkdown(text, file.path);
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
      const actions = parsed && Array.isArray(parsed.actions) ? parsed.actions : [];
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

      let text = "";
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

      let parsed = null;
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

      const marks = parsed && Array.isArray(parsed.marks) ? parsed.marks : [];
      const map = {};
      for (let i = 0; i < marks.length; i += 1) {
        const mark = marks[i] || {};
        const name = String(mark.name || "").trim();
        const x = Number(mark.x);
        const y = Number(mark.y);
        if (!name) continue;
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

      let text = "";
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

      let parsed = null;
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

      let text = "";
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
      this.addPlayerViewPlayActions();
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

    async reportScriptError(filePath, error, operation) {
      const category = error && error.category ? error.category : "Content";
      const code = error && error.code ? error.code : "MCONTENT001";
      const message = error && error.message ? error.message : String(error);
      const line = error && error.line !== undefined ? error.line : "-";
      const notice = `movi ${category} ${code} at ${filePath}:${line} - ${message}`;
      new Notice(notice, 10000);

      await this.logger.error(operation || "script", category, code, message, {
        file: filePath,
        line: error && error.line ? error.line : 1,
        column: error && error.column ? error.column : 1,
        stack: error && error.stack ? error.stack : undefined,
      });
    }

    async onunload() {
      this.removeCandidateViewPlayActions();
      this.removePlayerViewPlayActions();
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

  return {
    MoviPlugin,
  };
});

module.exports = Movi.MoviPlugin;



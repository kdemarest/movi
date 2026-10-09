unit("diagnostics", ["plugin"], () => {
  const LAST_ERROR_PATH = "movi/_lastErr.log";
  const CODE_MAP_PATH = "movi/runtime-code-map.json";

  Object.assign(Movi.MoviPlugin.prototype, {
    // Code bugs (anything that is not a Parser/Content script error): blocking surface,
    // movi.log entry, and _lastErr.log mapped back to the source file.
    reportError(context, error) {
      const detail = error instanceof Error ? error.stack || error.message : String(error);
      const now = new Date().toISOString();
      console.error(`movi ${context} failed: ${detail}`, error);

      this.logger.error(context, "Runtime", "MRUNTIME", error instanceof Error ? error.message : String(error), {
        stack: error instanceof Error ? error.stack : undefined,
      });

      this.writeLastError(context, "runtime", detail, now).catch((writeError) => {
        console.error("movi could not write _lastErr.log", writeError);
      });

      if (this.errorModal) {
        this.errorModal.setError(context, error);
        return;
      }

      this.errorModal = new Movi.ErrorModal(this.app, this, context, error);
      this.errorModal.open();
    },

    async writeLastError(context, errorType, detail, now) {
      const bundlePosition = this.extractBundlePositionFromErrorDetail(detail);
      let bundleLocation = "Bundle location: unavailable";
      let sourceLocation = "Source location: unresolved";

      if (bundlePosition) {
        bundleLocation = `Bundle location: .obsidian/plugins/movi/main.js:${bundlePosition.line}:${bundlePosition.column}`;
        const codeMap = await this.loadRuntimeCodeMap();
        const source = this.resolveSourceLocationFromBundle(bundlePosition.line, bundlePosition.column, codeMap);

        if (source) {
          sourceLocation = `Source location: ${source.sourcePath}:${source.sourceLine}:${source.sourceColumn} (map: ${CODE_MAP_PATH})`;
        } else if (codeMap) {
          sourceLocation = `Source location: unresolved (map: ${CODE_MAP_PATH})`;
        }
      }

      const payload = [
        "movi failure",
        "Project: movi",
        `Error type: ${errorType}`,
        `Generated: ${now}`,
        `Operation: ${context}`,
        bundleLocation,
        sourceLocation,
        "",
        detail,
      ].join("\n");

      await this.app.vault.adapter.write(LAST_ERROR_PATH, `${payload}\n`);
    },

    extractBundlePositionFromErrorDetail(detail) {
      // Desktop stacks name the bundle file; mobile stacks name the plugin.
      const match = /(?:main\.js|plugin:movi):(\d+):(\d+)/.exec(String(detail || ""));
      return match ? { line: Number(match[1]), column: Number(match[2]) } : null;
    },

    async loadRuntimeCodeMap() {
      if (this.runtimeCodeMapLoaded) {
        return this.runtimeCodeMap;
      }

      this.runtimeCodeMapLoaded = true;
      this.runtimeCodeMap = null;

      try {
        if (!(await this.app.vault.adapter.exists(CODE_MAP_PATH))) {
          return null;
        }

        const parsed = JSON.parse(await this.app.vault.adapter.read(CODE_MAP_PATH));
        if (!parsed || !Array.isArray(parsed.entries)) {
          return null;
        }

        this.runtimeCodeMap = parsed.entries;
        return this.runtimeCodeMap;
      } catch (mapError) {
        // Diagnostics must never throw; report and carry on without source mapping.
        console.error("movi could not load runtime-code-map.json", mapError);
        return null;
      }
    },

    resolveSourceLocationFromBundle(bundleLine, bundleColumn, entries) {
      if (!entries) {
        return null;
      }

      for (const entry of entries) {
        if (bundleLine >= entry.bundleStartLine && bundleLine <= entry.bundleEndLine) {
          return {
            sourcePath: entry.sourcePath,
            sourceLine: entry.sourceStartLine + (bundleLine - entry.bundleStartLine),
            sourceColumn: bundleColumn,
          };
        }
      }

      return null;
    },
  });
});

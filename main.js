register(() => {
  const { Plugin, Notice } = require("obsidian");

  class MoviPlugin extends Plugin {
    async onload() {
      this.logger = new Movi.Logger(this.app, {
        logPath: "movi.log",
        maxBytes: 6144,
      });

      await this.logger.appendRunHeader();
      await this.logger.info("plugin-load", "movi loaded", {
        category: "Lifecycle",
        code: "MLOAD",
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
        await this.reportScriptError(file.path, error);
      }
    }

    async reportScriptError(filePath, error) {
      const category = error && error.category ? error.category : "Content";
      const code = error && error.code ? error.code : "MCONTENT001";
      const message = error && error.message ? error.message : String(error);
      const line = error && error.line !== undefined ? error.line : "-";
      const notice = `movi ${category} ${code} at ${filePath}:${line} - ${message}`;
      new Notice(notice, 10000);

      await this.logger.error("validate-script", category, code, message, {
        file: filePath,
        line: error && error.line ? error.line : 1,
        column: error && error.column ? error.column : 1,
        stack: error && error.stack ? error.stack : undefined,
      });
    }

    async onunload() {
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


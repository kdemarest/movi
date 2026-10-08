register(() => {
  class Logger {
    constructor(app, options) {
      this.app = app;
      this.logPath = (options && options.logPath) || "movi/movi.log";
      this.maxBytes = (options && options.maxBytes) || 6144;
    }

    static trimToCap(text, maxBytes) {
      if (!text || maxBytes <= 0) return "";
      if (text.length <= maxBytes) return text;

      let out = text.slice(-maxBytes);
      const firstNewline = out.indexOf("\n");
      if (firstNewline !== -1) out = out.slice(firstNewline + 1);
      return out;
    }

    static compact(value) {
      if (value === null || value === undefined) return "-";
      return String(value).replace(/\s+/g, " ").trim();
    }

    static formatEntry(entry) {
      const ts = entry.timestamp || new Date().toISOString();
      const level = Logger.compact(entry.level || "INFO");
      const category = Logger.compact(entry.category || "General");
      const code = Logger.compact(entry.code || "-");
      const operation = Logger.compact(entry.operation || "-");
      const file = Logger.compact(entry.file || "-");
      const line = entry.line === undefined || entry.line === null ? "-" : String(entry.line);
      const column = entry.column === undefined || entry.column === null ? "-" : String(entry.column);
      const message = Logger.compact(entry.message || "-");
      const stack = entry.stack ? ` | stack=${Logger.compact(entry.stack)}` : "";

      return `${ts} | ${level} | ${category} | ${code} | ${operation} | ${file}:${line}:${column} | ${message}${stack}`;
    }

    async appendRunHeader() {
      const ts = new Date().toISOString();
      await this.appendRaw(`\n=== RUN ${ts} ===\n\n`);
    }

    async info(operation, message, extra) {
      const entry = Object.assign({}, extra || {}, {
        level: "INFO",
        operation: operation || "-",
        message: message || "-",
      });
      await this.appendEntry(entry);
    }

    async error(operation, category, code, message, extra) {
      const entry = Object.assign({}, extra || {}, {
        level: "ERROR",
        operation: operation || "-",
        category: category || "General",
        code: code || "-",
        message: message || "-",
      });

      const formatted = Logger.formatEntry(entry);
      console.error(formatted);
      await this.appendRaw(formatted + "\n");
    }

    async appendEntry(entry) {
      const formatted = Logger.formatEntry(entry);
      await this.appendRaw(formatted + "\n");
    }

    async appendRaw(text) {
      const adapter = this.app.vault.adapter;
      try {
        let existing = "";
        try {
          existing = await adapter.read(this.logPath);
        } catch (readError) {
          existing = "";
        }

        const combined = Logger.trimToCap(existing + text, this.maxBytes);
        await adapter.write(this.logPath, combined);
      } catch (writeError) {
        console.error("movi logger write failure", writeError);
      }
    }
  }

  return {
    Logger,
  };
});

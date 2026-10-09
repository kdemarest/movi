unit("error-modal", [], () => {
  const { Modal, Notice } = require("obsidian");

  // Blocking, full-screen failure surface. Stays until the user taps Clear.
  class ErrorModal extends Modal {
    constructor(app, plugin, context, error) {
      super(app);
      this.plugin = plugin;
      this.context = context;
      this.error = error;
    }

    setError(context, error) {
      this.context = context;
      this.error = error;
      this.render();
    }

    render() {
      const detail = this.error instanceof Error
        ? this.error.stack || this.error.message
        : String(this.error);
      const contentEl = this.contentEl;
      contentEl.empty();
      contentEl.style.display = "flex";
      contentEl.style.flexDirection = "column";
      contentEl.style.gap = "1em";
      contentEl.style.height = "100%";
      contentEl.style.boxSizing = "border-box";
      contentEl.style.padding = "2em";
      contentEl.style.overflowY = "auto";

      contentEl.createEl("h2", { text: "movi failure" });
      contentEl.createEl("p", { text: `Operation: ${this.context}` });
      contentEl.createEl("pre", { text: detail }).style.whiteSpace = "pre-wrap";

      const actions = contentEl.createEl("div");
      actions.style.display = "flex";
      actions.style.gap = "0.6em";
      actions.style.alignItems = "center";

      const copyButton = actions.createEl("button", { text: "Copy" });
      copyButton.addEventListener("click", async () => {
        const payload = ["movi failure", `Operation: ${this.context}`, "", detail].join("\n");

        // Clipboard support varies by WebView: try the API, then execCommand; the Notice reports the outcome.
        let copied = false;
        try {
          if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(payload);
            copied = true;
          }
        } catch (error) {
          // clipboard API refused; try the execCommand fallback
        }

        if (!copied) {
          try {
            const textarea = document.createElement("textarea");
            textarea.value = payload;
            textarea.style.position = "fixed";
            textarea.style.left = "-9999px";
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            copied = document.execCommand("copy");
            textarea.remove();
          } catch (error) {
            // fallback failed too; the Notice below says so
          }
        }

        new Notice(copied ? "movi: error copied to clipboard." : "movi: could not copy automatically.");
      });

      const clearButton = actions.createEl("button", { text: "Clear" });
      clearButton.addEventListener("click", () => this.close());
    }

    onOpen() {
      this.modalEl.style.position = "fixed";
      this.modalEl.style.inset = "0";
      this.modalEl.style.width = "100vw";
      this.modalEl.style.height = "100vh";
      this.modalEl.style.maxWidth = "none";
      this.modalEl.style.maxHeight = "none";
      this.modalEl.style.margin = "0";
      this.modalEl.style.padding = "0";
      this.modalEl.style.borderRadius = "0";
      this.modalEl.style.zIndex = "var(--layer-modal)";
      this.render();
    }

    onClose() {
      if (this.plugin.errorModal === this) {
        this.plugin.errorModal = null;
      }
      this.contentEl.empty();
    }
  }

  Object.assign(Movi, {
    ErrorModal,
  });
});

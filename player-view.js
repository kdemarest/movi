register(() => {
  const { ItemView } = require("obsidian");

  const MOVI_PLAYER_VIEW_TYPE = "movi-player-view";

  class PlayerView extends ItemView {
    constructor(leaf, app, logger) {
      super(leaf);
      this.app = app;
      this.logger = logger;
      this.movie = null;
      this.currentIndex = 0;
      this.isPlaying = false;
      this.timerId = null;
      this.controls = null;
      this.imageEl = null;
      this.statusEl = null;
      this.frameEl = null;
      this.zoomDotEl = null;
      this.zoomDotAnimId = null;
      this.currentTx = 0;
      this.currentTy = 0;
      this.currentScale = 1;
    }

    getViewType() {
      return MOVI_PLAYER_VIEW_TYPE;
    }

    getDisplayText() {
      return "movi Player";
    }

    getIcon() {
      return "play";
    }

    async onOpen() {
      this.renderShell();
      this.updateStatus("Ready");
    }

    async onClose() {
      this.stopPlayback();
    }

    renderShell() {
      const root = this.contentEl;
      root.empty();

      const controls = root.createDiv({ cls: "movi-controls" });
      const playBtn = controls.createEl("button", { text: "Play" });
      const restartBtn = controls.createEl("button", { text: "Restart" });

      playBtn.onclick = () => this.play();
      restartBtn.onclick = () => this.restart();

      const frame = root.createDiv({ cls: "movi-frame" });
      frame.style.minHeight = "220px";
      frame.style.display = "flex";
      frame.style.alignItems = "center";
      frame.style.justifyContent = "center";
      frame.style.background = "var(--background-secondary)";
      frame.style.position = "relative";
      frame.style.overflow = "hidden";

      const img = frame.createEl("img");
      img.style.maxWidth = "100%";
      img.style.maxHeight = "70vh";
      img.style.objectFit = "contain";

      const zoomDot = frame.createDiv({ cls: "movi-zoom-dot" });
      zoomDot.style.position = "absolute";
      zoomDot.style.width = "20px";
      zoomDot.style.height = "20px";
      zoomDot.style.borderRadius = "50%";
      zoomDot.style.transform = "translate(-50%, -50%)";
      zoomDot.style.background = "rgba(255, 0, 255, 0.9)";
      zoomDot.style.border = "2px solid white";
      zoomDot.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.55)";
      zoomDot.style.pointerEvents = "none";
      zoomDot.style.display = "none";
      zoomDot.style.zIndex = "3";

      const status = root.createDiv({ cls: "movi-status" });
      status.style.marginTop = "10px";

      this.controls = { playBtn, restartBtn };
      this.imageEl = img;
      this.statusEl = status;
      this.frameEl = frame;
      this.zoomDotEl = zoomDot;
    }

    loadMovie(movie) {
      this.stopPlayback();
      this.movie = movie;
      this.currentIndex = 0;
      if (this.imageEl) {
        this.imageEl.removeAttribute("src");
        this.imageEl.style.transition = "none";
        this.imageEl.style.transformOrigin = "center center";
        this.imageEl.style.transform = "translate(0px, 0px) scale(1)";
      }
      this.currentTx = 0;
      this.currentTy = 0;
      this.currentScale = 1;
      if (this.zoomDotEl) this.zoomDotEl.style.display = "none";
      this.stopZoomDotTracking();
      const count = movie && Array.isArray(movie.actions) ? movie.actions.length : 0;
      this.updateStatus(`Loaded ${count} action${count === 1 ? "" : "s"}.`);
    }

    play() {
      if (!this.movie || !Array.isArray(this.movie.actions) || this.movie.actions.length === 0) {
        this.updateStatus("No movie loaded.");
        return;
      }
      if (this.isPlaying) return;
      if (this.currentIndex >= this.movie.actions.length) {
        this.currentIndex = 0;
      }
      this.isPlaying = true;
      this.runCurrentAction();
    }

    restart() {
      if (!this.movie) return;
      this.stopPlayback();
      this.currentIndex = 0;
      this.play();
    }

    stopPlayback() {
      this.isPlaying = false;
      if (this.timerId !== null) {
        window.clearTimeout(this.timerId);
        this.timerId = null;
      }
      this.stopZoomDotTracking();
    }

    runCurrentAction() {
      if (!this.isPlaying || !this.movie) return;
      const actions = this.movie.actions || [];
      if (this.currentIndex >= actions.length) {
        this.stopPlayback();
        this.updateStatus("Playback complete.");
        return;
      }

      const action = actions[this.currentIndex];
      const durationMs = Math.max(1, Math.floor(Number(action.durationSeconds || 0) * 1000));

      if (action.type === "show") {
        const next = actions[this.currentIndex + 1];
        if (next && next.type === "zoom") {
          this.showImageAction(action, () => {
            this.currentIndex += 1;
            this.runCurrentAction();
          });
          return;
        }

        this.showImageAction(action);
        this.timerId = window.setTimeout(() => {
          this.currentIndex += 1;
          this.runCurrentAction();
        }, durationMs);
        return;
      }

      if (action.type === "zoom") {
        this.runZoomAction(action, durationMs);
        this.timerId = window.setTimeout(() => {
          this.currentIndex += 1;
          this.runCurrentAction();
        }, durationMs);
        return;
      }

      this.stopPlayback();
      this.updateStatus(`Unsupported action: ${action.type}`);
    }

    showImageAction(action, onReady) {
      const file = action.file;
      if (!file || !this.imageEl) return;

      const src = this.app.vault.getResourcePath(file);
      this.stopZoomDotTracking();

      let readyFired = false;
      const fireReady = () => {
        if (readyFired) return;
        readyFired = true;
        if (typeof onReady === "function") onReady();
      };

      this.imageEl.onload = () => {
        fireReady();
      };
      this.imageEl.style.transition = "none";
      this.imageEl.style.transformOrigin = "center center";
      this.imageEl.style.transform = "translate(0px, 0px) scale(1)";
      this.currentTx = 0;
      this.currentTy = 0;
      this.currentScale = 1;
      this.imageEl.setAttribute("src", src);

      if (this.zoomDotEl) this.zoomDotEl.style.display = "none";
      this.updateStatus(`Showing ${action.image} (${this.currentIndex + 1}/${this.movie.actions.length})`);

      if (this.imageEl.complete && this.imageEl.naturalWidth > 0) {
        fireReady();
      }
    }

    runZoomAction(action, durationMs) {
      if (!this.imageEl) return;

      const end = action.zoomEnd && action.zoomEnd > 0 ? action.zoomEnd : this.currentScale;
      const anchorX = Number.isFinite(Number(action.zoomAnchorX)) ? Number(action.zoomAnchorX) : 0.5;
      const anchorY = Number.isFinite(Number(action.zoomAnchorY)) ? Number(action.zoomAnchorY) : 0.5;

      this.stopZoomDotTracking();

      const width = this.imageEl.offsetWidth;
      const height = this.imageEl.offsetHeight;
      const endTx = end * width * (0.5 - anchorX);
      const endTy = end * height * (0.5 - anchorY);

      this.imageEl.style.transition = "none";
      this.imageEl.style.transformOrigin = "center center";
      this.imageEl.style.transform = `translate(${this.currentTx}px, ${this.currentTy}px) scale(${this.currentScale})`;
      this.positionZoomDot(anchorX, anchorY);

      this.imageEl.offsetWidth;

      this.imageEl.style.transition = `transform ${durationMs}ms linear`;
      this.imageEl.style.transform = `translate(${endTx}px, ${endTy}px) scale(${end})`;
      this.startZoomDotTracking(anchorX, anchorY, durationMs + 80);

      this.currentTx = endTx;
      this.currentTy = endTy;
      this.currentScale = end;

      this.updateStatus(`Zoom ${action.zoomTargetName || "target"} (${this.currentIndex + 1}/${this.movie.actions.length})`);
    }

    positionZoomDot(anchorX, anchorY) {
      if (!this.zoomDotEl || !this.frameEl || !this.imageEl) return;

      const frameRect = this.frameEl.getBoundingClientRect();
      const imageRect = this.imageEl.getBoundingClientRect();
      if (imageRect.width <= 0 || imageRect.height <= 0 || frameRect.width <= 0 || frameRect.height <= 0) {
        this.zoomDotEl.style.display = "none";
        return;
      }

      const x = imageRect.left - frameRect.left + anchorX * imageRect.width;
      const y = imageRect.top - frameRect.top + anchorY * imageRect.height;

      this.zoomDotEl.style.left = `${x}px`;
      this.zoomDotEl.style.top = `${y}px`;
      this.zoomDotEl.style.display = "block";
    }

    startZoomDotTracking(anchorX, anchorY, durationMs) {
      this.stopZoomDotTracking();
      const started = Date.now();

      const tick = () => {
        this.positionZoomDot(anchorX, anchorY);
        if (Date.now() - started < durationMs) {
          this.zoomDotAnimId = window.requestAnimationFrame(tick);
        } else {
          this.zoomDotAnimId = null;
          this.positionZoomDot(anchorX, anchorY);
        }
      };

      this.zoomDotAnimId = window.requestAnimationFrame(tick);
    }

    stopZoomDotTracking() {
      if (this.zoomDotAnimId !== null) {
        window.cancelAnimationFrame(this.zoomDotAnimId);
        this.zoomDotAnimId = null;
      }
    }

    updateStatus(text) {
      if (this.statusEl) this.statusEl.setText(text || "");
    }
  }

  return {
    PlayerView,
    MOVI_PLAYER_VIEW_TYPE,
  };
});

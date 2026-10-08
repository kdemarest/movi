register(() => {
  const { ItemView, setIcon } = require("obsidian");

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
      this.scrubberTickId = null;
      this.controls = null;
      this.scrubberEl = null;
      this.scrubberTimeEl = null;
      this.scrubberWasPlaying = false;
      this.isScrubbing = false;
      this.imageEl = null;
      this.statusEl = null;
      this.frameEl = null;
      this.zoomDotEl = null;
      this.zoomDotAnimId = null;
      this.captionEl = null;
      this.captionWindows = [];
      this.labelTimings = {};
      this.currentTx = 0;
      this.currentTy = 0;
      this.currentScale = 1;
      this.currentAction = null;
      this.currentActionStartedAt = 0;
      this.currentActionRemainingMs = 0;
      this.activeZoomTarget = null;
      this.pausedAction = null;
      this.totalDurationMs = 0;
      this.actionStartTimes = [];
      this.currentElapsedMs = 0;
      this.modeRibbonObserver = null;
      this.modeRibbonSyncTimer = null;
      this.modeRibbonLastLogAt = 0;
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
      this.logModeRibbonState("onOpen:after-render", true);
      this.startModeRibbonSync();
      this.scheduleModeRibbonSync();
      this.updatePlayPauseButton();
      this.updateScrubberUi(0);
      this.updateStatus("Ready");
      this.logModeRibbonState("onOpen:done", true);
    }

    async onClose() {
      this.stopPlayback();
      this.stopModeRibbonSync();
    }

    getHeaderEl() {
      const directHeaderEl = this.containerEl.querySelector(".view-header");
      if (directHeaderEl) {
        return directHeaderEl;
      }

      const leafContentEl = this.containerEl.closest(".workspace-leaf-content");
      if (!leafContentEl) {
        return null;
      }

      return leafContentEl.querySelector(".view-header");
    }

    logModeRibbonState(reason, force) {
      if (!this.logger || typeof this.logger.info !== "function") {
        return;
      }

      const now = Date.now();
      if (!force && now - this.modeRibbonLastLogAt < 300) {
        return;
      }
      this.modeRibbonLastLogAt = now;

      const headerEl = this.getHeaderEl();
      const ribbonEl = headerEl ? headerEl.querySelector(".mode-ribbon") : null;
      const actionsEl = headerEl ? headerEl.querySelector(".view-actions") : null;
      const optionsEl = actionsEl
        ? actionsEl.querySelector('.view-action.mod-options, .view-action[aria-label*="More options"], .view-action[aria-label*="Options"]')
        : null;

      const parts = [
        `reason=${reason || "-"}`,
        `header=${headerEl ? "1" : "0"}`,
        `ribbon=${ribbonEl ? "1" : "0"}`,
        `actions=${actionsEl ? "1" : "0"}`,
        `options=${optionsEl ? "1" : "0"}`,
        `actionsDisplay=${actionsEl ? (actionsEl.style.display || "<empty>") : "-"}`,
        `ribbonDisplay=${ribbonEl ? (ribbonEl.style.display || "<empty>") : "-"}`,
        `ribbonButtons=${ribbonEl ? String(ribbonEl.querySelectorAll("button").length) : "0"}`,
      ];

      this.logger
        .info("mode-ribbon", parts.join(" | "), {
          category: "UI",
          code: "MMODE001",
          file: this.movie && this.movie.sourcePath ? this.movie.sourcePath : "-",
        })
        .catch(() => {});
    }

    startModeRibbonSync() {
      this.stopModeRibbonSync();
      this.ensureModeRibbon();

      const leafContentEl = this.containerEl.closest(".workspace-leaf-content");
      if (!leafContentEl || typeof MutationObserver === "undefined") {
        return;
      }

      this.modeRibbonObserver = new MutationObserver(() => {
        this.logModeRibbonState("observer:mutation", false);
        this.scheduleModeRibbonSync();
      });
      this.modeRibbonObserver.observe(leafContentEl, {
        childList: true,
        subtree: true,
      });
    }

    stopModeRibbonSync() {
      if (this.modeRibbonObserver) {
        this.modeRibbonObserver.disconnect();
        this.modeRibbonObserver = null;
      }

      if (this.modeRibbonSyncTimer !== null) {
        window.clearTimeout(this.modeRibbonSyncTimer);
        this.modeRibbonSyncTimer = null;
      }
    }

    scheduleModeRibbonSync() {
      if (this.modeRibbonSyncTimer !== null) {
        return;
      }

      this.modeRibbonSyncTimer = window.setTimeout(() => {
        this.modeRibbonSyncTimer = null;
        this.ensureModeRibbon();
      }, 0);
    }

    ensureModeRibbon() {
      const headerEl = this.getHeaderEl();
      if (!headerEl) {
        this.logModeRibbonState("ensure:no-header", true);
        return null;
      }

      let ribbon = headerEl.querySelector(".mode-ribbon");
      if (!ribbon) {
        this.logModeRibbonState("ensure:create-ribbon", true);
        ribbon = document.createElement("div");
        ribbon.classList.add("mode-ribbon");
        ribbon.style.display = "inline-flex";
        ribbon.style.alignItems = "center";
        ribbon.style.gap = "0.25em";
        ribbon.style.marginInlineStart = "auto";
        ribbon.style.color = "var(--icon-color)";

        const actionsEl = headerEl.querySelector(".view-actions");
        if (actionsEl) {
          headerEl.insertBefore(ribbon, actionsEl);
        } else {
          headerEl.appendChild(ribbon);
        }
      }

      ribbon.style.color = "var(--icon-color)";

      const actionsEl = headerEl.querySelector(".view-actions");
      this.ensureModeRibbonMoreActionsButton(ribbon, actionsEl);

      if (actionsEl) {
        actionsEl.style.display = "none";
      }

      this.logModeRibbonState("ensure:complete", false);
      return ribbon;
    }

    addModeButton(ribbon, position, buttonEl) {
      if (!ribbon || !Number.isInteger(position) || position < 0 || !(buttonEl instanceof HTMLElement)) {
        return null;
      }

      const fallbackKey =
        buttonEl.getAttribute("aria-label") ||
        buttonEl.getAttribute("title") ||
        (buttonEl.textContent || "").trim();
      const buttonKey = buttonEl.getAttribute("data-mode-button-key") || fallbackKey;

      if (buttonKey) {
        buttonEl.setAttribute("data-mode-button-key", buttonKey);
        ribbon
          .querySelectorAll(`[data-mode-button-key="${CSS.escape(buttonKey)}"]`)
          .forEach((existing) => {
            if (existing !== buttonEl) existing.remove();
          });
      }

      const existingAtPosition = ribbon.querySelector(
        `[data-mode-button-position="${position}"]`
      );
      if (existingAtPosition && existingAtPosition !== buttonEl) {
        existingAtPosition.remove();
      }

      buttonEl.setAttribute("data-mode-button-position", String(position));

      const orderedButtons = [...ribbon.children].filter((child) => child !== buttonEl);
      const insertBefore = orderedButtons.find((child) => {
        const childPos = Number(child.getAttribute("data-mode-button-position"));
        return Number.isFinite(childPos) && childPos > position;
      });

      if (insertBefore) {
        ribbon.insertBefore(buttonEl, insertBefore);
      } else {
        ribbon.appendChild(buttonEl);
      }

      return buttonEl;
    }

    ensureModeRibbonMoreActionsButton(ribbon, actionsEl) {
      const optionsActionEl = actionsEl
        ? actionsEl.querySelector(
            '.view-action.mod-options, .view-action[aria-label*="More options"], .view-action[aria-label*="Options"]'
          )
        : null;

      if (!optionsActionEl) {
        if (ribbon) {
          ribbon
            .querySelectorAll('.movi-mode-more-actions, [data-mode-button-key="MoreActions"]')
            .forEach((el) => el.remove());
        }
        return;
      }

      const buttonEl = document.createElement("button");
      buttonEl.classList.add("clickable-icon");
      buttonEl.classList.add("view-action");
      buttonEl.classList.add("movi-mode-more-actions");
      buttonEl.style.color = "var(--icon-color)";
      buttonEl.setAttribute("aria-label", "More Actions");
      buttonEl.setAttribute("title", "More Actions");
      buttonEl.setAttribute("type", "button");
      buttonEl.setAttribute("data-mode-button-key", "MoreActions");
      setIcon(buttonEl, "more-vertical");
      buttonEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const headerEl = this.getHeaderEl();
        const liveActionsEl = headerEl ? headerEl.querySelector(".view-actions") : null;
        const liveOptionsActionEl = liveActionsEl
          ? liveActionsEl.querySelector(
              '.view-action.mod-options, .view-action[aria-label*="More options"], .view-action[aria-label*="Options"]'
            )
          : null;

        if (!liveOptionsActionEl) {
          return;
        }

        liveOptionsActionEl.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
          })
        );
      });

      this.addModeButton(ribbon, 99, buttonEl);
    }

    renderShell() {
      const root = this.contentEl;
      root.empty();
      root.style.display = "flex";
      root.style.flexDirection = "column";
      root.style.height = "100%";

      const frame = root.createDiv({ cls: "movi-frame" });
      frame.style.minHeight = "220px";
      frame.style.flex = "1";
      frame.style.display = "flex";
      frame.style.alignItems = "center";
      frame.style.justifyContent = "center";
      frame.style.background = "var(--background-secondary)";
      frame.style.position = "relative";
      frame.style.overflow = "hidden";

      const img = frame.createEl("img");
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100%";
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

      const caption = frame.createDiv({ cls: "movi-caption" });
      caption.style.position = "absolute";
      caption.style.left = "0";
      caption.style.right = "0";
      caption.style.bottom = "0";
      caption.style.padding = "0.6em 1em";
      caption.style.textAlign = "center";
      caption.style.color = "#fff";
      caption.style.background = "rgba(0, 0, 0, 0.55)";
      caption.style.whiteSpace = "pre-wrap";
      caption.style.pointerEvents = "none";
      caption.style.display = "none";
      caption.style.zIndex = "4";

      const status = root.createDiv({ cls: "movi-status" });
      status.style.marginTop = "10px";
      status.style.textAlign = "center";

      const scrubberWrap = root.createDiv({ cls: "movi-scrubber-wrap" });
      scrubberWrap.style.display = "flex";
      scrubberWrap.style.alignItems = "center";
      scrubberWrap.style.gap = "0.6rem";
      scrubberWrap.style.padding = "0.6rem 0.2rem 0.2rem";

      const scrubber = scrubberWrap.createEl("input");
      scrubber.type = "range";
      scrubber.min = "0";
      scrubber.max = "1000";
      scrubber.step = "1";
      scrubber.value = "0";
      scrubber.style.flex = "1";

      const scrubberTime = scrubberWrap.createDiv({ cls: "movi-scrubber-time" });
      scrubberTime.style.minWidth = "88px";
      scrubberTime.style.textAlign = "right";
      scrubberTime.style.fontSize = "0.9em";

      const controls = root.createDiv({ cls: "movi-controls" });
      controls.style.display = "flex";
      controls.style.justifyContent = "center";
      controls.style.alignItems = "center";
      controls.style.gap = "0.8rem";
      controls.style.padding = "0.8rem 0 0.4rem";

      const restartBtn = controls.createEl("button");
      restartBtn.setAttribute("aria-label", "Restart");
      restartBtn.setAttribute("title", "Restart");
      setIcon(restartBtn, "rotate-ccw");

      const playPauseBtn = controls.createEl("button");
      playPauseBtn.setAttribute("aria-label", "Play");
      playPauseBtn.setAttribute("title", "Play");
      playPauseBtn.style.width = "44px";
      playPauseBtn.style.height = "44px";
      playPauseBtn.style.display = "inline-flex";
      playPauseBtn.style.alignItems = "center";
      playPauseBtn.style.justifyContent = "center";
      setIcon(playPauseBtn, "play");

      playPauseBtn.onclick = () => {
        if (this.isPlaying) {
          this.pause();
        } else {
          this.play();
        }
      };
      restartBtn.onclick = () => this.restart();

      const startScrub = () => {
        this.isScrubbing = true;
        this.scrubberWasPlaying = this.isPlaying;
        if (this.isPlaying) {
          this.pause();
        }
      };

      const previewScrub = () => {
        if (!this.movie) {
          this.updateScrubberUi(0);
          return;
        }

        const ratio = Number(scrubber.value) / 1000;
        const targetMs = Math.round(this.totalDurationMs * ratio);
        this.updateScrubberUi(targetMs);
      };

      const commitScrub = () => {
        if (!this.movie) {
          this.scrubberWasPlaying = false;
          this.isScrubbing = false;
          return;
        }

        const ratio = Number(scrubber.value) / 1000;
        const targetMs = Math.round(this.totalDurationMs * ratio);
        this.seekToMs(targetMs);

        if (this.scrubberWasPlaying) {
          this.play();
        }
        this.scrubberWasPlaying = false;
        this.isScrubbing = false;
      };

      scrubber.addEventListener("pointerdown", startScrub);
      scrubber.addEventListener("input", previewScrub);
      scrubber.addEventListener("change", commitScrub);
      scrubber.addEventListener("pointerup", commitScrub);
      scrubber.addEventListener("touchend", commitScrub);

      this.controls = { playPauseBtn, restartBtn };
      this.scrubberEl = scrubber;
      this.scrubberTimeEl = scrubberTime;
      this.imageEl = img;
      this.statusEl = status;
      this.frameEl = frame;
      this.zoomDotEl = zoomDot;
      this.captionEl = caption;
    }

    updatePlayPauseButton() {
      const button = this.controls && this.controls.playPauseBtn;
      if (!button) return;

      if (this.isPlaying) {
        setIcon(button, "pause");
        button.setAttribute("aria-label", "Pause");
        button.setAttribute("title", "Pause");
      } else {
        setIcon(button, "play");
        button.setAttribute("aria-label", "Play");
        button.setAttribute("title", "Play");
      }
    }

    getTimelineActionDurationMs(actions, index) {
      const list = Array.isArray(actions) ? actions : [];
      const action = list[index];
      if (!action) return 0;

      if (action.type === "show") {
        const next = list[index + 1];
        if (next && next.type === "zoom") {
          return 0;
        }
      }

      return Math.max(1, Math.floor(Number(action.durationSeconds || 0) * 1000));
    }

    loadMovie(movie) {
      this.stopPlayback();
      this.movie = movie;
      this.currentIndex = 0;
      this.totalDurationMs = 0;
      this.actionStartTimes = [];
      this.currentElapsedMs = 0;

      if (this.imageEl) {
        this.imageEl.removeAttribute("src");
        this.imageEl.style.transition = "none";
        this.imageEl.style.transformOrigin = "center center";
        this.imageEl.style.transform = "translate(0px, 0px) scale(1)";
      }

      this.hideCaption();

      this.currentTx = 0;
      this.currentTy = 0;
      this.currentScale = 1;
      this.currentAction = null;
      this.currentActionStartedAt = 0;
      this.currentActionRemainingMs = 0;
      this.activeZoomTarget = null;
      this.pausedAction = null;

      if (this.zoomDotEl) this.zoomDotEl.style.display = "none";
      this.stopZoomDotTracking();

      const actions = movie && Array.isArray(movie.actions) ? movie.actions : [];
      let running = 0;
      for (let i = 0; i < actions.length; i += 1) {
        this.actionStartTimes[i] = running;
        running += this.getTimelineActionDurationMs(actions, i);
      }
      this.totalDurationMs = running;

      this.labelTimings = {};
      for (let i = 0; i < actions.length; i += 1) {
        const name = actions[i] && actions[i].name;
        if (name) {
          this.labelTimings[name] = {
            startMs: this.actionStartTimes[i],
            durationMs: this.getTimelineActionDurationMs(actions, i),
          };
        }
      }

      const captions = movie && Array.isArray(movie.captions) ? movie.captions : [];
      this.captionWindows = captions
        .map(caption => {
          const anchorStartMs = caption.anchorIndex >= 0 ? (this.actionStartTimes[caption.anchorIndex] || 0) : 0;

          let startMs = anchorStartMs;
          if (Number.isFinite(caption.anchorOffsetSeconds)) {
            startMs = anchorStartMs + caption.anchorOffsetSeconds * 1000;
          } else if (Number.isFinite(caption.anchorPercent)) {
            const anchorDurationMs = caption.anchorIndex >= 0
              ? this.getTimelineActionDurationMs(actions, caption.anchorIndex)
              : 0;
            startMs = anchorStartMs + (caption.anchorPercent / 100) * anchorDurationMs;
          }
          startMs = Math.max(0, startMs);

          const rawEndMs = startMs + Math.max(1, Math.floor(Number(caption.durationSeconds || 0) * 1000));
          const endMs = Math.min(rawEndMs, this.totalDurationMs);
          return { key: caption.key, text: caption.text, startMs, endMs };
        })
        .filter(window => window.endMs > window.startMs);

      this.updateStatus("Ready");
      this.updatePlayPauseButton();
      this.updateScrubberUi(0);
    }

    play() {
      if (!this.movie || !Array.isArray(this.movie.actions) || this.movie.actions.length === 0) {
        this.updateStatus("No movie loaded.");
        return;
      }
      if (this.isPlaying) return;

      this.isPlaying = true;
      this.updatePlayPauseButton();
      this.startScrubberTick();

      if (this.pausedAction) {
        this.resumePausedAction();
        return;
      }

      if (this.currentIndex >= this.movie.actions.length) {
        this.currentIndex = 0;
        this.currentElapsedMs = 0;
      }
      this.runCurrentAction();
    }

    pause() {
      if (!this.isPlaying) return;

      this.isPlaying = false;

      let remainingMs = this.currentActionRemainingMs;
      if (this.currentActionStartedAt > 0 && this.currentActionRemainingMs > 0) {
        const elapsed = Date.now() - this.currentActionStartedAt;
        remainingMs = Math.max(0, this.currentActionRemainingMs - elapsed);
      }

      if (this.timerId !== null) {
        window.clearTimeout(this.timerId);
        this.timerId = null;
      }

      if (this.currentAction && this.currentAction.type === "zoom") {
        const transform = this.captureCurrentImageTransform();
        this.currentTx = transform.tx;
        this.currentTy = transform.ty;
        this.currentScale = transform.scale;

        if (this.imageEl) {
          this.imageEl.style.transition = "none";
          this.imageEl.style.transformOrigin = "center center";
          this.imageEl.style.transform = `translate(${this.currentTx}px, ${this.currentTy}px) scale(${this.currentScale})`;
        }
      }

      this.stopZoomDotTracking();
      this.stopScrubberTick();
      this.updateElapsedFromPlaybackNow();

      this.pausedAction = {
        action: this.currentAction,
        index: this.currentIndex,
        remainingMs,
        zoomTarget: this.activeZoomTarget,
      };

      this.updatePlayPauseButton();
      this.updateStatus("Paused");
    }

    resumePausedAction() {
      const paused = this.pausedAction;
      if (!paused || !paused.action) {
        this.runCurrentAction();
        return;
      }

      this.currentIndex = paused.index;
      const remainingMs = Math.max(1, Math.floor(Number(paused.remainingMs || 1)));
      const action = paused.action;

      this.currentAction = action;
      this.currentActionStartedAt = Date.now();
      this.currentActionRemainingMs = remainingMs;
      this.pausedAction = null;

      if (action.type === "show") {
        this.timerId = window.setTimeout(() => {
          this.currentIndex += 1;
          this.runCurrentAction();
        }, remainingMs);
        this.updateStatus(`Showing ${action.image} (${this.currentIndex + 1}/${this.movie.actions.length})`);
        return;
      }

      if (action.type === "zoom") {
        this.resumeZoomAction(paused.zoomTarget, remainingMs);
        this.timerId = window.setTimeout(() => {
          this.currentIndex += 1;
          this.runCurrentAction();
        }, remainingMs);
        this.updateStatus(`Zoom ${action.zoomTargetName || "target"} (${this.currentIndex + 1}/${this.movie.actions.length})`);
        return;
      }

      if (action.type === "cut") {
        this.timerId = window.setTimeout(() => {
          this.currentIndex += 1;
          this.runCurrentAction();
        }, remainingMs);
        this.updateStatus(`Cut ${action.zoomTargetName || "scene"} (${this.currentIndex + 1}/${this.movie.actions.length})`);
        return;
      }

      this.runCurrentAction();
    }

    restart() {
      if (!this.movie) return;
      this.stopPlayback();
      this.currentIndex = 0;
      this.currentElapsedMs = 0;
      this.updateScrubberUi(0);
      this.play();
    }

    stopPlayback() {
      this.isPlaying = false;
      if (this.timerId !== null) {
        window.clearTimeout(this.timerId);
        this.timerId = null;
      }
      this.stopZoomDotTracking();
      this.stopScrubberTick();
      this.currentAction = null;
      this.currentActionStartedAt = 0;
      this.currentActionRemainingMs = 0;
      this.activeZoomTarget = null;
      this.pausedAction = null;
      this.updatePlayPauseButton();
    }

    runCurrentAction() {
      if (!this.isPlaying || !this.movie) return;
      const actions = this.movie.actions || [];
      if (this.currentIndex >= actions.length) {
        this.currentElapsedMs = this.totalDurationMs;
        this.updateScrubberUi(this.currentElapsedMs);
        this.stopPlayback();
        this.updateStatus("Playback complete.");
        return;
      }

      const action = actions[this.currentIndex];
      const durationMs = this.getTimelineActionDurationMs(actions, this.currentIndex);
      this.currentAction = action;
      this.currentActionStartedAt = Date.now();
      this.currentActionRemainingMs = durationMs;
      this.currentElapsedMs = this.actionStartTimes[this.currentIndex] || 0;
      this.updateScrubberUi(this.currentElapsedMs);

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

      if (action.type === "cut") {
        this.runCutAction(action);
        this.timerId = window.setTimeout(() => {
          this.currentIndex += 1;
          this.runCurrentAction();
        }, durationMs);
        return;
      }

      this.stopPlayback();
      this.updateStatus(`Unsupported action: ${action.type}`);
    }

    seekToMs(targetMs) {
      if (!this.movie || !Array.isArray(this.movie.actions) || this.movie.actions.length === 0) {
        return;
      }

      const actions = this.movie.actions;
      const clamped = Math.max(0, Math.min(this.totalDurationMs, Number(targetMs) || 0));

      this.stopPlayback();

      if (clamped >= this.totalDurationMs) {
        this.applyCompletedStateUpTo(actions.length);
        this.currentIndex = actions.length;
        this.currentElapsedMs = this.totalDurationMs;
        this.updateScrubberUi(this.currentElapsedMs);
        this.updateStatus("Playback complete.");
        return;
      }

      let index = 0;
      for (let i = 0; i < actions.length; i += 1) {
        const start = this.actionStartTimes[i] || 0;
        const end = i + 1 < actions.length
          ? this.actionStartTimes[i + 1]
          : this.totalDurationMs;
        if (clamped >= start && clamped < end) {
          index = i;
          break;
        }
      }

      const action = actions[index];
      const actionStart = this.actionStartTimes[index] || 0;
      const actionDurationMs = this.getTimelineActionDurationMs(actions, index);
      const offsetMs = Math.max(0, Math.min(actionDurationMs, clamped - actionStart));

      this.applyCompletedStateUpTo(index);

      if (action && action.type === "zoom" && offsetMs > 0) {
        const progress = Math.max(0, Math.min(1, offsetMs / actionDurationMs));
        this.applyZoomProgress(action, progress);
      }

      this.currentIndex = index;
      this.currentElapsedMs = clamped;

      if (offsetMs > 0 && action) {
        this.pausedAction = {
          action,
          index,
          remainingMs: Math.max(1, actionDurationMs - offsetMs),
          zoomTarget: action.type === "zoom" ? this.activeZoomTarget : null,
        };
      }

      this.updateScrubberUi(this.currentElapsedMs);
      this.updateStatus(`Ready at ${this.formatMs(this.currentElapsedMs)}`);
    }

    applyCompletedStateUpTo(indexExclusive) {
      const actions = this.movie && Array.isArray(this.movie.actions) ? this.movie.actions : [];

      this.stopZoomDotTracking();
      if (this.zoomDotEl) {
        this.zoomDotEl.style.display = "none";
      }

      this.currentTx = 0;
      this.currentTy = 0;
      this.currentScale = 1;
      this.activeZoomTarget = null;
      this.hideCaption();

      if (this.imageEl) {
        this.imageEl.style.transition = "none";
        this.imageEl.style.transformOrigin = "center center";
        this.imageEl.style.transform = "translate(0px, 0px) scale(1)";
      }

      for (let i = 0; i < indexExclusive; i += 1) {
        const action = actions[i];
        if (!action) continue;

        if (action.type === "show") {
          this.applyShowInstant(action);
          continue;
        }

        if (action.type === "zoom" || action.type === "cut") {
          this.applyZoomInstant(action);
        }
      }

      const currentAction = actions[indexExclusive];
      if (currentAction && currentAction.type === "show") {
        this.applyShowInstant(currentAction);
      }
      if (currentAction && currentAction.type === "cut") {
        this.applyZoomInstant(currentAction);
      }
    }

    applyShowInstant(action) {
      const file = action && action.file;
      if (!file || !this.imageEl) return;

      const src = this.app.vault.getResourcePath(file);
      this.imageEl.style.transition = "none";
      this.imageEl.style.transformOrigin = "center center";
      this.imageEl.style.transform = "translate(0px, 0px) scale(1)";
      this.currentTx = 0;
      this.currentTy = 0;
      this.currentScale = 1;
      this.activeZoomTarget = null;
      this.imageEl.setAttribute("src", src);
    }

    applyZoomInstant(action) {
      this.applyZoomProgress(action, 1);
    }

    applyZoomProgress(action, progress) {
      if (!this.imageEl) return;

      const p = Math.max(0, Math.min(1, Number(progress) || 0));
      const startTx = this.currentTx;
      const startTy = this.currentTy;
      const startScale = this.currentScale;

      const end = action.zoomEnd && action.zoomEnd > 0 ? action.zoomEnd : startScale;
      const anchorX = Number.isFinite(Number(action.zoomAnchorX)) ? Number(action.zoomAnchorX) : 0.5;
      const anchorY = Number.isFinite(Number(action.zoomAnchorY)) ? Number(action.zoomAnchorY) : 0.5;

      const width = this.imageEl.offsetWidth;
      const height = this.imageEl.offsetHeight;
      const endTx = end * width * (0.5 - anchorX);
      const endTy = end * height * (0.5 - anchorY);

      const tx = startTx + (endTx - startTx) * p;
      const ty = startTy + (endTy - startTy) * p;
      const scale = startScale + (end - startScale) * p;

      this.imageEl.style.transition = "none";
      this.imageEl.style.transformOrigin = "center center";
      this.imageEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;

      this.currentTx = tx;
      this.currentTy = ty;
      this.currentScale = scale;
      this.activeZoomTarget = { endTx, endTy, endScale: end, anchorX, anchorY };
      this.positionZoomDot(anchorX, anchorY);
    }

    showImageAction(action, onReady) {
      const file = action.file;
      if (!file || !this.imageEl) return;

      const src = this.app.vault.getResourcePath(file);
      this.stopZoomDotTracking();
      this.activeZoomTarget = null;

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

      this.activeZoomTarget = { endTx, endTy, endScale: end, anchorX, anchorY };

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

    runCutAction(action) {
      if (!this.imageEl) return;

      this.stopZoomDotTracking();
      this.applyZoomInstant(action);
      this.updateStatus(`Cut ${action.zoomTargetName || "scene"} (${this.currentIndex + 1}/${this.movie.actions.length})`);
    }

    showCaption(text) {
      if (!this.captionEl) return;
      this.captionEl.textContent = String(text || "");
      this.captionEl.style.display = "block";
    }

    hideCaption() {
      if (!this.captionEl) return;
      this.captionEl.style.display = "none";
      this.captionEl.textContent = "";
    }

    getCaptionTextAtMs(ms) {
      let best = null;

      for (const window of this.captionWindows) {
        if (ms >= window.startMs && ms < window.endMs) {
          if (!best || window.startMs > best.startMs) {
            best = window;
          }
        }
      }

      return best ? best.text : null;
    }

    updateCaptionForMs(ms) {
      const text = this.getCaptionTextAtMs(ms);
      if (text === null) {
        this.hideCaption();
        return;
      }
      this.showCaption(text);
    }

    resumeZoomAction(zoomTarget, durationMs) {
      if (!this.imageEl || !zoomTarget) {
        this.runCurrentAction();
        return;
      }

      this.stopZoomDotTracking();

      this.imageEl.style.transition = "none";
      this.imageEl.style.transformOrigin = "center center";
      this.imageEl.style.transform = `translate(${this.currentTx}px, ${this.currentTy}px) scale(${this.currentScale})`;
      this.positionZoomDot(zoomTarget.anchorX, zoomTarget.anchorY);

      this.imageEl.offsetWidth;

      this.imageEl.style.transition = `transform ${durationMs}ms linear`;
      this.imageEl.style.transform = `translate(${zoomTarget.endTx}px, ${zoomTarget.endTy}px) scale(${zoomTarget.endScale})`;
      this.startZoomDotTracking(zoomTarget.anchorX, zoomTarget.anchorY, durationMs + 80);

      this.currentTx = zoomTarget.endTx;
      this.currentTy = zoomTarget.endTy;
      this.currentScale = zoomTarget.endScale;
      this.activeZoomTarget = zoomTarget;
    }

    captureCurrentImageTransform() {
      if (!this.imageEl) {
        return { tx: this.currentTx, ty: this.currentTy, scale: this.currentScale };
      }

      const computed = window.getComputedStyle(this.imageEl).transform;
      if (!computed || computed === "none") {
        return { tx: this.currentTx, ty: this.currentTy, scale: this.currentScale };
      }

      try {
        const matrix = new DOMMatrix(computed);
        const scale = Number.isFinite(matrix.a) ? matrix.a : this.currentScale;
        const tx = Number.isFinite(matrix.e) ? matrix.e : this.currentTx;
        const ty = Number.isFinite(matrix.f) ? matrix.f : this.currentTy;
        return { tx, ty, scale };
      } catch (error) {
        return { tx: this.currentTx, ty: this.currentTy, scale: this.currentScale };
      }
    }

    startScrubberTick() {
      this.stopScrubberTick();

      const tick = () => {
        if (!this.isPlaying) {
          this.scrubberTickId = null;
          return;
        }

        this.updateElapsedFromPlaybackNow();
        this.scrubberTickId = window.setTimeout(tick, 100);
      };

      this.scrubberTickId = window.setTimeout(tick, 100);
    }

    stopScrubberTick() {
      if (this.scrubberTickId !== null) {
        window.clearTimeout(this.scrubberTickId);
        this.scrubberTickId = null;
      }
    }

    updateElapsedFromPlaybackNow() {
      if (!this.movie || !Array.isArray(this.movie.actions) || this.movie.actions.length === 0) {
        this.currentElapsedMs = 0;
        this.updateScrubberUi(0);
        return;
      }

      if (!this.currentAction || this.currentIndex >= this.movie.actions.length) {
        this.updateScrubberUi(this.currentElapsedMs);
        return;
      }

      if (this.isScrubbing) {
        return;
      }

      const actionStart = this.actionStartTimes[this.currentIndex] || 0;
      const actions = this.movie.actions || [];
      const actionDurationMs = this.getTimelineActionDurationMs(actions, this.currentIndex);
      const elapsedSinceStart = Math.max(0, Date.now() - this.currentActionStartedAt);
      const elapsedBeforeThisRun = Math.max(0, actionDurationMs - this.currentActionRemainingMs);
      const elapsedInAction = Math.min(actionDurationMs, elapsedBeforeThisRun + elapsedSinceStart);
      this.currentElapsedMs = Math.min(this.totalDurationMs, actionStart + elapsedInAction);
      this.updateScrubberUi(this.currentElapsedMs);
    }

    updateScrubberUi(elapsedMs) {
      const clamped = Math.max(0, Math.min(this.totalDurationMs, Number(elapsedMs) || 0));

      if (this.scrubberEl) {
        const value = this.totalDurationMs > 0
          ? Math.round((clamped / this.totalDurationMs) * 1000)
          : 0;
        this.scrubberEl.value = String(value);
      }

      if (this.scrubberTimeEl) {
        this.scrubberTimeEl.setText(`${this.formatMs(clamped)} / ${this.formatMs(this.totalDurationMs)}`);
      }

      this.updateCaptionForMs(clamped);
    }

    formatMs(ms) {
      const totalSeconds = Math.max(0, Number(ms) || 0) / 1000;
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.floor(totalSeconds % 60);
      return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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



/**
 * REQUIEM CABARET VOLTAIRE 2026 - SCENES CONTROLLER
 * Manages the artistic diamond scene buttons (! ? / [ - : > ~)
 * Implements status inheritance until modified.
 */

class ScenesController {
  constructor(app) {
    this.app = app;
    this.sceneSymbols = ['!', '?', '/', '[', '-', ':', '>', '~'];
    this.activeSceneId = '~';
    this.scenes = {};

    this.initDefaultScenes();
    this.bindEvents();
  }

  initDefaultScenes() {
    this.sceneSymbols.forEach(sym => {
      if (!this.scenes[sym]) {
        this.scenes[sym] = {
          isCustomized: false,
          segments: [],
          circles: []
        };
      }
    });
  }

  loadScenesData(scenesData, activeId = '~') {
    if (scenesData) {
      this.scenes = Object.assign({}, scenesData);
      this.sceneSymbols.forEach(sym => {
        if (!this.scenes[sym]) {
          this.scenes[sym] = { isCustomized: false, segments: [], circles: [] };
        }
      });
    }
    this.activeSceneId = activeId || '~';
    this.updateSceneButtonsUI();
  }

  bindEvents() {
    const pad = document.getElementById('scenesDiamondPad');
    if (!pad) return;

    pad.addEventListener('click', (e) => {
      const btn = e.target.closest('.scene-diamond-btn');
      if (!btn) return;
      const sceneId = btn.dataset.scene;
      if (sceneId) {
        this.selectScene(sceneId);
      }
    });
  }

  selectScene(newSceneId) {
    if (newSceneId === this.activeSceneId) return;

    // Capture current scene's elements
    const currentElements = this.app.getCurrentElementsSnapshot();

    // Check if target scene has its own customized state
    const targetScene = this.scenes[newSceneId];
    if (!targetScene || !targetScene.isCustomized) {
      // Inherit last status from current scene!
      this.scenes[newSceneId] = {
        isCustomized: false,
        segments: JSON.parse(JSON.stringify(currentElements.segments)),
        circles: JSON.parse(JSON.stringify(currentElements.circles))
      };
    }

    this.activeSceneId = newSceneId;
    this.updateSceneButtonsUI();

    // Notify app to load target scene's elements
    this.app.applySceneElements(this.scenes[newSceneId]);
    this.app.syncStateToServer();
  }

  /**
   * Called whenever the user modifies any circle, segment, or slider.
   * Marks the current scene as customized so it maintains its own independent state.
   */
  markActiveSceneModified() {
    if (this.scenes[this.activeSceneId]) {
      this.scenes[this.activeSceneId].isCustomized = true;
      const snapshot = this.app.getCurrentElementsSnapshot();
      this.scenes[this.activeSceneId].segments = snapshot.segments;
      this.scenes[this.activeSceneId].circles = snapshot.circles;
    }
  }

  updateSceneButtonsUI() {
    const buttons = document.querySelectorAll('.scene-diamond-btn');
    buttons.forEach(btn => {
      const isCurrent = btn.dataset.scene === this.activeSceneId;
      btn.classList.toggle('active', isCurrent);
    });
  }

  getExportData() {
    return {
      activeSceneId: this.activeSceneId,
      scenes: this.scenes
    };
  }
}

window.ScenesController = ScenesController;

import { HistoryManager } from './history.js?v=2';
import { loadFont } from './fonts.js?v=2';

export class ThumbnailEditor {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d');

    // Logical dimensions for YouTube Thumbnail (16:9 standard)
    this.logicalWidth = 1280;
    this.logicalHeight = 720;

    // Set canvas internal resolution to 1280x720
    this.canvas.width = this.logicalWidth;
    this.canvas.height = this.logicalHeight;

    // Editor State
    this.layers = [];
    this.backgroundImage = null;
    this.backgroundImageSrc = null;
    this.backgroundImageSettings = {
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
      scaleMode: 'cover', // 'cover', 'contain', 'custom'
      opacity: 100,
      blur: 0,
      brightness: 100,
      contrast: 100,
      saturate: 100
    };

    this.zoom = 1.0; // 0.1 to 8.0
    this.panX = 0;
    this.panY = 0;
    this.selectedLayerId = null;

    // Explicit Editing State Machine
    this.editingState = 'idle'; // 'idle', 'editing', 'committing', 'cancelling'
    this.editingLayerId = null;
    this.editingOriginalText = '';

    // Asynchronous Operation Token tracking (layerId -> token)
    this.layerOperationTokens = new Map();
    this.bgOperationToken = 0;

    // Snapping configuration
    this.snapSettings = {
      snapToGrid: false,
      snapToGuides: true,
      gridSize: 20,
      snapThreshold: 8
    };
    this.activeGuides = [];

    // Callback when state updates
    this.onStateChange = () => {};

    // History
    this.history = new HistoryManager();

    // Init offscreen canvas for measuring text dimensions
    this.measureCanvas = document.createElement('canvas');
    this.measureCtx = this.measureCanvas.getContext('2d');
  }

  getSelectedLayer() {
    if (!this.selectedLayerId) return null;
    return this.layers.find(l => l.id === this.selectedLayerId) || null;
  }

  // Centralized selection API
  selectLayer(id) {
    // If active editing, commit first
    if (this.editingState === 'editing') {
      this.commitEditing();
    }
    const targetId = id && this.layers.some(layer => layer.id === id) ? id : null;
    this.selectedLayerId = targetId;
    this.assertEditorInvariants();
    this.onStateChange();
    this.render();
  }

  // Explicit Editing Transaction Actions
  startEditing(id) {
    if (this.editingState === 'editing') {
      if (this.editingLayerId === id) return true;
      this.commitEditing();
    }
    const layer = this.layers.find(l => l.id === id);
    if (!layer || layer.isLocked) return false;

    this.editingState = 'editing';
    this.editingLayerId = id;
    this.editingOriginalText = layer.text;
    this.assertEditorInvariants();
    this.onStateChange();
    this.render();
    return true;
  }

  commitEditing() {
    if (this.editingState !== 'editing') return;
    this.editingState = 'committing';

    const layer = this.layers.find(l => l.id === this.editingLayerId);
    if (layer) {
      // Only save history if the user actually modified the text
      if (layer.text !== this.editingOriginalText) {
        this.saveHistory();
      }
    }

    this.editingState = 'idle';
    this.editingLayerId = null;
    this.editingOriginalText = '';
    this.assertEditorInvariants();
    this.onStateChange();
    this.render();
  }

  cancelEditing() {
    if (this.editingState !== 'editing') return;
    this.editingState = 'cancelling';

    const layer = this.layers.find(l => l.id === this.editingLayerId);
    if (layer) {
      layer.text = this.editingOriginalText;
      this.measureLayer(layer);
    }

    this.editingState = 'idle';
    this.editingLayerId = null;
    this.editingOriginalText = '';
    this.assertEditorInvariants();
    this.onStateChange();
    this.render();
  }

  updateText(id, text) {
    const layer = this.layers.find(l => l.id === id);
    if (!layer || layer.isLocked) return;
    layer.text = text;
    this.measureLayer(layer);
    this.assertEditorInvariants();
    this.render();
    this.onStateChange();
  }

  // Centralized Mutation APIs
  moveLayer(id, x, y) {
    const layer = this.layers.find(l => l.id === id);
    if (!layer || layer.isLocked) return;
    layer.x = x;
    layer.y = y;
    this.assertEditorInvariants();
    this.render();
  }

  resizeLayer(id, width, height, fontSize) {
    const layer = this.layers.find(l => l.id === id);
    if (!layer || layer.isLocked) return;
    layer.width = width;
    layer.height = height;
    if (fontSize !== undefined && fontSize !== null) {
      layer.fontSize = fontSize;
    }
    this.assertEditorInvariants();
    this.render();
  }

  rotateLayer(id, rotation) {
    const layer = this.layers.find(l => l.id === id);
    if (!layer || layer.isLocked) return;
    layer.rotation = rotation;
    this.assertEditorInvariants();
    this.render();
  }

  nudgeLayer(id, dx, dy) {
    const layer = this.layers.find(l => l.id === id);
    if (!layer || layer.isLocked) return;
    layer.x += dx;
    layer.y += dy;
    this.assertEditorInvariants();
    this.render();
  }

  // Get deep copy of current state for history
  getCurrentState() {
    return {
      layers: this.layers.map(layer => ({ ...layer })),
      backgroundImageSrc: this.backgroundImageSrc,
      backgroundImageSettings: { ...this.backgroundImageSettings },
      selectedLayerId: this.selectedLayerId
    };
  }

  // Restore state from history
  restoreState(state) {
    if (!state) return;

    // If active editing, cancel it cleanly
    if (this.editingState === 'editing') {
      this.cancelEditing();
    }

    this.layers = Array.isArray(state.layers) ? state.layers.map(l => ({ ...l })) : [];
    this.selectedLayerId = this.layers.some(layer => layer.id === state.selectedLayerId)
      ? state.selectedLayerId
      : null;
    this.backgroundImageSettings = {
      ...this.backgroundImageSettings,
      ...(state.backgroundImageSettings || {})
    };

    if (state.backgroundImageSrc !== this.backgroundImageSrc) {
      this.backgroundImageSrc = state.backgroundImageSrc;
      const currentBgToken = ++this.bgOperationToken;
      if (this.backgroundImageSrc) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (currentBgToken !== this.bgOperationToken) return;
          this.backgroundImage = img;
          this.recalculateAllTextDimensions();
          this.assertEditorInvariants();
          this.render();
          this.onStateChange();
        };
        img.onerror = () => {
          if (currentBgToken !== this.bgOperationToken) return;
          this.backgroundImage = null;
          this.backgroundImageSrc = null;
          this.recalculateAllTextDimensions();
          this.assertEditorInvariants();
          this.render();
          this.onStateChange();
        };
        img.src = this.backgroundImageSrc;
      } else {
        this.backgroundImage = null;
        this.recalculateAllTextDimensions();
        this.assertEditorInvariants();
        this.render();
        this.onStateChange();
      }
    } else {
      this.recalculateAllTextDimensions();
      this.assertEditorInvariants();
      this.render();
      this.onStateChange();
    }
  }

  saveHistory() {
    // Avoid saving history while in temporary transitorily broken state
    if (this.editingState === 'editing' || this.editingState === 'cancelling') return;
    this.history.pushState(this.getCurrentState());
    this.onStateChange();
  }

  undo() {
    const prevState = this.history.undo(this.getCurrentState());
    if (prevState) {
      this.restoreState(prevState);
    }
  }

  redo() {
    const nextState = this.history.redo(this.getCurrentState());
    if (nextState) {
      this.restoreState(nextState);
    }
  }

  // Layer Management
  addTextLayer(text = 'TEXTO', save = true) {
    const newLayer = {
      id: 'text_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'text',
      text: text,
      x: 300,
      y: 250,
      width: 200,
      height: 100,
      rotation: 0,
      fontSize: 80,
      fontFamily: 'Montserrat',
      fontWeight: '900',
      fontStyle: 'normal',
      fillColor: '#ffffff',
      alignment: 'center',
      letterSpacing: 2,
      lineHeight: 1.2,

      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 10,

      shadowEnabled: true,
      shadowColor: 'rgba(0, 0, 0, 0.7)',
      shadowBlur: 15,
      shadowOffsetX: 5,
      shadowOffsetY: 5,

      glowEnabled: false,
      glowColor: '#ff007f',
      glowBlur: 20,

      backgroundEnabled: false,
      backgroundColor: '#000000',
      backgroundOpacity: 0.6,
      backgroundPadding: 15,

      isVisible: true,
      isLocked: false
    };

    this.layers.push(newLayer);
    this.selectedLayerId = newLayer.id;
    this.measureLayer(newLayer);
    newLayer.x = (this.logicalWidth - newLayer.width) / 2;
    newLayer.y = (this.logicalHeight - newLayer.height) / 2;

    if (save) {
      this.saveHistory();
    }
    this.render();

    // Async font loading with operation tokens per layer
    const layerId = newLayer.id;
    const currentToken = (this.layerOperationTokens.get(layerId) || 0) + 1;
    this.layerOperationTokens.set(layerId, currentToken);

    loadFont(newLayer.fontFamily).then(() => {
      const currentLayer = this.layers.find(layer => layer.id === layerId);
      if (!currentLayer) return;
      if (this.layerOperationTokens.get(layerId) !== currentToken) return;
      this.measureLayer(currentLayer);
      this.assertEditorInvariants();
      this.render();
      this.onStateChange();
    });

    return newLayer.id;
  }

  deleteLayer(id) {
    if (this.editingState === 'editing' && this.editingLayerId === id) {
      this.cancelEditing();
    }
    const index = this.layers.findIndex(l => l.id === id);
    if (index !== -1) {
      const layer = this.layers[index];
      if (layer.isLocked) return;
      this.layers.splice(index, 1);
      if (this.selectedLayerId === id) {
        this.selectedLayerId = this.layers.length > 0 ? this.layers[this.layers.length - 1].id : null;
      }
      this.layerOperationTokens.delete(id);
      this.saveHistory();
      this.render();
    }
  }

  duplicateLayer(id) {
    const layer = this.layers.find(l => l.id === id);
    if (!layer) return;

    const dup = {
      ...layer,
      id: 'text_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      x: layer.x + 30,
      y: layer.y + 30,
      isLocked: false
    };

    this.layers.push(dup);
    this.selectedLayerId = dup.id;
    this.saveHistory();
    this.render();
  }

  updateLayerProperty(id, property, value) {
    const layer = this.layers.find(l => l.id === id);
    if (!layer) return;

    layer[property] = value;

    if (['text', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'strokeWidth', 'backgroundPadding'].includes(property)) {
      if (property === 'fontFamily') {
        const requestedFont = value;
        const currentToken = (this.layerOperationTokens.get(id) || 0) + 1;
        this.layerOperationTokens.set(id, currentToken);

        loadFont(value).then(() => {
          const currentLayer = this.layers.find(candidate => candidate.id === id);
          if (!currentLayer) return;
          if (this.layerOperationTokens.get(id) !== currentToken) return;
          if (currentLayer.fontFamily !== requestedFont) return;
          this.measureLayer(currentLayer);
          this.assertEditorInvariants();
          this.render();
          this.onStateChange();
        });
      } else {
        this.measureLayer(layer);
        this.assertEditorInvariants();
        this.render();
      }
    } else {
      this.assertEditorInvariants();
      this.render();
    }
  }

  // Load Background Image
  setBackgroundImage(src) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const currentBgToken = ++this.bgOperationToken;
    img.onload = () => {
      if (currentBgToken !== this.bgOperationToken) return;
      this.backgroundImage = img;
      this.backgroundImageSrc = src;
      this.saveHistory();
      this.render();
    };
    img.onerror = () => {
      if (currentBgToken !== this.bgOperationToken) return;
      alert('Error al cargar la imagen de fondo. Intente con otro archivo.');
    };
    img.src = src;
  }

  removeBackgroundImage() {
    this.backgroundImage = null;
    this.backgroundImageSrc = null;
    this.saveHistory();
    this.render();
  }

  // Measure layer text dimensions exactly
  measureLayer(layer) {
    const ctx = this.measureCtx;
    ctx.save();

    // Set font style
    const weight = layer.fontWeight || 'normal';
    const style = layer.fontStyle || 'normal';
    ctx.font = `${style} ${weight} ${layer.fontSize}px "${layer.fontFamily}"`;

    if (ctx.letterSpacing !== undefined) {
      ctx.letterSpacing = `${layer.letterSpacing}px`;
    }

    const lines = layer.text.split('\n');
    let maxWidth = 0;

    lines.forEach(line => {
      const metrics = ctx.measureText(line);
      if (metrics.width > maxWidth) {
        maxWidth = metrics.width;
      }
    });

    ctx.restore();

    // Canvas letterSpacing fallback for older browsers
    if (ctx.letterSpacing === undefined && layer.letterSpacing !== 0) {
      lines.forEach(line => {
        const extra = line.length * layer.letterSpacing;
        const width = ctx.measureText(line).width + extra;
        if (width > maxWidth) maxWidth = width;
      });
    }

    // Assign width and height
    layer.width = Math.max(20, Math.ceil(maxWidth));

    const count = lines.length;
    const spacingHeight = layer.fontSize * layer.lineHeight;
    layer.height = Math.max(20, Math.ceil((count - 1) * spacingHeight + layer.fontSize));
  }

  recalculateAllTextDimensions() {
    this.layers.forEach(layer => this.measureLayer(layer));
  }

  // Reorder Layers
  moveLayerUp(id) {
    const index = this.layers.findIndex(l => l.id === id);
    if (index !== -1 && index < this.layers.length - 1) {
      const temp = this.layers[index];
      this.layers[index] = this.layers[index + 1];
      this.layers[index + 1] = temp;
      this.saveHistory();
      this.render();
    }
  }

  moveLayerDown(id) {
    const index = this.layers.findIndex(l => l.id === id);
    if (index !== -1 && index > 0) {
      const temp = this.layers[index];
      this.layers[index] = this.layers[index - 1];
      this.layers[index - 1] = temp;
      this.saveHistory();
      this.render();
    }
  }

  // Rendering Loop
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);

    // 1. Draw Checkered Background
    this.drawCheckeredBackground(ctx, this.logicalWidth, this.logicalHeight);

    // 2. Draw Background Image (with filters)
    if (this.backgroundImage) {
      ctx.save();

      const s = this.backgroundImageSettings;
      const filters = [];
      if (s.blur > 0) filters.push(`blur(${s.blur}px)`);
      if (s.brightness !== 100) filters.push(`brightness(${s.brightness}%)`);
      if (s.contrast !== 100) filters.push(`contrast(${s.contrast}%)`);
      if (s.saturate !== 100) filters.push(`saturate(${s.saturate}%)`);

      if (filters.length > 0) {
        ctx.filter = filters.join(' ');
      }

      ctx.globalAlpha = s.opacity / 100;

      if (s.scaleMode === 'cover') {
        const imgRatio = this.backgroundImage.width / this.backgroundImage.height;
        const canvasRatio = this.logicalWidth / this.logicalHeight;
        let sx, sy, sw, sh;

        if (imgRatio > canvasRatio) {
          sh = this.backgroundImage.height;
          sw = sh * canvasRatio;
          sx = (this.backgroundImage.width - sw) / 2;
          sy = 0;
        } else {
          sw = this.backgroundImage.width;
          sh = sw / canvasRatio;
          sx = 0;
          sy = (this.backgroundImage.height - sh) / 2;
        }
        ctx.drawImage(this.backgroundImage, sx, sy, sw, sh, 0, 0, this.logicalWidth, this.logicalHeight);
      } else if (s.scaleMode === 'contain') {
        const imgRatio = this.backgroundImage.width / this.backgroundImage.height;
        const canvasRatio = this.logicalWidth / this.logicalHeight;
        let dx, dy, dw, dh;

        if (imgRatio > canvasRatio) {
          dw = this.logicalWidth;
          dh = dw / imgRatio;
          dx = 0;
          dy = (this.logicalHeight - dh) / 2;
        } else {
          dh = this.logicalHeight;
          dw = dh * imgRatio;
          dy = 0;
          dx = (this.logicalWidth - dw) / 2;
        }
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
        ctx.drawImage(this.backgroundImage, dx, dy, dw, dh);
      } else {
        ctx.drawImage(this.backgroundImage, s.x, s.y, s.width, s.height);
      }

      ctx.restore();
    }

    // 3. Draw Text Layers in order
    this.layers.forEach(layer => {
      if (!layer.isVisible) return;
      this.drawTextLayer(ctx, layer);
    });
  }

  drawCheckeredBackground(ctx, w, h) {
    ctx.save();
    const size = 20;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e5e5e5';
    for (let y = 0; y < h; y += size * 2) {
      for (let x = 0; x < w; x += size * 2) {
        ctx.fillRect(x, y, size, size);
        ctx.fillRect(x + size, y + size, size, size);
      }
    }
    ctx.restore();
  }

  drawTextLayer(ctx, layer) {
    ctx.save();

    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;

    ctx.translate(cx, cy);
    if (layer.rotation !== 0) {
      ctx.rotate((layer.rotation * Math.PI) / 180);
    }
    ctx.translate(-layer.width / 2, -layer.height / 2);

    if (layer.glowEnabled) {
      ctx.shadowColor = layer.glowColor;
      ctx.shadowBlur = layer.glowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else if (layer.shadowEnabled) {
      ctx.shadowColor = layer.shadowColor;
      ctx.shadowBlur = layer.shadowBlur;
      ctx.shadowOffsetX = layer.shadowOffsetX;
      ctx.shadowOffsetY = layer.shadowOffsetY;
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    const lines = layer.text.split('\n');
    const padding = layer.backgroundPadding;

    if (layer.backgroundEnabled) {
      ctx.save();
      ctx.fillStyle = layer.backgroundColor;
      ctx.globalAlpha = layer.backgroundOpacity;

      const rectX = -padding;
      const rectY = -padding;
      const rectW = layer.width + padding * 2;
      const rectH = layer.height + padding * 2;

      ctx.beginPath();
      const radius = 8;
      ctx.roundRect(rectX, rectY, rectW, rectH, radius);
      ctx.fill();
      ctx.restore();
    }

    const weight = layer.fontWeight || 'normal';
    const style = layer.fontStyle || 'normal';
    ctx.font = `${style} ${weight} ${layer.fontSize}px "${layer.fontFamily}"`;
    ctx.textBaseline = 'top';

    if (ctx.letterSpacing !== undefined) {
      ctx.letterSpacing = `${layer.letterSpacing}px`;
    }

    ctx.fillStyle = layer.fillColor;
    ctx.strokeStyle = layer.strokeColor;
    ctx.lineWidth = layer.strokeWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const spacingHeight = layer.fontSize * layer.lineHeight;

    lines.forEach((line, index) => {
      const lineY = index * spacingHeight;
      let lineX = 0;

      if (layer.alignment === 'center') {
        let textWidth = 0;
        if (ctx.letterSpacing !== undefined) {
          textWidth = ctx.measureText(line).width;
        } else {
          textWidth = ctx.measureText(line).width + (line.length * layer.letterSpacing);
        }
        lineX = (layer.width - textWidth) / 2;
      } else if (layer.alignment === 'right') {
        let textWidth = 0;
        if (ctx.letterSpacing !== undefined) {
          textWidth = ctx.measureText(line).width;
        } else {
          textWidth = ctx.measureText(line).width + (line.length * layer.letterSpacing);
        }
        lineX = layer.width - textWidth;
      }

      if (ctx.letterSpacing === undefined && layer.letterSpacing !== 0) {
        let currentX = lineX;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (layer.strokeEnabled && layer.strokeWidth > 0) {
            ctx.strokeText(char, currentX, lineY);
          }
          ctx.fillText(char, currentX, lineY);
          currentX += ctx.measureText(char).width + layer.letterSpacing;
        }
      } else {
        if (layer.strokeEnabled && layer.strokeWidth > 0) {
          ctx.strokeText(line, lineX, lineY);
        }
        ctx.fillText(line, lineX, lineY);
      }
    });

    ctx.restore();
  }

  // Export Canvas
  exportImage(format = 'png', quality = 0.95) {
    const mimeType = format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : 'image/png';

    if (mimeType === 'image/jpeg') {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = this.logicalWidth;
      tempCanvas.height = this.logicalHeight;
      const tempCtx = tempCanvas.getContext('2d');

      tempCtx.fillStyle = '#000000';
      tempCtx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);

      if (this.backgroundImage) {
        tempCtx.save();
        const s = this.backgroundImageSettings;
        const filters = [];
        if (s.blur > 0) filters.push(`blur(${s.blur}px)`);
        if (s.brightness !== 100) filters.push(`brightness(${s.brightness}%)`);
        if (s.contrast !== 100) filters.push(`contrast(${s.contrast}%)`);
        if (s.saturate !== 100) filters.push(`saturate(${s.saturate}%)`);
        if (filters.length > 0) tempCtx.filter = filters.join(' ');
        tempCtx.globalAlpha = s.opacity / 100;

        if (s.scaleMode === 'cover') {
          const imgRatio = this.backgroundImage.width / this.backgroundImage.height;
          const canvasRatio = this.logicalWidth / this.logicalHeight;
          let sx, sy, sw, sh;
          if (imgRatio > canvasRatio) {
            sh = this.backgroundImage.height;
            sw = sh * canvasRatio;
            sx = (this.backgroundImage.width - sw) / 2;
            sy = 0;
          } else {
            sw = this.backgroundImage.width;
            sh = sw / canvasRatio;
            sx = 0;
            sy = (this.backgroundImage.height - sh) / 2;
          }
          tempCtx.drawImage(this.backgroundImage, sx, sy, sw, sh, 0, 0, this.logicalWidth, this.logicalHeight);
        } else if (s.scaleMode === 'contain') {
          const imgRatio = this.backgroundImage.width / this.backgroundImage.height;
          const canvasRatio = this.logicalWidth / this.logicalHeight;
          let dx, dy, dw, dh;
          if (imgRatio > canvasRatio) {
            dw = this.logicalWidth;
            dh = dw / imgRatio;
            dx = 0;
            dy = (this.logicalHeight - dh) / 2;
          } else {
            dh = this.logicalHeight;
            dw = dh * imgRatio;
            dy = 0;
            dx = (this.logicalWidth - dw) / 2;
          }
          tempCtx.fillStyle = '#000000';
          tempCtx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
          tempCtx.drawImage(this.backgroundImage, dx, dy, dw, dh);
        } else {
          tempCtx.drawImage(this.backgroundImage, s.x, s.y, s.width, s.height);
        }
        tempCtx.restore();
      }

      this.layers.forEach(layer => {
        if (layer.isVisible) {
          this.drawTextLayer(tempCtx, layer);
        }
      });

      return tempCanvas.toDataURL(mimeType, quality);
    }

    return this.canvas.toDataURL('image/png');
  }

  assertEditorInvariants() {
    // 1. Unique IDs
    const ids = this.layers.map(l => l.id);
    const uniqueIds = ids.length === new Set(ids).size;
    if (!uniqueIds) throw new Error("Invariante violado: IDs de capa duplicados.");

    // 2. Valid selection
    if (this.selectedLayerId !== null) {
      const selectedExists = this.layers.some(l => l.id === this.selectedLayerId);
      if (!selectedExists) throw new Error("Invariante violado: selectedLayerId apunta a una capa inexistente.");
    }

    // 3. Valid editingLayerId
    if (this.editingLayerId !== null) {
      const editingExists = this.layers.some(l => l.id === this.editingLayerId);
      if (!editingExists) throw new Error("Invariante violado: editingLayerId apunta a una capa inexistente.");
    }

    // 4. Consistent transitional editing state
    if (this.editingState === 'editing') {
      if (this.editingLayerId === null) {
        throw new Error("Invariante violado: editingState es 'editing' pero editingLayerId es null.");
      }
    } else if (this.editingState === 'idle') {
      if (this.editingLayerId !== null) {
        throw new Error("Invariante violado: editingState es 'idle' pero editingLayerId no es null.");
      }
    }

    // 5. Serializable snapshots
    try {
      JSON.stringify(this.getCurrentState());
    } catch (e) {
      throw new Error("Invariante violado: el estado actual no es serializable: " + e.message);
    }

    // 6. Exactly one textarea
    const textareas = document.querySelectorAll('#in-place-editor');
    if (textareas.length !== 1) {
      throw new Error(`Invariante violado: se encontraron ${textareas.length} textareas de edición en lugar de exactamente 1.`);
    }

    // 7. No visible textarea pointing to deleted layer or active when editor state is idle
    const inlineEditor = document.getElementById('in-place-editor');
    if (inlineEditor && !inlineEditor.classList.contains('hidden')) {
      if (this.editingState === 'idle') {
        throw new Error("Invariante violado: inline textarea visible pero editor.editingState es idle.");
      }
      const editingLayer = this.layers.find(l => l.id === this.editingLayerId);
      if (!editingLayer) {
        throw new Error("Invariante violado: inline textarea visible apuntando a una capa inexistente.");
      }
    }

    return true;
  }
}

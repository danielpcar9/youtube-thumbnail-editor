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

    // Snapping configuration
    this.snapSettings = {
      snapToGrid: false,
      snapToGuides: true,
      gridSize: 20,
      snapThreshold: 8
    };
    this.activeGuides = [];

    // Helper overlay canvas reference (optional, we can draw overlays in ui/interaction)
    this.onStateChange = () => {}; // Callback when state updates

    // History
    this.history = new HistoryManager();

    // Init offscreen canvas for measuring text dimensions
    this.measureCanvas = document.createElement('canvas');
    this.measureCtx = this.measureCanvas.getContext('2d');
  }

  getSelectedLayer() {
    if (!this.selectedLayerId) return null;
    return this.layers.find(l => l.id === this.selectedLayerId);
  }

  // Get deep copy of current state for history
  getCurrentState() {
    return {
      layers: this.layers,
      backgroundImageSrc: this.backgroundImageSrc,
      backgroundImageSettings: this.backgroundImageSettings,
      selectedLayerId: this.selectedLayerId
    };
  }

  // Restore state from history
  restoreState(state) {
    if (!state) return;
    
    this.selectedLayerId = state.selectedLayerId;
    this.backgroundImageSettings = { ...state.backgroundImageSettings };
    this.layers = state.layers.map(l => ({ ...l }));

    if (state.backgroundImageSrc !== this.backgroundImageSrc) {
      this.backgroundImageSrc = state.backgroundImageSrc;
      if (this.backgroundImageSrc) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          this.backgroundImage = img;
          this.recalculateAllTextDimensions();
          this.render();
          this.onStateChange();
        };
        img.onerror = () => {
          this.backgroundImage = null;
          this.backgroundImageSrc = null;
          this.recalculateAllTextDimensions();
          this.render();
          this.onStateChange();
        };
        img.src = this.backgroundImageSrc;
      } else {
        this.backgroundImage = null;
        this.recalculateAllTextDimensions();
        this.render();
        this.onStateChange();
      }
    } else {
      this.recalculateAllTextDimensions();
      this.render();
      this.onStateChange();
    }
  }

  saveHistory() {
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
  addTextLayer(text = 'TEXTO') {
    const newLayer = {
      id: 'text_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      type: 'text',
      text: text,
      x: 300,
      y: 250,
      width: 200, // calculated later
      height: 100, // calculated later
      rotation: 0, // degrees
      fontSize: 80,
      fontFamily: 'Montserrat',
      fontWeight: '900', // bold
      fontStyle: 'normal',
      fillColor: '#ffffff',
      alignment: 'center', // 'left', 'center', 'right'
      letterSpacing: 2, // px
      lineHeight: 1.2, // multiplier
      
      // Border / Stroke
      strokeEnabled: true,
      strokeColor: '#000000',
      strokeWidth: 10,

      // Shadow
      shadowEnabled: true,
      shadowColor: 'rgba(0, 0, 0, 0.7)',
      shadowBlur: 15,
      shadowOffsetX: 5,
      shadowOffsetY: 5,

      // Glow
      glowEnabled: false,
      glowColor: '#ff007f',
      glowBlur: 20,

      // Background Panel
      backgroundEnabled: false,
      backgroundColor: '#000000',
      backgroundOpacity: 0.6,
      backgroundPadding: 15, // px

      isVisible: true,
      isLocked: false
    };

    // Make sure font is loaded before adding and rendering
    loadFont(newLayer.fontFamily).then(() => {
      this.layers.push(newLayer);
      this.selectedLayerId = newLayer.id;
      this.measureLayer(newLayer);
      // Place center of new layer at canvas center
      newLayer.x = (this.logicalWidth - newLayer.width) / 2;
      newLayer.y = (this.logicalHeight - newLayer.height) / 2;
      
      this.saveHistory();
      this.render();
    });
  }

  deleteLayer(id) {
    const index = this.layers.findIndex(l => l.id === id);
    if (index !== -1) {
      this.layers.splice(index, 1);
      if (this.selectedLayerId === id) {
        this.selectedLayerId = this.layers.length > 0 ? this.layers[this.layers.length - 1].id : null;
      }
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
      x: layer.x + 30, // offset
      y: layer.y + 30,
      isLocked: false
    };

    this.layers.push(dup);
    this.selectedLayerId = dup.id;
    this.saveHistory();
    this.render();
  }

  // Returns a Promise so callers can know when the change (and any async font
  // loading it triggers) has actually finished being applied, before e.g.
  // saving a history snapshot or syncing the selection box overlay.
  updateLayerProperty(id, property, value) {
    const layer = this.layers.find(l => l.id === id);
    if (!layer) return Promise.resolve();

    layer[property] = value;

    if (['text', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'strokeWidth', 'backgroundPadding'].includes(property)) {
      if (property === 'fontFamily') {
        return loadFont(value).then(() => {
          this.measureLayer(layer);
          this.render();
          this.onStateChange();
        });
      } else {
        this.measureLayer(layer);
        this.render();
        return Promise.resolve();
      }
    } else {
      this.render();
      return Promise.resolve();
    }
  }

  // Load Background Image
  setBackgroundImage(src) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.backgroundImage = img;
      this.backgroundImageSrc = src;
      this.saveHistory();
      this.render();
    };
    img.onerror = () => {
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

    // Canvas letterSpacing fallback for older browsers:
    // If not supported natively, add an estimation
    if (ctx.letterSpacing === undefined && layer.letterSpacing !== 0) {
      lines.forEach(line => {
        const extra = line.length * layer.letterSpacing;
        const width = ctx.measureText(line).width + extra;
        if (width > maxWidth) maxWidth = width;
      });
    }

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

    // 1. Draw Checkered Background (to show transparency)
    this.drawCheckeredBackground(ctx, this.logicalWidth, this.logicalHeight);

    // 2. Draw Background Image (with filters)
    if (this.backgroundImage) {
      ctx.save();
      
      // Apply image filters
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

      // Draw depending on scaleMode
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
        // Fill canvas with black for containment borders, then draw image
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
        ctx.drawImage(this.backgroundImage, dx, dy, dw, dh);
      } else {
        // custom
        ctx.drawImage(this.backgroundImage, s.x, s.y, s.width, s.height);
      }

      ctx.restore();
    }

    // 3. Draw Grid Lines if grid is active and drawn directly (normally grid is drawn in UI overlay, but we can render it)
    // We prefer drawing the grid on the UI overlay to not bake it into the export.

    // 4. Draw Text Layers in order (index 0 is bottom, last index is top)
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

    // Move to the position of the layer (layer.x, layer.y represents top-left)
    // For rotation, we rotate around the center of the bounding box
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;

    ctx.translate(cx, cy);
    if (layer.rotation !== 0) {
      ctx.rotate((layer.rotation * Math.PI) / 180);
    }
    // Go back to the top-left of the bounding box relative to rotation center (cx, cy)
    ctx.translate(-layer.width / 2, -layer.height / 2);

    // Apply Glow/Shadow filters at context level before drawing shapes
    // Note: Canvas shadow can be used. Glow is simulated with a shadow without offsets.
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

    // 1. Draw Background Panel (if enabled)
    if (layer.backgroundEnabled) {
      ctx.save();
      // Temporarily disable shadow on background panel unless we want it, normally we don't or keep it clean
      // Actually, if drop shadow is enabled, let it apply to the background box too, it looks nice!
      ctx.fillStyle = layer.backgroundColor;
      ctx.globalAlpha = layer.backgroundOpacity;
      
      // Draw rounded rectangle or flat rectangle
      const rectX = -padding;
      const rectY = -padding;
      const rectW = layer.width + padding * 2;
      const rectH = layer.height + padding * 2;
      
      ctx.beginPath();
      // Round corner radius = 8px
      const radius = 8;
      ctx.roundRect(rectX, rectY, rectW, rectH, radius);
      ctx.fill();
      ctx.restore();
    }

    // 2. Set Font Properties
    const weight = layer.fontWeight || 'normal';
    const style = layer.fontStyle || 'normal';
    ctx.font = `${style} ${weight} ${layer.fontSize}px "${layer.fontFamily}"`;
    ctx.textBaseline = 'top';

    if (ctx.letterSpacing !== undefined) {
      ctx.letterSpacing = `${layer.letterSpacing}px`;
    }

    // Color Setup
    ctx.fillStyle = layer.fillColor;
    ctx.strokeStyle = layer.strokeColor;
    ctx.lineWidth = layer.strokeWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 3. Draw Text Line by Line
    const spacingHeight = layer.fontSize * layer.lineHeight;

    lines.forEach((line, index) => {
      const lineY = index * spacingHeight;
      let lineX = 0;

      // Alignment adjustments
      if (layer.alignment === 'center') {
        let textWidth = 0;
        if (ctx.letterSpacing !== undefined) {
          textWidth = ctx.measureText(line).width;
        } else {
          // Fallback letterspacing width
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

      // Draw custom letterspacing fallback if browser lacks support
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
        // Native rendering
        if (layer.strokeEnabled && layer.strokeWidth > 0) {
          // Draw stroke first
          ctx.strokeText(line, lineX, lineY);
        }
        // Draw fill second
        ctx.fillText(line, lineX, lineY);
      }
    });

    ctx.restore();
  }

  // Export Canvas
  exportImage(format = 'png', quality = 0.95) {
    // Return high quality data URL
    const mimeType = format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : 'image/png';
    
    // In case there is transparency and user exports to JPG, draw a solid black background
    if (mimeType === 'image/jpeg') {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = this.logicalWidth;
      tempCanvas.height = this.logicalHeight;
      const tempCtx = tempCanvas.getContext('2d');
      
      // Draw solid black
      tempCtx.fillStyle = '#000000';
      tempCtx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
      
      // Draw actual thumbnail content
      // Redraw onto temporary canvas
      // But we can just draw checkers replacement:
      if (this.backgroundImage) {
        // Redraw background image
        // Draw with filters and alpha
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

    // For PNG, just return dataURL from active canvas
    return this.canvas.toDataURL('image/png');
  }
}

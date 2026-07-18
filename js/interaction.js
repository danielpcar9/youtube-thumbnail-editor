import { snapLayer } from './snapping.js?v=2';

export class InteractionController {
  constructor(editor, overlayElement, inPlaceEditorElement) {
    this.editor = editor;
    this.overlay = overlayElement;
    this.inPlaceEditor = inPlaceEditorElement;

    // Interaction states
    this.activeAction = null; // 'move', 'resize', 'rotate', 'pan'
    this.resizeHandle = null;  // 'n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'
    this.startX = 0;
    this.startY = 0;
    
    // Copy of active layer properties when interaction starts
    this.initialLayerState = null;

    // Selection box elements
    this.selectionBox = null;
    this.guidesContainer = null;
    
    // Pan offset starting states
    this.startPanX = 0;
    this.startPanY = 0;

    this.initOverlay();
    this.initKeyboardShortcuts();
  }

  initOverlay() {
    this.overlay.innerHTML = `
      <div id="selection-box" class="selection-box hidden">
        <!-- Border lines -->
        <div class="selection-line line-n"></div>
        <div class="selection-line line-s"></div>
        <div class="selection-line line-e"></div>
        <div class="selection-line line-w"></div>
        
        <!-- Resize Handles -->
        <div class="handle handle-nw" data-handle="nw"></div>
        <div class="handle handle-n" data-handle="n"></div>
        <div class="handle handle-ne" data-handle="ne"></div>
        <div class="handle handle-e" data-handle="e"></div>
        <div class="handle handle-se" data-handle="se"></div>
        <div class="handle handle-s" data-handle="s"></div>
        <div class="handle handle-sw" data-handle="sw"></div>
        <div class="handle handle-w" data-handle="w"></div>
        
        <!-- Rotate Handle -->
        <div class="handle-rotate-line"></div>
        <div class="handle handle-rotate" data-handle="rotate"></div>
      </div>
      <div id="guides-container"></div>
    `;

    this.selectionBox = this.overlay.querySelector('#selection-box');
    this.guidesContainer = this.overlay.querySelector('#guides-container');

    // Attach mouse listeners
    this.overlay.addEventListener('mousedown', this.handleMouseDown.bind(this));
    window.addEventListener('mousemove', this.handleMouseMove.bind(this));
    window.addEventListener('mouseup', this.handleMouseUp.bind(this));

    // Double click to edit in-place
    this.selectionBox.addEventListener('dblclick', this.startInPlaceEdit.bind(this));

    // Textarea blur / edit finished listeners
    this.inPlaceEditor.addEventListener('blur', this.commitInPlaceEdit.bind(this));
    this.inPlaceEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.inPlaceEditor.blur();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        // Blur on simple Enter, Shift+Enter adds newline
        e.preventDefault();
        this.inPlaceEditor.blur();
      }
    });

    // Real-time update text while typing
    this.inPlaceEditor.addEventListener('input', () => {
      const activeLayer = this.getSelectedLayer();
      if (activeLayer) {
        this.editor.updateLayerProperty(activeLayer.id, 'text', this.inPlaceEditor.value);
        this.updateSelectionBoxPosition();
        this.updateInPlaceEditorStyle(activeLayer);
      }
    });
  }

  getSelectedLayer() {
    if (!this.editor.selectedLayerId) return null;
    return this.editor.layers.find(l => l.id === this.editor.selectedLayerId);
  }

  // Update selection box size & position to match active layer
  updateSelectionBoxPosition() {
    const layer = this.getSelectedLayer();
    
    if (!layer || !layer.isVisible || this.activeAction === 'pan' || this.isEditingText()) {
      this.selectionBox.classList.add('hidden');
      this.guidesContainer.innerHTML = '';
      return;
    }

    this.selectionBox.classList.remove('hidden');
    
    // Set position and dimensions (same logical coordinate system)
    this.selectionBox.style.left = `${layer.x}px`;
    this.selectionBox.style.top = `${layer.y}px`;
    this.selectionBox.style.width = `${layer.width}px`;
    this.selectionBox.style.height = `${layer.height}px`;
    this.selectionBox.style.transform = `rotate(${layer.rotation}deg)`;

    // Change style if locked
    if (layer.isLocked) {
      this.selectionBox.classList.add('locked');
    } else {
      this.selectionBox.classList.remove('locked');
    }
  }

  // Get mouse coordinates relative to workspace scaled canvas container
  getLogicalMouseCoords(e) {
    const rect = this.overlay.getBoundingClientRect();
    const xScreen = e.clientX - rect.left;
    const yScreen = e.clientY - rect.top;
    
    // Scale screen coordinate deltas back to logical dimensions
    return {
      x: xScreen / this.editor.zoom,
      y: yScreen / this.editor.zoom
    };
  }

  handleMouseDown(e) {
    // If double clicking/editing text, don't trigger drags
    if (this.isEditingText()) return;

    const layer = this.getSelectedLayer();
    
    // Hand tool / Pan spacebar active
    if (e.button === 1 || this.activeAction === 'pan') {
      this.activeAction = 'pan';
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.startPanX = this.editor.panX;
      this.startPanY = this.editor.panY;
      e.preventDefault();
      return;
    }

    // Check if clicked a handle
    const handleEl = e.target.closest('.handle');
    if (handleEl && layer && !layer.isLocked) {
      e.stopPropagation();
      const handleType = handleEl.dataset.handle;
      
      if (handleType === 'rotate') {
        this.activeAction = 'rotate';
      } else {
        this.activeAction = 'resize';
        this.resizeHandle = handleType;
      }
      
      const mouse = this.getLogicalMouseCoords(e);
      this.startX = mouse.x;
      this.startY = mouse.y;
      this.initialLayerState = { ...layer };
      
      e.preventDefault();
      return;
    }

    // Clicked inside selection box (Move)
    const insideSelection = e.target.closest('#selection-box');
    if (insideSelection && layer) {
      e.stopPropagation();
      
      if (layer.isLocked) return;

      this.activeAction = 'move';
      const mouse = this.getLogicalMouseCoords(e);
      this.startX = mouse.x;
      this.startY = mouse.y;
      this.initialLayerState = { ...layer };
      e.preventDefault();
      return;
    }

    // Clicked canvas background (Deselect or click through)
    // Find if clicked another layer (hit test)
    const mouse = this.getLogicalMouseCoords(e);
    const clickedLayer = this.hitTestLayers(mouse.x, mouse.y);

    if (clickedLayer) {
      this.editor.selectedLayerId = clickedLayer.id;
      this.editor.onStateChange();
      this.updateSelectionBoxPosition();
      
      // Instantly start dragging the newly selected layer
      if (!clickedLayer.isLocked) {
        this.activeAction = 'move';
        this.startX = mouse.x;
        this.startY = mouse.y;
        this.initialLayerState = { ...clickedLayer };
      }
      this.editor.render();
    } else {
      this.editor.selectedLayerId = null;
      this.editor.onStateChange();
      this.updateSelectionBoxPosition();
      this.editor.render();
    }
  }

  handleMouseMove(e) {
    if (!this.activeAction) return;

    const layer = this.getSelectedLayer();
    
    if (this.activeAction === 'pan') {
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      this.editor.panX = this.startPanX + dx;
      this.editor.panY = this.startPanY + dy;
      this.editor.onStateChange(); // triggers CSS pan repositioning
      return;
    }

    if (!layer || layer.isLocked) return;

    const mouse = this.getLogicalMouseCoords(e);
    const dx = mouse.x - this.startX;
    const dy = mouse.y - this.startY;

    if (this.activeAction === 'move') {
      let newX = this.initialLayerState.x + dx;
      let newY = this.initialLayerState.y + dy;

      // Snapping
      const tempLayer = { ...layer, x: newX, y: newY };
      const snapResult = snapLayer(
        tempLayer,
        this.editor.layers,
        this.editor.logicalWidth,
        this.editor.logicalHeight,
        this.editor.snapSettings
      );

      layer.x = snapResult.x;
      layer.y = snapResult.y;

      this.editor.activeGuides = snapResult.guides;
      this.drawSmartGuides(snapResult.guides);
      
      this.editor.render();
      this.updateSelectionBoxPosition();
      this.editor.onStateChange();
    } 
    
    else if (this.activeAction === 'resize') {
      this.resizeLayerRotated(layer, dx, dy);
      this.editor.measureLayer(layer);
      this.editor.render();
      this.updateSelectionBoxPosition();
      this.editor.onStateChange();
    } 
    
    else if (this.activeAction === 'rotate') {
      // Calculate rotation angle
      const cx = this.initialLayerState.x + this.initialLayerState.width / 2;
      const cy = this.initialLayerState.y + this.initialLayerState.height / 2;
      
      const rad = Math.atan2(mouse.y - cy, mouse.x - cx);
      let deg = (rad * 180) / Math.PI + 90; // Add 90 because handle is on top

      // Hold Shift to snap to 15 degrees
      if (e.shiftKey) {
        deg = Math.round(deg / 15) * 15;
      }

      layer.rotation = Math.round((deg + 360) % 360);
      this.editor.render();
      this.updateSelectionBoxPosition();
      this.editor.onStateChange();
    }
  }

  handleMouseUp() {
    if (this.activeAction) {
      if (this.activeAction === 'move' || this.activeAction === 'resize' || this.activeAction === 'rotate') {
        this.editor.saveHistory();
      }
      this.activeAction = null;
      this.resizeHandle = null;
      this.editor.activeGuides = [];
      this.guidesContainer.innerHTML = '';
    }
  }

  // Projects delta mouse coordinates onto local axes of rotated layer to resize correctly
  resizeLayerRotated(layer, dx, dy) {
    const rad = (this.initialLayerState.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Project screen-space delta mouse movement to rotated layer local coordinates
    const localDx = dx * cos + dy * sin;
    const localDy = -dx * sin + dy * cos;

    const init = this.initialLayerState;
    const handle = this.resizeHandle;

    let newWidth = init.width;
    let newHeight = init.height;
    let shiftX = 0;
    let shiftY = 0;

    // Resize Horizontal
    if (handle.includes('e')) {
      newWidth = Math.max(10, init.width + localDx);
    } else if (handle.includes('w')) {
      const possibleWidth = init.width - localDx;
      if (possibleWidth > 10) {
        newWidth = possibleWidth;
        shiftX = localDx;
      }
    }

    // Resize Vertical
    if (handle.includes('s')) {
      newHeight = Math.max(10, init.height + localDy);
    } else if (handle.includes('n')) {
      const possibleHeight = init.height - localDy;
      if (possibleHeight > 10) {
        newHeight = possibleHeight;
        shiftY = localDy;
      }
    }

    // Set font size proportionally if dragging corners
    if (['nw', 'ne', 'sw', 'se'].includes(handle)) {
      // Calculate scale change of width
      const scale = newWidth / init.width;
      layer.fontSize = Math.max(8, Math.round(init.fontSize * scale));
    } else {
      // For pure side resizing, change layer size limits
      layer.width = newWidth;
      layer.height = newHeight;
    }

    // Apply shifts back to global coordinates based on rotation
    if (shiftX !== 0 || shiftY !== 0) {
      layer.x = init.x + (shiftX * cos - shiftY * sin);
      layer.y = init.y + (shiftX * sin + shiftY * cos);
    }
  }

  // Simple point in rotated rect collision detection
  hitTestLayers(x, y) {
    // Traverse layers backwards (top-most layers first)
    for (let i = this.editor.layers.length - 1; i >= 0; i--) {
      const layer = this.editor.layers[i];
      if (!layer.isVisible) continue;

      // Translate test point relative to layer center
      const cx = layer.x + layer.width / 2;
      const cy = layer.y + layer.height / 2;
      
      const px = x - cx;
      const py = y - cy;

      // Rotate point back by layer rotation angle
      const rad = (-layer.rotation * Math.PI) / 180;
      const rx = px * Math.cos(rad) - py * Math.sin(rad);
      const ry = px * Math.sin(rad) + py * Math.cos(rad);

      // Check boundaries of unrotated local box
      const halfW = layer.width / 2;
      const halfH = layer.height / 2;
      const padding = layer.backgroundEnabled ? layer.backgroundPadding : 0;

      if (rx >= -halfW - padding && rx <= halfW + padding &&
          ry >= -halfH - padding && ry <= halfH + padding) {
        return layer;
      }
    }
    return null;
  }

  // Smart Guides drawing
  drawSmartGuides(guides) {
    this.guidesContainer.innerHTML = '';
    
    guides.forEach(g => {
      const line = document.createElement('div');
      line.className = `smart-guide-line ${g.type}`;
      
      if (g.type === 'vertical') {
        line.style.left = `${g.x}px`;
        line.style.top = '0px';
        line.style.height = `${this.editor.logicalHeight}px`;
      } else {
        line.style.top = `${g.y}px`;
        line.style.left = '0px';
        line.style.width = `${this.editor.logicalWidth}px`;
      }
      
      this.guidesContainer.appendChild(line);
    });
  }

  // Direct editing setup
  startInPlaceEdit() {
    const layer = this.getSelectedLayer();
    if (!layer || layer.isLocked) return;

    this.selectionBox.classList.add('hidden');
    this.inPlaceEditor.classList.remove('hidden');
    
    this.inPlaceEditor.value = layer.text;
    this.updateInPlaceEditorStyle(layer);
    this.inPlaceEditor.focus();
    this.inPlaceEditor.select();
  }

  updateInPlaceEditorStyle(layer) {
    const s = this.inPlaceEditor.style;
    s.left = `${layer.x}px`;
    s.top = `${layer.y}px`;
    s.width = `${layer.width}px`;
    s.height = `${layer.height}px`;
    s.fontSize = `${layer.fontSize}px`;
    s.fontFamily = `"${layer.fontFamily}", sans-serif`;
    s.fontWeight = layer.fontWeight;
    s.fontStyle = layer.fontStyle;
    s.color = layer.fillColor;
    s.textAlign = layer.alignment;
    s.lineHeight = layer.lineHeight;
    s.letterSpacing = `${layer.letterSpacing}px`;
    s.transform = `rotate(${layer.rotation}deg)`;
    s.transformOrigin = 'center';
  }

  commitInPlaceEdit() {
    if (!this.isEditingText()) return;

    const layer = this.getSelectedLayer();
    const newText = this.inPlaceEditor.value.trim();

    this.inPlaceEditor.classList.add('hidden');
    
    if (layer && newText !== '') {
      const oldText = layer.text;
      if (oldText !== newText) {
        this.editor.updateLayerProperty(layer.id, 'text', newText);
        this.editor.saveHistory();
      }
    }

    this.updateSelectionBoxPosition();
    this.editor.render();
  }

  isEditingText() {
    return !this.inPlaceEditor.classList.contains('hidden');
  }

  // Keyboard Shortcuts Bindings
  initKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Skip shortcuts if writing in text area or input fields
      const activeEl = document.activeElement;
      const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable;
      if (isInput) return;

      const layer = this.getSelectedLayer();

      // Undo: Ctrl/Cmd + Z
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        this.editor.undo();
        this.updateSelectionBoxPosition();
      }
      
      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') || ((e.ctrlKey || e.metaKey) && e.key === 'y')) {
        e.preventDefault();
        this.editor.redo();
        this.updateSelectionBoxPosition();
      }

      // Lock selected layer: Ctrl/Cmd + L
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        if (layer) {
          e.preventDefault();
          this.editor.updateLayerProperty(layer.id, 'isLocked', !layer.isLocked);
          this.editor.saveHistory();
          this.updateSelectionBoxPosition();
        }
      }

      // Toggle visibility: Ctrl/Cmd + H
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        if (layer) {
          e.preventDefault();
          this.editor.updateLayerProperty(layer.id, 'isVisible', !layer.isVisible);
          this.editor.saveHistory();
          this.updateSelectionBoxPosition();
        }
      }

      // Delete: Delete or Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (layer) {
          e.preventDefault();
          this.editor.deleteLayer(layer.id);
          this.updateSelectionBoxPosition();
        }
      }

      // Duplicate: Ctrl/Cmd + D
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        if (layer) {
          e.preventDefault();
          this.editor.duplicateLayer(layer.id);
          this.updateSelectionBoxPosition();
        }
      }

      // Arrow Key Nudging
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        if (layer && !layer.isLocked) {
          e.preventDefault();
          const speed = e.shiftKey ? 10 : 1; // shift nudges by 10px
          
          if (e.key === 'ArrowLeft') layer.x -= speed;
          if (e.key === 'ArrowRight') layer.x += speed;
          if (e.key === 'ArrowUp') layer.y -= speed;
          if (e.key === 'ArrowDown') layer.y += speed;

          this.editor.render();
          this.updateSelectionBoxPosition();
          
          // Debounce history saving on keyboard nudges
          clearTimeout(this.nudgeHistoryTimeout);
          this.nudgeHistoryTimeout = setTimeout(() => {
            this.editor.saveHistory();
          }, 300);
        }
      }
    });

    // Spacebar panning listener
    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement;
      const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable;
      if (isInput) return;

      if (e.key === ' ' && this.activeAction !== 'pan') {
        // Spacebar pressed: turn cursor to grab
        this.activeAction = 'pan';
        this.overlay.style.cursor = 'grab';
        // Cache start pan coordinates when workspace is hovered
        this.startX = this.lastMouseX || 0;
        this.startY = this.lastMouseY || 0;
        this.startPanX = this.editor.panX;
        this.startPanY = this.editor.panY;
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === ' ' && this.activeAction === 'pan') {
        this.activeAction = null;
        this.overlay.style.cursor = 'default';
      }
    });

    // Store mouse position for spacebar pan start
    window.addEventListener('mousemove', (e) => {
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    });
  }
}

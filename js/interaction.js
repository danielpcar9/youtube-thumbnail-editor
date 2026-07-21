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
    this.boundHandlers = {};
    this.onRequestTextEdit = null;

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
    this.overlay.tabIndex = -1;

    // Attach mouse listeners
    this.boundHandlers.mouseDown = this.handleMouseDown.bind(this);
    this.boundHandlers.mouseMove = this.handleMouseMove.bind(this);
    this.boundHandlers.mouseUp = this.handleMouseUp.bind(this);
    this.overlay.addEventListener('mousedown', this.boundHandlers.mouseDown);
    window.addEventListener('mousemove', this.boundHandlers.mouseMove);
    window.addEventListener('mouseup', this.boundHandlers.mouseUp);

    // Double click to edit in-place
    this.boundHandlers.doubleClick = () => {
      const layer = this.getSelectedLayer();
      if (!layer || layer.isLocked) return;
      if (this.onRequestTextEdit) {
        this.onRequestTextEdit(layer);
      } else {
        this.startInPlaceEdit();
      }
    };
    this.selectionBox.addEventListener('dblclick', this.boundHandlers.doubleClick);

    // Textarea blur / edit finished listeners
    this.boundHandlers.editorBlur = () => {
      // Ensure we only commit if currently editing
      if (this.editor.editingState === 'editing') {
        this.commitInPlaceEdit();
      }
    };

    this.boundHandlers.editorKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.commitInPlaceEdit(true);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.commitInPlaceEdit();
      }
    };

    this.inPlaceEditor.addEventListener('blur', this.boundHandlers.editorBlur);
    this.inPlaceEditor.addEventListener('keydown', this.boundHandlers.editorKeyDown);

    // Real-time update text while typing (does not save history)
    this.boundHandlers.editorInput = () => {
      const activeLayer = this.getEditingLayer();
      if (activeLayer) {
        this.editor.updateText(activeLayer.id, this.inPlaceEditor.value);
        this.updateSelectionBoxPosition();
        this.updateInPlaceEditorStyle(activeLayer);
      }
    };
    this.inPlaceEditor.addEventListener('input', this.boundHandlers.editorInput);
  }

  getSelectedLayer() {
    return this.editor.getSelectedLayer();
  }

  getEditingLayer() {
    if (!this.editor.editingLayerId) return null;
    return this.editor.layers.find(layer => layer.id === this.editor.editingLayerId) || null;
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

    return {
      x: xScreen / this.editor.zoom,
      y: yScreen / this.editor.zoom
    };
  }

  handleMouseDown(e) {
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
    const mouse = this.getLogicalMouseCoords(e);
    const clickedLayer = this.hitTestLayers(mouse.x, mouse.y);

    if (clickedLayer) {
      this.editor.selectLayer(clickedLayer.id);
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
      this.editor.selectLayer(null);
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
      this.editor.onStateChange();
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

      this.editor.moveLayer(layer.id, snapResult.x, snapResult.y);
      this.editor.activeGuides = snapResult.guides;
      this.drawSmartGuides(snapResult.guides);

      this.updateSelectionBoxPosition();
      this.editor.onStateChange();
    }

    else if (this.activeAction === 'resize') {
      this.resizeLayerRotated(layer, mouse.x, mouse.y);
      this.updateSelectionBoxPosition();
      this.editor.onStateChange();
    }

    else if (this.activeAction === 'rotate') {
      const cx = this.initialLayerState.x + this.initialLayerState.width / 2;
      const cy = this.initialLayerState.y + this.initialLayerState.height / 2;

      const rad = Math.atan2(mouse.y - cy, mouse.x - cx);
      let deg = (rad * 180) / Math.PI + 90;

      if (e.shiftKey) {
        deg = Math.round(deg / 15) * 15;
      }

      const rotation = Math.round((deg + 360) % 360);
      this.editor.rotateLayer(layer.id, rotation);
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
      this.editor.assertEditorInvariants();
    }
  }

  // Geometrically perfect rotated resizing keeping the opposite side fixed
  resizeLayerRotated(layer, mouseX, mouseY) {
    const init = this.initialLayerState;
    const handle = this.resizeHandle;
    const rad = (init.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Original Center
    const cx = init.x + init.width / 2;
    const cy = init.y + init.height / 2;

    // Define fixed point in local space relative to original center
    let uFixed = 0;
    let vFixed = 0;
    let uDragged = 0;
    let vDragged = 0;

    switch (handle) {
      case 'se':
        uFixed = -init.width / 2; vFixed = -init.height / 2;
        uDragged = init.width / 2; vDragged = init.height / 2;
        break;
      case 'nw':
        uFixed = init.width / 2; vFixed = init.height / 2;
        uDragged = -init.width / 2; vDragged = -init.height / 2;
        break;
      case 'ne':
        uFixed = -init.width / 2; vFixed = init.height / 2;
        uDragged = init.width / 2; vDragged = -init.height / 2;
        break;
      case 'sw':
        uFixed = init.width / 2; vFixed = -init.height / 2;
        uDragged = -init.width / 2; vDragged = init.height / 2;
        break;
      case 'e':
        uFixed = -init.width / 2; vFixed = 0;
        uDragged = init.width / 2; vDragged = 0;
        break;
      case 'w':
        uFixed = init.width / 2; vFixed = 0;
        uDragged = -init.width / 2; vDragged = 0;
        break;
      case 's':
        uFixed = 0; vFixed = -init.height / 2;
        uDragged = 0; vDragged = init.height / 2;
        break;
      case 'n':
        uFixed = 0; vFixed = init.height / 2;
        uDragged = 0; vDragged = -init.height / 2;
        break;
    }

    // Convert local fixed point to global space coordinates
    const xFixed = cx + (uFixed * cos - vFixed * sin);
    const yFixed = cy + (uFixed * sin + vFixed * cos);

    let newWidth = init.width;
    let newHeight = init.height;
    let newFontSize = init.fontSize;

    if (['nw', 'ne', 'sw', 'se'].includes(handle)) {
      // Corner drag: aspect ratio and font size scaling
      const originalDiagonal = Math.sqrt(init.width * init.width + init.height * init.height);
      const currentDiagonal = Math.sqrt((mouseX - xFixed) * (mouseX - xFixed) + (mouseY - yFixed) * (mouseY - yFixed));

      // Prevent flipping by checking dot product of original vs new diagonal vectors
      const origDiagVecX = uDragged - uFixed;
      const origDiagVecY = vDragged - vFixed;
      const origDiagGlobalX = origDiagVecX * cos - origDiagVecY * sin;
      const origDiagGlobalY = origDiagVecX * sin + origDiagVecY * cos;

      const newDiagGlobalX = mouseX - xFixed;
      const newDiagGlobalY = mouseY - yFixed;

      const dot = origDiagGlobalX * newDiagGlobalX + origDiagGlobalY * newDiagGlobalY;

      if (dot > 0) {
        const scale = Math.max(0.1, currentDiagonal / originalDiagonal);
        newWidth = Math.max(20, init.width * scale);
        newHeight = Math.max(20, init.height * scale);
        newFontSize = Math.max(8, Math.round(init.fontSize * scale));
      } else {
        newWidth = 20;
        newHeight = 20;
        newFontSize = 8;
      }
    } else {
      // Side resize: projects mouse distance relative to fixed point onto local axis
      const dxGlobal = mouseX - xFixed;
      const dyGlobal = mouseY - yFixed;

      const localDx = dxGlobal * cos + dyGlobal * sin;
      const localDy = -dxGlobal * sin + dyGlobal * cos;

      if (handle === 'e' || handle === 'w') {
        const sign = handle === 'e' ? 1 : -1;
        newWidth = Math.max(20, localDx * sign);
      } else if (handle === 's' || handle === 'n') {
        const sign = handle === 's' ? 1 : -1;
        newHeight = Math.max(20, localDy * sign);
      }
    }

    // Determine scale offsets to compute new center from fixed point
    const scaleX = newWidth / init.width;
    const scaleY = newHeight / init.height;
    const uFixedNew = uFixed * scaleX;
    const vFixedNew = vFixed * scaleY;

    const cxNew = xFixed - (uFixedNew * cos - vFixedNew * sin);
    const cyNew = yFixed - (uFixedNew * sin + vFixedNew * cos);

    const newX = cxNew - newWidth / 2;
    const newY = cyNew - newHeight / 2;

    // Apply values via the Editor APIs
    this.editor.moveLayer(layer.id, newX, newY);
    this.editor.resizeLayer(layer.id, newWidth, newHeight, newFontSize);
  }

  hitTestLayers(x, y) {
    for (let i = this.editor.layers.length - 1; i >= 0; i--) {
      const layer = this.editor.layers[i];
      if (!layer.isVisible) continue;

      const cx = layer.x + layer.width / 2;
      const cy = layer.y + layer.height / 2;

      const px = x - cx;
      const py = y - cy;

      const rad = (-layer.rotation * Math.PI) / 180;
      const rx = px * Math.cos(rad) - py * Math.sin(rad);
      const ry = px * Math.sin(rad) + py * Math.cos(rad);

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

  startInPlaceEdit() {
    const layer = this.getSelectedLayer();
    if (!layer || layer.isLocked) return;

    const editStarted = this.editor.startEditing(layer.id);
    if (!editStarted) return;

    this.inPlaceEditor.classList.add('hidden');

    // Focus the properties panel textarea instead
    const propText = document.getElementById('prop-text');
    if (propText) {
      propText.focus();
      propText.select();
    }
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

  commitInPlaceEdit(cancel = false) {
    if (this.editor.editingState !== 'editing') return;
    if (this.isCommittingOrCancelling) return;
    this.isCommittingOrCancelling = true;

    const textareaText = this.inPlaceEditor.value;
    this.inPlaceEditor.classList.add('hidden');

    // Explicitly blur and shift focus back to overlay
    if (document.activeElement === this.inPlaceEditor) {
      this.inPlaceEditor.blur();
    }

    const layer = this.getEditingLayer();
    if (layer) {
      if (cancel) {
        this.editor.cancelEditing();
      } else {
        // Apply final text update
        this.editor.updateText(layer.id, textareaText);
        this.editor.commitEditing();
      }
    } else {
      // Fallback state machine reset if layer disappeared during transaction
      this.editor.editingState = 'idle';
      this.editor.editingLayerId = null;
      this.editor.editingOriginalText = '';
      this.editor.onStateChange();
    }

    this.overlay.focus({ preventScroll: true });
    this.updateSelectionBoxPosition();
    this.editor.render();

    this.isCommittingOrCancelling = false;
  }

  hasOpenInPlaceEditor() {
    return !this.inPlaceEditor.classList.contains('hidden') || document.activeElement === document.getElementById('prop-text');
  }

  closeInPlaceEditor() {
    this.closeTextEditorUI(true);
  }

  closeTextEditorUI(commit = true) {
    if (this.isCommittingOrCancelling) return;
    this.isCommittingOrCancelling = true;

    // 1. Ocultar el editor inline
    if (this.inPlaceEditor) {
      this.inPlaceEditor.classList.add('hidden');
      if (document.activeElement === this.inPlaceEditor) {
        this.inPlaceEditor.blur();
      }
    }

    // 2. Quitar foco del panel textarea
    const propText = document.getElementById('prop-text');
    if (propText && document.activeElement === propText) {
      propText.blur();
    }

    // 3. Coordinar con el modelo
    if (this.editor.editingState === 'editing') {
      if (commit) {
        this.editor.commitEditing();
      } else {
        this.editor.cancelEditing();
      }
    } else {
      this.editor.editingState = 'idle';
      this.editor.editingLayerId = null;
      this.editor.editingOriginalText = '';
    }

    // 4. Devolver foco al workspace
    if (this.overlay) {
      this.overlay.focus({ preventScroll: true });
    }

    // 5. Verificar selección
    if (this.editor.selectedLayerId) {
      const selectedExists = this.editor.layers.some(l => l.id === this.editor.selectedLayerId);
      if (!selectedExists) {
        this.editor.selectedLayerId = null;
      }
    }

    this.updateSelectionBoxPosition();
    this.editor.render();

    this.isCommittingOrCancelling = false;
  }

  isEditingText() {
    return this.editor.editingState === 'editing' || this.hasOpenInPlaceEditor();
  }

  initKeyboardShortcuts() {
    this.boundHandlers.keyDown = (e) => {
      // Skip shortcuts if writing in input fields, select, contenteditable or textarea
      const activeEl = document.activeElement;
      const isInput = activeEl.tagName === 'INPUT' ||
                      activeEl.tagName === 'SELECT' ||
                      activeEl.tagName === 'TEXTAREA' ||
                      activeEl.isContentEditable;
      if (isInput) return;

      const layer = this.getSelectedLayer();
      const keyLower = e.key.toLowerCase();

      // Undo: Ctrl/Cmd + Z
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && keyLower === 'z') {
        e.preventDefault();
        this.editor.undo();
        this.updateSelectionBoxPosition();
        return;
      }

      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if (((e.ctrlKey || e.metaKey) && e.shiftKey && keyLower === 'z') || ((e.ctrlKey || e.metaKey) && keyLower === 'y')) {
        e.preventDefault();
        this.editor.redo();
        this.updateSelectionBoxPosition();
        return;
      }

      // Lock selected layer: Ctrl/Cmd + L
      if ((e.ctrlKey || e.metaKey) && keyLower === 'l') {
        if (layer) {
          e.preventDefault();
          this.editor.updateLayerProperty(layer.id, 'isLocked', !layer.isLocked);
          this.editor.saveHistory();
          this.updateSelectionBoxPosition();
        }
        return;
      }

      // Toggle visibility: Ctrl/Cmd + H
      if ((e.ctrlKey || e.metaKey) && keyLower === 'h') {
        if (layer) {
          e.preventDefault();
          this.editor.updateLayerProperty(layer.id, 'isVisible', !layer.isVisible);
          this.editor.saveHistory();
          this.updateSelectionBoxPosition();
        }
        return;
      }

      // Delete: Delete or Backspace (only if workspace has focus/activeEl matches overlay/body)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const canDelete = activeEl === this.overlay || activeEl === document.body;
        if (layer && !layer.isLocked && canDelete) {
          e.preventDefault();
          this.editor.deleteLayer(layer.id);
          this.updateSelectionBoxPosition();
        }
        return;
      }

      // Duplicate: Ctrl/Cmd + D
      if ((e.ctrlKey || e.metaKey) && keyLower === 'd') {
        if (layer) {
          e.preventDefault();
          this.editor.duplicateLayer(layer.id);
          this.updateSelectionBoxPosition();
        }
        return;
      }

      // Arrow Key Nudging
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(keyLower)) {
        if (layer && !layer.isLocked) {
          e.preventDefault();
          const speed = e.shiftKey ? 10 : 1;
          let dx = 0;
          let dy = 0;

          if (e.key === 'ArrowLeft') dx = -speed;
          if (e.key === 'ArrowRight') dx = speed;
          if (e.key === 'ArrowUp') dy = -speed;
          if (e.key === 'ArrowDown') dy = speed;

          this.editor.nudgeLayer(layer.id, dx, dy);
          this.updateSelectionBoxPosition();

          clearTimeout(this.nudgeHistoryTimeout);
          this.nudgeHistoryTimeout = setTimeout(() => {
            this.editor.saveHistory();
          }, 300);
        }
        return;
      }
    };
    window.addEventListener('keydown', this.boundHandlers.keyDown);

    // Spacebar panning listener
    this.boundHandlers.spaceKeyDown = (e) => {
      const activeEl = document.activeElement;
      const isInput = activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable;
      if (isInput) return;

      if (e.key === ' ' && this.activeAction !== 'pan') {
        this.activeAction = 'pan';
        this.overlay.style.cursor = 'grab';
        this.startX = this.lastMouseX || 0;
        this.startY = this.lastMouseY || 0;
        this.startPanX = this.editor.panX;
        this.startPanY = this.editor.panY;
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', this.boundHandlers.spaceKeyDown);

    this.boundHandlers.keyUp = (e) => {
      if (e.key === ' ' && this.activeAction === 'pan') {
        this.activeAction = null;
        this.overlay.style.cursor = 'default';
      }
    };
    window.addEventListener('keyup', this.boundHandlers.keyUp);

    this.boundHandlers.trackMouse = (e) => {
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    };
    window.addEventListener('mousemove', this.boundHandlers.trackMouse);
  }

  destroy() {
    this.overlay.removeEventListener('mousedown', this.boundHandlers.mouseDown);
    window.removeEventListener('mousemove', this.boundHandlers.mouseMove);
    window.removeEventListener('mouseup', this.boundHandlers.mouseUp);

    // Check if selectionBox elements exist before removing
    if (this.selectionBox) {
      this.selectionBox.removeEventListener('dblclick', this.boundHandlers.doubleClick);
    }

    this.inPlaceEditor.removeEventListener('blur', this.boundHandlers.editorBlur);
    this.inPlaceEditor.removeEventListener('keydown', this.boundHandlers.editorKeyDown);
    this.inPlaceEditor.removeEventListener('input', this.boundHandlers.editorInput);

    window.removeEventListener('keydown', this.boundHandlers.keyDown);
    window.removeEventListener('keydown', this.boundHandlers.spaceKeyDown);
    window.removeEventListener('keyup', this.boundHandlers.keyUp);
    window.removeEventListener('mousemove', this.boundHandlers.trackMouse);
    clearTimeout(this.nudgeHistoryTimeout);
  }
}

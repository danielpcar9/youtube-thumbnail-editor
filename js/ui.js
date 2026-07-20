import { GOOGLE_FONTS, SYSTEM_FONTS, preloadCommonFonts } from './fonts.js?v=2';
import { ThumbnailEditor } from './editor.js?v=2';
import { InteractionController } from './interaction.js?v=2';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // DOM Elements
  const canvasEl = document.getElementById('canvas');
  const canvasContainer = document.getElementById('canvas-container');
  const workspaceViewport = document.getElementById('workspace-viewport');
  const interactionOverlay = document.getElementById('interaction-overlay');
  const inPlaceEditor = document.getElementById('in-place-editor');
  
  // Toolbar Buttons
  const btnLoadBg = document.getElementById('btn-load-bg');
  const bgFileInput = document.getElementById('bg-file-input');
  const btnAddText = document.getElementById('btn-add-text');
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnZoomIn = document.getElementById('btn-zoom-in');
  const btnZoomOut = document.getElementById('btn-zoom-out');
  const zoomSelect = document.getElementById('zoom-select');
  const btnExportPng = document.getElementById('btn-export-png');
  const btnExportJpg = document.getElementById('btn-export-jpg');
  const btnDeleteLayer = document.getElementById('btn-delete-layer');
  
  // Left Sidebar
  const layersListContainer = document.getElementById('layers-list');
  
  // Right Properties Panel
  const propertiesControls = document.getElementById('properties-controls');
  const propertiesEmptyState = document.getElementById('properties-empty-state');
  const coordDisplay = document.getElementById('coord-display');
  
  // 1. Transform Controls
  const propX = document.getElementById('prop-x');
  const propY = document.getElementById('prop-y');
  const propRotation = document.getElementById('prop-rotation');
  const propFontSizeNum = document.getElementById('prop-font-size-num');
  
  // 2. Typography Controls
  const propFontFamily = document.getElementById('prop-font-family');
  const propFontWeight = document.getElementById('prop-font-weight');
  const alignBtns = document.querySelectorAll('.align-btn');
  const btnItalic = document.getElementById('prop-italic');
  const propLetterSpacing = document.getElementById('prop-letter-spacing');
  const valLetterSpacing = document.getElementById('val-letter-spacing');
  const propLineHeight = document.getElementById('prop-line-height');
  const valLineHeight = document.getElementById('val-line-height');
  
  // 3. Color Controls
  const propFillColor = document.getElementById('prop-fill-color');
  const propFillColorHex = document.getElementById('prop-fill-color-hex');
  const fillPreviewBtn = document.getElementById('fill-color-preview');
  
  // 4. Stroke Controls
  const propStrokeEnable = document.getElementById('prop-stroke-enable');
  const strokeSettingsBlock = document.getElementById('stroke-settings-block');
  const propStrokeWidth = document.getElementById('prop-stroke-width');
  const valStrokeWidth = document.getElementById('val-stroke-width');
  const propStrokeColor = document.getElementById('prop-stroke-color');
  const propStrokeColorHex = document.getElementById('prop-stroke-color-hex');
  const strokePreviewBtn = document.getElementById('stroke-color-preview');

  // 5. Shadow Controls
  const propShadowEnable = document.getElementById('prop-shadow-enable');
  const shadowSettingsBlock = document.getElementById('shadow-settings-block');
  const propShadowColor = document.getElementById('prop-shadow-color');
  const propShadowColorHex = document.getElementById('prop-shadow-color-hex');
  const shadowPreviewBtn = document.getElementById('shadow-color-preview');
  const propShadowBlur = document.getElementById('prop-shadow-blur');
  const valShadowBlur = document.getElementById('val-shadow-blur');
  const propShadowOffsetX = document.getElementById('prop-shadow-offset-x');
  const propShadowOffsetY = document.getElementById('prop-shadow-offset-y');

  // 6. Glow Controls
  const propGlowEnable = document.getElementById('prop-glow-enable');
  const glowSettingsBlock = document.getElementById('glow-settings-block');
  const propGlowColor = document.getElementById('prop-glow-color');
  const propGlowColorHex = document.getElementById('prop-glow-color-hex');
  const glowPreviewBtn = document.getElementById('glow-color-preview');
  const propGlowBlur = document.getElementById('prop-glow-blur');
  const valGlowBlur = document.getElementById('val-glow-blur');

  // 7. Background Panel Controls
  const propBgEnable = document.getElementById('prop-bg-enable');
  const bgSettingsBlock = document.getElementById('bg-settings-block');
  const propBgColor = document.getElementById('prop-bg-color');
  const propBgColorHex = document.getElementById('prop-bg-color-hex');
  const bgPreviewBtn = document.getElementById('bg-color-preview');
  const propBgOpacity = document.getElementById('prop-bg-opacity');
  const valBgOpacity = document.getElementById('val-bg-opacity');
  const propBgPadding = document.getElementById('prop-bg-padding');
  const valBgPadding = document.getElementById('val-bg-padding');

  // 8. General Settings (Background Image filters & align snapping)
  const propSnapGuides = document.getElementById('prop-snap-guides');
  const propSnapGrid = document.getElementById('prop-snap-grid');
  const propGridSize = document.getElementById('prop-grid-size');
  const valGridSize = document.getElementById('val-grid-size');
  const gridSizeBlock = document.getElementById('grid-size-block');
  
  const bgFiltersBlock = document.getElementById('bg-image-filters-block');
  const bgEmptyFilters = document.getElementById('bg-image-empty-filters');
  const btnRemoveBg = document.getElementById('btn-remove-bg');
  
  const propBgImgOpacity = document.getElementById('prop-bg-image-opacity');
  const valBgImgOpacity = document.getElementById('val-bg-image-opacity');
  const propBgImgBlur = document.getElementById('prop-bg-image-blur');
  const valBgImgBlur = document.getElementById('val-bg-image-blur');
  const propBgImgBrightness = document.getElementById('prop-bg-image-brightness');
  const valBgImgBrightness = document.getElementById('val-bg-image-brightness');
  const propBgImgContrast = document.getElementById('prop-bg-image-contrast');
  const valBgImgContrast = document.getElementById('val-bg-image-contrast');
  const propBgImgSaturate = document.getElementById('prop-bg-image-saturate');
  const valBgImgSaturate = document.getElementById('val-bg-image-saturate');
  const propBgImgScale = document.getElementById('prop-bg-image-scale');

  // Initialize Editor & Interaction controller
  const editor = new ThumbnailEditor(canvasEl);
  const interaction = new InteractionController(editor, interactionOverlay, inPlaceEditor);

  // Setup fonts inside UI selectors
  populateFontSelector();

  // State Change Listener
  editor.onStateChange = () => {
    syncUI();
  };

  // Preload common fonts, then load demo background and initial professional text layer
  preloadCommonFonts().then(() => {
    // Load demo background image
    editor.setBackgroundImage('demo_background.png');
    
    // Set a small delay for image loading, then add a styled default text layer
    setTimeout(() => {
      editor.addTextLayer('DISEÑO PRO');
      
      setTimeout(() => {
        const activeLayer = editor.getSelectedLayer();
        if (activeLayer) {
          editor.updateLayerProperty(activeLayer.id, 'fontFamily', 'Anton');
          editor.updateLayerProperty(activeLayer.id, 'fontSize', 130);
          editor.updateLayerProperty(activeLayer.id, 'fillColor', '#ffde00'); // bright thumbnail yellow
          editor.updateLayerProperty(activeLayer.id, 'strokeColor', '#000000');
          editor.updateLayerProperty(activeLayer.id, 'strokeWidth', 15);
          editor.updateLayerProperty(activeLayer.id, 'rotation', -6); // classic YouTube tilt
          
          // Position vertically in lower middle
          editor.updateLayerProperty(activeLayer.id, 'y', 380);
          
          // Enhanced Shadow
          editor.updateLayerProperty(activeLayer.id, 'shadowColor', 'rgba(0,0,0,0.9)');
          editor.updateLayerProperty(activeLayer.id, 'shadowBlur', 20);
          editor.updateLayerProperty(activeLayer.id, 'shadowOffsetX', 8);
          editor.updateLayerProperty(activeLayer.id, 'shadowOffsetY', 8);
          
          editor.saveHistory();
        }
      }, 300);
    }, 200);

    editor.saveHistory(); // Save initial empty state
    zoomToFit();
  });

  // Populate families in dropdown
  function populateFontSelector() {
    const googleGroup = propFontFamily.querySelector('optgroup[label="Fuentes Google (Thumbnails)"]');
    const systemGroup = propFontFamily.querySelector('optgroup[label="Fuentes del Sistema"]');

    GOOGLE_FONTS.forEach(font => {
      const opt = document.createElement('option');
      opt.value = font;
      opt.textContent = font;
      googleGroup.appendChild(opt);
    });

    SYSTEM_FONTS.forEach(font => {
      const opt = document.createElement('option');
      opt.value = font;
      opt.textContent = font;
      systemGroup.appendChild(opt);
    });
  }

  // Load BG Image File
  btnLoadBg.addEventListener('click', () => {
    bgFileInput.click();
  });

  bgFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      editor.setBackgroundImage(event.target.result);
      bgFileInput.value = ''; // Reset file input
    };
    reader.readAsDataURL(file);
  });

  btnRemoveBg.addEventListener('click', () => {
    editor.removeBackgroundImage();
  });

  // Add text layer
  btnAddText.addEventListener('click', () => {
    editor.addTextLayer();
  });

  // Delete selected layer
  btnDeleteLayer.addEventListener('click', () => {
    if (editor.selectedLayerId) {
      editor.deleteLayer(editor.selectedLayerId);
    }
  });

  // Undo / Redo
  btnUndo.addEventListener('click', () => {
    editor.undo();
    interaction.updateSelectionBoxPosition();
  });

  btnRedo.addEventListener('click', () => {
    editor.redo();
    interaction.updateSelectionBoxPosition();
  });

  // Zoom controls
  btnZoomIn.addEventListener('click', () => {
    adjustZoom(0.25);
  });

  btnZoomOut.addEventListener('click', () => {
    adjustZoom(-0.25);
  });

  zoomSelect.addEventListener('change', () => {
    const val = zoomSelect.value;
    if (val === 'fit') {
      zoomToFit();
    } else {
      setZoom(parseFloat(val));
    }
  });

  function setZoom(newZoom) {
    // Bound zoom between 10% and 800%
    editor.zoom = Math.max(0.1, Math.min(8.0, newZoom));
    
    // Reset panning on direct zoom choices to keep centered
    editor.panX = 0;
    editor.panY = 0;
    
    updateViewportTransform();
    syncZoomUI();
  }

  function adjustZoom(delta) {
    const current = editor.zoom;
    let nextZoom = current;

    if (delta > 0) {
      if (current < 1) nextZoom += 0.1;
      else if (current < 2) nextZoom += 0.25;
      else nextZoom += 0.5;
    } else {
      if (current <= 1) nextZoom -= 0.1;
      else if (current <= 2) nextZoom -= 0.25;
      else nextZoom -= 0.5;
    }

    editor.zoom = Math.max(0.1, Math.min(8.0, nextZoom));
    updateViewportTransform();
    syncZoomUI();
  }

  function zoomToFit() {
    const vW = workspaceViewport.clientWidth - 40;
    const vH = workspaceViewport.clientHeight - 40;
    const scale = Math.min(vW / editor.logicalWidth, vH / editor.logicalHeight);
    
    editor.zoom = Math.max(0.1, Math.min(1.5, scale)); // Fit max zoom 150%
    editor.panX = 0;
    editor.panY = 0;
    
    updateViewportTransform();
    syncZoomUI();
  }

  function updateViewportTransform() {
    // Apply zoom & pan translation to canvas container CSS transform
    canvasContainer.style.transform = `translate(${editor.panX}px, ${editor.panY}px) scale(${editor.zoom})`;
    
    // Pixelated rendering look at zoom levels larger than 150% (Photoshop style)
    if (editor.zoom > 1.5) {
      canvasEl.style.imageRendering = 'pixelated';
    } else {
      canvasEl.style.imageRendering = 'auto';
    }
  }

  function syncZoomUI() {
    const pct = Math.round(editor.zoom * 100);
    // Find closest match in dropdown or create/update a temporary text representation
    zoomSelect.value = zoomSelect.querySelector(`option[value="${editor.zoom}"]`) ? editor.zoom : 'fit';
    
    // Update select label visually
    const selectedOpt = zoomSelect.options[zoomSelect.selectedIndex];
    if (selectedOpt && selectedOpt.value === 'fit') {
      selectedOpt.textContent = `Ajustar (${pct}%)`;
    } else {
      // Find fit option to clean it up
      const fitOpt = zoomSelect.querySelector('option[value="fit"]');
      if (fitOpt) fitOpt.textContent = 'Ajustar';
    }
  }

  // Listening to viewport resize to dynamically readjust if "fit" active
  const resizeObserver = new ResizeObserver(() => {
    if (zoomSelect.value === 'fit') {
      zoomToFit();
    }
  });
  resizeObserver.observe(workspaceViewport);

  // Synchronize entire UI controls with state
  function syncUI() {
    // 1. Undo/Redo Buttons state
    btnUndo.disabled = !editor.history.canUndo();
    btnRedo.disabled = !editor.history.canRedo();

    // 2. Active Layer selection
    const activeLayer = editor.layers.find(l => l.id === editor.selectedLayerId);
    
    if (activeLayer) {
      propertiesControls.classList.remove('hidden');
      propertiesEmptyState.classList.add('hidden');
      btnDeleteLayer.disabled = false;

      // Populate Text Properties
      propX.value = Math.round(activeLayer.x);
      propY.value = Math.round(activeLayer.y);
      propRotation.value = Math.round(activeLayer.rotation);
      propFontSizeNum.value = activeLayer.fontSize;
      propFontFamily.value = activeLayer.fontFamily;
      propFontWeight.value = activeLayer.fontWeight;
      propLetterSpacing.value = activeLayer.letterSpacing;
      valLetterSpacing.textContent = activeLayer.letterSpacing;
      propLineHeight.value = activeLayer.lineHeight;
      valLineHeight.textContent = activeLayer.lineHeight;
      
      btnItalic.classList.toggle('active', activeLayer.fontStyle === 'italic');

      // Colors
      propFillColor.value = activeLayer.fillColor;
      propFillColorHex.value = activeLayer.fillColor.toUpperCase();
      fillPreviewBtn.style.backgroundColor = activeLayer.fillColor;

      // Text Align indicators
      alignBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.align === activeLayer.alignment);
      });

      // Stroke Options
      propStrokeEnable.checked = activeLayer.strokeEnabled;
      if (activeLayer.strokeEnabled) {
        strokeSettingsBlock.classList.remove('hidden');
        propStrokeWidth.value = activeLayer.strokeWidth;
        valStrokeWidth.textContent = activeLayer.strokeWidth;
        propStrokeColor.value = activeLayer.strokeColor;
        propStrokeColorHex.value = activeLayer.strokeColor.toUpperCase();
        strokePreviewBtn.style.backgroundColor = activeLayer.strokeColor;
      } else {
        strokeSettingsBlock.classList.add('hidden');
      }

      // Shadow Options
      propShadowEnable.checked = activeLayer.shadowEnabled;
      if (activeLayer.shadowEnabled) {
        shadowSettingsBlock.classList.remove('hidden');
        propShadowColor.value = activeLayer.shadowColor.startsWith('#') ? activeLayer.shadowColor : '#000000'; // fallback
        propShadowColorHex.value = activeLayer.shadowColor;
        shadowPreviewBtn.style.backgroundColor = activeLayer.shadowColor;
        propShadowBlur.value = activeLayer.shadowBlur;
        valShadowBlur.textContent = activeLayer.shadowBlur;
        propShadowOffsetX.value = activeLayer.shadowOffsetX;
        propShadowOffsetY.value = activeLayer.shadowOffsetY;
      } else {
        shadowSettingsBlock.classList.add('hidden');
      }

      // Glow Options
      propGlowEnable.checked = activeLayer.glowEnabled;
      if (activeLayer.glowEnabled) {
        glowSettingsBlock.classList.remove('hidden');
        propGlowColor.value = activeLayer.glowColor;
        propGlowColorHex.value = activeLayer.glowColor.toUpperCase();
        glowPreviewBtn.style.backgroundColor = activeLayer.glowColor;
        propGlowBlur.value = activeLayer.glowBlur;
        valGlowBlur.textContent = activeLayer.glowBlur;
      } else {
        glowSettingsBlock.classList.add('hidden');
      }

      // Background Panel
      propBgEnable.checked = activeLayer.backgroundEnabled;
      if (activeLayer.backgroundEnabled) {
        bgSettingsBlock.classList.remove('hidden');
        propBgColor.value = activeLayer.backgroundColor;
        propBgColorHex.value = activeLayer.backgroundColor.toUpperCase();
        bgPreviewBtn.style.backgroundColor = activeLayer.backgroundColor;
        propBgOpacity.value = activeLayer.backgroundOpacity;
        valBgOpacity.textContent = activeLayer.backgroundOpacity;
        propBgPadding.value = activeLayer.backgroundPadding;
        valBgPadding.textContent = activeLayer.backgroundPadding;
      } else {
        bgSettingsBlock.classList.add('hidden');
      }

    } else {
      // No active text layer
      propertiesControls.classList.add('hidden');
      propertiesEmptyState.classList.remove('hidden');
      btnDeleteLayer.disabled = true;
    }

    // 3. Background filters sync
    if (editor.backgroundImage) {
      bgFiltersBlock.classList.remove('hidden');
      bgEmptyFilters.classList.add('hidden');

      const s = editor.backgroundImageSettings;
      propBgImgOpacity.value = s.opacity;
      valBgImgOpacity.textContent = s.opacity + '%';
      propBgImgBlur.value = s.blur;
      valBgImgBlur.textContent = s.blur + 'px';
      propBgImgBrightness.value = s.brightness;
      valBgImgBrightness.textContent = s.brightness + '%';
      propBgImgContrast.value = s.contrast;
      valBgImgContrast.textContent = s.contrast + '%';
      propBgImgSaturate.value = s.saturate;
      valBgImgSaturate.textContent = s.saturate + '%';
      propBgImgScale.value = s.scaleMode;
    } else {
      bgFiltersBlock.classList.add('hidden');
      bgEmptyFilters.classList.remove('hidden');
    }

    // 4. Update coordinates display
    if (activeLayer) {
      coordDisplay.textContent = `X: ${Math.round(activeLayer.x)}, Y: ${Math.round(activeLayer.y)}`;
    } else {
      coordDisplay.textContent = 'X: 0, Y: 0';
    }

    // 5. Update Layers Sidebar List
    renderLayersList();

    // 6. Update dragging overlay bounding boxes
    interaction.updateSelectionBoxPosition();

    // Recreate Lucide Icons on re-renders
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function renderLayersList() {
    layersListContainer.innerHTML = '';

    if (editor.layers.length === 0) {
      layersListContainer.innerHTML = `
        <div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; margin-top: 20px;">
          No hay capas de texto. Haz clic en "Añadir Texto"
        </div>
      `;
      return;
    }

    // Render backwards: top layer on canvas shows at top of sidebar layers list
    for (let i = editor.layers.length - 1; i >= 0; i--) {
      const layer = editor.layers[i];
      const activeClass = layer.id === editor.selectedLayerId ? 'active' : '';

      const item = document.createElement('div');
      item.className = `layer-item ${activeClass}`;
      item.innerHTML = `
        <div class="layer-info">
          <i data-lucide="type" class="layer-type-icon"></i>
          <span class="layer-name"></span>
        </div>
        <div class="layer-controls">
          <button class="layer-action-btn btn-up" title="Subir Capa">
            <i data-lucide="chevron-up"></i>
          </button>
          <button class="layer-action-btn btn-down" title="Bajar Capa">
            <i data-lucide="chevron-down"></i>
          </button>
          <button class="layer-action-btn btn-lock ${layer.isLocked ? 'active' : ''}" title="${layer.isLocked ? 'Desbloquear' : 'Bloquear'}">
            <i data-lucide="${layer.isLocked ? 'lock' : 'unlock'}"></i>
          </button>
          <button class="layer-action-btn btn-visible" title="${layer.isVisible ? 'Ocultar' : 'Mostrar'}">
            <i data-lucide="${layer.isVisible ? 'eye' : 'eye-off'}"></i>
          </button>
        </div>
      `;
      const layerName = item.querySelector('.layer-name');
      const layerText = String(layer.text ?? '');
      layerName.textContent = layerText.substring(0, 18) || '(Vacío)';
      layerName.title = layerText;
      item.querySelector('.layer-controls').addEventListener('click', event => {
        event.stopPropagation();
      });

      // Select Layer
      item.addEventListener('click', () => {
        editor.selectLayer(layer.id);
      });

      // Actions inside item row
      const btnUp = item.querySelector('.btn-up');
      const btnDown = item.querySelector('.btn-down');
      const btnLock = item.querySelector('.btn-lock');
      const btnVisible = item.querySelector('.btn-visible');

      btnUp.addEventListener('click', () => {
        editor.moveLayerUp(layer.id);
      });

      btnDown.addEventListener('click', () => {
        editor.moveLayerDown(layer.id);
      });

      btnLock.addEventListener('click', () => {
        editor.updateLayerProperty(layer.id, 'isLocked', !layer.isLocked);
        editor.saveHistory();
        syncUI();
      });

      btnVisible.addEventListener('click', () => {
        editor.updateLayerProperty(layer.id, 'isVisible', !layer.isVisible);
        editor.saveHistory();
        syncUI();
      });

      layersListContainer.appendChild(item);
    }
  }

  // -------------------------------------------------------------
  // EVENT LISTENERS FOR LAYER PROPERTIES UPDATES (DEBOUNCED/DIRECT)
  // -------------------------------------------------------------
  
  function updateActiveProperty(prop, val, saveHist = true) {
    if (editor.selectedLayerId) {
      editor.updateLayerProperty(editor.selectedLayerId, prop, val);
      if (saveHist) {
        editor.saveHistory();
      }
    }
  }

  // Positional numeric updates
  propX.addEventListener('input', () => updateActiveProperty('x', parseFloat(propX.value) || 0, false));
  propX.addEventListener('change', () => editor.saveHistory());
  
  propY.addEventListener('input', () => updateActiveProperty('y', parseFloat(propY.value) || 0, false));
  propY.addEventListener('change', () => editor.saveHistory());

  propRotation.addEventListener('input', () => {
    let val = parseFloat(propRotation.value) || 0;
    val = (val + 360) % 360;
    updateActiveProperty('rotation', val, false);
  });
  propRotation.addEventListener('change', () => editor.saveHistory());

  propFontSizeNum.addEventListener('input', () => {
    const val = Math.max(6, parseInt(propFontSizeNum.value) || 20);
    updateActiveProperty('fontSize', val, false);
  });
  propFontSizeNum.addEventListener('change', () => editor.saveHistory());

  // Text inputs & font adjustments
  propFontFamily.addEventListener('change', () => {
    updateActiveProperty('fontFamily', propFontFamily.value);
  });

  propFontWeight.addEventListener('change', () => {
    updateActiveProperty('fontWeight', propFontWeight.value);
  });

  alignBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      updateActiveProperty('alignment', btn.dataset.align);
      alignBtns.forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  btnItalic.addEventListener('click', () => {
    const activeLayer = editor.layers.find(l => l.id === editor.selectedLayerId);
    if (activeLayer) {
      const nextStyle = activeLayer.fontStyle === 'italic' ? 'normal' : 'italic';
      updateActiveProperty('fontStyle', nextStyle);
      btnItalic.classList.toggle('active', nextStyle === 'italic');
    }
  });

  propLetterSpacing.addEventListener('input', () => {
    const val = parseInt(propLetterSpacing.value);
    valLetterSpacing.textContent = val;
    updateActiveProperty('letterSpacing', val, false);
  });
  propLetterSpacing.addEventListener('change', () => editor.saveHistory());

  propLineHeight.addEventListener('input', () => {
    const val = parseFloat(propLineHeight.value);
    valLineHeight.textContent = val.toFixed(1);
    updateActiveProperty('lineHeight', val, false);
  });
  propLineHeight.addEventListener('change', () => editor.saveHistory());

  // Color selection syncing (fill color)
  propFillColor.addEventListener('input', () => {
    const hex = propFillColor.value;
    propFillColorHex.value = hex.toUpperCase();
    fillPreviewBtn.style.backgroundColor = hex;
    updateActiveProperty('fillColor', hex, false);
  });
  propFillColor.addEventListener('change', () => editor.saveHistory());

  propFillColorHex.addEventListener('change', () => {
    let hex = propFillColorHex.value.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      propFillColor.value = hex;
      fillPreviewBtn.style.backgroundColor = hex;
      updateActiveProperty('fillColor', hex);
    }
  });

  // Stroke controls
  propStrokeEnable.addEventListener('change', () => {
    updateActiveProperty('strokeEnabled', propStrokeEnable.checked);
  });

  propStrokeWidth.addEventListener('input', () => {
    const val = parseInt(propStrokeWidth.value);
    valStrokeWidth.textContent = val;
    updateActiveProperty('strokeWidth', val, false);
  });
  propStrokeWidth.addEventListener('change', () => editor.saveHistory());

  propStrokeColor.addEventListener('input', () => {
    const hex = propStrokeColor.value;
    propStrokeColorHex.value = hex.toUpperCase();
    strokePreviewBtn.style.backgroundColor = hex;
    updateActiveProperty('strokeColor', hex, false);
  });
  propStrokeColor.addEventListener('change', () => editor.saveHistory());

  propStrokeColorHex.addEventListener('change', () => {
    let hex = propStrokeColorHex.value.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      propStrokeColor.value = hex;
      strokePreviewBtn.style.backgroundColor = hex;
      updateActiveProperty('strokeColor', hex);
    }
  });

  // Shadow controls
  propShadowEnable.addEventListener('change', () => {
    updateActiveProperty('shadowEnabled', propShadowEnable.checked);
  });

  propShadowColor.addEventListener('input', () => {
    const hex = propShadowColor.value;
    propShadowColorHex.value = hex.toUpperCase();
    shadowPreviewBtn.style.backgroundColor = hex;
    updateActiveProperty('shadowColor', hex, false);
  });
  propShadowColor.addEventListener('change', () => editor.saveHistory());

  propShadowColorHex.addEventListener('change', () => {
    const colorStr = propShadowColorHex.value.trim();
    // Allow hex and rgba
    if (colorStr.startsWith('#') || colorStr.startsWith('rgb') || colorStr.startsWith('rgba')) {
      updateActiveProperty('shadowColor', colorStr);
      if (colorStr.startsWith('#')) {
        propShadowColor.value = colorStr;
        shadowPreviewBtn.style.backgroundColor = colorStr;
      }
    }
  });

  propShadowBlur.addEventListener('input', () => {
    const val = parseInt(propShadowBlur.value);
    valShadowBlur.textContent = val;
    updateActiveProperty('shadowBlur', val, false);
  });
  propShadowBlur.addEventListener('change', () => editor.saveHistory());

  propShadowOffsetX.addEventListener('input', () => {
    const val = parseInt(propShadowOffsetX.value) || 0;
    updateActiveProperty('shadowOffsetX', val, false);
  });
  propShadowOffsetX.addEventListener('change', () => editor.saveHistory());

  propShadowOffsetY.addEventListener('input', () => {
    const val = parseInt(propShadowOffsetY.value) || 0;
    updateActiveProperty('shadowOffsetY', val, false);
  });
  propShadowOffsetY.addEventListener('change', () => editor.saveHistory());

  // Glow controls
  propGlowEnable.addEventListener('change', () => {
    updateActiveProperty('glowEnabled', propGlowEnable.checked);
  });

  propGlowColor.addEventListener('input', () => {
    const hex = propGlowColor.value;
    propGlowColorHex.value = hex.toUpperCase();
    glowPreviewBtn.style.backgroundColor = hex;
    updateActiveProperty('glowColor', hex, false);
  });
  propGlowColor.addEventListener('change', () => editor.saveHistory());

  propGlowColorHex.addEventListener('change', () => {
    let hex = propGlowColorHex.value.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      propGlowColor.value = hex;
      glowPreviewBtn.style.backgroundColor = hex;
      updateActiveProperty('glowColor', hex);
    }
  });

  propGlowBlur.addEventListener('input', () => {
    const val = parseInt(propGlowBlur.value);
    valGlowBlur.textContent = val;
    updateActiveProperty('glowBlur', val, false);
  });
  propGlowBlur.addEventListener('change', () => editor.saveHistory());

  // Background box panel controls
  propBgEnable.addEventListener('change', () => {
    updateActiveProperty('backgroundEnabled', propBgEnable.checked);
  });

  propBgColor.addEventListener('input', () => {
    const hex = propBgColor.value;
    propBgColorHex.value = hex.toUpperCase();
    bgPreviewBtn.style.backgroundColor = hex;
    updateActiveProperty('backgroundColor', hex, false);
  });
  propBgColor.addEventListener('change', () => editor.saveHistory());

  propBgColorHex.addEventListener('change', () => {
    let hex = propBgColorHex.value.trim();
    if (!hex.startsWith('#')) hex = '#' + hex;
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      propBgColor.value = hex;
      bgPreviewBtn.style.backgroundColor = hex;
      updateActiveProperty('backgroundColor', hex);
    }
  });

  propBgOpacity.addEventListener('input', () => {
    const val = parseFloat(propBgOpacity.value);
    valBgOpacity.textContent = val;
    updateActiveProperty('backgroundOpacity', val, false);
  });
  propBgOpacity.addEventListener('change', () => editor.saveHistory());

  propBgPadding.addEventListener('input', () => {
    const val = parseInt(propBgPadding.value);
    valBgPadding.textContent = val;
    updateActiveProperty('backgroundPadding', val, false);
  });
  propBgPadding.addEventListener('change', () => editor.saveHistory());

  // Background Image filters event listeners
  function updateBgSetting(key, val, saveHist = false) {
    editor.backgroundImageSettings[key] = val;
    editor.render();
    if (saveHist) {
      editor.saveHistory();
    }
  }

  propBgImgOpacity.addEventListener('input', () => {
    const val = parseInt(propBgImgOpacity.value);
    valBgImgOpacity.textContent = val + '%';
    updateBgSetting('opacity', val);
  });
  propBgImgOpacity.addEventListener('change', () => editor.saveHistory());

  propBgImgBlur.addEventListener('input', () => {
    const val = parseInt(propBgImgBlur.value);
    valBgImgBlur.textContent = val + 'px';
    updateBgSetting('blur', val);
  });
  propBgImgBlur.addEventListener('change', () => editor.saveHistory());

  propBgImgBrightness.addEventListener('input', () => {
    const val = parseInt(propBgImgBrightness.value);
    valBgImgBrightness.textContent = val + '%';
    updateBgSetting('brightness', val);
  });
  propBgImgBrightness.addEventListener('change', () => editor.saveHistory());

  propBgImgContrast.addEventListener('input', () => {
    const val = parseInt(propBgImgContrast.value);
    valBgImgContrast.textContent = val + '%';
    updateBgSetting('contrast', val);
  });
  propBgImgContrast.addEventListener('change', () => editor.saveHistory());

  propBgImgSaturate.addEventListener('input', () => {
    const val = parseInt(propBgImgSaturate.value);
    valBgImgSaturate.textContent = val + '%';
    updateBgSetting('saturate', val);
  });
  propBgImgSaturate.addEventListener('change', () => editor.saveHistory());

  propBgImgScale.addEventListener('change', () => {
    updateBgSetting('scaleMode', propBgImgScale.value, true);
  });

  // Color preset swatches setup
  document.querySelectorAll('.preset-colors').forEach(container => {
    const type = container.dataset.picker; // 'fill' or other

    container.addEventListener('click', (e) => {
      const swatch = e.target.closest('.preset-color');
      if (!swatch) return;

      const color = swatch.dataset.color;
      if (type === 'fill') {
        propFillColor.value = color;
        propFillColorHex.value = color.toUpperCase();
        fillPreviewBtn.style.backgroundColor = color;
        updateActiveProperty('fillColor', color);
      }
    });
  });

  // Snapping UI controls sync
  propSnapGuides.addEventListener('change', () => {
    editor.snapSettings.snapToGuides = propSnapGuides.checked;
  });

  propSnapGrid.addEventListener('change', () => {
    editor.snapSettings.snapToGrid = propSnapGrid.checked;
    gridSizeBlock.classList.toggle('hidden', !propSnapGrid.checked);
  });

  propGridSize.addEventListener('input', () => {
    const val = parseInt(propGridSize.value);
    valGridSize.textContent = val;
    editor.snapSettings.gridSize = val;
  });

  // Mouse move status bar coordinates display
  interactionOverlay.addEventListener('mousemove', (e) => {
    const mouse = interaction.getLogicalMouseCoords(e);
    coordDisplay.textContent = `X: ${Math.round(mouse.x)}, Y: ${Math.round(mouse.y)}`;
  });

  // Panning listener update
  // Drag panning workspace using mouse click-wheel or spacebar drag
  workspaceViewport.addEventListener('mousemove', (e) => {
    if (interaction.activeAction === 'pan') {
      const dx = e.clientX - interaction.startX;
      const dy = e.clientY - interaction.startY;
      editor.panX = interaction.startPanX + dx;
      editor.panY = interaction.startPanY + dy;
      updateViewportTransform();
    }
  });

  // Export buttons
  btnExportPng.addEventListener('click', () => {
    const dataUrl = editor.exportImage('png');
    downloadURL(dataUrl, 'youtube-thumbnail.png');
  });

  btnExportJpg.addEventListener('click', () => {
    const dataUrl = editor.exportImage('jpeg', 0.95);
    downloadURL(dataUrl, 'youtube-thumbnail.jpg');
  });

  function downloadURL(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
});

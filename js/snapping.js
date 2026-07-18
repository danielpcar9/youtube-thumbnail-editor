/**
 * Calculates snapping alignment for a layer being moved.
 *
 * @param {Object} activeLayer - The layer being moved (contains x, y, width, height, id)
 * @param {Array} allLayers - All layers in the editor
 * @param {number} canvasWidth - Target canvas width (1280)
 * @param {number} canvasHeight - Target canvas height (720)
 * @param {Object} options - Snapping configuration options
 * @param {boolean} options.snapToGrid - Enable grid snap
 * @param {boolean} options.snapToGuides - Enable smart guides (canvas edges/centers, other layers)
 * @param {number} options.gridSize - Grid step in pixels (e.g. 20)
 * @param {number} options.threshold - Snap distance in pixels (e.g. 8)
 * @returns {Object} { x, y, guides } where x/y are snapped coords, guides is array of line indicators
 */
export function snapLayer(activeLayer, allLayers, canvasWidth, canvasHeight, options = {}) {
  const {
    snapToGrid = false,
    snapToGuides = true,
    gridSize = 20,
    threshold = 8
  } = options;

  let snapX = activeLayer.x;
  let snapY = activeLayer.y;

  const w = activeLayer.width;
  const h = activeLayer.height;

  // Active layer bounds
  const l = snapX;
  const r = snapX + w;
  const cx = snapX + w / 2;
  const t = snapY;
  const b = snapY + h;
  const cy = snapY + h / 2;

  const guides = [];

  let minDeltaX = threshold;
  let minDeltaY = threshold;

  // 1. GRID SNAPPING (if enabled, run first, then let smart guides override/refine if close to elements)
  if (snapToGrid) {
    const gridX = Math.round(l / gridSize) * gridSize;
    const deltaGridX = Math.abs(gridX - l);
    if (deltaGridX < minDeltaX) {
      snapX = gridX;
      minDeltaX = deltaGridX;
    }

    const gridY = Math.round(t / gridSize) * gridSize;
    const deltaGridY = Math.abs(gridY - t);
    if (deltaGridY < minDeltaY) {
      snapY = gridY;
      minDeltaY = deltaGridY;
    }
  }

  // If snapToGuides is disabled, return immediately
  if (!snapToGuides) {
    return { x: snapX, y: snapY, guides };
  }

  // Collect target guides for X-axis (vertical lines at specific X positions)
  // Each entry: { value: x-coordinate, label: description, type: 'border'|'center' }
  const xTargets = [
    { value: 0, label: 'Canvas Left' },
    { value: canvasWidth, label: 'Canvas Right' },
    { value: canvasWidth / 2, label: 'Canvas Horizontal Center' }
  ];

  // Collect target guides for Y-axis (horizontal lines at specific Y positions)
  const yTargets = [
    { value: 0, label: 'Canvas Top' },
    { value: canvasHeight, label: 'Canvas Bottom' },
    { value: canvasHeight / 2, label: 'Canvas Vertical Center' }
  ];

  // Add other layers' bounds to targets
  allLayers.forEach(layer => {
    if (layer.id === activeLayer.id || !layer.isVisible) return;

    const lw = layer.width;
    const lh = layer.height;
    const lx = layer.x;
    const ly = layer.y;

    xTargets.push(
      { value: lx, label: 'Layer Left' },
      { value: lx + lw, label: 'Layer Right' },
      { value: lx + lw / 2, label: 'Layer Center X' }
    );

    yTargets.push(
      { value: ly, label: 'Layer Top' },
      { value: ly + lh, label: 'Layer Bottom' },
      { value: ly + lh / 2, label: 'Layer Center Y' }
    );
  });

  // Calculate snap for X coordinates (moving active layer horizontally)
  // We compare the active layer's Left, Center, and Right against target X positions
  xTargets.forEach(target => {
    // Snap Left edge of active layer to target
    const diffLeft = Math.abs(l - target.value);
    if (diffLeft < minDeltaX) {
      minDeltaX = diffLeft;
      snapX = target.value;
      guides.push({ type: 'vertical', x: target.value, matchType: 'left' });
    }

    // Snap Center of active layer to target
    const diffCenter = Math.abs(cx - target.value);
    if (diffCenter < minDeltaX) {
      minDeltaX = diffCenter;
      snapX = target.value - w / 2;
      guides.push({ type: 'vertical', x: target.value, matchType: 'center' });
    }

    // Snap Right edge of active layer to target
    const diffRight = Math.abs(r - target.value);
    if (diffRight < minDeltaX) {
      minDeltaX = diffRight;
      snapX = target.value - w;
      guides.push({ type: 'vertical', x: target.value, matchType: 'right' });
    }
  });

  // Calculate snap for Y coordinates (moving active layer vertically)
  // We compare the active layer's Top, Center, and Bottom against target Y positions
  yTargets.forEach(target => {
    // Snap Top edge of active layer to target
    const diffTop = Math.abs(t - target.value);
    if (diffTop < minDeltaY) {
      minDeltaY = diffTop;
      snapY = target.value;
      guides.push({ type: 'horizontal', y: target.value, matchType: 'top' });
    }

    // Snap Center of active layer to target
    const diffCenter = Math.abs(cy - target.value);
    if (diffCenter < minDeltaY) {
      minDeltaY = diffCenter;
      snapY = target.value - h / 2;
      guides.push({ type: 'horizontal', y: target.value, matchType: 'center' });
    }

    // Snap Bottom edge of active layer to target
    const diffBottom = Math.abs(b - target.value);
    if (diffBottom < minDeltaY) {
      minDeltaY = diffBottom;
      snapY = target.value - h;
      guides.push({ type: 'horizontal', y: target.value, matchType: 'bottom' });
    }
  });

  // Filter guides to only those matching our final snapped position
  const activeGuides = guides.filter(guide => {
    if (guide.type === 'vertical') {
      if (guide.matchType === 'left') return Math.abs(snapX - guide.x) < 0.01;
      if (guide.matchType === 'center') return Math.abs((snapX + w / 2) - guide.x) < 0.01;
      if (guide.matchType === 'right') return Math.abs((snapX + w) - guide.x) < 0.01;
    } else {
      if (guide.matchType === 'top') return Math.abs(snapY - guide.y) < 0.01;
      if (guide.matchType === 'center') return Math.abs((snapY + h / 2) - guide.y) < 0.01;
      if (guide.matchType === 'bottom') return Math.abs((snapY + h) - guide.y) < 0.01;
    }
    return false;
  });

  // Deduplicate guides by coordinate
  const uniqueGuides = [];
  const seenCoords = new Set();

  activeGuides.forEach(g => {
    const key = `${g.type}-${g.type === 'vertical' ? g.x : g.y}`;
    if (!seenCoords.has(key)) {
      seenCoords.add(key);
      uniqueGuides.push(g);
    }
  });

  return {
    x: snapX,
    y: snapY,
    guides: uniqueGuides
  };
}

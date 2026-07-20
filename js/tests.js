// StudioThumb Comprehensive Automated Test Suite
// To run: navigate to http://localhost:8001/?test=1

export async function runAllTests(editor, interaction, syncUI) {
  console.log("=== INICIANDO SUITE DE PRUEBAS AUTOMATIZADAS DE ESTABILIDAD ===");
  
  const results = [];
  const logTest = (name, passed, details = "") => {
    results.push({ name, passed, details });
    console.log(`${passed ? "✅ PASS" : "❌ FAIL"}: ${name} ${details ? `(${details})` : ""}`);
  };

  const assertInvariants = () => {
    try {
      editor.assertEditorInvariants();
      return true;
    } catch (e) {
      throw new Error(`Invariante fallido durante prueba: ${e.message}`);
    }
  };

  try {
    // Limpiar estado inicial
    editor.layers = [];
    editor.selectedLayerId = null;
    editor.editingState = 'idle';
    editor.editingLayerId = null;
    editor.editingOriginalText = '';
    editor.history.clear();
    editor.saveHistory();
    editor.render();
    syncUI();
    assertInvariants();

    // -------------------------------------------------------------
    // PRUEBA 1: Crear 100 capas consecutivas de forma inmediata
    // -------------------------------------------------------------
    console.log("Prueba 1: Creando 100 capas...");
    for (let i = 0; i < 100; i++) {
      editor.addTextLayer(`Capa_${i}`, false);
    }
    editor.saveHistory();
    assertInvariants();
    logTest("Crear 100 capas", editor.layers.length === 100, `Capas creadas: ${editor.layers.length}`);

    // Limpiar de nuevo para pruebas individuales
    editor.layers = [];
    editor.selectedLayerId = null;
    editor.saveHistory();

    // -------------------------------------------------------------
    // PRUEBA 2: Crear y borrar capas concurrentemente mientras cargan fuentes
    // -------------------------------------------------------------
    console.log("Prueba 2: Carga asíncrona concurrente...");
    const ids = [];
    for (let i = 0; i < 50; i++) {
      const id = editor.addTextLayer(`Async_${i}`, false);
      ids.push(id);
      // Borrar la mitad inmediatamente antes de que carguen las fuentes
      if (i % 2 === 0) {
        editor.deleteLayer(id);
      }
    }
    editor.saveHistory();
    assertInvariants();
    // Esperar un momento a que las promesas asíncronas de fuentes resuelvan
    await new Promise(r => setTimeout(r, 600));
    assertInvariants();
    logTest("Carga asíncrona y borrado concurrente", editor.layers.length === 25, `Sobrevivientes: ${editor.layers.length}`);

    // Limpiar
    editor.layers = [];
    editor.selectedLayerId = null;
    editor.saveHistory();

    // -------------------------------------------------------------
    // PRUEBA 3: Creación y edición de texto (Flujo Enter / Confirmar)
    // -------------------------------------------------------------
    console.log("Prueba 3: Edición de texto y confirmación con Enter...");
    const textId = editor.addTextLayer("Editable Inicial");
    assertInvariants();
    
    // Simular doble clic en la caja de selección para editar
    interaction.startInPlaceEdit();
    assertInvariants();
    logTest("Estado de edición activo", editor.editingState === 'editing' && editor.editingLayerId === textId);

    // Escribir texto real simulando input
    interaction.inPlaceEditor.value = "Texto Editado Pro";
    interaction.inPlaceEditor.dispatchEvent(new Event('input'));
    
    // Simular Enter para confirmar
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    interaction.inPlaceEditor.dispatchEvent(enterEvent);
    assertInvariants();

    const layerAfterEnter = editor.layers.find(l => l.id === textId);
    logTest("Confirmar texto con Enter", layerAfterEnter && layerAfterEnter.text === "Texto Editado Pro", `Texto: ${layerAfterEnter?.text}`);
    logTest("Estado retorna a idle post-Enter", editor.editingState === 'idle' && !interaction.isEditingText());

    // -------------------------------------------------------------
    // PRUEBA 4: Cancelación con Escape
    // -------------------------------------------------------------
    console.log("Prueba 4: Cancelación de edición con Escape...");
    interaction.startInPlaceEdit();
    interaction.inPlaceEditor.value = "Texto que debe ser descartado";
    interaction.inPlaceEditor.dispatchEvent(new Event('input'));
    
    // Simular Escape para cancelar
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    interaction.inPlaceEditor.dispatchEvent(escEvent);
    assertInvariants();

    const layerAfterEsc = editor.layers.find(l => l.id === textId);
    logTest("Cancelar texto con Escape", layerAfterEsc && layerAfterEsc.text === "Texto Editado Pro", `Texto recuperado: ${layerAfterEsc?.text}`);

    // -------------------------------------------------------------
    // PRUEBA 5: Confirmación por Blur
    // -------------------------------------------------------------
    console.log("Prueba 5: Confirmación por pérdida de foco (Blur)...");
    interaction.startInPlaceEdit();
    interaction.inPlaceEditor.value = "Texto Confirmado Blur";
    interaction.inPlaceEditor.dispatchEvent(new Event('input'));
    
    // Simular blur
    interaction.inPlaceEditor.dispatchEvent(new Event('blur'));
    assertInvariants();

    const layerAfterBlur = editor.layers.find(l => l.id === textId);
    logTest("Confirmar texto por Blur", layerAfterBlur && layerAfterBlur.text === "Texto Confirmado Blur", `Texto: ${layerAfterBlur?.text}`);

    // -------------------------------------------------------------
    // PRUEBA 6: Cambiar selección durante edición (Política determinista)
    // -------------------------------------------------------------
    console.log("Prueba 6: Selección de otra capa durante edición...");
    const anotherTextId = editor.addTextLayer("Capa Secundaria");
    
    // Volver a la primera capa e iniciar edición
    editor.selectLayer(textId);
    interaction.startInPlaceEdit();
    interaction.inPlaceEditor.value = "Cambio durante edición";
    interaction.inPlaceEditor.dispatchEvent(new Event('input'));

    // Cambiar la selección a la segunda capa directamente desde la API del editor
    editor.selectLayer(anotherTextId);
    assertInvariants();

    // Comprobar que el texto en la capa primera se confirmó automáticamente antes del cambio de selección
    const firstLayer = editor.layers.find(l => l.id === textId);
    logTest("Confirmación automática al cambiar selección", firstLayer && firstLayer.text === "Cambio durante edición");
    logTest("Selección actualizada correctamente", editor.selectedLayerId === anotherTextId);
    logTest("Estado de edición cerrado tras cambio de selección", editor.editingState === 'idle');
    logTest("Textarea huérfano cerrado al cambiar selección", !interaction.hasOpenInPlaceEditor());

    // -------------------------------------------------------------
    // PRUEBA 7: Capas bloqueadas (Inmutabilidad)
    // -------------------------------------------------------------
    console.log("Prueba 7: Operaciones sobre capas bloqueadas...");
    editor.updateLayerProperty(anotherTextId, 'isLocked', true);
    
    // Intentar mover, redimensionar, rotar
    const oldX = editor.layers.find(l => l.id === anotherTextId).x;
    editor.moveLayer(anotherTextId, oldX + 100, 300);
    editor.rotateLayer(anotherTextId, 90);

    const lockedLayer = editor.layers.find(l => l.id === anotherTextId);
    logTest("Bloqueo previene movimiento", lockedLayer && lockedLayer.x === oldX, `X: ${lockedLayer?.x}`);
    logTest("Bloqueo previene rotación", lockedLayer && lockedLayer.rotation === 0, `Rotación: ${lockedLayer?.rotation}`);

    // Intentar borrar
    editor.deleteLayer(anotherTextId);
    const lockedLayerAfterDelete = editor.layers.find(l => l.id === anotherTextId);
    logTest("Bloqueo previene eliminación", lockedLayerAfterDelete !== undefined);

    // Desbloquear para continuar
    editor.updateLayerProperty(anotherTextId, 'isLocked', false);
    editor.deleteLayer(anotherTextId);

    // -------------------------------------------------------------
    // PRUEBA 8: Undo / Redo histórico e invariantes
    // -------------------------------------------------------------
    console.log("Prueba 8: Deshacer y Rehacer histórico...");
    const hLayerId = editor.addTextLayer("Original"); // State 1
    editor.moveLayer(hLayerId, 100, 100);
    editor.saveHistory(); // State 2
    
    editor.updateText(hLayerId, "Editado");
    editor.saveHistory(); // State 3

    editor.undo(); // State 2
    assertInvariants();
    let currentLayer = editor.layers.find(l => l.id === hLayerId);
    logTest("Undo restaura texto", currentLayer && currentLayer.text === "Original");

    editor.undo(); // State 1
    assertInvariants();
    currentLayer = editor.layers.find(l => l.id === hLayerId);
    logTest("Undo restaura posición", currentLayer && currentLayer.x !== 100);

    editor.redo(); // State 2
    assertInvariants();
    currentLayer = editor.layers.find(l => l.id === hLayerId);
    logTest("Redo aplica movimiento de nuevo", currentLayer && currentLayer.x === 100);

    // -------------------------------------------------------------
    // PRUEBA 9: Resistencia ante caracteres especiales, multilinea y emojis
    // -------------------------------------------------------------
    console.log("Prueba 9: Carga de caracteres especiales, emojis y HTML...");
    const unicodeText = "Texto <script>alert(1)</script> \n Emojis 🚀🔥 \n \"Comillas\" & 'Símbolos'";
    const specialLayerId = editor.addTextLayer(unicodeText);
    assertInvariants();
    
    const specialLayer = editor.layers.find(l => l.id === specialLayerId);
    logTest("Soporte de texto Unicode/multilinea/HTML", specialLayer && specialLayer.text === unicodeText);
    
    // -------------------------------------------------------------
    // PRUEBA 10: 500 operaciones consecutivas sin desbordamiento ni cuelgues
    // -------------------------------------------------------------
    console.log("Prueba 10: Estrés (500 operaciones consecutivas)...");
    const stressLayerId = editor.addTextLayer("Stress");
    for (let i = 0; i < 250; i++) {
      editor.moveLayer(stressLayerId, i, i);
      editor.rotateLayer(stressLayerId, i % 360);
    }
    editor.saveHistory();
    assertInvariants();
    logTest("Estrés y resistencia de 500 operaciones", true);

    // Limpiar pantalla mostrando resultados
    showTestResultsModal(results);

  } catch (error) {
    console.error("Fallo crítico en suite de pruebas:", error);
    showTestResultsModal([{ name: "Suite de pruebas ejecutada con error", passed: false, details: error.message }]);
  }
}

function showTestResultsModal(results) {
  // Remover modal existente si lo hay
  const existing = document.getElementById('test-results-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'test-results-modal';
  modal.style.position = 'fixed';
  modal.style.top = '50%';
  modal.style.left = '50%';
  modal.style.transform = 'translate(-50%, -50%)';
  modal.style.width = '600px';
  modal.style.maxHeight = '80%';
  modal.style.overflowY = 'auto';
  modal.style.backgroundColor = '#18181c';
  modal.style.border = '2px solid #6366f1';
  modal.style.borderRadius = '12px';
  modal.style.padding = '24px';
  modal.style.zIndex = '99999';
  modal.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.5)';
  modal.style.color = '#f4f4f5';

  const title = document.createElement('h2');
  title.textContent = "Resultados de la Auditoría del Editor";
  title.style.marginBottom = '16px';
  title.style.fontSize = '1.3rem';
  title.style.borderBottom = '1px solid #2c2c35';
  title.style.paddingBottom = '8px';
  title.style.color = '#8b5cf6';
  modal.appendChild(title);

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '8px';

  let passedCount = 0;
  results.forEach(r => {
    if (r.passed) passedCount++;
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.padding = '8px 12px';
    row.style.backgroundColor = '#25252e';
    row.style.borderRadius = '6px';
    row.style.fontSize = '0.85rem';

    const label = document.createElement('span');
    label.textContent = r.name;
    label.style.fontWeight = '500';

    const status = document.createElement('span');
    status.textContent = r.passed ? "PASSED" : "FAILED";
    status.style.color = r.passed ? "#10b981" : "#ef4444";
    status.style.fontWeight = 'bold';
    status.style.padding = '2px 6px';
    status.style.backgroundColor = r.passed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
    status.style.borderRadius = '4px';

    row.appendChild(label);
    row.appendChild(status);
    list.appendChild(row);
  });

  modal.appendChild(list);

  const summary = document.createElement('div');
  summary.style.marginTop = '16px';
  summary.style.fontSize = '0.9rem';
  summary.style.fontWeight = 'bold';
  summary.style.textAlign = 'right';
  summary.textContent = `Pruebas superadas: ${passedCount} / ${results.length}`;
  modal.appendChild(summary);

  const btnClose = document.createElement('button');
  btnClose.textContent = "Cerrar";
  btnClose.style.marginTop = '16px';
  btnClose.style.padding = '8px 16px';
  btnClose.style.backgroundColor = '#6366f1';
  btnClose.style.color = 'white';
  btnClose.style.border = 'none';
  btnClose.style.borderRadius = '6px';
  btnClose.style.cursor = 'pointer';
  btnClose.style.fontWeight = 'bold';
  btnClose.onclick = () => modal.remove();

  modal.appendChild(btnClose);
  document.body.appendChild(modal);
}

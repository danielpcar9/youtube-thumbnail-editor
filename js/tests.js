// StudioThumb Comprehensive Automated Test Suite
// To run: navigate to http://localhost:8001/?test=1

export async function runAllTests(editor, interaction, syncUI) {
  console.log("=== INICIANDO SUITE DE PRUEBAS AUTOMATIZADAS DE ESTABILIDAD V3 ===");

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
    // -------------------------------------------------------------
    // PRUEBAS DE INICIALIZACIÓN
    // -------------------------------------------------------------
    // 1. Verificar "DISEÑO PRO" inicial
    const hasInitial = editor.layers.some(l => l.text === "DISEÑO PRO");
    logTest("Primer cuadro DISEÑO PRO existe en inicio", hasInitial);

    // 2. DISEÑO PRO es seleccionable, editable y eliminable
    const initialLayer = editor.layers.find(l => l.text === "DISEÑO PRO");
    if (initialLayer) {
      editor.selectLayer(initialLayer.id);
      logTest("DISEÑO PRO es seleccionable", editor.selectedLayerId === initialLayer.id);

      editor.updateText(initialLayer.id, "DISEÑO PRO EDITADO");
      logTest("DISEÑO PRO es editable", editor.layers.find(l => l.id === initialLayer.id).text === "DISEÑO PRO EDITADO");

      editor.deleteLayer(initialLayer.id);
      logTest("DISEÑO PRO es eliminable y desaparece del modelo", !editor.layers.some(l => l.id === initialLayer.id));
      logTest("DISEÑO PRO removido limpia la selección", editor.selectedLayerId === null);
    }

    // Limpiar estado inicial para pruebas aisladas
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

    // 3. Crear una capa
    const layer1 = editor.addTextLayer("Capa A");
    assertInvariants();
    logTest("Crear una capa", editor.layers.length === 1 && editor.selectedLayerId === layer1);

    // 4. Crear cinco capas
    const layers = [layer1];
    for (let i = 2; i <= 5; i++) {
      layers.push(editor.addTextLayer(`Capa ${i}`));
    }
    assertInvariants();
    logTest("Crear cinco capas", editor.layers.length === 5);

    // 5. Editar la primera capa (Capa A / layers[0])
    editor.selectLayer(layers[0]);
    editor.startEditing(layers[0]);
    editor.updateText(layers[0], "Capa A Modificada");
    editor.commitEditing();
    assertInvariants();
    logTest("Editar la primera capa", editor.layers.find(l => l.id === layers[0]).text === "Capa A Modificada");

    // 6. Eliminar la primera capa
    editor.deleteLayer(layers[0]);
    assertInvariants();
    logTest("Eliminar la primera capa", !editor.layers.some(l => l.id === layers[0]));

    // 7. Editar la última capa
    const lastLayerId = layers[layers.length - 1];
    editor.selectLayer(lastLayerId);
    editor.startEditing(lastLayerId);
    editor.updateText(lastLayerId, "Ultima Modificada");
    editor.commitEditing();
    assertInvariants();
    logTest("Editar la última capa", editor.layers.find(l => l.id === lastLayerId).text === "Ultima Modificada");

    // 8. Eliminar la última capa
    editor.deleteLayer(lastLayerId);
    assertInvariants();
    logTest("Eliminar la última capa", !editor.layers.some(l => l.id === lastLayerId));

    // 9. Eliminar todas las capas una por una
    const remainingIds = [...editor.layers.map(l => l.id)];
    remainingIds.forEach(id => editor.deleteLayer(id));
    assertInvariants();
    logTest("Eliminar todas las capas una por una", editor.layers.length === 0 && editor.selectedLayerId === null);

    // 10. Crear una capa después de eliminar la primera
    const newAfterDel = editor.addTextLayer("Nueva Tras Borrar Todo");
    assertInvariants();
    logTest("Crear capa después de vaciar", editor.layers.length === 1 && editor.selectedLayerId === newAfterDel);

    // 11. Editar desde el panel (simulando eventos en propText)
    const propText = document.getElementById('prop-text');
    propText.focus();
    propText.value = "Texto Editado Panel";
    propText.dispatchEvent(new Event('input'));

    // Simular pérdida de foco (blur)
    propText.dispatchEvent(new Event('blur'));
    assertInvariants();
    logTest("Editar desde el panel y confirmar por Blur", editor.layers.find(l => l.id === newAfterDel).text === "Texto Editado Panel");

    // 12. Escribir texto vacío
    propText.focus();
    propText.value = "";
    propText.dispatchEvent(new Event('input'));
    propText.dispatchEvent(new Event('blur'));
    assertInvariants();
    logTest("Escribir texto vacío es válido", editor.layers.find(l => l.id === newAfterDel).text === "");

    // 13. Escribir texto multilinea, emojis y HTML
    propText.focus();
    const complexText = "Linea 1\nLinea 2 🚀\n<div>HTML Literal</div>";
    propText.value = complexText;
    propText.dispatchEvent(new Event('input'));
    propText.dispatchEvent(new Event('blur'));
    assertInvariants();
    logTest("Escribir texto multilínea, emojis y HTML", editor.layers.find(l => l.id === newAfterDel).text === complexText);

    // 14. Confirmar con Enter y Cancelar con Escape
    // Iniciar edición
    propText.focus();
    propText.value = "Texto Temporal";
    propText.dispatchEvent(new Event('input'));
    // Escape key
    propText.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assertInvariants();
    logTest("Cancelar con Escape restaura texto original", editor.layers.find(l => l.id === newAfterDel).text === complexText);

    propText.focus();
    propText.value = "Texto Confirmado Enter";
    propText.dispatchEvent(new Event('input'));
    // Enter key
    propText.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assertInvariants();
    logTest("Confirmar con Enter aplica cambios", editor.layers.find(l => l.id === newAfterDel).text === "Texto Confirmado Enter");

    // 15. Cambiar de selección durante edición
    const bId = editor.addTextLayer("Capa B");
    editor.selectLayer(newAfterDel);
    propText.focus();
    propText.value = "Texto Auto Confirmado";
    propText.dispatchEvent(new Event('input'));

    // Seleccionar Capa B sin hacer blur
    editor.selectLayer(bId);
    assertInvariants();
    logTest("Cambiar de selección durante edición auto-confirma", editor.layers.find(l => l.id === newAfterDel).text === "Texto Auto Confirmado");

    // 16. Eliminar capa mientras el panel tiene foco
    propText.focus();
    editor.deleteLayer(bId);
    assertInvariants();
    logTest("Eliminar capa mientras el panel tiene foco cierra transacción", editor.editingState === 'idle');

    // 17. Deshacer y rehacer (Undo/Redo)
    editor.undo();
    assertInvariants();
    logTest("Undo después de eliminar restaura la capa", editor.layers.some(l => l.id === bId));

    editor.redo();
    assertInvariants();
    logTest("Redo vuelve a eliminar la capa", !editor.layers.some(l => l.id === bId));

    // 18. Mover, Redimensionar y Rotar
    const active = editor.getSelectedLayer();
    if (active) {
      editor.moveLayer(active.id, 100, 120);
      logTest("Mover capa actualiza coordenadas", active.x === 100 && active.y === 120);

      editor.resizeLayer(active.id, 400, 150, 45);
      logTest("Redimensionar capa actualiza tamaño y fuente", active.width === 400 && active.height === 150 && active.fontSize === 45);

      editor.rotateLayer(active.id, 45);
      logTest("Rotar capa actualiza ángulo", active.rotation === 45);
    }

    // 19. Capas bloqueadas (Inmutabilidad)
    editor.updateLayerProperty(newAfterDel, 'isLocked', true);
    editor.moveLayer(newAfterDel, 500, 500);
    editor.deleteLayer(newAfterDel);
    const lockedL = editor.layers.find(l => l.id === newAfterDel);
    logTest("Capa bloqueada no se puede mover", lockedL && lockedL.x !== 500);
    logTest("Capa bloqueada no se puede eliminar", lockedL !== undefined);

    // Desbloquear
    editor.updateLayerProperty(newAfterDel, 'isLocked', false);
    editor.deleteLayer(newAfterDel);

    // 20. Carga rápida de fuentes y eliminación concurrente
    const asyncIds = [];
    for (let i = 0; i < 20; i++) {
      const id = editor.addTextLayer(`Async L ${i}`, false);
      asyncIds.push(id);
      if (i % 2 === 0) {
        editor.deleteLayer(id);
      }
    }
    // Esperar carga asíncrona
    await new Promise(r => setTimeout(r, 200));
    assertInvariants();
    logTest("Eliminar capas concurrentemente mientras cargan fuentes es seguro", true);

    // Limpiar para test de estrés
    editor.layers = [];
    editor.selectedLayerId = null;
    editor.saveHistory();

    // 21. Estrés: 500 operaciones consecutivas
    console.log("Iniciando estrés (500 operaciones)...");
    const stressId = editor.addTextLayer("Stress Layer");
    for (let i = 0; i < 250; i++) {
      editor.moveLayer(stressId, i, i);
      editor.rotateLayer(stressId, i % 360);
    }
    editor.saveHistory();
    assertInvariants();
    logTest("Estrés de 500 operaciones consecutivas completado", true);

    // 22. REGRESIÓN ESPECÍFICA
    console.log("Ejecutando regresión específica...");
    editor.layers = [];
    editor.selectedLayerId = null;
    editor.saveHistory();

    const layerA = editor.addTextLayer("A");
    editor.selectLayer(layerA);
    propText.focus();
    propText.value = "Cambio durante edición";
    propText.dispatchEvent(new Event('input'));

    const layerB = editor.addTextLayer("B");
    editor.selectLayer(layerB);

    const checkA = editor.layers.find(l => l.id === layerA);
    logTest("Regresión: Capa A confirmada tras cambio de selección", checkA && checkA.text === "Cambio durante edición");
    logTest("Regresión: Textarea inline de A está oculto", !interaction.hasOpenInPlaceEditor());

    editor.deleteLayer(layerA);
    logTest("Regresión: Capa A eliminada desaparece por completo", !editor.layers.some(l => l.id === layerA));

    // Verificar que Capa B sigue completamente operativa
    const checkB = editor.layers.find(l => l.id === layerB);
    logTest("Regresión: Capa B sigue activa en el modelo", checkB !== undefined);
    if (checkB) {
      editor.selectLayer(layerB);
      editor.moveLayer(layerB, 150, 150);
      editor.resizeLayer(layerB, 300, 100, 40);
      editor.deleteLayer(layerB);
      logTest("Regresión: Capa B es editable, movible, redimensionable y eliminable", editor.layers.length === 0);
    }

    // 23. Textarea flotante nunca queda visible al terminar
    logTest("Ningún textarea flotante/inline queda visible", !interaction.hasOpenInPlaceEditor());

    // Mostrar modal con resultados detallados
    showTestResultsModal(results);

  } catch (error) {
    console.error("Fallo crítico en suite de pruebas:", error);
    showTestResultsModal([{ name: "Suite de pruebas ejecutada con error", passed: false, details: error.message }]);
  }
}

function showTestResultsModal(results) {
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
  title.textContent = "Resultados de la Auditoría del Editor V3";
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

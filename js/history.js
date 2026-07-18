/**
 * Deep clones state objects (specifically layers and settings).
 * Handles primitives, arrays, and plain objects.
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item));
  }

  const cloned = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
}

export class HistoryManager {
  constructor(maxStates = 50) {
    this.maxStates = maxStates;
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Pushes a new state onto the history stack.
   * Clears the redo stack.
   * @param {Object} state - The state to save
   */
  pushState(state) {
    const clonedState = deepClone(state);
    
    // Check if the state is identical to the current top of stack to avoid duplicates
    if (this.undoStack.length > 0) {
      const lastStateStr = JSON.stringify(this.undoStack[this.undoStack.length - 1]);
      const newStateStr = JSON.stringify(clonedState);
      if (lastStateStr === newStateStr) {
        return; // Don't push identical states
      }
    }

    this.undoStack.push(clonedState);
    this.redoStack = []; // Clear redo stack on new action

    if (this.undoStack.length > this.maxStates) {
      this.undoStack.shift(); // Remove oldest state
    }
  }

  /**
   * Resets the history manager.
   */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Returns the previous state and moves the current state to the redo stack.
   * @param {Object} currentState - The active state to save in redo
   * @returns {Object|null} The previous state or null if no states to undo
   */
  undo(currentState) {
    if (this.undoStack.length <= 1) {
      // The bottom of the stack is the initial state, we shouldn't pop it
      return null;
    }

    // Move current state to redo
    const poppedCurrent = this.undoStack.pop();
    this.redoStack.push(deepClone(currentState));

    // Return the previous state (peeking the stack)
    return deepClone(this.undoStack[this.undoStack.length - 1]);
  }

  /**
   * Returns the next state from the redo stack and pushes the current state to the undo stack.
   * @param {Object} currentState - The active state to save in undo
   * @returns {Object|null} The next state or null if no states to redo
   */
  redo(currentState) {
    if (this.redoStack.length === 0) {
      return null;
    }

    const nextState = this.redoStack.pop();
    this.undoStack.push(deepClone(nextState));

    return nextState;
  }

  /**
   * Returns true if undo is available.
   */
  canUndo() {
    return this.undoStack.length > 1;
  }

  /**
   * Returns true if redo is available.
   */
  canRedo() {
    return this.redoStack.length > 0;
  }
}

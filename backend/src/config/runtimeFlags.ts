let aiEvalWasmAvailable = false

/**
 * Sets the availability of the AI evaluation WebAssembly module.
 * @param {boolean} val - Whether the AI evaluation WebAssembly module is available.
 */
export function setAiEvalWasmAvailable(val: boolean) {
  aiEvalWasmAvailable = !!val
}

/**
 * Checks if the AI evaluation WebAssembly module is available.
 * @returns {boolean} - True if the AI evaluation WebAssembly module is available, false otherwise.
 */
export function isAiEvalWasmAvailable() {
  return aiEvalWasmAvailable
}

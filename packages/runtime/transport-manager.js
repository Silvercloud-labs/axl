export class TransportManager {
  #adapters = [];
  
  /**
   * Register a transport adapter.
   * @param {string} name - Name of the transport (e.g., "REST", "MCP")
   * @param {function} mountFn - Function that mounts the transport on the Express app
   */
  register(name, mountFn) {
    this.#adapters.push({ name, mountFn });
  }
  
  /**
   * Mount all registered transports onto the app.
   */
  mountAll(app, context) {
    const mounted = [];
    for (const { name, mountFn } of this.#adapters) {
      mountFn(app, context);
      mounted.push(name);
    }
    return mounted;
  }
  
  get names() {
    return this.#adapters.map(a => a.name);
  }
}

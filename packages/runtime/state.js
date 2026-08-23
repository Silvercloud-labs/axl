import fs from "node:fs";
import path from "node:path";

/**
 * Interface definition (for documentation):
 * interface StateStore {
 *   get(namespace: string, key: string): Promise<any>;
 *   set(namespace: string, key: string, value: any, ttlMs?: number): Promise<void>;
 *   delete(namespace: string, key: string): Promise<void>;
 * }
 */

export class InMemoryStateStore {
  constructor() {
    this.namespaces = new Map();
  }

  async get(namespace, key) {
    const nsMap = this.namespaces.get(namespace);
    if (!nsMap) return undefined;
    const entry = nsMap.get(key);
    if (!entry) return undefined;
    
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      nsMap.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async set(namespace, key, value, ttlMs) {
    let nsMap = this.namespaces.get(namespace);
    if (!nsMap) {
      nsMap = new Map();
      this.namespaces.set(namespace, nsMap);
    }
    const expiresAt = ttlMs ? Date.now() + ttlMs : undefined;
    nsMap.set(key, { value, expiresAt });
  }

  async delete(namespace, key) {
    const nsMap = this.namespaces.get(namespace);
    if (nsMap) {
      nsMap.delete(key);
    }
  }

  // Internal helper to drop expired entries
  _sweep() {
    const now = Date.now();
    for (const nsMap of this.namespaces.values()) {
      for (const [k, entry] of nsMap.entries()) {
        if (entry.expiresAt && now > entry.expiresAt) {
          nsMap.delete(k);
        }
      }
    }
  }
}

export class FileStateStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = {};
    this.pendingWrite = null;
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        this.state = JSON.parse(raw);
      } catch (err) {
        console.warn(`Failed to parse state file ${filePath}, starting fresh.`, err.message);
        this.state = {};
      }
    } else {
      this.state = {};
    }
  }

  _scheduleWrite() {
    if (this.pendingWrite) return;
    this.pendingWrite = setTimeout(() => {
      this.pendingWrite = null;
      try {
        // Sweep before saving
        this._sweep();
        fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf-8");
      } catch (err) {
        console.error(`Failed to write state file ${this.filePath}`, err);
      }
    }, 100); // 100ms debounce
    if (this.pendingWrite.unref) this.pendingWrite.unref();
  }

  async get(namespace, key) {
    const ns = this.state[namespace];
    if (!ns) return undefined;
    const entry = ns[key];
    if (!entry) return undefined;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      delete ns[key];
      this._scheduleWrite();
      return undefined;
    }
    return entry.value;
  }

  async set(namespace, key, value, ttlMs) {
    if (!this.state[namespace]) {
      this.state[namespace] = {};
    }
    const expiresAt = ttlMs ? Date.now() + ttlMs : undefined;
    this.state[namespace][key] = { value, expiresAt };
    this._scheduleWrite();
  }

  async delete(namespace, key) {
    const ns = this.state[namespace];
    if (ns && ns[key]) {
      delete ns[key];
      this._scheduleWrite();
    }
  }

  _sweep() {
    const now = Date.now();
    for (const ns of Object.values(this.state)) {
      for (const [k, entry] of Object.entries(ns)) {
        if (entry.expiresAt && now > entry.expiresAt) {
          delete ns[k];
        }
      }
    }
  }
}

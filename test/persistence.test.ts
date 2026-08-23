import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxlEngine } from '../packages/runtime/engine.js';
import { FileStateStore } from '../packages/runtime/state.js';
import fs from 'fs';
import path from 'path';

describe('FileStateStore Persistence', () => {
  const tempFile = path.join(process.cwd(), 'test-temp-state.json');

  beforeEach(() => {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    vi.restoreAllMocks();
  });

  it('persists idempotency cache across engine instances', async () => {
    const manifest = {
      app: { base_url: 'http://localhost' },
      actions: {
        my_action: { permission: 'PUBLIC', endpoint: { path: '/do', method: 'POST' }, input: {} }
      }
    };

    // First instance
    const store1 = new FileStateStore(tempFile);
    const engine1 = new AxlEngine(manifest, store1);
    
    // Mock HTTP execution
    engine1._executeHttp = vi.fn().mockResolvedValue({ success: true, run: 1 });

    const context = { sessionCookie: 'userA', idempotencyKey: 'idem123' };
    
    // Execute and cache result
    const res1 = await engine1.execute('my_action', {}, context);
    expect(res1.run).toBe(1);
    expect(engine1._executeHttp).toHaveBeenCalledTimes(1);

    // Wait briefly for debounce write
    await new Promise(r => setTimeout(r, 150));
    
    engine1.destroy();

    // Verify file exists
    expect(fs.existsSync(tempFile)).toBe(true);
    const raw = fs.readFileSync(tempFile, 'utf-8');
    expect(raw).toContain('idem123'); // Should be in the JSON

    // Second instance, using the same file
    const store2 = new FileStateStore(tempFile);
    const engine2 = new AxlEngine(manifest, store2);
    
    // Mock HTTP execution
    engine2._executeHttp = vi.fn().mockResolvedValue({ success: true, run: 2 });

    // Execute with same idempotency key
    const res2 = await engine2.execute('my_action', {}, context);
    
    // It should return the cached result (run: 1), NOT execute again
    expect(res2.run).toBe(1);
    expect(engine2._executeHttp).toHaveBeenCalledTimes(0);

    engine2.destroy();
  });
});

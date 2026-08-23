import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadManifest } from '../packages/runtime/manifest.js';
import fs from 'fs';

vi.mock('fs');

describe('manifest.js', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadManifest', () => {
    it('loads and parses a valid manifest file successfully', () => {
      const validManifest = {
        app: { base_url: 'http://localhost' },
        actions: {}
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validManifest));

      const result = loadManifest('/fake/path/manifest.json');
      expect(result).toEqual(validManifest);
    });

    it('throws clearly when file is missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => loadManifest('/fake/missing.json')).toThrow(/Manifest not found: \/fake\/missing.json/);
    });

    it('throws clearly when file is malformed JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{ not valid json');

      expect(() => loadManifest('/fake/bad.json')).toThrow(/Failed to parse manifest.json/);
    });

    it('throws when required top-level keys are missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      // Missing app
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ actions: {} }));
      expect(() => loadManifest('/fake/path')).toThrow(/manifest.json missing required field: "app"/);

      // Missing app.base_url
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ app: {}, actions: {} }));
      expect(() => loadManifest('/fake/path')).toThrow(/manifest.json missing required field: "app.base_url"/);

      // Missing actions
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ app: { base_url: 'url' } }));
      expect(() => loadManifest('/fake/path')).toThrow(/manifest.json missing required field: "actions"/);
    });

    // Workflows used to be loaded with no shape checking at all, so a hand-edited or
    // corrupted manifest could carry a step that is neither an action nor a branch. The
    // engine's step loop then spun on it synchronously and pinned the whole process.
    // Failing at load, with a path and an index, is the better failure.
    describe('workflow shape validation', () => {
      function load(manifest: any) {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(manifest));
        return () => loadManifest('/fake/path');
      }

      const base = { app: { base_url: 'http://localhost' }, actions: {} };

      it('accepts a manifest with no workflows key', () => {
        expect(load({ ...base })).not.toThrow();
      });

      it('accepts valid string, object and branch steps', () => {
        expect(load({
          ...base,
          workflows: [
            { name: 'w1', steps: ['a', { action: 'b', bindings: [{ targetField: 't', sourceStep: 'a', sourceField: 's' }] }] },
            { name: 'w2', steps: [{ if: 'a.ok', then: ['b'], else: [{ action: 'c' }] }] }
          ]
        })).not.toThrow();
      });

      it('rejects a non-array workflows field', () => {
        expect(load({ ...base, workflows: { name: 'w' } })).toThrow(/"workflows" must be an array/);
      });

      it('rejects a workflow with no name or no steps array', () => {
        expect(load({ ...base, workflows: [{ steps: [] }] })).toThrow(/missing a non-empty "name"/);
        expect(load({ ...base, workflows: [{ name: 'w' }] })).toThrow(/must have a "steps" array/);
      });

      // The exact shape that hung the engine.
      it('rejects a step that is neither an action nor a branch', () => {
        expect(load({ ...base, workflows: [{ name: 'w', steps: [{ notAnAction: true }] }] }))
          .toThrow(/is not a branch \(needs "if"\).*or an action step/);
      });

      it('rejects null, numeric and empty-string steps', () => {
        expect(load({ ...base, workflows: [{ name: 'w', steps: [null] }] })).toThrow(/must be an action name or a step object/);
        expect(load({ ...base, workflows: [{ name: 'w', steps: [42] }] })).toThrow(/must be an action name or a step object/);
        expect(load({ ...base, workflows: [{ name: 'w', steps: [''] }] })).toThrow(/empty action name/);
      });

      it('rejects a malformed branch', () => {
        expect(load({ ...base, workflows: [{ name: 'w', steps: [{ if: 'a.ok' }] }] })).toThrow(/no "then" array/);
        expect(load({ ...base, workflows: [{ name: 'w', steps: [{ if: 1, then: [] }] }] })).toThrow(/non-string "if"/);
        expect(load({ ...base, workflows: [{ name: 'w', steps: [{ if: 'a.ok', then: [], else: 'x' }] }] })).toThrow(/"else" is not an array/);
      });

      it('validates steps nested inside a branch', () => {
        expect(load({ ...base, workflows: [{ name: 'w', steps: [{ if: 'a.ok', then: [{ bogus: 1 }] }] }] }))
          .toThrow(/steps\[0\]\.then\[0\] is not a branch \(needs "if"\)/);
      });

      it('rejects malformed bindings', () => {
        expect(load({ ...base, workflows: [{ name: 'w', steps: [{ action: 'a', bindings: {} }] }] }))
          .toThrow(/non-array "bindings"/);
        expect(load({ ...base, workflows: [{ name: 'w', steps: [{ action: 'a', bindings: [{ targetField: 't' }] }] }] }))
          .toThrow(/missing a non-empty "sourceStep"/);
      });

      it('names the offending workflow and index', () => {
        expect(load({ ...base, workflows: [{ name: 'ok', steps: [] }, { name: 'bad', steps: [{}] }] }))
          .toThrow(/workflows\[1\] \("bad"\)\.steps\[0\]/);
      });
    });
    // Named domain events. The compiler rejects two actions sharing an event name, but
    // it cannot reject a collision with a lifecycle event: every lifecycle name contains
    // a dot and the lexer does not accept "." in an identifier, so `EVENT
    // action.completed` never parses as one name. The collision is reachable only
    // through a hand-edited or generated manifest -- here.
    describe('action event validation', () => {
      function loadWith(actions: Record<string, any>) {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
          app: { base_url: 'http://localhost' },
          actions
        }));
        return () => loadManifest('/fake/path');
      }

      it('accepts a normal named event', () => {
        expect(loadWith({ a: { event: 'OrderCreated' } })).not.toThrow();
      });

      it('accepts actions with no event field', () => {
        expect(loadWith({ a: {}, b: {} })).not.toThrow();
      });

      it.each([
        'action.started', 'action.completed',
        'workflow.started', 'workflow.paused', 'workflow.resumed', 'workflow.completed'
      ])('rejects the reserved lifecycle event name %j', (name) => {
        expect(loadWith({ a: { event: name } })).toThrow(/reserved lifecycle event name/);
      });

      it('rejects two actions sharing an event name', () => {
        expect(loadWith({ a: { event: 'Made' }, b: { event: 'Made' } }))
          .toThrow(/duplicates actions\["a"\]\.event \("Made"\)/);
      });

      it('rejects a non-string or empty event', () => {
        expect(loadWith({ a: { event: 42 } })).toThrow(/must be a non-empty string/);
        expect(loadWith({ a: { event: '' } })).toThrow(/must be a non-empty string/);
      });
    });
  });
});

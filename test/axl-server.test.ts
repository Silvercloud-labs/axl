import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildAxlServer } from '../packages/runtime/axl-server.js';
import * as manifestUtils from '../packages/runtime/manifest.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildZodShape } from '../packages/runtime/schema-utils.js';

vi.mock('../packages/runtime/manifest.js');
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  const registerToolMock = vi.fn();
  return {
    McpServer: vi.fn().mockImplementation(() => ({
      registerTool: registerToolMock,
      connect: vi.fn()
    }))
  };
});

describe('axl-server.js & schema building', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Zod schema-building logic (buildZodShape)', () => {
    it('handles required vs optional correctly', () => {
      const inputSpec = {
        req_str: { type: 'string', required: true },
        opt_str: { type: 'string', required: false },
        req_num: { type: 'number', required: true },
        opt_bool: { type: 'boolean', required: false }
      };

      const shape = buildZodShape(inputSpec);
      const schema = z.object(shape);

      // Should succeed with only required fields
      expect(() => schema.parse({ req_str: 'hello', req_num: 42 })).not.toThrow();

      // Should fail if missing required fields
      expect(() => schema.parse({ opt_str: 'optional' })).toThrow(/expected string/i);

      // Should succeed with all fields
      expect(() => schema.parse({
        req_str: 'hello',
        opt_str: 'world',
        req_num: 42,
        opt_bool: true
      })).not.toThrow();

      // Type checking validation
      expect(() => schema.parse({ req_str: 'hello', req_num: 'not a number' })).toThrow(/expected number/i);
      expect(() => schema.parse({ req_str: 'hello', req_num: 42, opt_bool: 'not boolean' })).toThrow(/expected boolean/i);
    });

    it('defaults to string if unknown type', () => {
      const inputSpec = {
        unknown_field: { type: 'magic', required: true }
      };
      const shape = buildZodShape(inputSpec);
      const schema = z.object(shape);
      expect(() => schema.parse({ unknown_field: 'works as string' })).not.toThrow();
      expect(() => schema.parse({ unknown_field: 123 })).toThrow(/expected string/i);
    });
  });

  describe('buildAxlServer', () => {
    it('registers MCP tools with the correct parsed Zod schemas', () => {
      const manifest = {
        app: { name: 'TestApp', version: '1.0', base_url: 'http://localhost' },
        actions: {
          test_action: {
            description: 'A test action',
            input: {
              foo: { type: 'string', required: true }
            }
          }
        },
        workflows: []
      };
      vi.mocked(manifestUtils.loadManifest).mockReturnValue(manifest);

      const { server } = buildAxlServer('dummy/path.json');
      
      expect(McpServer).toHaveBeenCalledWith({
        name: 'axl-testapp',
        version: '1.0'
      });

      expect(server.registerTool).toHaveBeenCalledWith(
        'test_action',
        expect.objectContaining({
          description: 'A test action',
          inputSchema: expect.any(Object)
        }),
        expect.any(Function)
      );

      // Check the special confirm_action and run_workflow tools
      expect(server.registerTool).toHaveBeenCalledWith(
        'confirm_action',
        expect.anything(),
        expect.any(Function)
      );
      
      expect(server.registerTool).toHaveBeenCalledWith(
        'run_workflow',
        expect.anything(),
        expect.any(Function)
      );
    });
  });
});

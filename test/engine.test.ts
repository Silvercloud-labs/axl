import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxlEngine, PermissionError, BackendError } from '../packages/runtime/engine.js';
import crypto from 'crypto';

describe('AxlEngine', () => {
  let manifest: any;
  let engine: any;

  beforeEach(() => {
    manifest = {
      app: { base_url: 'http://localhost' },
      actions: {
        public_action: { permission: 'PUBLIC', endpoint: { path: '/public', method: 'GET' }, input: {} },
        auth_action: { permission: 'AUTH', endpoint: { path: '/auth', method: 'GET' }, input: {} },
        otp_action: { permission: 'AUTH', confirm: 'OTP', endpoint: { path: '/otp', method: 'POST' }, input: {} },
        workflow_step1: { permission: 'PUBLIC', endpoint: { path: '/s1', method: 'POST' }, input: {} },
        workflow_step2: { permission: 'PUBLIC', endpoint: { path: '/s2', method: 'POST' }, input: { id: { type: 'string', required: true } } }
      },
      workflows: [
        {
          name: 'test_workflow',
          steps: [
            'workflow_step1',
            { action: 'workflow_step2', bindings: [{ sourceStep: 'workflow_step1', sourceField: 'outId', targetField: 'id' }] }
          ]
        },
        {
          name: 'missing_binding_workflow',
          steps: [
             { action: 'workflow_step2', bindings: [] } // missing required id
          ]
        }
      ],
      rateLimits: {
        public_action: '2/sec'
      }
    };
    engine = new AxlEngine(manifest);
    // Mock the actual HTTP call to isolate unit tests
    engine._executeHttp = vi.fn().mockResolvedValue({ success: true, outId: '123' });
  });

  afterEach(() => {
    engine.destroy();
    vi.restoreAllMocks();
  });

  describe('checkPermission', () => {
    it('allows PUBLIC without session', () => {
      expect(() => engine.checkPermission(manifest.actions.public_action, null)).not.toThrow();
    });

    it('throws PermissionError for AUTH without session', () => {
      expect(() => engine.checkPermission(manifest.actions.auth_action, null)).toThrow(PermissionError);
      expect(() => engine.checkPermission(manifest.actions.auth_action, {})).toThrow(PermissionError);
    });

    it('allows AUTH with session', () => {
      expect(() => engine.checkPermission(manifest.actions.auth_action, { sessionCookie: '123' })).not.toThrow();
    });
  });

  describe('idempotencyCache', () => {
    it('caches based on idempotency key', async () => {
      const context = { sessionCookie: 'user1', idempotencyKey: 'idem1' };
      const res1 = await engine.execute('auth_action', {}, context);
      const res2 = await engine.execute('auth_action', {}, context);
      
      expect(res1).toBe(res2);
      expect(engine._executeHttp).toHaveBeenCalledTimes(1);
    });

    it('executes again for different key', async () => {
      const context1 = { sessionCookie: 'user1', idempotencyKey: 'idem1' };
      const context2 = { sessionCookie: 'user1', idempotencyKey: 'idem2' };
      await engine.execute('auth_action', {}, context1);
      await engine.execute('auth_action', {}, context2);
      
      expect(engine._executeHttp).toHaveBeenCalledTimes(2);
    });
  });

  describe('_checkRateLimit', () => {
    it('enforces rate limits in isolation', async () => {
      await engine._checkRateLimit('public_action', { sessionCookie: 'user1' });
      await engine._checkRateLimit('public_action', { sessionCookie: 'user1' });

      // 3rd time should throw, limit is 2/sec
      await expect(engine._checkRateLimit('public_action', { sessionCookie: 'user1' })).rejects.toThrow(/Rate limit exceeded/);
    });

    // AXL never validates the bearer token, so a quota keyed on it (or on any composite
    // that includes it) is rotatable. Measured against the real server before the fix:
    // 40 of 40 requests admitted through a 10/min limit from one source IP.
    it('is not bypassed by rotating the session token from one IP', async () => {
      const ip = '203.0.113.5';
      await engine._checkRateLimit('public_action', { ip, sessionCookie: 'token-1' });
      await engine._checkRateLimit('public_action', { ip, sessionCookie: 'token-2' });

      await expect(engine._checkRateLimit('public_action', { ip, sessionCookie: 'token-3' }))
        .rejects.toThrow(/Rate limit exceeded/);
    });

    // The IP anchors the quota, so a rejected request must not have spent allowance in
    // the session bucket it did clear -- otherwise a blocked caller silently burns down
    // a quota they were never admitted through.
    it('does not consume the session bucket on a request the IP bucket rejects', async () => {
      const ip = '203.0.113.6';
      await engine._checkRateLimit('public_action', { ip });
      await engine._checkRateLimit('public_action', { ip });

      const fresh = { ip, sessionCookie: 'brand-new' };
      await expect(engine._checkRateLimit('public_action', fresh)).rejects.toThrow(/Rate limit exceeded/);

      const record = await engine.state.get('rateLimits', `public_action:${ip}|brand-new`);
      expect(record).toBeUndefined();
    });

    // The session narrows; it must never widen. One steady session gets the full quota
    // and no less -- both of its buckets reach the limit on the same request.
    it('does not double-count a single real session', async () => {
      const ctx = { ip: '203.0.113.7', sessionCookie: 'steady' };
      await engine._checkRateLimit('public_action', ctx);
      await engine._checkRateLimit('public_action', ctx);
      await expect(engine._checkRateLimit('public_action', ctx)).rejects.toThrow(/Rate limit exceeded/);
    });

    it('still isolates two different source IPs', async () => {
      await engine._checkRateLimit('public_action', { ip: '10.0.0.1' });
      await engine._checkRateLimit('public_action', { ip: '10.0.0.1' });
      await expect(engine._checkRateLimit('public_action', { ip: '10.0.0.1' })).rejects.toThrow(/Rate limit exceeded/);

      await expect(engine._checkRateLimit('public_action', { ip: '10.0.0.2' })).resolves.toBeUndefined();
    });
  });

  describe('confirm-failure lockout identity', () => {
    it('is not cleared by rotating the session token from one IP', async () => {
      const ip = '203.0.113.8';
      for (let i = 0; i < 25; i++) {
        await engine._recordConfirmFailure({ ip, sessionCookie: `token-${i}` });
      }
      expect(await engine._isConfirmLocked({ ip, sessionCookie: 'a-brand-new-token' })).toBe(true);
    });

    it('does not lock an unrelated IP', async () => {
      const ip = '203.0.113.10';
      for (let i = 0; i < 25; i++) {
        await engine._recordConfirmFailure({ ip });
      }
      expect(await engine._isConfirmLocked({ ip: '203.0.113.11' })).toBe(false);
    });
  });

  describe('OTP confirm/reject flow', () => {
    it('creates pending confirmation, allows correct OTP, handles wrong OTP with 5 attempts', async () => {
      const context = { sessionCookie: 'user1' };
      const res = await engine.execute('otp_action', {}, context);
      
      expect(res.confirmationRequired).toBe(true);
      expect(res.token).toBeDefined();
      
      const token = res.token;
      const pendingInfo = await engine.state.get('pendingConfirmations', token);
      const actualOtp = pendingInfo.otp;
      
      // 1st wrong attempt
      await expect(engine.confirmAction(token, 'wrong1', context)).rejects.toThrow(/Incorrect OTP.*4 attempt/);
      // 2nd wrong attempt
      await expect(engine.confirmAction(token, 'wrong2', context)).rejects.toThrow(/Incorrect OTP.*3 attempt/);
      // 3rd wrong attempt
      await expect(engine.confirmAction(token, 'wrong3', context)).rejects.toThrow(/Incorrect OTP.*2 attempt/);
      // 4th wrong attempt
      await expect(engine.confirmAction(token, 'wrong4', context)).rejects.toThrow(/Incorrect OTP.*1 attempt/);
      
      // The pending confirmation should still exist
      expect(await engine.state.get('pendingConfirmations', token)).toBeDefined();
      
      // 5th wrong attempt cancels it
      await expect(engine.confirmAction(token, 'wrong5', context)).rejects.toThrow(/Too many incorrect attempts/);
      expect(await engine.state.get('pendingConfirmations', token)).toBeUndefined();
    });

    it('executes action on correct OTP', async () => {
      const context = { sessionCookie: 'user1' };
      const res = await engine.execute('otp_action', {}, context);
      
      const token = res.token;
      const pendingInfo = await engine.state.get('pendingConfirmations', token);
      const actualOtp = pendingInfo.otp;
      
      const finalRes = await engine.confirmAction(token, actualOtp, context);
      expect(finalRes.success).toBe(true);
      expect(engine._executeHttp).toHaveBeenCalledTimes(1);
      expect(await engine.state.get('pendingConfirmations', token)).toBeUndefined();
    });
  });

  describe('Workflow binding resolution', () => {
    it('resolves USING bindings correctly', async () => {
      const res = await engine.runWorkflow('test_workflow', {}, null);
      
      expect(res.status).toBe('COMPLETED');
      // Step 1 executes
      expect(engine._executeHttp).toHaveBeenNthCalledWith(
        1,
        'workflow_step1',
        expect.anything(),
        {},
        null,
        // The fifth argument is the per-execution options bag (TIMEOUT). A step with
        // no TIMEOUT declared passes an undefined deadline, not a default one.
        { timeoutMs: undefined }
      );
      // Step 2 executes with bound arg (id: '123' from step 1's mock output)
      expect(engine._executeHttp).toHaveBeenNthCalledWith(
        2,
        'workflow_step2',
        expect.anything(),
        { id: '123' },
        null,
        { timeoutMs: undefined }
      );
    });

    it('fails clearly on missing required binding', async () => {
      // missing_binding_workflow runs workflow_step2 with no bindings and no initialArgs
      await expect(engine.runWorkflow('missing_binding_workflow', {}, null)).rejects.toThrow(/invalid initial arguments.*\"id\"/is);
    });
  });

  describe('Workflow IF/ELSE branching', () => {
    it('evaluates IF branch correctly against step outputs', async () => {
      manifest.actions.step_gate = { permission: 'PUBLIC', endpoint: { path: '/gate', method: 'GET' }, input: {} };
      manifest.actions.step_then = { permission: 'PUBLIC', endpoint: { path: '/then', method: 'GET' }, input: {} };
      manifest.actions.step_else = { permission: 'PUBLIC', endpoint: { path: '/else', method: 'GET' }, input: {} };
      manifest.workflows.push({
        name: 'test_branch_workflow',
        steps: [
          'step_gate',
          { if: 'step_gate.success', then: ['step_then'], else: ['step_else'] }
        ]
      });

      engine._executeHttp = vi.fn().mockImplementation(async (actionName) => {
        if (actionName === 'step_gate') return { success: true };
        return { done: true };
      });

      await engine.runWorkflow('test_branch_workflow', {}, null);
      
      expect(engine._executeHttp).toHaveBeenCalledWith('step_gate', expect.anything(), expect.anything(), null, { timeoutMs: undefined });
      expect(engine._executeHttp).toHaveBeenCalledWith('step_then', expect.anything(), expect.anything(), null, { timeoutMs: undefined });
      expect(engine._executeHttp).not.toHaveBeenCalledWith('step_else', expect.anything(), expect.anything(), null, { timeoutMs: undefined });
    });

    it('evaluates ELSE branch correctly against step outputs', async () => {
      manifest.actions.step_gate = { permission: 'PUBLIC', endpoint: { path: '/gate', method: 'GET' }, input: {} };
      manifest.actions.step_then = { permission: 'PUBLIC', endpoint: { path: '/then', method: 'GET' }, input: {} };
      manifest.actions.step_else = { permission: 'PUBLIC', endpoint: { path: '/else', method: 'GET' }, input: {} };
      manifest.workflows.push({
        name: 'test_branch_workflow_false',
        steps: [
          'step_gate',
          { if: 'step_gate.success', then: ['step_then'], else: ['step_else'] }
        ]
      });

      engine._executeHttp = vi.fn().mockImplementation(async (actionName) => {
        if (actionName === 'step_gate') return { success: false };
        return { done: true };
      });

      await engine.runWorkflow('test_branch_workflow_false', {}, null);
      
      expect(engine._executeHttp).toHaveBeenCalledWith('step_gate', expect.anything(), expect.anything(), null, { timeoutMs: undefined });
      expect(engine._executeHttp).not.toHaveBeenCalledWith('step_then', expect.anything(), expect.anything(), null, { timeoutMs: undefined });
      expect(engine._executeHttp).toHaveBeenCalledWith('step_else', expect.anything(), expect.anything(), null, { timeoutMs: undefined });
    });
  });
});

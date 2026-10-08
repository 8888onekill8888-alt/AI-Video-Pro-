import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { creditCosts, planLimits, type CreditOperation } from '@storyflix/shared';

export interface CreditReceipt {
  id: string;
  operation: CreditOperation;
  amount: number;
  balance: number;
  createdAt: string;
  metadata: Record<string, unknown>;
}

export class InsufficientCreditsError extends Error {
  readonly statusCode = 402;
  constructor(readonly balance: number, readonly required: number) { super(`Insufficient credits: ${required} required, ${balance} available`); }
}

export class CreditLedger {
  private readonly balances = new Map<string, number>();
  private readonly entries = new Map<string, CreditReceipt[]>();
  private readonly pool: Pool | undefined;
  private readonly costs;

  constructor(private readonly env: Record<string, string | undefined> = process.env) {
    this.costs = creditCosts(env);
    if (env.DATABASE_URL) this.pool = new Pool({ connectionString: env.DATABASE_URL, max: 8, ssl: env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : undefined });
  }

  estimate(operation: CreditOperation, units = 1): number {
    return this.costs[operation] * Math.max(1, Math.ceil(units));
  }

  async balance(userId: string): Promise<{ balance: number; plan: 'FREE' | 'PRO'; limits: ReturnType<typeof planLimits> }> {
    if (this.pool) {
      await this.pool.query('INSERT INTO credits (user_id, balance, plan_id) VALUES ($1,$2,\'FREE\') ON CONFLICT (user_id) DO NOTHING', [userId, planLimits('FREE', this.env).creditsMonthly]);
      const result = await this.pool.query<{ balance: number; plan_id: string }>('SELECT balance, plan_id FROM credits WHERE user_id=$1', [userId]);
      const row = result.rows[0];
      const plan = row?.plan_id === 'PRO' ? 'PRO' : 'FREE';
      return { balance: row?.balance ?? 0, plan, limits: planLimits(plan, this.env) };
    }
    if (!this.balances.has(userId)) this.balances.set(userId, planLimits('FREE', this.env).creditsMonthly);
    return { balance: this.balances.get(userId) ?? 0, plan: 'FREE', limits: planLimits('FREE', this.env) };
  }

  async charge(userId: string, operation: CreditOperation, metadata: Record<string, unknown> = {}, units = 1): Promise<CreditReceipt> {
    const amount = this.estimate(operation, units);
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('INSERT INTO credits (user_id, balance, plan_id) VALUES ($1,$2,\'FREE\') ON CONFLICT (user_id) DO NOTHING', [userId, planLimits('FREE', this.env).creditsMonthly]);
        const { rows } = await client.query<{ balance: number }>('SELECT balance FROM credits WHERE user_id=$1 FOR UPDATE', [userId]);
        const balance = rows[0]?.balance ?? 0;
        if (balance < amount) throw new InsufficientCreditsError(balance, amount);
        const nextBalance = balance - amount;
        await client.query('UPDATE credits SET balance=$2, updated_at=NOW() WHERE user_id=$1', [userId, nextBalance]);
        const id = randomUUID();
        const createdAt = new Date().toISOString();
        await client.query('INSERT INTO credit_transactions (id, user_id, operation, amount, balance_after, metadata, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, userId, operation, -amount, nextBalance, metadata, createdAt]);
        await client.query('COMMIT');
        return { id, operation, amount, balance: nextBalance, createdAt, metadata };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    }
    const current = (await this.balance(userId)).balance;
    if (current < amount) throw new InsufficientCreditsError(current, amount);
    const balance = current - amount;
    this.balances.set(userId, balance);
    const receipt = { id: randomUUID(), operation, amount, balance, createdAt: new Date().toISOString(), metadata };
    this.entries.set(userId, [receipt, ...(this.entries.get(userId) ?? [])]);
    return receipt;
  }

  async history(userId: string, limit = 50): Promise<CreditReceipt[]> {
    if (this.pool) {
      const { rows } = await this.pool.query<{ id: string; operation: CreditOperation; amount: number; balance_after: number; metadata: Record<string, unknown>; created_at: Date }>('SELECT id, operation, amount, balance_after, metadata, created_at FROM credit_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', [userId, limit]);
      return rows.map((row) => ({ id: row.id, operation: row.operation, amount: Math.abs(row.amount), balance: row.balance_after, metadata: row.metadata, createdAt: row.created_at.toISOString() }));
    }
    return (this.entries.get(userId) ?? []).slice(0, limit);
  }

  async refund(userId: string, receipt: CreditReceipt, reason: string): Promise<void> {
    const metadata = { refundFor: receipt.id, reason };
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const prior = await client.query("SELECT id FROM credit_transactions WHERE user_id=$1 AND metadata->>'refundFor'=$2 LIMIT 1", [userId, receipt.id]);
        if (prior.rowCount) { await client.query('COMMIT'); return; }
        await client.query('UPDATE credits SET balance=balance+$2, updated_at=NOW() WHERE user_id=$1', [userId, receipt.amount]);
        const { rows } = await client.query<{ balance: number }>('SELECT balance FROM credits WHERE user_id=$1', [userId]);
        await client.query('INSERT INTO credit_transactions (id, user_id, operation, amount, balance_after, metadata, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())', [randomUUID(), userId, receipt.operation, receipt.amount, rows[0]?.balance ?? 0, metadata]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
      return;
    }
    const history = this.entries.get(userId) ?? [];
    if (history.some((entry) => entry.metadata.refundFor === receipt.id)) return;
    const balance = (this.balances.get(userId) ?? 0) + receipt.amount;
    this.balances.set(userId, balance);
    this.entries.set(userId, [{ ...receipt, id: randomUUID(), balance, metadata }, ...history]);
  }

  async close(): Promise<void> { await this.pool?.end(); }
}
import { Request, Response } from 'express';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import { pool } from '../config/database';

const tracer = trace.getTracer('bank-account-service');

interface TransferPayload {
  fromAccount: string;
  toAccount:   string;
  amount:      number;
}

export class AccountController {
  // ────────────────────────────────────────────────────────────────
  // POST /api/v1/accounts/execute-transfer
  // ────────────────────────────────────────────────────────────────
  async executeTransfer(req: Request, res: Response): Promise<void> {
    const span = tracer.startSpan('account.execute_transfer');

    await context.with(trace.setSpan(context.active(), span), async () => {
      const client = await pool.connect();

      try {
        const { fromAccount, toAccount, amount } = req.body as TransferPayload;

        span.setAttribute('transfer.from_account', fromAccount);
        span.setAttribute('transfer.to_account',   toAccount);
        span.setAttribute('transfer.amount',        amount);

        await client.query('BEGIN');

        // ── 1. Obtener cuenta origen con bloqueo pesimista ──────────
        const originResult = await client.query<{
          id: string; balance: string; owner: string;
        }>(
          `SELECT id, balance, owner
           FROM accounts
           WHERE account_number = $1
           FOR UPDATE`,
          [fromAccount]
        );

        if (originResult.rowCount === 0) {
          await client.query('ROLLBACK');
          span.setAttribute('error.type', 'ACCOUNT_NOT_FOUND');
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Cuenta origen no encontrada' });
          res.status(404).json({ error: `Cuenta origen ${fromAccount} no encontrada` });
          return;
        }

        const originAccount = originResult.rows[0];
        const currentBalance = parseFloat(originAccount.balance);

        span.setAttribute('account.owner',           originAccount.owner);
        span.setAttribute('account.current_balance', currentBalance);

        // ── 2. Validar saldo suficiente ─────────────────────────────
        if (currentBalance < amount) {
          await client.query('ROLLBACK');

          // Registrar el intento fallido en la tabla de transferencias
          await pool.query(
            `INSERT INTO transfers (from_account, to_account, amount, status, failure_reason)
             VALUES ($1, $2, $3, 'FAILED', $4)`,
            [fromAccount, toAccount, amount, 'Saldo insuficiente']
          );

          span.setAttribute('error.type',          'INSUFFICIENT_FUNDS');
          span.setAttribute('account.balance',      currentBalance);
          span.setAttribute('transfer.amount_requested', amount);
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Saldo insuficiente' });

          res.status(400).json({
            error:           'Saldo insuficiente',
            availableBalance: currentBalance,
            requestedAmount:  amount,
            shortBy:          amount - currentBalance,
          });
          return;
        }

        // ── 3. Verificar que la cuenta destino existe ───────────────
        const destResult = await client.query<{ id: string }>(
          `SELECT id FROM accounts WHERE account_number = $1`,
          [toAccount]
        );

        if (destResult.rowCount === 0) {
          await client.query('ROLLBACK');
          span.setAttribute('error.type', 'DEST_ACCOUNT_NOT_FOUND');
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Cuenta destino no encontrada' });
          res.status(404).json({ error: `Cuenta destino ${toAccount} no encontrada` });
          return;
        }

        // ── 4. Ejecutar la transferencia ────────────────────────────
        const updateOriginResult = await client.query<{ balance: string }>(
          `UPDATE accounts
           SET balance = balance - $1
           WHERE account_number = $2
           RETURNING balance`,
          [amount, fromAccount]
        );

        await client.query(
          `UPDATE accounts
           SET balance = balance + $1
           WHERE account_number = $2`,
          [amount, toAccount]
        );

        // ── 5. Registrar la transferencia exitosa ───────────────────
        const transferRecord = await client.query<{ id: string; created_at: Date }>(
          `INSERT INTO transfers (from_account, to_account, amount, status)
           VALUES ($1, $2, $3, 'SUCCESS')
           RETURNING id, created_at`,
          [fromAccount, toAccount, amount]
        );

        await client.query('COMMIT');

        const newBalance  = parseFloat(updateOriginResult.rows[0].balance);
        const transferId  = transferRecord.rows[0].id;
        const processedAt = transferRecord.rows[0].created_at;

        span.setAttribute('transfer.id',          transferId);
        span.setAttribute('account.new_balance',  newBalance);
        span.setStatus({ code: SpanStatusCode.OK });

        console.log(`[MS-B] Transferencia exitosa: ${transferId} — $${amount} de ${fromAccount} a ${toAccount}`);

        res.status(200).json({
          transferId,
          newBalance,
          processedAt,
        });

      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        const error = err as Error;

        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        console.error('[MS-B] Error al ejecutar transferencia:', error);

        res.status(500).json({ error: 'Error interno del servidor' });
      } finally {
        client.release();
        span.end();
      }
    });
  }

  // ────────────────────────────────────────────────────────────────
  // GET /api/v1/accounts/:accountNumber
  // ────────────────────────────────────────────────────────────────
  async getAccount(req: Request, res: Response): Promise<void> {
    const span = tracer.startSpan('account.get_by_number');

    await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const { accountNumber } = req.params;
        span.setAttribute('account.number', accountNumber);

        const result = await pool.query<{
          account_number: string; owner: string; balance: string; created_at: Date;
        }>(
          `SELECT account_number, owner, balance, created_at
           FROM accounts
           WHERE account_number = $1`,
          [accountNumber]
        );

        if (result.rowCount === 0) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Cuenta no encontrada' });
          res.status(404).json({ error: 'Cuenta no encontrada' });
          return;
        }

        const account = result.rows[0];
        span.setAttribute('account.owner',   account.owner);
        span.setAttribute('account.balance', parseFloat(account.balance));
        span.setStatus({ code: SpanStatusCode.OK });

        res.status(200).json({
          accountNumber: account.account_number,
          owner:         account.owner,
          balance:       parseFloat(account.balance),
          createdAt:     account.created_at,
        });
      } catch (err) {
        const error = err as Error;
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        res.status(500).json({ error: 'Error interno del servidor' });
      } finally {
        span.end();
      }
    });
  }
}
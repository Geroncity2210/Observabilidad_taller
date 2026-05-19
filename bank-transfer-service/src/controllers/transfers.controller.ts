import { Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import { SeverityNumber } from '@opentelemetry/api-logs';
import { getLogger } from '../config/tracing';

const MS_B_URL = process.env.MS_B_URL || 'http://localhost:8081';
const tracer   = trace.getTracer('bank-transfer-service');
const logger   = getLogger('transfer-controller');

export interface TransferRequest {
  fromAccount: string;
  toAccount:   string;
  amount:      number;
} 

export class TransferController {
  async initiateTransfer(req: Request, res: Response): Promise<void> {
    const span = tracer.startSpan('transfer.initiate');

    await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const body = req.body as TransferRequest;

        if (!body.fromAccount || !body.toAccount || !body.amount) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Payload inválido' });
          span.setAttribute('error.type', 'VALIDATION_ERROR');

          logger.emit({
            severityNumber: SeverityNumber.WARN,
            severityText: 'WARN',
            body: 'Transferencia rechazada: payload inválido',
            attributes: { 'error.type': 'VALIDATION_ERROR' },
          });

          res.status(400).json({ error: 'fromAccount, toAccount y amount son requeridos' });
          return;
        }

        if (body.amount <= 0) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Monto debe ser mayor a 0' });
          span.setAttribute('error.type', 'VALIDATION_ERROR');

          logger.emit({
            severityNumber: SeverityNumber.WARN,
            severityText: 'WARN',
            body: 'Transferencia rechazada: monto inválido',
            attributes: {
              'transfer.from_account': body.fromAccount,
              'error.type':            'INVALID_AMOUNT',
            },
          });

          res.status(400).json({ error: 'El monto debe ser mayor a 0' });
          return;
        }

        span.setAttribute('transfer.from_account', body.fromAccount);
        span.setAttribute('transfer.to_account',   body.toAccount);

        console.log(`[MS-A] Iniciando transferencia: ${body.fromAccount} → ${body.toAccount}`);

        const response = await axios.post(`${MS_B_URL}/api/v1/accounts/execute-transfer`, body, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        });

        span.setAttribute('transfer.status', 'SUCCESS');
        span.setStatus({ code: SpanStatusCode.OK });

        logger.emit({
          severityNumber: SeverityNumber.INFO,
          severityText: 'INFO',
          body: `El cliente de la cuenta ${body.fromAccount} realizó una transferencia con id ${response.data.transferId} hacia ${body.toAccount}`,
          attributes: {
            'transfer.id':           response.data.transferId,
            'transfer.from_account': body.fromAccount,
            'transfer.to_account':   body.toAccount,
            'transfer.status':       'SUCCESS',
          },
        });

        res.status(200).json({
          message:     'Transferencia exitosa',
          transferId:  response.data.transferId,
          fromAccount: body.fromAccount,
          toAccount:   body.toAccount,
          amount:      body.amount,
          newBalance:  response.data.newBalance,
          processedAt: response.data.processedAt,
        });

      } catch (err) {
        const axiosErr    = err as AxiosError<{ error: string }>;
        const statusCode  = axiosErr.response?.status || 500;
        const errorDetail = axiosErr.response?.data?.error || 'Error interno en MS-B';

        span.recordException(axiosErr);
        span.setAttribute('transfer.status', 'FAILED');
        span.setAttribute('error.status_code', statusCode);
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorDetail });

        logger.emit({
          severityNumber: SeverityNumber.ERROR,
          severityText: 'ERROR',
          body: `Transferencia fallida desde ${(req.body as TransferRequest).fromAccount} hacia ${(req.body as TransferRequest).toAccount}: ${errorDetail}`,
          attributes: {
            'transfer.from_account': (req.body as TransferRequest).fromAccount,
            'transfer.to_account':   (req.body as TransferRequest).toAccount,
            'transfer.status':       'FAILED',
            'error.detail':          errorDetail,
            'error.status_code':     statusCode,
          },
        });

        console.error(`[MS-A] Error en transferencia:`, errorDetail);
        res.status(statusCode).json({ error: errorDetail });
      } finally {
        span.end();
      }
    });
  }
}
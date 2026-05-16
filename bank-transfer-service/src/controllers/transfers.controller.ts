import { Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';

const MS_B_URL = process.env.MS_B_URL || 'http://localhost:8081';
const tracer   = trace.getTracer('bank-transfer-service');

export interface TransferRequest {
  fromAccount: string;
  toAccount:   string;
  amount:      number;
}

export class TransferController {
  async initiateTransfer(req: Request, res: Response): Promise<void> {
    // Span manual para el flujo de negocio (la llamada HTTP a MS-B ya se instrumenta sola)
    const span = tracer.startSpan('transfer.initiate');

    await context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const body = req.body as TransferRequest;

        // Validación básica de entrada
        if (!body.fromAccount || !body.toAccount || !body.amount) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Payload inválido' });
          span.setAttribute('error.type', 'VALIDATION_ERROR');
          res.status(400).json({ error: 'fromAccount, toAccount y amount son requeridos' });
          return;
        }

        if (body.amount <= 0) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Monto debe ser mayor a 0' });
          span.setAttribute('error.type', 'VALIDATION_ERROR');
          res.status(400).json({ error: 'El monto debe ser mayor a 0' });
          return;
        }

        // Añadir atributos de negocio al span para verlos en New Relic
        span.setAttribute('transfer.from_account', body.fromAccount);
        span.setAttribute('transfer.to_account',   body.toAccount);
        span.setAttribute('transfer.amount',        body.amount);

        console.log(`[MS-A] Iniciando transferencia: ${body.fromAccount} → ${body.toAccount} por $${body.amount}`);

        // La auto-instrumentación de axios inyecta el header `traceparent` W3C
        // automáticamente, enlazando esta traza con la del MS-B
        const response = await axios.post(`${MS_B_URL}/api/v1/accounts/execute-transfer`, body, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
        });

        span.setAttribute('transfer.status', 'SUCCESS');
        span.setStatus({ code: SpanStatusCode.OK });

        res.status(200).json({
          message:      'Transferencia exitosa',
          transferId:   response.data.transferId,
          fromAccount:  body.fromAccount,
          toAccount:    body.toAccount,
          amount:       body.amount,
          newBalance:   response.data.newBalance,
          processedAt:  response.data.processedAt,
        });
      } catch (err) {
        const axiosErr = err as AxiosError<{ error: string }>;
        const statusCode  = axiosErr.response?.status || 500;
        const errorDetail = axiosErr.response?.data?.error || 'Error interno en MS-B';

        span.recordException(axiosErr);
        span.setAttribute('transfer.status', 'FAILED');
        span.setAttribute('error.status_code', statusCode);
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorDetail });

        console.error(`[MS-A] Error en transferencia:`, errorDetail);

        res.status(statusCode).json({ error: errorDetail });
      } finally {
        span.end();
      }
    });
  }
}
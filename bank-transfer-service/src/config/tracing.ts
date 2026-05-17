import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';

const collectorUrl = process.env.OTEL_COLLECTOR_URL || 'http://localhost:4318';
const serviceName  = process.env.SERVICE_NAME || 'bank-transfer-service';

const traceExporter = new OTLPTraceExporter({
  url: `${collectorUrl}/v1/traces`,
});

export const sdk = new NodeSDK({
  resource: new Resource({
    'service.name':    serviceName,
    'service.version': '1.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
  }) as any,
  traceExporter: traceExporter as any,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        // Propagamos el contexto W3C automáticamente en cada request saliente
        enabled: true,
      },
    }),
  ],
});

sdk.start();
console.log(`[Tracing] SDK iniciado → servicio: "${serviceName}" → collector: ${collectorUrl}`);

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('[Tracing] SDK detenido correctamente'))
    .catch((err) => console.error('[Tracing] Error al detener SDK:', err))
    .finally(() => process.exit(0));
});
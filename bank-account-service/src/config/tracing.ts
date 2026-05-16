import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';

const collectorUrl = process.env.OTEL_COLLECTOR_URL || 'http://localhost:4318';
const serviceName  = process.env.SERVICE_NAME || 'bank-account-service';

const traceExporter = new OTLPTraceExporter({
  url: `${collectorUrl}/v1/traces`,
});

export const sdk = new NodeSDK({
  resource: new Resource({
    'service.name':    serviceName,
    'service.version': '1.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
  }),
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      // La instrumentación de `pg` captura automáticamente cada query SQL
      // como un span hijo con la query exacta y duración
      '@opentelemetry/instrumentation-pg': { enabled: true },
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
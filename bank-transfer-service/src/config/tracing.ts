import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource, resourceFromAttributes } from '@opentelemetry/resources';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { logs } from '@opentelemetry/api-logs';

const collectorUrl = process.env.OTEL_COLLECTOR_URL || 'http://localhost:4318';
const serviceName  = process.env.SERVICE_NAME || 'bank-transfer-service'; // cambiar en MS-B

const resource = resourceFromAttributes({
  'service.name':           serviceName,
  'service.version':        '1.0.0',
  'deployment.environment': process.env.NODE_ENV || 'development',
});

const traceExporter = new OTLPTraceExporter({
  url: `${collectorUrl}/v1/traces`,
});

const logExporter = new OTLPLogExporter({
  url: `${collectorUrl}/v1/logs`,
});

const metricExporter = new OTLPMetricExporter({
  url: `${collectorUrl}/v1/metrics`,
});

// ← LoggerProvider con processor en el constructor
const loggerProvider = new LoggerProvider({
  resource: resource as any,
  processors: [new SimpleLogRecordProcessor(logExporter)], // ← aquí en vez de addLogRecordProcessor
});

logs.setGlobalLoggerProvider(loggerProvider as any);

export const sdk = new NodeSDK({
  resource: resource as any,
  spanProcessors: [new SimpleSpanProcessor(traceExporter as any)],
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter as any,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-http': { enabled: true }, // cambiar a instrumentation-pg en MS-B
    }),
  ],
});

sdk.start();
console.log(`[Tracing] SDK iniciado → servicio: "${serviceName}" → collector: ${collectorUrl}`);

export const getLogger = (name: string) => logs.getLogger(name);

process.on('SIGTERM', () => {
  Promise.all([sdk.shutdown(), loggerProvider.shutdown()])
    .then(() => console.log('[Tracing] SDK detenido correctamente'))
    .catch((err) => console.error('[Tracing] Error al detener SDK:', err))
    .finally(() => process.exit(0));
});
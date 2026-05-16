FROM otel/opentelemetry-collector-contrib:0.100.0

COPY otel-collector-config.yaml /etc/otelcol-contrib/config.yaml

# Cloud Run usa el puerto 8080 para health checks HTTP
EXPOSE 4317 4318 8888

CMD ["--config=/etc/otelcol-contrib/config.yaml"]
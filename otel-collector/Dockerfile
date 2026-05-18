FROM otel/opentelemetry-collector-contrib:0.100.0

COPY otel-collector-config.yaml /etc/otelcol-contrib/config.yaml

EXPOSE 8080 4317 4318

CMD ["--config=/etc/otelcol-contrib/config.yaml"]
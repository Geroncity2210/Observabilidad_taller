// CRÍTICO: tracing.ts debe ser la primera importación de todo el proyecto
import './config/tracing';

import express from 'express';
import { transferRoutes } from './routes/transfer.routes';

const app  = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Health check requerido por Cloud Run
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'bank-transfer-service' });
});

app.use('/api/v1/transfers', transferRoutes);

app.listen(PORT, () => {
  console.log(`[MS-A] bank-transfer-service corriendo en puerto ${PORT}`);
});
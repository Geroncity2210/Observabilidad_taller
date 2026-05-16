// CRÍTICO: tracing.ts debe ser la primera importación
import './config/tracing';

import express from 'express';
import { accountRoutes } from './routes/account.routes';

const app  = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Health check requerido por Cloud Run
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'bank-account-service' });
});

app.use('/api/v1/accounts', accountRoutes);

app.listen(PORT, () => {
  console.log(`[MS-B] bank-account-service corriendo en puerto ${PORT}`);
});
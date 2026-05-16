import { Router } from 'express';
import { TransferController } from '../controllers/transfers.controller';

export const transferRoutes = Router();
const controller = new TransferController();

// POST /api/v1/transfers
transferRoutes.post('/', controller.initiateTransfer.bind(controller));
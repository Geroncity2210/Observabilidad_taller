import { Router } from 'express';
import { AccountController } from './../controllers/account.controller';

export const accountRoutes = Router();
const controller = new AccountController();

// POST /api/v1/accounts/execute-transfer  ← llamado por MS-A
accountRoutes.post('/execute-transfer', controller.executeTransfer.bind(controller));

// GET  /api/v1/accounts/:accountNumber   ← consulta pública de saldo
accountRoutes.get('/:accountNumber', controller.getAccount.bind(controller));
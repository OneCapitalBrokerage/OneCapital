import express from 'express';
import { getStockName, getAllStockNames } from '../Controllers/market/instrumentStockNameControllers.js';

const router = express.Router();

// ✅ Properly bind controller to route
router.get('/instrumentGetName', getStockName);
router.get('/instrumentGetAllNames', getAllStockNames);

export default router;

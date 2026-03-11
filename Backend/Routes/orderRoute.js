import { postOrder, getOrderInstrument, updateOrder, exitAllOpenOrder, deleteOrder, deleteAllClosedOrders } from '../Controllers/legacy/orderController.js';
import { requireTrading } from '../Middleware/restrictionMiddleware.js';
import { protect } from '../Middleware/authMiddleware.js';
import express from "express";

const router = express.Router();

router.post('/postOrder', protect, requireTrading, postOrder);
router.get('/getOrderInstrument', getOrderInstrument);
router.post('/updateOrder', protect, requireTrading, updateOrder);
router.put('/exitAllOpenOrder', protect, requireTrading, exitAllOpenOrder);

// Delete Routes
router.post('/deleteOrder', protect, requireTrading, deleteOrder);
router.post('/deleteAllClosedOrders', protect, requireTrading, deleteAllClosedOrders);

export default router;

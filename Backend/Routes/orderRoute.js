import { postOrder, getOrderInstrument, updateOrder, exitAllOpenOrder, deleteOrder, deleteAllClosedOrders } from '../Controllers/legacy/orderController.js';
import { requireTrading } from '../Middleware/restrictionMiddleware.js';
import { checkDealerModeTrading } from '../Middleware/checkDealerMode.js';
import { protect } from '../Middleware/authMiddleware.js';
import express from "express";

const router = express.Router();

router.post('/postOrder', protect, requireTrading, checkDealerModeTrading, postOrder);
router.get('/getOrderInstrument', getOrderInstrument);
router.post('/updateOrder', protect, requireTrading, checkDealerModeTrading, updateOrder);
router.put('/exitAllOpenOrder', protect, requireTrading, checkDealerModeTrading, exitAllOpenOrder);

// Delete Routes
router.post('/deleteOrder', protect, requireTrading, checkDealerModeTrading, deleteOrder);
router.post('/deleteAllClosedOrders', protect, requireTrading, checkDealerModeTrading, deleteAllClosedOrders);

export default router;

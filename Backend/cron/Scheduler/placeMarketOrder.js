import mongoose from 'mongoose';
import { getKiteLTP } from '../../services/kiteQuote.js';
import Order from '../../Model/Trading/OrdersModel.js';
import { closeOrderAndSettle } from '../../services/closeOrderAndSettle.js';
import { removeFromWatchlist } from '../../Utils/OrderManager.js';

// ---------------------------------------------------------
// HELPER: Fetch Live LTP (Using Kite Quote API)
// ---------------------------------------------------------
async function getLiveLtp(instrumentToken) {
    try {
        if (!instrumentToken) return 0;
        const data = await getKiteLTP([instrumentToken]);
        if (data && data[instrumentToken] && data[instrumentToken].last_price) {
            return data[instrumentToken].last_price;
        }
        return 0;
    } catch (err) {
        console.error('[getLiveLtp] API Error:', err.message);
        return 0;
    }
}

// ---------------------------------------------------------
// MAIN: placeMarketOrder — close order via closeOrderAndSettle
// ---------------------------------------------------------
async function placeMarketOrder(orderId) {
    if (!orderId) {
        return { ok: false, error: 'orderId is required' };
    }

    try {
        // 1. Fetch order details
        let order = null;
        if (mongoose.Types.ObjectId.isValid(orderId)) {
            order = await Order.findById(orderId).lean();
        }
        if (!order) {
            order = await Order.findOne({ order_id: orderId }).lean();
        }
        if (!order) {
            return { ok: false, error: 'Order not found' };
        }

        // 2. Fetch live LTP
        const tokenToFetch = order.instrument_token || order.security_Id;
        let currentLtp = await getLiveLtp(tokenToFetch);

        // Fallback to stored price if API fails
        if (!currentLtp || currentLtp === 0) {
            currentLtp = Number(order.ltp) || Number(order.price);
            console.log(`[placeMarketOrder] API fetch failed. Using stored price: ${currentLtp}`);
        }

        // 3. Determine cameFrom
        const orderStatus = order.status || order.order_status || '';
        const orderCategory = order.category || order.order_category || '';
        let cameFrom = 'Hold';
        if (orderStatus === 'OPEN') cameFrom = 'Open';
        else if (orderCategory === 'OVERNIGHT' || order.product === 'NRML' || order.product === 'CNC') cameFrom = 'Overnight';
        else if (orderStatus === 'HOLD') cameFrom = 'Hold';

        // 4. Use unified close + settle service
        const result = await closeOrderAndSettle(order._id, {
            exitPrice: Number(Number(currentLtp).toFixed(2)),
            exitReason: 'square_off',
            cameFrom,
        });

        if (result.ok) {
            await removeFromWatchlist(result.order || {
                _id: order._id,
                instrument_token: order.instrument_token || order.security_Id,
            });
            console.log(`[placeMarketOrder] Order ${order._id} closed at ₹${currentLtp}. P&L: ₹${result.pnl?.netPnl ?? 'N/A'}`);
        }

        return result;

    } catch (err) {
        console.error('[placeMarketOrder] Error:', err);
        return { ok: false, error: err.message || String(err) };
    }
}

export { placeMarketOrder };
export default placeMarketOrder;

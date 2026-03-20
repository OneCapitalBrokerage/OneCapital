import mongoose from 'mongoose';
import Order from '../../Model/Trading/OrdersModel.js';
import { closeOrderAndSettle } from '../../services/closeOrderAndSettle.js';
import { removeFromWatchlist } from '../../Utils/OrderManager.js';
import { getCachedLtp } from '../../services/livePriceCache.js';

function resolveExitPrice(order, opts = {}) {
    const providedExitPrice = Number(opts.exitPrice);
    if (Number.isFinite(providedExitPrice) && providedExitPrice > 0) {
        return { price: providedExitPrice, priceSource: 'provided_exit_price' };
    }

    const tokenToFetch = order.instrument_token || order.security_Id;
    const { ltp: cachedLtp } = getCachedLtp(tokenToFetch, opts.snapshot || null);
    if (cachedLtp > 0) {
        return { price: cachedLtp, priceSource: 'feed_cache' };
    }

    const storedPrice = Number(order.ltp)
        || Number(order.effective_entry_price)
        || Number(order.price)
        || 0;

    if (storedPrice > 0) {
        return { price: storedPrice, priceSource: 'stored_price_fallback' };
    }

    return { price: 0, priceSource: 'unavailable' };
}

// ---------------------------------------------------------
// MAIN: placeMarketOrder — close order via closeOrderAndSettle
// ---------------------------------------------------------
async function placeMarketOrder(orderId, opts = {}) {
    if (!orderId) {
        return { ok: false, error: 'orderId is required' };
    }

    try {
        // 1. Fetch order details
        let order = opts.order || null;
        if (!order && mongoose.Types.ObjectId.isValid(orderId)) {
            order = await Order.findById(orderId).lean();
        }
        if (!order) {
            order = await Order.findOne({ order_id: orderId }).lean();
        }
        if (!order) {
            return { ok: false, error: 'Order not found' };
        }

        // 2. Resolve exit price from feed cache first, stored price second
        const { price: currentLtp, priceSource } = resolveExitPrice(order, opts);
        if (!currentLtp || currentLtp <= 0) {
            console.warn(`[placeMarketOrder] No usable exit price for order ${order._id}`);
            return { ok: false, error: 'exit_price_unavailable', priceSource };
        }

        // 3. Determine cameFrom
        const orderStatus = order.status || order.order_status || '';
        const orderCategory = order.category || order.order_category || '';
        let cameFrom = 'Open';
        if (orderCategory === 'OVERNIGHT' || order.product === 'NRML' || order.product === 'CNC') cameFrom = 'Overnight';
        else if (orderStatus === 'HOLD') cameFrom = 'Hold';

        // 4. Use unified close + settle service
        const result = await closeOrderAndSettle(order._id, {
            exitPrice: Number(Number(currentLtp).toFixed(2)),
            exitReason: 'square_off',
            cameFrom,
            closedAt: opts.closedAt || null,
        });

        if (result.ok) {
            await removeFromWatchlist(result.order || {
                _id: order._id,
                instrument_token: order.instrument_token || order.security_Id,
            });
            console.log(`[placeMarketOrder] Order ${order._id} closed at ₹${currentLtp} via ${priceSource}. P&L: ₹${result.pnl?.netPnl ?? 'N/A'}`);
        }

        return {
            ...result,
            priceSource,
        };

    } catch (err) {
        console.error('[placeMarketOrder] Error:', err);
        return { ok: false, error: err.message || String(err) };
    }
}

export { placeMarketOrder };
export default placeMarketOrder;

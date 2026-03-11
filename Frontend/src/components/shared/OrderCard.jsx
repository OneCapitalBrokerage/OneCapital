import { useState } from 'react';

const OrderCard = ({
  order,
  onCancel,
  onModify,
  showActions = true,
}) => {
  const [showConfirm, setShowConfirm] = useState(false);

  const isBuy = order.side === 'BUY';
  const sideColor = isBuy ? 'text-primary' : 'text-red-500';
  const sideBgColor = isBuy ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-red-50 dark:bg-red-900/30';
  const productLabel = order.product === 'MIS' ? 'Intraday' : 'CNC';
  
  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusBadge = () => {
    const statusConfig = {
      OPEN: { bg: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', label: 'Open' },
      PENDING: { bg: 'bg-gray-100 dark:bg-[#16231d] text-gray-600 dark:text-[#9cb7aa]', label: 'Pending' },
      EXECUTED: { bg: 'bg-green-100 dark:bg-emerald-900/30 text-green-700 dark:text-emerald-400', label: 'Executed' },
      CANCELLED: { bg: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', label: 'Cancelled' },
      REJECTED: { bg: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', label: 'Rejected' },
    };
    const config = statusConfig[order.status] || statusConfig.PENDING;
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${config.bg}`}>
        {config.label}
      </span>
    );
  };

  const handleCancelClick = () => {
    setShowConfirm(true);
  };

  const confirmCancel = () => {
    onCancel?.(order.id);
    setShowConfirm(false);
  };

  return (
    <div className="bg-white dark:bg-[#111b17] rounded-xl shadow-sm border border-gray-100 dark:border-[#22352d] p-4 relative">
      {/* Confirm Cancel Dialog */}
      {showConfirm && (
        <div className="absolute inset-0 bg-white dark:bg-[#111b17] rounded-xl z-10 flex flex-col items-center justify-center p-4">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            Cancel this order?
          </p>
          <div className="flex gap-3">
            <button
              onClick={confirmCancel}
              className="px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg"
            >
              Yes, Cancel
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-lg"
            >
              No, Keep
            </button>
          </div>
        </div>
      )}

      {/* Header Row */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs font-bold uppercase px-1.5 py-0.5 rounded ${sideBgColor} ${sideColor}`}>
            {order.side}
          </span>
          <h3 className="font-bold text-gray-900 dark:text-[#e8f3ee] truncate">
            {order.symbol}
          </h3>
          <span className="text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-gray-700 px-1 rounded">
            {order.exchange}
          </span>
        </div>
        {getStatusBadge()}
      </div>

      {/* Order Details Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div>
          <span className="text-[10px] text-gray-400 uppercase block">Qty</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-[#e8f3ee]">
            {order.quantity}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-gray-400 uppercase block">Price</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-[#e8f3ee]">
            ₹{order.price?.toFixed(2) || 'MKT'}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-gray-400 uppercase block">Type</span>
          <span className="text-sm font-medium text-gray-600 dark:text-[#9cb7aa]">
            {order.orderType}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-gray-400 uppercase block">Product</span>
          <span className="text-sm font-medium text-gray-600 dark:text-[#9cb7aa]">
            {productLabel}
          </span>
        </div>
      </div>

      {/* Footer Row */}
      <div className="flex justify-between items-center pt-2 border-t border-gray-100 dark:border-[#22352d]">
        <span className="text-xs text-gray-400">
          {formatTime(order.createdAt)}
        </span>
        
        {showActions && order.status === 'OPEN' && (
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              onClick={() => onModify?.(order)}
              className="text-xs font-semibold text-primary hover:text-blue-600 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">edit</span>
              Modify
            </button>
            <button
              onClick={handleCancelClick}
              className="text-xs font-semibold text-red-500 hover:text-red-600 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">close</span>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderCard;

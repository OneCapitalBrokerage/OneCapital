import { useState } from 'react';

const BuySellModal = ({ 
  isOpen, 
  onClose, 
  stock,
  initialSide = 'BUY',
  onSubmit 
}) => {
  const [side, setSide] = useState(initialSide);
  const [product, setProduct] = useState('MIS'); // MIS or CNC
  const [orderType, setOrderType] = useState('MARKET'); // MARKET, SL, TGT
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(stock?.ltp || 0);
  const [stopLoss, setStopLoss] = useState('');
  const [target, setTarget] = useState('');

  if (!isOpen || !stock) return null;

  const isBuy = side === 'BUY';
  const headerColor = isBuy ? 'bg-primary' : 'bg-red-500';
  const isPositive = stock.change >= 0;
  const changeColor = isPositive ? 'text-[#8dfcba]' : 'text-red-300';

  const handleSubmit = () => {
    onSubmit?.({
      symbol: stock.symbol,
      side,
      product,
      orderType,
      quantity,
      price: orderType === 'MARKET' ? null : price,
      stopLoss: orderType === 'SL' ? stopLoss : null,
      target: orderType === 'TGT' ? target : null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative w-full max-w-md bg-white dark:bg-[#111b17] rounded-t-2xl sm:rounded-xl shadow-2xl transform transition-all overflow-hidden flex flex-col mx-auto max-h-[90vh]">
        {/* Header */}
        <div className={`${headerColor} px-5 py-4 text-white shrink-0`}>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-xl font-bold tracking-tight flex items-center gap-2">
                {side} {stock.symbol}
              </h3>
              <div className="flex items-center gap-2 mt-1 text-white/80 text-sm">
                <span className="font-medium bg-white/20 px-1 rounded text-xs text-white">
                  {stock.exchange}
                </span>
                <span className="font-medium">₹{stock.ltp?.toFixed(2)}</span>
                <span className={`${changeColor} font-medium`}>
                  {isPositive ? '+' : ''}{stock.change?.toFixed(2)} ({isPositive ? '+' : ''}{stock.changePercent?.toFixed(2)}%)
                </span>
              </div>
            </div>
            
            {/* Buy/Sell Toggle */}
            <div className="flex flex-col items-end gap-1">
              <label className="flex items-center cursor-pointer relative">
                <input
                  type="checkbox"
                  checked={isBuy}
                  onChange={() => setSide(isBuy ? 'SELL' : 'BUY')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-white/30 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-white/40"></div>
                <span className="ml-2 text-xs font-bold uppercase text-white">{side}</span>
              </label>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-6 overflow-y-auto">
          {/* Product Tabs - Intraday/Longterm */}
          <div className="flex p-1 bg-gray-100 dark:bg-[#0b120f] rounded-lg">
            <button
              onClick={() => setProduct('MIS')}
              className={`flex-1 py-2 text-center text-sm font-semibold rounded-md transition-all ${
                product === 'MIS'
                  ? 'bg-white dark:bg-[#16231d] text-primary shadow-sm'
                  : 'text-gray-500 dark:text-[#9cb7aa] hover:text-gray-700 dark:hover:text-[#e8f3ee]'
              }`}
            >
              Intraday <span className="text-[10px] font-normal opacity-75 ml-1">MIS</span>
            </button>
            <button
              onClick={() => setProduct('CNC')}
              className={`flex-1 py-2 text-center text-sm font-semibold rounded-md transition-all ${
                product === 'CNC'
                  ? 'bg-white dark:bg-[#16231d] text-primary shadow-sm'
                  : 'text-gray-500 dark:text-[#9cb7aa] hover:text-gray-700 dark:hover:text-[#e8f3ee]'
              }`}
            >
              Longterm <span className="text-[10px] font-normal opacity-75 ml-1">CNC</span>
            </button>
          </div>

          {/* Order Type */}
          <div className="flex gap-6 px-1">
            {['MARKET', 'SL', 'TGT'].map((type) => (
              <label key={type} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="orderType"
                  value={type}
                  checked={orderType === type}
                  onChange={() => setOrderType(type)}
                  className="w-4 h-4 text-primary border-gray-300 dark:border-[#22352d] focus:ring-primary"
                />
                <span className={`text-sm font-medium ${orderType === type ? 'text-gray-900 dark:text-[#e8f3ee]' : 'text-gray-500 dark:text-[#9cb7aa]'}`}>
                  {type}
                </span>
              </label>
            ))}
          </div>

          {/* Stop Loss Field */}
          {orderType === 'SL' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 dark:text-[#9cb7aa] uppercase tracking-wide">
                Stop-Loss Price (INR)
              </label>
              <input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Trigger Price"
                className="w-full bg-white dark:bg-[#0b120f] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-3 text-lg font-bold text-gray-900 dark:text-[#e8f3ee] focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-center"
              />
            </div>
          )}

          {/* Target Field */}
          {orderType === 'TGT' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 dark:text-[#9cb7aa] uppercase tracking-wide">
                Target Price (INR)
              </label>
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Target Price"
                className="w-full bg-white dark:bg-[#0b120f] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-3 text-lg font-bold text-gray-900 dark:text-[#e8f3ee] focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-center"
              />
            </div>
          )}

          {/* Quantity & Price */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 dark:text-[#9cb7aa] uppercase tracking-wide">Qty.</label>
              <div className="relative">
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  min="1"
                  className="w-full bg-white dark:bg-[#0b120f] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-3 text-lg font-bold text-gray-900 dark:text-[#e8f3ee] focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-center"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 dark:text-[#6f8b7f]">
                  Lot: 1
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 dark:text-[#9cb7aa] uppercase tracking-wide">Price</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                disabled={orderType === 'MARKET'}
                className="w-full bg-white dark:bg-[#0b120f] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-3 text-lg font-bold text-gray-900 dark:text-[#e8f3ee] focus:ring-2 focus:ring-primary focus:border-transparent outline-none text-center disabled:opacity-50"
              />
            </div>
          </div>

          {/* Margin Info */}
          <div className="flex justify-between items-center text-xs border-t border-gray-100 dark:border-[#22352d] pt-4">
            <span className="text-gray-500 dark:text-[#9cb7aa]">
              Margin required: <span className="text-gray-900 dark:text-[#e8f3ee] font-semibold">
                ₹{(quantity * price * 0.2).toFixed(2)}
              </span>
            </span>
            <span className="text-primary cursor-pointer hover:underline">
              Available: ₹25,430.00
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pb-4">
            <button
              onClick={handleSubmit}
              className={`flex-1 ${isBuy ? 'bg-primary hover:bg-blue-600 dark:shadow-[0_12px_24px_rgba(16,185,129,0.28)]' : 'bg-red-500 hover:bg-red-600 dark:shadow-[0_12px_24px_rgba(248,113,113,0.3)]'} text-white font-bold py-3.5 rounded-lg shadow-lg transition-all flex items-center justify-center gap-2 uppercase text-sm tracking-wide`}
            >
              Place {side} Order
            </button>
            <button
              onClick={onClose}
              className="px-5 py-3.5 text-gray-500 font-bold hover:bg-gray-100 dark:hover:bg-[#16231d] rounded-lg transition-colors uppercase text-sm tracking-wide"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuySellModal;

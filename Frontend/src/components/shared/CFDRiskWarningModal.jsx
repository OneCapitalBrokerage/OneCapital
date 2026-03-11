import { useEffect, useState } from 'react';

const CFDRiskWarningModal = ({ isOpen, onAgree }) => {
  const [isChecked, setIsChecked] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cfd-risk-warning-title"
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px]" />

      <div className="relative w-full max-w-[510px] overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[#ececec] px-5 py-4">
          <div className="flex size-9 items-center justify-center rounded-full bg-[#fff5ea] text-[#e58b11]">
            <span className="material-symbols-outlined text-[22px]">warning</span>
          </div>
          <h2 id="cfd-risk-warning-title" className="text-[18px] leading-tight font-bold text-[#111418]">
            Acknowledgment
          </h2>
        </div>

        <div className="px-6 pb-6 pt-5">
          <p className="text-center text-[16px] font-medium leading-[1.55] text-[#151a20]">
            CFDs are complex and risky products. Trading on margin is highly risky - you can lose all of the funds
            you invest. Make sure you understand these risks and that CFDs are suitable for you before trading.
          </p>

          <div className="mt-5 rounded-2xl border-2 border-[#e69a31] bg-[#fff9f1] px-5 py-5 text-center">
            <p className="text-[15px] font-semibold leading-[1.45] text-[#bb6d07]">
              ⚠ Important: Please read and understand this risk disclosure before proceeding with CFD trading.
            </p>
          </div>

          <label className="mt-6 flex cursor-pointer items-start gap-3 text-[#111418]">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={(event) => setIsChecked(event.target.checked)}
              className="mt-[2px] size-[22px] shrink-0 rounded border-[#8f96a0] text-[#137fec] focus:ring-[#137fec]"
            />
            <span className="text-[15px] font-medium leading-[1.5]">
              I have read and understood the above-stated CFD Risk Disclosure and acknowledge the same.
            </span>
          </label>

          <button
            type="button"
            disabled={!isChecked}
            onClick={onAgree}
            className="mt-6 h-14 w-full rounded-2xl bg-[#137fec] text-[18px] font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-[#d7d8db] disabled:text-[#a4a7ac]"
          >
            <span className="inline-flex items-center gap-2">
              <span className="material-symbols-outlined text-[22px]">check_circle</span>
              I Agree
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CFDRiskWarningModal;

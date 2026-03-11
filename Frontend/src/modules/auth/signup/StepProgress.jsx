const STEPS = ['Broker', 'Personal', 'Contact', 'Security', 'Documents', 'Bank Details', 'Review'];

const StepProgress = ({ currentStep }) => (
  <div className="px-4 sm:px-5 pt-3 pb-2">
    <div className="flex items-center justify-between mb-2">
      <p className="text-xs text-gray-500 font-medium">Step {currentStep} of {STEPS.length}</p>
      <p className="text-xs font-semibold text-[#137fec]">{STEPS[currentStep - 1]}</p>
    </div>
    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full bg-[#137fec] rounded-full transition-all duration-300"
        style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
      />
    </div>
  </div>
);

export default StepProgress;

const IST_TIME_ZONE = 'Asia/Kolkata';

const toIstPseudoDate = (value = new Date()) =>
  new Date(new Date(value).toLocaleString('en-US', { timeZone: IST_TIME_ZONE }));

const isSaturdayIst = (value = new Date()) => toIstPseudoDate(value).getDay() === 6;

const getWithdrawalWindowInfo = (value = new Date()) => {
  const istNow = toIstPseudoDate(value);
  const isOpen = istNow.getDay() === 6;

  return {
    isOpen,
    reason: isOpen ? 'open' : 'saturday_only',
    message: isOpen
      ? 'Withdrawal window is open today (Saturday IST).'
      : 'Withdrawals are open only on Saturday (IST).',
    istNow,
    weekdayLabel: istNow.toLocaleDateString('en-IN', {
      weekday: 'long',
      timeZone: IST_TIME_ZONE,
    }),
  };
};

export {
  getWithdrawalWindowInfo,
  isSaturdayIst,
};

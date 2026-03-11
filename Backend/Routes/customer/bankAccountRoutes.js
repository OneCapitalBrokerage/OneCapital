import express from 'express';
import { protect } from '../../Middleware/authMiddleware.js';
import {
  getBankAccounts,
  addBankAccount,
  updateBankAccount,
  deleteBankAccount,
} from '../../Controllers/customer/BankAccountController.js';

const router = express.Router();

router.use(protect);

router.get('/bank-accounts', getBankAccounts);
router.post('/bank-accounts', addBankAccount);
router.put('/bank-accounts/:id', updateBankAccount);
router.delete('/bank-accounts/:id', deleteBankAccount);

export default router;

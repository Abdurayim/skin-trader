const crypto = require('crypto');
const axios = require('axios');
const { Transaction } = require('../models');
const { TRANSACTION_STATUS } = require('../utils/constants');

/**
 * PayMe Payment Gateway Service
 *
 * SETUP REQUIRED:
 * 1. Register at https://business.payme.uz/en
 * 2. Get merchant credentials (PAYME_MERCHANT_ID, PAYME_SECRET_KEY)
 * 3. Configure webhook URL in PayMe dashboard
 *
 * Environment Variables Required:
 * - PAYME_MERCHANT_ID
 * - PAYME_SECRET_KEY
 * - PAYME_CALLBACK_URL
 * - PAYME_WEBHOOK_URL
 * - PAYME_TEST_MODE (true/false)
 */

class PaymeService {
  constructor() {
    this.merchantId = process.env.PAYME_MERCHANT_ID;
    this.secretKey = process.env.PAYME_SECRET_KEY;
    this.callbackUrl = process.env.PAYME_CALLBACK_URL;
    this.webhookUrl = process.env.PAYME_WEBHOOK_URL;
    this.testMode = process.env.PAYME_TEST_MODE === 'true';

    // PayMe API endpoints
    this.baseUrl = this.testMode
      ? 'https://checkout.test.paycom.uz'
      : 'https://checkout.paycom.uz';

    this.apiUrl = this.testMode
      ? 'https://test.paycom.uz/api'
      : 'https://api.paycom.uz';
  }

  /**
   * Generate PayMe payment URL
   * @param {ObjectId} userId - User ID
   * @param {Number} amount - Amount in tiyin (1 UZS = 100 tiyin) or cents (1 USD = 100 cents)
   * @param {String} currency - Currency code (UZS or USD)
   * @param {ObjectId} transactionId - Internal transaction ID
   * @returns {String} Payment URL
   */
  generatePaymentUrl(userId, amount, currency, transactionId) {
    if (!this.merchantId) {
      throw new Error('PayMe merchant ID not configured. Please set PAYME_MERCHANT_ID in .env');
    }

    // Convert to smallest unit (tiyin for UZS, cents for USD)
    const amountInSmallestUnit = Math.round(amount * 100);

    // Create merchant params (base64 encoded JSON)
    const merchantParams = {
      merchant_id: this.merchantId,
      account: {
        user_id: userId.toString(),
        transaction_id: transactionId.toString()
      },
      amount: amountInSmallestUnit,
      currency: currency === 'USD' ? 840 : 860, // 840 = USD, 860 = UZS
      callback: this.callbackUrl,
      description: 'Skintrader Monthly Subscription'
    };

    const paramsBase64 = Buffer.from(JSON.stringify(merchantParams)).toString('base64');

    return `${this.baseUrl}/${paramsBase64}`;
  }

  /**
   * Verify webhook signature from PayMe
   * @param {Object} payload - Webhook payload
   * @param {String} signature - Signature from PayMe headers
   * @returns {Boolean} Is signature valid
   */
  verifyWebhookSignature(payload, signature) {
    if (!this.secretKey) {
      throw new Error('PayMe secret key not configured');
    }

    // PayMe uses HMAC-SHA256
    const expectedSignature = crypto
      .createHmac('sha256', this.secretKey)
      .update(JSON.stringify(payload))
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Handle PayMe webhook callback
   * PayMe uses JSON-RPC 2.0 protocol
   * @param {Object} payload - Webhook payload
   * @returns {Object} Response
   */
  async handleWebhook(payload) {
    const { method, params } = payload;

    switch (method) {
      case 'CheckPerformTransaction':
        return await this.checkPerformTransaction(params);

      case 'CreateTransaction':
        return await this.createTransaction(params);

      case 'PerformTransaction':
        return await this.performTransaction(params);

      case 'CancelTransaction':
        return await this.cancelTransaction(params);

      case 'CheckTransaction':
        return await this.checkTransaction(params);

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  /**
   * Check if transaction can be performed
   */
  async checkPerformTransaction(params) {
    const { account } = params;
    const transactionId = account.transaction_id;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.status !== TRANSACTION_STATUS.PENDING) {
      throw new Error('Transaction already processed');
    }

    return {
      allow: true
    };
  }

  /**
   * Create transaction in PayMe system
   */
  async createTransaction(params) {
    const { id: paymeTransactionId, account, amount, time } = params;
    const transactionId = account.transaction_id;

    // Check if already exists
    let transaction = await Transaction.findOne({ paymeTransactionId });
    if (transaction) {
      if (transaction.status === TRANSACTION_STATUS.COMPLETED) {
        return {
          create_time: transaction.createdAt.getTime(),
          transaction: transaction._id.toString(),
          state: 2 // Completed
        };
      }
      return {
        create_time: transaction.createdAt.getTime(),
        transaction: transaction._id.toString(),
        state: 1 // Processing
      };
    }

    // Update existing transaction
    transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    transaction.paymeTransactionId = paymeTransactionId;
    transaction.status = TRANSACTION_STATUS.PROCESSING;
    transaction.webhookReceived = true;
    transaction.webhookReceivedAt = new Date(time);
    await transaction.save();

    return {
      create_time: time,
      transaction: transaction._id.toString(),
      state: 1 // Processing
    };
  }

  /**
   * Perform transaction - mark as completed
   */
  async performTransaction(params) {
    const { id: paymeTransactionId } = params;

    const transaction = await Transaction.findOne({ paymeTransactionId });
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.status === TRANSACTION_STATUS.COMPLETED) {
      return {
        transaction: transaction._id.toString(),
        perform_time: transaction.updatedAt.getTime(),
        state: 2 // Completed
      };
    }

    transaction.status = TRANSACTION_STATUS.COMPLETED;
    await transaction.save();

    return {
      transaction: transaction._id.toString(),
      perform_time: Date.now(),
      state: 2 // Completed
    };
  }

  /**
   * Cancel transaction
   */
  async cancelTransaction(params) {
    const { id: paymeTransactionId, reason } = params;

    const transaction = await Transaction.findOne({ paymeTransactionId });
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.status === TRANSACTION_STATUS.COMPLETED) {
      // Cannot cancel completed transaction, must refund
      throw new Error('Cannot cancel completed transaction');
    }

    transaction.status = TRANSACTION_STATUS.CANCELLED;
    transaction.errorMessage = `Cancelled: ${reason}`;
    await transaction.save();

    return {
      transaction: transaction._id.toString(),
      cancel_time: Date.now(),
      state: -1 // Cancelled
    };
  }

  /**
   * Check transaction status
   */
  async checkTransaction(params) {
    const { id: paymeTransactionId } = params;

    const transaction = await Transaction.findOne({ paymeTransactionId });
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    let state;
    switch (transaction.status) {
      case TRANSACTION_STATUS.PENDING:
        state = 0;
        break;
      case TRANSACTION_STATUS.PROCESSING:
        state = 1;
        break;
      case TRANSACTION_STATUS.COMPLETED:
        state = 2;
        break;
      case TRANSACTION_STATUS.CANCELLED:
      case TRANSACTION_STATUS.FAILED:
        state = -1;
        break;
      case TRANSACTION_STATUS.REFUNDED:
        state = -2;
        break;
      default:
        state = 0;
    }

    return {
      create_time: transaction.createdAt.getTime(),
      perform_time: transaction.status === TRANSACTION_STATUS.COMPLETED
        ? transaction.updatedAt.getTime()
        : 0,
      cancel_time: transaction.status === TRANSACTION_STATUS.CANCELLED
        ? transaction.updatedAt.getTime()
        : 0,
      transaction: transaction._id.toString(),
      state,
      reason: transaction.errorMessage || null
    };
  }

  /**
   * Check payment status via PayMe API
   * @param {String} paymeTransactionId - PayMe transaction ID
   * @returns {Object} Transaction status
   */
  async checkPaymentStatus(paymeTransactionId) {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          method: 'CheckTransaction',
          params: { id: paymeTransactionId }
        },
        {
          headers: {
            'X-Auth': `${this.merchantId}:${this.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.result;
    } catch (error) {
      throw new Error(`Failed to check payment status: ${error.message}`);
    }
  }

  /**
   * Cancel transaction via PayMe API
   * @param {String} paymeTransactionId - PayMe transaction ID
   * @param {Number} reason - Cancel reason code
   * @returns {Object} Cancellation result
   */
  async cancelPayment(paymeTransactionId, reason = 1) {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          method: 'CancelTransaction',
          params: { id: paymeTransactionId, reason }
        },
        {
          headers: {
            'X-Auth': `${this.merchantId}:${this.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data.result;
    } catch (error) {
      throw new Error(`Failed to cancel payment: ${error.message}`);
    }
  }
}

module.exports = new PaymeService();

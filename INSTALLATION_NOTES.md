# Installation & Setup Notes

## New Dependencies Required

Install the following npm package:

```bash
npm install node-cron
```

## Environment Variables

The following environment variables have been added to `.env`:

### PayMe Configuration
```
PAYME_MERCHANT_ID=your_merchant_id_here
PAYME_SECRET_KEY=your_secret_key_here
PAYME_CALLBACK_URL=http://targetschool.uz:8001/api/v1/payments/payme/callback
PAYME_WEBHOOK_URL=http://targetschool.uz:8001/api/v1/payments/payme/webhook
PAYME_TEST_MODE=true
```

### Subscription Configuration
```
SUBSCRIPTION_PRICE_USD=1
SUBSCRIPTION_PRICE_UZS=12000
SUBSCRIPTION_DURATION_DAYS=30
GRACE_PERIOD_DAYS=3
```

## PayMe Merchant Account Setup

1. **Register**: Visit https://business.payme.uz/en
2. **Call Support**: +998 78 150-22-24
3. **Submit Documents**: Business registration documents
4. **Wait**: 3-5 business days for approval
5. **Get Credentials**: Receive PAYME_MERCHANT_ID and PAYME_SECRET_KEY
6. **Configure Webhook**: Set webhook URL in PayMe dashboard to:
   `http://targetschool.uz:8001/api/v1/payments/payme/webhook`
7. **Test**: Use sandbox credentials first (set PAYME_TEST_MODE=true)
8. **Production**: Switch to production credentials and set PAYME_TEST_MODE=false

## Database Migration

Run the user migration script to grant existing KYC-verified users a free 30-day subscription:

```bash
node src/scripts/migrateExistingUsers.js
```

## Testing Checklist

### Backend
- [ ] Install node-cron: `npm install node-cron`
- [ ] Register PayMe merchant account
- [ ] Update .env with PayMe credentials
- [ ] Test payment URL generation
- [ ] Test webhook signature verification
- [ ] Test subscription creation flow
- [ ] Test subscription expiry (change dates manually)
- [ ] Test grace period logic
- [ ] Test report creation
- [ ] Test duplicate report prevention
- [ ] Test admin report resolution

### Frontend
- [ ] Test subscription status display
- [ ] Test payment redirect to PayMe
- [ ] Test post creation blocking without subscription
- [ ] Test grace period warning
- [ ] Test report button on posts
- [ ] Test report button on user profiles
- [ ] Test admin subscription management
- [ ] Test admin report management

## Deployment Notes

1. Ensure PayMe production credentials are configured
2. Verify webhook URL is accessible from PayMe servers
3. Test payment flow with small amount first
4. Monitor webhook delivery in first 24 hours
5. Check subscription cleanup job runs daily at 00:00 UTC

## Support Resources

- PayMe API Documentation: https://paymeapi.docs.apiary.io/
- PayMe Integration Guide: https://www.saaztro.co/blog/payme-paycom-payment-gateway-integration
- PayMe Support: +998 78 150-22-24

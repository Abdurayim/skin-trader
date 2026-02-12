# Skintrader API Endpoints - Subscription & Report System

## Base URL
```
http://targetschool.uz:8001/api/v1
```

---

## Subscription Endpoints

### 1. Get Subscription Status
**GET** `/subscriptions/status`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "subscriptionStatus": "active",
    "hasActiveSubscription": true,
    "isInGracePeriod": false,
    "subscriptionExpiresAt": "2026-03-06T00:00:00.000Z",
    "gracePeriodEndsAt": null,
    "subscription": {
      "_id": "65f...",
      "plan": "monthly",
      "status": "active",
      "startDate": "2026-02-06T00:00:00.000Z",
      "endDate": "2026-03-06T00:00:00.000Z",
      "autoRenew": false,
      "daysRemaining": 28
    }
  }
}
```

**Frontend Usage:**
```javascript
// Add to src/config/api.js
export const SUBSCRIPTION_ENDPOINTS = {
  GET_STATUS: '/v1/subscriptions/status',
  INITIATE: '/v1/subscriptions/initiate',
  HISTORY: '/v1/subscriptions/history',
  CANCEL: '/v1/subscriptions/cancel'
};
```

---

### 2. Initiate Subscription Payment
**POST** `/subscriptions/initiate`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Body:**
```json
{
  "currency": "UZS"  // or "USD"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactionId": "65f...",
    "paymentUrl": "https://checkout.paycom.uz/...",
    "amount": 12000,
    "currency": "UZS",
    "expiresIn": 900
  },
  "message": "Payment initiated. Redirect user to paymentUrl"
}
```

**Frontend Usage:**
```javascript
const initiatePayment = async (currency = 'UZS') => {
  const response = await api.post('/v1/subscriptions/initiate', { currency });
  // Redirect user to payment URL
  window.location.href = response.data.paymentUrl;
};
```

---

### 3. Get Subscription History
**GET** `/subscriptions/history?page=1&limit=10`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "subscriptions": [
      {
        "_id": "65f...",
        "plan": "monthly",
        "status": "active",
        "startDate": "2026-02-06T00:00:00.000Z",
        "endDate": "2026-03-06T00:00:00.000Z",
        "lastPaymentId": {
          "amount": 12000,
          "currency": "UZS",
          "status": "completed",
          "createdAt": "2026-02-06T00:00:00.000Z"
        }
      }
    ],
    "pagination": {
      "total": 3,
      "page": 1,
      "limit": 10,
      "pages": 1
    }
  }
}
```

---

### 4. Cancel Auto-Renewal
**POST** `/subscriptions/cancel`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Body:**
```json
{
  "reason": "Too expensive" // optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "subscription": {
      "_id": "65f...",
      "autoRenew": false,
      "cancelledAt": "2026-02-06T12:00:00.000Z",
      "endDate": "2026-03-06T00:00:00.000Z"
    }
  },
  "message": "Auto-renewal cancelled. Subscription will expire on 2026-03-06..."
}
```

---

## Payment Endpoints

### 5. Get Transaction History
**GET** `/payments/transactions?page=1&limit=10&status=completed`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 50)
- `status`: Filter by status (pending, processing, completed, failed, cancelled, refunded)

**Response:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "_id": "65f...",
        "amount": 12000,
        "currency": "UZS",
        "status": "completed",
        "paymentMethod": "payme",
        "createdAt": "2026-02-06T00:00:00.000Z",
        "subscriptionId": {
          "plan": "monthly",
          "status": "active",
          "startDate": "2026-02-06T00:00:00.000Z",
          "endDate": "2026-03-06T00:00:00.000Z"
        }
      }
    ],
    "pagination": {
      "total": 5,
      "page": 1,
      "limit": 10,
      "pages": 1
    }
  }
}
```

---

## Report Endpoints

### 6. Create Report
**POST** `/reports`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

**Body:**
```json
{
  "reportType": "post",  // or "user"
  "targetId": "65f...",
  "category": "scam",  // see Report Categories below
  "description": "This post is fraudulent" // optional, max 1000 chars
}
```

**Report Categories:**
- Post reports: `scam`, `fake_item`, `inappropriate_content`, `duplicate_post`, `incorrect_pricing`
- User reports: `harassment`, `spam`, `fraud`, `impersonation`, `offensive_profile`
- General: `other`

**Response:**
```json
{
  "success": true,
  "data": {
    "report": {
      "_id": "65f...",
      "reportType": "post",
      "category": "scam",
      "status": "pending",
      "priority": "medium",
      "createdAt": "2026-02-06T12:00:00.000Z"
    }
  },
  "message": "Report submitted successfully. Our team will review it shortly."
}
```

**Error Responses:**
- Duplicate report: `400 { "code": "DUPLICATE_REPORT" }`
- Rate limit exceeded: `400 { "code": "REPORT_LIMIT_EXCEEDED" }` (10 reports/day)
- Cannot report self: `400 { "message": "You cannot report yourself" }`

**Frontend Usage:**
```javascript
// Add to src/config/api.js
export const REPORT_ENDPOINTS = {
  CREATE: '/v1/reports',
  MY_REPORTS: '/v1/reports/my',
  DETAILS: (id) => `/v1/reports/${id}`
};

// Component usage
const reportPost = async (postId, category, description) => {
  try {
    await api.post('/v1/reports', {
      reportType: 'post',
      targetId: postId,
      category,
      description
    });
    toast.success('Report submitted');
  } catch (error) {
    if (error.response?.data?.code === 'DUPLICATE_REPORT') {
      toast.error('You already reported this');
    }
  }
};
```

---

### 7. Get My Reports
**GET** `/reports/my?page=1&limit=10&status=pending&reportType=post`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Query Parameters:**
- `page`: Page number
- `limit`: Items per page (max: 50)
- `status`: pending, under_review, resolved, dismissed
- `reportType`: post, user

**Response:**
```json
{
  "success": true,
  "data": {
    "reports": [
      {
        "_id": "65f...",
        "reportType": "post",
        "category": "scam",
        "description": "Fraudulent item",
        "status": "pending",
        "priority": "medium",
        "targetId": {
          "title": "Selling CS:GO Knife",
          // ... post data
        },
        "createdAt": "2026-02-06T12:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 3,
      "page": 1,
      "limit": 10,
      "pages": 1
    }
  }
}
```

---

### 8. Get Report Details
**GET** `/reports/:id`

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "report": {
      "_id": "65f...",
      "reportType": "post",
      "category": "scam",
      "description": "Fraudulent item",
      "status": "resolved",
      "priority": "medium",
      "targetId": { /* full post/user data */ },
      "reviewedBy": {
        "username": "admin1",
        "email": "admin@skintrader.com"
      },
      "resolution": {
        "action": "delete_post",
        "notes": "Confirmed scam, post removed",
        "resolvedAt": "2026-02-07T10:00:00.000Z"
      },
      "createdAt": "2026-02-06T12:00:00.000Z"
    }
  }
}
```

---

## Admin Endpoints

### 9. Get All Subscriptions (Admin)
**GET** `/admin/subscriptions?page=1&limit=20&status=active`

**Headers:**
```
Authorization: Bearer {admin_access_token}
```

**Permissions Required:** `manage_subscriptions`

**Response:**
```json
{
  "success": true,
  "data": {
    "subscriptions": [ /* array of subscriptions with user info */ ],
    "stats": [
      { "_id": "active", "count": 150 },
      { "_id": "expired", "count": 30 }
    ],
    "pagination": { /* ... */ }
  }
}
```

---

### 10. Grant Free Subscription (Admin)
**POST** `/admin/subscriptions/grant`

**Headers:**
```
Authorization: Bearer {admin_access_token}
Content-Type: application/json
```

**Permissions Required:** `manage_subscriptions`

**Body:**
```json
{
  "userId": "65f...",
  "durationDays": 30  // optional, defaults to 30
}
```

---

### 11. Get All Reports (Admin)
**GET** `/admin/reports?page=1&limit=20&status=pending&priority=high`

**Headers:**
```
Authorization: Bearer {admin_access_token}
```

**Permissions Required:** `manage_reports`

**Query Parameters:**
- `status`: pending, under_review, resolved, dismissed
- `reportType`: post, user
- `category`: scam, harassment, etc.
- `priority`: low, medium, high, critical

**Response:**
```json
{
  "success": true,
  "data": {
    "reports": [ /* array of reports */ ],
    "pendingCount": 15,
    "pagination": { /* ... */ }
  }
}
```

---

### 12. Resolve Report (Admin)
**POST** `/admin/reports/:id/resolve`

**Headers:**
```
Authorization: Bearer {admin_access_token}
Content-Type: application/json
```

**Permissions Required:** `manage_reports`

**Body:**
```json
{
  "action": "delete_post",  // dismiss, delete_post, warn_user, suspend_user, ban_user, delete_user
  "notes": "Confirmed scam, taking action",
  "adminNotes": "Internal notes here"  // optional
}
```

**Actions:**
- `dismiss`: No action taken
- `delete_post`: Delete the reported post
- `warn_user`: Warn the user (logged in AdminLog)
- `suspend_user`: Suspend user account
- `ban_user`: Ban user permanently
- `delete_user`: Delete user account and all posts

---

## Error Codes

All error responses follow this format:

```json
{
  "success": false,
  "message": "Error description",
  "code": "ERROR_CODE",  // optional
  "data": { /* additional context */ }
}
```

**Common Error Codes:**
- `SUBSCRIPTION_REQUIRED`: User needs active subscription
- `SUBSCRIPTION_EXPIRED`: Subscription has expired
- `PAYMENT_FAILED`: Payment processing failed
- `DUPLICATE_REPORT`: User already reported this target
- `REPORT_LIMIT_EXCEEDED`: Daily report limit reached (10/day)
- `KYC_REQUIRED`: KYC verification required
- `FORBIDDEN`: Insufficient permissions

---

## Special Headers

### Grace Period Warning
When user is in grace period, responses include:
```
X-Grace-Period-Warning: true
X-Grace-Period-Ends: 2026-02-09T00:00:00.000Z
```

Frontend should display a warning banner when these headers are present.

---

## Frontend Integration Checklist

### API Configuration (`src/config/api.js`)
```javascript
const API_BASE_URL = 'http://targetschool.uz:8001/api/v1';

export const ENDPOINTS = {
  // Subscription
  SUBSCRIPTION_STATUS: '/subscriptions/status',
  SUBSCRIPTION_INITIATE: '/subscriptions/initiate',
  SUBSCRIPTION_HISTORY: '/subscriptions/history',
  SUBSCRIPTION_CANCEL: '/subscriptions/cancel',

  // Transactions
  TRANSACTIONS: '/payments/transactions',
  TRANSACTION_DETAILS: (id) => `/payments/transactions/${id}`,

  // Reports
  REPORTS_CREATE: '/reports',
  REPORTS_MY: '/reports/my',
  REPORT_DETAILS: (id) => `/reports/${id}`,

  // Admin - Subscriptions
  ADMIN_SUBSCRIPTIONS: '/admin/subscriptions',
  ADMIN_SUBSCRIPTION_GRANT: '/admin/subscriptions/grant',
  ADMIN_SUBSCRIPTION_REVOKE: (id) => `/admin/subscriptions/${id}/revoke`,
  ADMIN_TRANSACTIONS: '/admin/transactions',
  ADMIN_SUBSCRIPTION_STATS: '/admin/subscriptions/stats',

  // Admin - Reports
  ADMIN_REPORTS: '/admin/reports',
  ADMIN_REPORT_DETAILS: (id) => `/admin/reports/${id}`,
  ADMIN_REPORT_STATUS: (id) => `/admin/reports/${id}/status`,
  ADMIN_REPORT_RESOLVE: (id) => `/admin/reports/${id}/resolve`,
  ADMIN_REPORT_DISMISS: (id) => `/admin/reports/${id}/dismiss`,
  ADMIN_REPORT_STATS: '/admin/reports/stats'
};
```

### Constants (`src/utils/constants.js`)
```javascript
export const SUBSCRIPTION_STATUS = {
  NONE: 'none',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  GRACE_PERIOD: 'grace_period',
  PENDING: 'pending',
  CANCELLED: 'cancelled'
};

export const REPORT_CATEGORY = {
  SCAM: 'scam',
  FAKE_ITEM: 'fake_item',
  INAPPROPRIATE_CONTENT: 'inappropriate_content',
  DUPLICATE_POST: 'duplicate_post',
  INCORRECT_PRICING: 'incorrect_pricing',
  HARASSMENT: 'harassment',
  SPAM: 'spam',
  FRAUD: 'fraud',
  IMPERSONATION: 'impersonation',
  OFFENSIVE_PROFILE: 'offensive_profile',
  OTHER: 'other'
};

export const REPORT_STATUS = {
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed'
};
```

---

## Testing with Postman/cURL

### Test Subscription Status
```bash
curl -X GET http://targetschool.uz:8001/api/v1/subscriptions/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Test Create Report
```bash
curl -X POST http://targetschool.uz:8001/api/v1/reports \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reportType": "post",
    "targetId": "POST_ID_HERE",
    "category": "scam",
    "description": "This looks like a scam"
  }'
```

### Test Payment Initiation
```bash
curl -X POST http://targetschool.uz:8001/api/v1/subscriptions/initiate \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"currency": "UZS"}'
```

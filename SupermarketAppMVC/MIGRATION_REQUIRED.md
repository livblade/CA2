# Database Migration Required! 

## ⚠️ IMPORTANT: Run This First

Before testing the new features, you **MUST** add two new columns to your `orders` table.

### Quick Setup (2 minutes)

**Step 1:** Run the migration SQL file

Open your MySQL tool (MySQL Workbench, phpMyAdmin, or command line) and run:

```bash
# File location:
migrations/add_currency_bnpl_to_orders.sql
```

**OR** copy-paste this SQL:

```sql
USE c372_supermarketdb;

ALTER TABLE `orders` 
ADD COLUMN `displayCurrency` VARCHAR(10) DEFAULT NULL COMMENT 'Display currency used during checkout (for reference only)' AFTER `total`;

ALTER TABLE `orders` 
ADD COLUMN `bnplMonths` INT DEFAULT NULL COMMENT 'BNPL installment months selected (simulator only)' AFTER `displayCurrency`;
```

**Step 2:** Verify the migration worked

```sql
DESCRIBE orders;
```

You should see:
```
+------------------+---------------+------+-----+---------+-------+
| Field            | Type          | Null | Key | Default | Extra |
+------------------+---------------+------+-----+---------+-------+
| id               | int           | NO   | PRI | NULL    | auto_increment |
| userId           | int           | NO   | MUL | NULL    |       |
| total            | decimal(10,2) | NO   |     | 0.00    |       |
| displayCurrency  | varchar(10)   | YES  |     | NULL    |       | ← NEW!
| bnplMonths       | int           | YES  |     | NULL    |       | ← NEW!
| createdAt        | datetime      | NO   | MUL | CURRENT_TIMESTAMP |  |
+------------------+---------------+------+-----+---------+-------+
```

---

## 🎯 What Changed

### 1. Currency is Display-Only Now ✅
- Users can view prices in their local currency
- **But they're always charged the SGD amount**
- Example: Item costs S$100 SGD
  - User selects USD → sees ~$74 USD
  - But Stripe charges S$100 SGD
  - Invoice shows: "Charged S$100 SGD (Display: USD)"

### 2. BNPL Info Now Saved to Database ✅
- Selected installment plan saved with order
- Shows on invoice: "12-month plan: $8.33/month"
- **Important**: Customer pays full amount upfront!
  - BNPL is a **simulator** showing "what if"
  - Not real installment payments
  - In production, you'd integrate Klarna/Afterpay APIs

### 3. Invoice Enhanced ✅
- Shows display currency if not SGD
- Shows BNPL plan with monthly breakdown
- Clarifies full payment was received

---

## 💡 Understanding BNPL Payments

### How It Works Now (Simulator):
1. Customer selects "12-month plan"
2. Sees: "Pay $8.33/month for 12 months"
3. Clicks "Pay with Stripe"
4. **Stripe charges FULL $100 immediately**
5. Invoice shows: "12-month plan selected" (for reference)

### How Real BNPL Works (Production):
1. Customer selects "12-month plan"
2. Sees: "Pay $8.33/month for 12 months"
3. Clicks "Pay with Klarna"
4. **Klarna pays you $100 immediately**
5. **Customer pays Klarna $8.33/month for 12 months**
6. Klarna handles collections, defaults, etc.

**To implement real BNPL:**
- Sign up with Klarna, Afterpay, or Zip
- Get API credentials
- Replace simulator with their SDK
- They handle all payment processing

---

## 🧪 Testing Guide

### Test 1: Currency Display
1. Add items to cart ($100+)
2. Go to `/checkout`
3. Select "USD" from currency dropdown
4. See amount change to ~$74 USD
5. Click "Proceed to Payment"
6. **Check payment page says:** "You will be charged: S$100.00 SGD"
7. Pay with Stripe
8. Check invoice shows: "Display Currency: USD (Charged in SGD)"

### Test 2: BNPL Plan
1. Add items to cart ($50+)
2. Go to `/checkout`
3. Click "6 months" BNPL plan
4. See: "$16.67/month"
5. Proceed to payment
6. Payment page shows: "6-month installment selected"
7. **Note:** "Full amount (S$100 SGD) will be charged now"
8. Complete payment
9. Check invoice shows BNPL breakdown

### Test 3: Both Together
1. Add $150 to cart
2. Select EUR currency (~€102)
3. Select 12-month BNPL (~€8.50/month)
4. Proceed and pay
5. Invoice should show:
   - Charged: S$150 SGD
   - Display: EUR
   - BNPL: 12 months at $12.50/month

---

## 📊 Database Schema

### New Columns in `orders` Table

| Column | Type | Description |
|--------|------|-------------|
| `displayCurrency` | VARCHAR(10) | Currency code shown to user (USD, EUR, etc.) |
| `bnplMonths` | INT | Number of installment months (3, 6, 12, or NULL) |

### Example Data:

```sql
SELECT id, userId, total, displayCurrency, bnplMonths, createdAt 
FROM orders 
ORDER BY id DESC 
LIMIT 5;
```

Result:
```
+----+--------+--------+-----------------+-----------+---------------------+
| id | userId | total  | displayCurrency | bnplMonths| createdAt           |
+----+--------+--------+-----------------+-----------+---------------------+
| 17 | 3      | 150.00 | EUR             | 12        | 2026-01-28 15:30:00 |
| 16 | 3      | 3.30   | NULL            | NULL      | 2025-12-04 09:26:14 |
| 15 | 3      | 3.50   | NULL            | NULL      | 2025-12-03 12:52:38 |
+----+--------+--------+-----------------+-----------+---------------------+
```

---

## ✅ Success Checklist

After migration, verify:

- [ ] Migration SQL ran without errors
- [ ] `displayCurrency` column exists in `orders` table
- [ ] `bnplMonths` column exists in `orders` table
- [ ] Server restarts without errors
- [ ] Checkout page shows currency selector
- [ ] Checkout page shows BNPL calculator
- [ ] Payment page shows "Charged in SGD"
- [ ] Payment completes successfully
- [ ] Invoice shows currency and BNPL info
- [ ] New order in database has currency/BNPL values

---

## 🚨 Troubleshooting

### Error: "Unknown column 'displayCurrency'"
**Fix:** Run the migration SQL above!

### Invoice doesn't show BNPL
**Check:** Order has `bnplMonths` value in database
```sql
SELECT * FROM orders WHERE id = YOUR_ORDER_ID;
```

### Currency not saving
**Check:** Session has `paymentCurrency` set
- Add console.log in checkout to verify

---

## 📞 Quick Support

**Issue:** Migration fails
- **Solution:** Check if columns already exist. If yes, skip migration.

**Issue:** Old orders show NULL
- **Solution:** This is normal! Only new orders have currency/BNPL data.

**Issue:** Payment fails with currency
- **Solution:** Check that Stripe route uses 'sgd' currency (line 491 in app.js)

---

**You're all set!** 🎉

The currency display and BNPL features are now fully functional with database persistence!

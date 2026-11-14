const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();
app.use(express.json());

// سرو کردن خودکار تمام فایل‌های پوشه (HTML, CSS, عکس‌ها)
app.use(express.static(__dirname));

// تنظیمات درگاه زرین‌پال (در حالت سندباکس/تستی بدون نیاز به پول یا اینماد)
const IS_SANDBOX = true;
const MERCHANT_ID = "00000000-0000-0000-0000-000000000000"; // در حالت سندباکس یک کد تستی معتبر است

const ZARINPAL_REQUEST_URL = IS_SANDBOX
  ? "https://sandbox.zarinpal.com/pg/v4/payment/request.json"
  : "https://payment.zarinpal.com/pg/v4/payment/request.json";

const ZARINPAL_START_PAY = IS_SANDBOX
  ? "https://sandbox.zarinpal.com/pg/StartPay/"
  : "https://payment.zarinpal.com/pg/StartPay/";

const ZARINPAL_VERIFY_URL = IS_SANDBOX
  ? "https://sandbox.zarinpal.com/pg/v4/payment/verify.json"
  : "https://payment.zarinpal.com/pg/v4/payment/verify.json";

// ۱. دریافت درخواست خرید و اتصال مشتری به درگاه
app.post("/api/pay", async (req, res) => {
  try {
    const { cart, customer } = req.body;

    if (!cart || cart.length === 0) {
      return res.status(400).json({ error: "سبد خرید خالی است!" });
    }

    // محاسبه قیمت بر حسب ریال
    const subtotalToman = cart.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const shippingToman = subtotalToman >= 1000000 ? 0 : 45000;
    const totalToman = subtotalToman + shippingToman;
    const totalRials = totalToman * 10; // تبدیل به ریال برای شاپرک

    const response = await axios.post(ZARINPAL_REQUEST_URL, {
      merchant_id: MERCHANT_ID,
      amount: totalRials,
      callback_url: "http://localhost:3000/api/verify",
      description: `خرید از فروشگاه دنیای کوچولوها برای ${customer.name}`,
      metadata: {
        mobile: customer.phone,
        email: "info@kocholo.ir",
      },
    });

    if (response.data.data && response.data.data.code === 100) {
      const authority = response.data.data.authority;
      res.json({ url: `${ZARINPAL_START_PAY}${authority}` });
    } else {
      res.status(400).json({ error: "خطا در صدور شناسه پرداخت بانک" });
    }
  } catch (error) {
    console.error("Payment Error:", error.response?.data || error.message);
    res.status(500).json({ error: "خطای برقراری ارتباط با درگاه پرداخت" });
  }
});

// ۲. بازگشت از بانک و تایید نهایی پرداخت
app.get("/api/verify", async (req, res) => {
  const { Authority, Status } = req.query;

  if (Status !== "OK") {
    return res.send(`
      <div style="font-family: Tahoma; text-align: center; margin-top: 80px; direction: rtl;">
        <h2 style="color: #e74c3c;">پرداخت لغو شد یا ناموفق بود! ❌</h2>
        <p>هیچ مبلغی از حساب شما کسر نشد.</p>
        <a href="/" style="display:inline-block; margin-top:20px; padding:10px 20px; background:#3498db; color:#fff; text-decoration:none; border-radius:8px;">بازگشت به فروشگاه</a>
      </div>
    `);
  }

  try {
    // در سیستم واقعی مبلغ باید از دیتابیس با Authority چک شود
    // برای تست فعلاً یک درخواست تایید می‌فرستیم:
    const verifyRes = await axios.post(ZARINPAL_VERIFY_URL, {
      merchant_id: MERCHANT_ID,
      amount: 10000, // در سندباکس تایید می‌شود
      authority: Authority,
    });

    const refId = verifyRes.data.data?.ref_id || "987654321";

    res.send(`
      <div style="font-family: Tahoma; text-align: center; margin-top: 80px; direction: rtl;">
        <h2 style="color: #27ae60;">پرداخت با موفقیت انجام شد! 🎉</h2>
        <p>سفارش شما با موفقیت ثبت شد و آماده ارسال است.</p>
        <p style="font-weight:bold; font-size:18px;">کد پیگیری بانکی: ${refId}</p>
        <a href="/" style="display:inline-block; margin-top:20px; padding:10px 20px; background:#2ecc71; color:#fff; text-decoration:none; border-radius:8px;">خرید دوباره</a>
      </div>
    `);
  } catch (err) {
    res.send(`
      <div style="font-family: Tahoma; text-align: center; margin-top: 80px; direction: rtl;">
        <h2 style="color: #f39c12;">سفارش قبلاً تایید شده یا خطایی رخ داده است.</h2>
        <a href="/">بازگشت به سایت</a>
      </div>
    `);
  }
});

// اجرای سرور روی پورت 3000
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

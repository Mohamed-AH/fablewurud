const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

// Rate limiter: 5 requests per hour per IP
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: {
    success: false,
    error: 'تم تجاوز الحد المسموح. يرجى المحاولة لاحقاً.',
    errorEn: 'Too many requests. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Sanitize text for Telegram (escape Markdown special chars)
function sanitizeForTelegram(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .trim();
}

// Validate email format
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// POST /api/contact
router.post('/', contactLimiter, async (req, res) => {
  try {
    const { name, email, message } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: 'الاسم مطلوب',
        errorEn: 'Name is required'
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        error: 'البريد الإلكتروني مطلوب',
        errorEn: 'Email is required'
      });
    }

    if (!isValidEmail(email.trim())) {
      return res.status(400).json({
        success: false,
        error: 'البريد الإلكتروني غير صالح',
        errorEn: 'Invalid email format'
      });
    }

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'الرسالة مطلوبة',
        errorEn: 'Message is required'
      });
    }

    // Check for Telegram credentials
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      console.error('Missing Telegram credentials');
      return res.status(500).json({
        success: false,
        error: 'خطأ في إعدادات الخادم',
        errorEn: 'Server configuration error'
      });
    }

    // Construct Telegram message
    const telegramMessage = `
📬 *رسالة جديدة من الموقع*

👤 *الاسم:* ${sanitizeForTelegram(name.trim())}
📧 *البريد:* ${sanitizeForTelegram(email.trim())}

💬 *الرسالة:*
${sanitizeForTelegram(message.trim())}

---
🕐 ${new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}
    `.trim();

    // Send to Telegram
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: telegramMessage,
        parse_mode: 'Markdown'
      })
    });

    const result = await response.json();

    if (!result.ok) {
      console.error('Telegram API error:', result);
      return res.status(500).json({
        success: false,
        error: 'فشل في إرسال الرسالة',
        errorEn: 'Failed to send message'
      });
    }

    // Success
    res.json({
      success: true,
      message: 'تم إرسال رسالتك بنجاح',
      messageEn: 'Your message has been sent successfully'
    });

  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ. يرجى المحاولة لاحقاً.',
      errorEn: 'An error occurred. Please try again later.'
    });
  }
});

module.exports = router;

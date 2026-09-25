import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';

  if (!user || !pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });
  return transporter;
}

export function isEmail(val) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val || '').trim());
}

export function isPhone(val) {
  return /^[0-9+()\-\s]{8,20}$/.test(String(val || '').trim());
}

export async function sendOtpMessage({ contact, otp, purpose, fullName }) {
  const isMail = isEmail(contact);

  if (isMail) {
    throw new Error('Chức năng gửi OTP qua Email hiện đang được nâng cấp. Vui lòng sử dụng Số điện thoại để nhận mã xác thực hoặc thử lại sau.');
  }

  console.log(`\n========================================`);
  console.log(`[ATTENDLY SMS OTP DISPATCH]`);
  console.log(`Recipient Phone: ${contact}`);
  console.log(`Purpose:         ${purpose}`);
  console.log(`OTP Code:        ${otp}`);
  console.log(`========================================\n`);

  // 1. Check eSMS Gateway (Vietnam SMS)
  const esmsApiKey = process.env.ESMS_API_KEY;
  const esmsSecretKey = process.env.ESMS_SECRET_KEY;
  if (esmsApiKey && esmsSecretKey) {
    try {
      const res = await fetch('http://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ApiKey: esmsApiKey,
          SecretKey: esmsSecretKey,
          Phone: contact,
          Content: `[ATTENDLY] Ma OTP cua ban la ${otp}. Ma co hieu luc trong 5 phut.`,
          SmsType: '2',
          Brandname: process.env.ESMS_BRANDNAME || 'Baotam',
        }),
      });
      const esmsData = await res.json().catch(() => ({}));
      if (esmsData.CodeResult === '100') {
        return { success: true, channel: 'SMS', sent: true, isRealSms: true };
      }
    } catch (eErr) {
      console.error('[eSMS Gateway Error]:', eErr.message);
    }
  }

  // 2. Check Twilio SMS Gateway (International / VN)
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

  if (twilioSid && twilioToken && twilioFrom) {
    try {
      let formattedPhone = contact.replace(/\s+/g, '');
      if (formattedPhone.startsWith('0')) {
        formattedPhone = '+84' + formattedPhone.slice(1);
      }
      const authHeader = 'Basic ' + Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
      const smsBody = new URLSearchParams({
        To: formattedPhone,
        From: twilioFrom,
        Body: `[ATTENDLY] Ma OTP xac thuc cua ban la ${otp}. Ma co hieu luc trong 5 phut.`,
      });
      const smsRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: smsBody.toString(),
      });
      if (!smsRes.ok) {
        const errData = await smsRes.json().catch(() => ({}));
        throw new Error(errData.message || 'Lỗi gửi SMS qua Twilio Gateway');
      }
      return { success: true, channel: 'SMS', sent: true, isRealSms: true };
    } catch (smsErr) {
      console.error('[SMS Gateway Error]:', smsErr.message);
      return { success: true, channel: 'SMS', sent: true, isRealSms: false, otp };
    }
  }

  // If no external SMS gateway is configured yet, allow instant phone testing
  return { success: true, channel: 'SMS', sent: true, isRealSms: false, otp };
}

export const sendOtpEmail = sendOtpMessage;

// Supabase Edge Function: send-invite-email
// Deploy: supabase functions deploy send-invite-email
// Secrets: supabase secrets set RESEND_API_KEY=re_xxx FROM_EMAIL=noreply@yourdomain.com

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@caylaklar.com';
const APP_NAME = 'Caylaklar Sesli Sohbet';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, code, expiresAt } = await req.json();

    if (!email || !code) {
      return new Response(
        JSON.stringify({ error: 'email ve code zorunludur' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY yapılandırılmamış' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const expiryDate = new Date(expiresAt);
    const timeStr = expiryDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #111621; color: #f1f5f9; padding: 40px; border-radius: 16px;">
        <h1 style="color: #2563eb; font-size: 22px; margin: 0 0 6px 0;">${APP_NAME}</h1>
        <p style="color: #94a3b8; margin: 0 0 32px 0; font-size: 14px;">Davet kodunuz hazır!</p>

        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 28px; text-align: center; margin-bottom: 24px;">
          <p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; margin: 0 0 12px 0;">Davet Kodunuz</p>
          <p style="color: #f1f5f9; font-size: 34px; font-weight: 900; font-family: 'Courier New', monospace; letter-spacing: 0.22em; margin: 0;">${code}</p>
        </div>

        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
          Bu kod <strong style="color: #f1f5f9;">${timeStr}</strong> saatine kadar geçerlidir (5 dakika).
        </p>
        <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
          Uygulamayı açın, <strong style="color: #f1f5f9;">"Kod kullanarak giriş yap"</strong> seçeneğini seçin
          ve bu kodu <strong style="color: #f1f5f9;">Davet Kodu</strong> alanına girin.
        </p>
        <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0;" />
        <p style="color: #475569; font-size: 11px;">Bu kodu sadece siz alıyorsunuz. Başkalarıyla paylaşmayın.</p>
      </div>
    `;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: `${APP_NAME} — Davet Kodunuz`,
        html: htmlBody,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Resend API hatası: ${errText}`);
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

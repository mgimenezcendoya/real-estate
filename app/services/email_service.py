# app/services/email_service.py
import logging
import resend
from app.config import get_settings

logger = logging.getLogger(__name__)


def send_password_reset_email(to: str, reset_url: str) -> None:
    """Send password reset email via Resend."""
    settings = get_settings()
    if not settings.resend_api_key:
        logger.warning("RESEND_API_KEY not set — skipping email send")
        return

    resend.api_key = settings.resend_api_key

    resend.Emails.send({
        "from": f"REALIA <{settings.resend_from_email}>",
        "to": [to],
        "subject": "Recuperá tu contraseña — REALIA",
        "html": f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="color: #1d4ed8; font-size: 20px; margin-bottom: 8px;">Recuperá tu contraseña</h2>
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            Recibimos una solicitud para restablecer la contraseña de tu cuenta REALIA.
            Hacé click en el botón para continuar. El link es válido por 30 minutos.
          </p>
          <a href="{reset_url}" style="display:inline-block;margin:24px 0;padding:12px 24px;background:#1d4ed8;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Restablecer contrase&ntilde;a</a>
          <p style="color:#9ca3af;font-size:12px;">
            Si no solicitaste este cambio, podés ignorar este email. Tu contraseña no será modificada.
          </p>
          <p style="color:#9ca3af;font-size:12px;">
            O copiá este link en tu navegador:<br/>
            <span style="color:#1d4ed8;">{reset_url}</span>
          </p>
        </div>
        """,
    })
    logger.info("Password reset email sent to %s", to)

import logging
import smtplib
from email.message import EmailMessage

from config.settings import GMAIL_ADDRESS, GMAIL_APP_PASSWORD

logger = logging.getLogger("pipeline")


def validate_smtp_config() -> bool:
    if not GMAIL_ADDRESS or not GMAIL_APP_PASSWORD:
        logger.warning(
            "Gmail credentials not configured. "
            "Set GMAIL_ADDRESS and GMAIL_APP_PASSWORD environment variables."
        )
        return False
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=15) as smtp:
            smtp.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
        return True
    except smtplib.SMTPAuthenticationError:
        logger.warning(
            "Gmail authentication failed. "
            "Check your App Password (remove spaces, must be 16 chars)."
        )
        return False
    except OSError as e:
        logger.warning("Cannot reach Gmail SMTP: %s", e)
        return False


def send_email(to_address: str, subject: str, body: str) -> bool:
    if not GMAIL_ADDRESS or not GMAIL_APP_PASSWORD:
        logger.error("Cannot send: Gmail credentials not configured.")
        return False
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = GMAIL_ADDRESS
    msg["To"] = to_address
    msg.set_content(body)
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as smtp:
            smtp.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
            smtp.send_message(msg)
        logger.info("Email sent to %s — subject: %s", to_address, subject)
        return True
    except smtplib.SMTPAuthenticationError:
        logger.error("Gmail authentication failed — cannot send email.")
        return False
    except smtplib.SMTPException as e:
        logger.error("SMTP error sending to %s: %s", to_address, e)
        return False
    except OSError as e:
        logger.error("Network error sending email: %s", e)
        return False

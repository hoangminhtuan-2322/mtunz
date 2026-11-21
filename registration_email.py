"""Deliver registration codes over HTTPS without storing provider credentials in the database."""
import json
import os
from urllib.request import Request, urlopen


def enabled():
    return bool(os.getenv('RESEND_API_KEY','').strip() and os.getenv('EMAIL_FROM','').strip())


def send_code(email, code):
    payload = {
        'from': os.environ['EMAIL_FROM'].strip(),
        'to': [email],
        'subject': 'Mã xác nhận đăng ký MTUNZ',
        'text': f'Mã xác nhận của bạn là {code}. Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu đăng ký, hãy bỏ qua email này.',
    }
    request = Request('https://api.resend.com/emails',data=json.dumps(payload).encode(),
                      headers={'Authorization':'Bearer '+os.environ['RESEND_API_KEY'].strip(),
                               'Content-Type':'application/json','User-Agent':'MTUNZ/2.0'})
    with urlopen(request,timeout=8):
        pass

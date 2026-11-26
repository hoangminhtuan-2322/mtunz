import os
import tempfile
from unittest.mock import Mock
import pytest
os.environ.setdefault('DATA_DIR', tempfile.mkdtemp(prefix='mtunz_video_api_'))
from fastapi.testclient import TestClient
from app import app, db
from test_flows import logged_admin, register_user
import video_upload_api as video
from video_storage import PART_BYTES, MAX_VIDEO_BYTES

def test_large_video_disabled_without_configuration(monkeypatch):
    monkeypatch.delenv('MTUNZ_R2_ENABLED',raising=False)
    admin=logged_admin()
    assert admin.get('/api/video-uploads/config').json()=={'enabled':False,'max_bytes':16*1024*1024}

def test_owner_reservation_resume_and_completion(monkeypatch):
    admin=logged_admin()
    alice=register_user(admin,'video_owner_test')
    bob=register_user(admin,'video_other_test')
    store=Mock()
    store.new_key.return_value='videos/'+'c'*48
    store.client.list_multipart_uploads.return_value={'Uploads':[]}
    store.begin.return_value='private-r2-upload'
    store.uploaded_parts.return_value=[]
    store.presign_part.return_value={'url':'https://example.invalid','bytes':PART_BYTES}
    monkeypatch.setattr(video,'enabled',lambda:True)
    monkeypatch.setattr(video,'configured_store',lambda:store)
    payload={'client_key':'video-test-client-001','name':'original.mp4','mime':'video/mp4','size':PART_BYTES+8}
    result=alice.post('/api/video-uploads',json=payload)
    assert result.status_code==200,result.text
    key=result.json()['upload_id']
    assert bob.get('/api/video-uploads/'+key).status_code==404
    assert bob.post('/api/video-uploads/'+key+'/parts/1').status_code==404
    assert bob.post('/api/video-uploads/'+key+'/complete').status_code==404
    assert alice.post('/api/video-uploads',json=payload).json()['upload_id']==key
    assert store.begin.call_count==1
    assert alice.post('/api/video-uploads/'+key+'/parts/3').status_code==422
    assert alice.post('/api/video-uploads/'+key+'/parts/1').status_code==200
    store.uploaded_parts.return_value=[{'PartNumber':1,'Size':PART_BYTES}]
    assert alice.get('/api/video-uploads/'+key).json()['completed_parts']==[1]
    # Verification represents a remotely completed, validated object.
    store.verify_object.return_value=True
    finished=alice.post('/api/video-uploads/'+key+'/complete')
    assert finished.status_code==200,finished.text
    attachment=finished.json()['attachment']
    assert attachment['size']==payload['size']
    assert alice.post('/api/video-uploads/'+key+'/complete').json()['attachment']['id']==attachment['id']
    assert bob.get(attachment['url']).status_code==403
    with db() as c:
        row=c.execute('SELECT file_content FROM attachments WHERE id=?',(attachment['id'],)).fetchone()
        assert row['file_content'] is None

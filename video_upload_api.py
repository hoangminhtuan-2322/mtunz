"""Owner-scoped, quota-reserved private multipart video upload API."""
import asyncio
import logging
import os
import re
from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field
from video_storage import (R2Config, PrivateVideoStore, ALLOWED_MIME, MAX_VIDEO_BYTES,
    PART_BYTES, USER_VIDEO_QUOTA, SYSTEM_VIDEO_QUOTA, URL_TTL, part_plan, check_quota)

LOG=logging.getLogger(__name__)
PREFIX='/api/video-uploads'
UPLOAD_TTL=24*3600
LOCK_KEY='video_storage_quota_lock'


def configured_store():
    cfg=R2Config.from_env()
    return PrivateVideoStore(cfg.client(),cfg.bucket)


def enabled():
    if os.getenv('MTUNZ_R2_ENABLED')!='1':
        return False
    try:
        R2Config.from_env()
        return True
    except (ValueError,RuntimeError):
        return False


def missing(exc):
    code=getattr(exc,'response',{}).get('Error',{}).get('Code','')
    return str(code) in ('404','NoSuchKey','NotFound','NoSuchUpload')


def lock(c):
    # UPDATE takes the same write lock for every reservation on SQLite/PG.
    c.execute('UPDATE settings SET value=value WHERE key=?',(LOCK_KEY,))


def initialize(core):
    with core.db() as c:
        c.execute("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO NOTHING",(LOCK_KEY,'1'))
        c.execute("""CREATE TABLE IF NOT EXISTS video_uploads (
            upload_key TEXT PRIMARY KEY, owner_id BIGINT NOT NULL,
            client_key TEXT NOT NULL, original_name TEXT NOT NULL,
            mime TEXT NOT NULL, size BIGINT NOT NULL, object_key TEXT NOT NULL UNIQUE,
            upload_id TEXT, state TEXT NOT NULL, expires_at BIGINT NOT NULL,
            attachment_id BIGINT, cleanup_after BIGINT NOT NULL DEFAULT 0,
            UNIQUE(owner_id,client_key))""")
        c.execute('CREATE INDEX IF NOT EXISTS video_upload_state_idx ON video_uploads(state,expires_at)')
        c.execute('CREATE INDEX IF NOT EXISTS video_upload_attachment_idx ON video_uploads(attachment_id)')


def reserve(core,uid,client_key,name,mime,size,store):
    with core.db() as c:
        lock(c)
        old=core.one(c,'SELECT * FROM video_uploads WHERE owner_id=? AND client_key=?',(uid,client_key))
        if old:
            if (old['original_name'],old['mime'],old['size'])!=(name,mime,size):
                raise HTTPException(409,'Mã tải đã dùng cho video khác.')
            if old['state']=='cleanup' or old['state']!='ready' and old['expires_at']<=core.now():
                raise HTTPException(409,'Phiên tải đã hết hạn. Hãy chọn lại video.')
            return old['upload_key']
        own=core.one(c,'SELECT COALESCE(SUM(size),0) AS total FROM video_uploads WHERE owner_id=?',(uid,))['total']
        total=core.one(c,'SELECT COALESCE(SUM(size),0) AS total FROM video_uploads')['total']
        try:check_quota(size,own,total)
        except ValueError:raise HTTPException(413,'Đã hết dung lượng video cho phép.') from None
        key=store.new_key()
        upload_key=key.split('/')[1]
        c.execute("""INSERT INTO video_uploads(upload_key,owner_id,client_key,original_name,mime,size,object_key,state,expires_at)
            VALUES(?,?,?,?,?,?,?,?,?)""",(upload_key,uid,client_key,name,mime,size,key,'reserved',core.now()+UPLOAD_TTL))
        return upload_key


def owned(core,c,uid,key):
    if not re.fullmatch(r'[a-f0-9]{48}',key):
        raise HTTPException(404,'Không tìm thấy phiên tải.')
    row=core.one(c,'SELECT * FROM video_uploads WHERE upload_key=? AND owner_id=?',(key,uid))
    if not row:
        raise HTTPException(404,'Không tìm thấy phiên tải.')
    if row['state']=='cleanup' or row['state']!='ready' and row['expires_at']<=core.now():
        raise HTTPException(409,'Phiên tải đã hết hạn hoặc đã hủy.')
    return row


def remote_uploads(store,key):
    result=store.client.list_multipart_uploads(Bucket=store.bucket,Prefix=key,MaxUploads=100)
    if result.get('IsTruncated'):
        raise RuntimeError('Unexpected multipart listing.')
    return [x['UploadId'] for x in result.get('Uploads',[]) if x.get('Key')==key]


def ensure_active(core,uid,key,store):
    with core.db() as c:
        lock(c)
        row=owned(core,c,uid,key)
        if row['state']=='reserved':
            # Recover a create call whose response was lost after R2 accepted it.
            uploads=remote_uploads(store,row['object_key'])
            if len(uploads)>1:
                raise RuntimeError('Ambiguous multipart creation.')
            upload_id=uploads[0] if uploads else store.begin(row['object_key'],row['mime'])
            c.execute("UPDATE video_uploads SET upload_id=?,state='active' WHERE upload_key=?",(upload_id,key))


def snapshot(core,c,row,store):
    result={'upload_id':row['upload_key'],'size':row['size'],'part_bytes':PART_BYTES,'completed_parts':[]}
    if row['state']=='ready':
        att=core.one(c,'SELECT id,original_name,mime,size FROM attachments WHERE id=? AND owner_id=?',(row['attachment_id'],row['owner_id']))
        if not att:raise HTTPException(404,'Video không còn tồn tại.')
        result['attachment']={'id':att['id'],'name':att['original_name'],'mime':att['mime'],'size':att['size'],'url':f"/api/attachments/{att['id']}"}
    elif row['state']=='active':
        expected=dict(part_plan(row['size']))
        try:
            parts=store.uploaded_parts(row['object_key'],row['upload_id'])
            result['completed_parts']=[p['PartNumber'] for p in parts if expected.get(p.get('PartNumber'))==p.get('Size')]
        except Exception as exc:
            # Completion may have succeeded remotely before the DB commit.
            if not missing(exc):raise
    return result


def cleanup(core,store):
    at=core.now()
    with core.db() as c:
        lock(c)
        c.execute("""UPDATE video_uploads SET state='cleanup',cleanup_after=?
            WHERE state IN ('reserved','active') AND expires_at<=?""",(at+URL_TTL+60,at))
        c.execute("""UPDATE video_uploads SET state='cleanup',cleanup_after=?
            WHERE state='ready' AND NOT EXISTS(SELECT 1 FROM attachments a WHERE a.id=video_uploads.attachment_id
            AND a.owner_id=video_uploads.owner_id)""",(at+URL_TTL+60,))
        rows=core.many(c,"SELECT upload_key FROM video_uploads WHERE state='cleanup' AND cleanup_after<=? LIMIT 10",(at,))
    for item in rows:
        try:
            with core.db() as c:
                lock(c)
                row=core.one(c,"SELECT * FROM video_uploads WHERE upload_key=? AND state='cleanup'",(item['upload_key'],))
                if not row:continue
                key=row['object_key']
                for upload_id in remote_uploads(store,key):
                    try:store.abort(key,upload_id)
                    except Exception as exc:
                        if not missing(exc):raise
                if remote_uploads(store,key):continue
                store.delete(key)
                try:store.client.head_object(Bucket=store.bucket,Key=key)
                except Exception as exc:
                    if not missing(exc):raise
                else:continue
                # Do not release quota until provider confirms cleanup.
                c.execute('DELETE FROM video_uploads WHERE upload_key=?',(row['upload_key'],))
        except Exception:
            LOG.warning('Private video cleanup pending; reservation retained.')


class Start(BaseModel):
    client_key:str=Field(min_length=16,max_length=64,pattern=r'^[A-Za-z0-9_-]+$')
    name:str=Field(min_length=1,max_length=120)
    mime:str
    size:int=Field(strict=True,gt=0,le=MAX_VIDEO_BYTES)


def install(core):
    initialize(core)
    app=core.app
    def get_store(request,scope,limit=240):
        user=core.current_user(request)
        if user['is_admin']:raise HTTPException(403,'Không hỗ trợ tải video từ tài khoản quản trị.')
        if not enabled():raise HTTPException(503,'Kho video lớn chưa được kích hoạt.')
        core.throttle(request,scope,limit,3600,str(user['id']))
        try:return user['id'],configured_store()
        except Exception:raise HTTPException(503,'Kho video tạm thời không khả dụng.') from None

    def unavailable():
        return HTTPException(503,'Kho video chưa phản hồi. Hãy thử lại phiên tải hiện tại.')

    @app.get(PREFIX+'/config')
    def config(request:Request):
        core.current_user(request)
        return {'enabled':enabled(),'max_bytes':MAX_VIDEO_BYTES if enabled() else 16*1024*1024}

    @app.post(PREFIX)
    def start(request:Request,body:Start):
        uid,store=get_store(request,'video-start',30)
        if body.mime not in ALLOWED_MIME:raise HTTPException(415,'Chỉ hỗ trợ video MP4/WebM.')
        name=re.sub(r'[\x00-\x1f\x7f/\\]+','_',body.name).strip('. ') or 'video'
        suffix='.mp4' if body.mime=='video/mp4' else '.webm'
        if not name.lower().endswith(suffix):name=name[:114]+suffix
        try:
            key=reserve(core,uid,body.client_key,name,body.mime,body.size,store)
            ensure_active(core,uid,key,store)
            with core.db() as c:
                lock(c)
                return snapshot(core,c,owned(core,c,uid,key),store)
        except HTTPException:raise
        except Exception:raise unavailable() from None

    @app.get(PREFIX+'/{key}')
    def status(request:Request,key:str):
        uid,store=get_store(request,'video-status')
        try:
            with core.db() as c:
                lock(c)
                return snapshot(core,c,owned(core,c,uid,key),store)
        except HTTPException:raise
        except Exception:raise unavailable() from None

    @app.post(PREFIX+'/{key}/parts/{number}')
    def part(request:Request,key:str,number:int):
        uid,store=get_store(request,'video-part',800)
        try:
            with core.db() as c:
                lock(c)
                row=owned(core,c,uid,key)
                if row['state']!='active':raise HTTPException(409,'Phiên tải không còn mở.')
                if number not in dict(part_plan(row['size'])):raise HTTPException(422,'Phần tải không hợp lệ.')
                return store.presign_part(row['object_key'],row['upload_id'],row['size'],number)
        except HTTPException:raise
        except Exception:raise unavailable() from None

    @app.post(PREFIX+'/{key}/complete')
    def complete(request:Request,key:str):
        uid,store=get_store(request,'video-complete',40)
        try:
            with core.db() as c:
                lock(c)
                row=owned(core,c,uid,key)
                if row['state']=='ready':return snapshot(core,c,row,store)
                if row['state']!='active':raise HTTPException(409,'Phiên tải chưa sẵn sàng.')
                if not core.one(c,'SELECT 1 FROM users WHERE id=?',(uid,)) or core.one(c,'SELECT 1 FROM account_deletion_requests WHERE user_id=?',(uid,)):
                    raise HTTPException(403,'Tài khoản không còn quyền tải.')
                try:store.verify_object(row['object_key'],row['size'],row['mime'])
                except Exception as exc:
                    if not missing(exc):raise
                    try:store.complete(row['object_key'],row['upload_id'],row['size'])
                    except ValueError:raise HTTPException(409,'Video chưa tải đủ các phần.') from None
                    store.verify_object(row['object_key'],row['size'],row['mime'])
                cur=c.execute("""INSERT INTO attachments(owner_id,stored_name,original_name,mime,size,created_at,file_content,upload_key)
                    VALUES(?,?,?,?,?,?,NULL,?)""",(uid,'r2-'+key,row['original_name'],row['mime'],row['size'],core.now(),row['client_key']))
                c.execute("UPDATE video_uploads SET state='ready',attachment_id=? WHERE upload_key=?",(cur.lastrowid,key))
                return snapshot(core,c,owned(core,c,uid,key),store)
        except HTTPException:raise
        except ValueError:raise HTTPException(415,'Nội dung video không đúng định dạng hoặc dung lượng.') from None
        except Exception:raise unavailable() from None

    @app.delete(PREFIX+'/{key}')
    def cancel(request:Request,key:str):
        uid,_=get_store(request,'video-cancel',40)
        with core.db() as c:
            lock(c)
            row=owned(core,c,uid,key)
            if row['state']=='ready':raise HTTPException(409,'Video đã hoàn tất.')
            c.execute("UPDATE video_uploads SET state='cleanup',cleanup_after=? WHERE upload_key=?",(core.now()+URL_TTL+60,key))
        return {'cancelled':True}

    async def cleanup_loop():
        while True:
            try:
                # Also run when new uploads are disabled but the bucket still exists.
                if os.getenv('MTUNZ_R2_BUCKET'):
                    await asyncio.to_thread(lambda:cleanup(core,configured_store()))
            except Exception:LOG.warning('Private video cleanup unavailable.')
            await asyncio.sleep(120)

    @app.on_event('startup')
    async def start_cleanup():
        app.state.video_cleanup_task=asyncio.create_task(cleanup_loop())

    @app.on_event('shutdown')
    async def stop_cleanup():
        task=getattr(app.state,'video_cleanup_task',None)
        if task:
            task.cancel()
            await asyncio.gather(task,return_exceptions=True)


def stream_attachment(core,file,headers,range_header,range_parser):
    """Called only AFTER normal attachment authorization. Never buffer the whole video."""
    with core.db() as c:
        row=core.one(c,"SELECT object_key,size FROM video_uploads WHERE attachment_id=? AND state='ready'",(file['id'],))
    if not row:raise HTTPException(404,'Video không còn tồn tại.')
    total=row['size']
    window=range_parser(range_header,total) if range_header else None
    headers={**headers,'Accept-Ranges':'bytes'}
    if window==():return Response(status_code=416,headers={**headers,'Content-Range':f'bytes */{total}'})
    try:
        store=configured_store()
        params={'Bucket':store.bucket,'Key':row['object_key']}
        if window:params['Range']=f'bytes={window[0]}-{window[1]-1}'
        result=store.client.get_object(**params)
        length=window[1]-window[0] if window else total
        if result.get('ContentLength')!=length:
            result['Body'].close()
            raise RuntimeError('Incorrect object length.')
    except Exception as exc:
        raise HTTPException(404 if missing(exc) else 503,'Video tạm thời không khả dụng.') from None
    body=result['Body']
    def chunks():
        try:
            while data:=body.read(256*1024):yield data
        finally:body.close()
    headers['Content-Length']=str(length)
    if window:headers['Content-Range']=f'bytes {window[0]}-{window[1]-1}/{total}'
    return StreamingResponse(chunks(),status_code=206 if window else 200,media_type=file['mime'],headers=headers)

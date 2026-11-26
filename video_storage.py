"""Private R2 video transport primitives.

No HTTP routes are exposed by this module. Callers must bind every upload to
an authenticated owner, atomically reserve quota, and persist object lifecycle
state before using it. Never put the credentials or raw object key in chat data.
"""
from __future__ import annotations

import os
import re
import secrets
from dataclasses import dataclass
from urllib.parse import parse_qs, quote, urlparse

MIB=1024*1024
MAX_VIDEO_BYTES=500*MIB
USER_VIDEO_QUOTA=1_000_000_000
SYSTEM_VIDEO_QUOTA=9_000_000_000
PART_BYTES=8*MIB
URL_TTL=300
ALLOWED_MIME={'video/mp4','video/webm'}
KEY_PATTERN=re.compile(r'videos/[a-f0-9]{48}')


def part_plan(size):
    if type(size) is not int or not 1<=size<=MAX_VIDEO_BYTES:
        raise ValueError('Invalid video size.')
    return [(n+1,min(PART_BYTES,size-offset))
            for n,offset in enumerate(range(0,size,PART_BYTES))]


def check_quota(size,user_reserved,system_reserved):
    part_plan(size)
    if any(type(v) is not int or v<0 for v in (user_reserved,system_reserved)):
        raise ValueError('Invalid quota accounting.')
    if user_reserved+size>USER_VIDEO_QUOTA or system_reserved+size>SYSTEM_VIDEO_QUOTA:
        raise ValueError('Video storage quota exceeded.')


def verified_parts(size,rows):
    """Use storage-authoritative sizes/ETags, never client-provided metadata."""
    expected=dict(part_plan(size))
    found={}
    for row in rows:
        number=row.get('PartNumber')
        if type(number) is not int or number not in expected or number in found:
            raise ValueError('Invalid or duplicate part.')
        if type(row.get('Size')) is not int or row['Size']!=expected[number]:
            raise ValueError('Unexpected part length.')
        etag=row.get('ETag')
        if not isinstance(etag,str) or not re.fullmatch(r'"[a-fA-F0-9]{32}"',etag):
            raise ValueError('Invalid part ETag.')
        found[number]={'PartNumber':number,'ETag':etag}
    if set(found)!=set(expected):
        raise ValueError('Upload incomplete.')
    return [found[n] for n in sorted(found)]


def checked_key(key):
    if not isinstance(key,str) or not KEY_PATTERN.fullmatch(key):
        raise ValueError('Invalid object key.')
    return key


def valid_header(mime,content):
    if mime=='video/mp4':
        return len(content)>=12 and content[4:8]==b'ftyp'
    return mime=='video/webm' and content.startswith(b'\x1a\x45\xdf\xa3')


@dataclass(frozen=True)
class R2Config:
    account: str
    bucket: str
    access_key: str
    secret_key: str

    @classmethod
    def from_env(cls):
        values=[os.environ.get('MTUNZ_R2_'+name,'').strip()
                for name in ('ACCOUNT_ID','BUCKET','ACCESS_KEY_ID','SECRET_ACCESS_KEY')]
        if not all(values):
            raise RuntimeError('Private R2 storage is not configured.')
        if not re.fullmatch(r'[a-fA-F0-9]{32}',values[0]) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]',values[1]):
            raise ValueError('Invalid R2 account or bucket.')
        return cls(*values)

    def client(self):
        import boto3
        from botocore.config import Config
        return boto3.client('s3',endpoint_url=f'https://{self.account}.r2.cloudflarestorage.com',
                            aws_access_key_id=self.access_key,aws_secret_access_key=self.secret_key,
                            region_name='auto',config=Config(signature_version='s3v4',
                                s3={'addressing_style':'path'},
                                connect_timeout=8,read_timeout=30,
                                retries={'max_attempts':2,'mode':'standard'},
                                request_checksum_calculation='when_required',
                                response_checksum_validation='when_required'))


class PrivateVideoStore:
    def __init__(self,client,bucket):
        self.client=client
        self.bucket=bucket

    def new_key(self):
        return 'videos/'+secrets.token_hex(24)

    def begin(self,key,mime):
        checked_key(key)
        if mime not in ALLOWED_MIME:
            raise ValueError('Unsupported video MIME type.')
        result=self.client.create_multipart_upload(Bucket=self.bucket,Key=key,
            ContentType=mime,CacheControl='private, no-store')
        return result['UploadId']

    def presign_part(self,key,upload_id,size,number):
        checked_key(key)
        expected=dict(part_plan(size))
        if type(number) is not int or number not in expected:
            raise ValueError('Invalid part number.')
        # Bind the exact expected length to the signature. Never sign an
        # unconstrained UploadPart URL; verify the SDK actually signed it.
        url=self.client.generate_presigned_url('upload_part',Params={
            'Bucket':self.bucket,'Key':key,'UploadId':upload_id,
            'PartNumber':number,'ContentLength':expected[number]},
            ExpiresIn=URL_TTL,HttpMethod='PUT')
        signed=parse_qs(urlparse(url).query).get('X-Amz-SignedHeaders',[''])[0].split(';')
        if 'content-length' not in signed:
            raise RuntimeError('SDK did not bind part size.')
        return {'url':url,'bytes':expected[number],'expires_in':URL_TTL}

    def uploaded_parts(self,key,upload_id):
        checked_key(key)
        # At most 63 parts for 500 MiB. Fail closed on truncated responses.
        response=self.client.list_parts(Bucket=self.bucket,Key=key,UploadId=upload_id,MaxParts=100)
        if response.get('IsTruncated'):
            raise ValueError('Unexpected multipart listing size.')
        return response.get('Parts',[])

    def complete(self,key,upload_id,size):
        parts=verified_parts(size,self.uploaded_parts(key,upload_id))
        self.client.complete_multipart_upload(Bucket=self.bucket,Key=key,
            UploadId=upload_id,MultipartUpload={'Parts':parts})

    def verify_object(self,key,size,mime):
        checked_key(key)
        part_plan(size)
        if mime not in ALLOWED_MIME:
            raise ValueError('Unsupported video MIME type.')
        meta=self.client.head_object(Bucket=self.bucket,Key=key)
        if meta.get('ContentLength')!=size or meta.get('ContentType')!=mime:
            raise ValueError('Object metadata mismatch.')
        result=self.client.get_object(Bucket=self.bucket,Key=key,Range='bytes=0-19')
        body=result['Body']
        try:
            content=body.read(20)
        finally:
            body.close()
        if not valid_header(mime,content):
            raise ValueError('Video header does not match declared MIME.')
        return True

    def playback_url(self,key,name,mime,download=False):
        checked_key(key)
        if mime not in ALLOWED_MIME:
            raise ValueError('Unsupported video MIME type.')
        clean=re.sub(r'[\x00-\x1f\x7f/\\]+','_',str(name))[:120] or 'video'
        disposition='attachment' if download else 'inline'
        return self.client.generate_presigned_url('get_object',Params={
            'Bucket':self.bucket,'Key':key,'ResponseContentType':mime,
            'ResponseCacheControl':'private, no-store',
            'ResponseContentDisposition':f"{disposition}; filename*=UTF-8''{quote(clean,safe='')}"},
            ExpiresIn=URL_TTL,HttpMethod='GET')

    def abort(self,key,upload_id):
        self.client.abort_multipart_upload(Bucket=self.bucket,Key=checked_key(key),UploadId=upload_id)

    def delete(self,key):
        self.client.delete_object(Bucket=self.bucket,Key=checked_key(key))

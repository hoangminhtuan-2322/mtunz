import io
import unittest
from unittest.mock import Mock
from urllib.parse import parse_qs, urlparse
from video_storage import (R2Config,PrivateVideoStore,part_plan,verified_parts,check_quota,
                           MAX_VIDEO_BYTES,PART_BYTES,USER_VIDEO_QUOTA,SYSTEM_VIDEO_QUOTA)

KEY='videos/'+'a'*48
ETAG='"'+'a'*32+'"'

class StorageTests(unittest.TestCase):
    def test_size_and_quota(self):
        plan=part_plan(MAX_VIDEO_BYTES)
        self.assertEqual(sum(size for _,size in plan),MAX_VIDEO_BYTES)
        self.assertEqual(len(plan),63)
        self.assertEqual(plan[-1][1],4*1024*1024)
        for bad in (0,-1,True,MAX_VIDEO_BYTES+1):
            with self.assertRaises(ValueError):part_plan(bad)
        check_quota(1,USER_VIDEO_QUOTA-1,SYSTEM_VIDEO_QUOTA-1)
        with self.assertRaises(ValueError):check_quota(1,USER_VIDEO_QUOTA,SYSTEM_VIDEO_QUOTA-1)
        with self.assertRaises(ValueError):check_quota(1,0,SYSTEM_VIDEO_QUOTA)

    def test_storage_authoritative_parts(self):
        size=PART_BYTES+100
        rows=[{'PartNumber':2,'Size':100,'ETag':ETAG},{'PartNumber':1,'Size':PART_BYTES,'ETag':ETAG}]
        self.assertEqual([p['PartNumber'] for p in verified_parts(size,rows)],[1,2])
        for bad in (rows[:1],rows+rows[:1],[dict(rows[0],Size=101),rows[1]]):
            with self.assertRaises(ValueError):verified_parts(size,bad)
        client=Mock()
        client.list_parts.return_value={'Parts':rows}
        store=PrivateVideoStore(client,'private-bucket')
        store.complete(KEY,'upload-id',size)
        self.assertEqual(client.complete_multipart_upload.call_args.kwargs['MultipartUpload']['Parts'],verified_parts(size,rows))
        client.list_parts.return_value={'Parts':rows[:1]}
        client.complete_multipart_upload.reset_mock()
        with self.assertRaises(ValueError):store.complete(KEY,'upload-id',size)
        client.complete_multipart_upload.assert_not_called()

    def test_header_and_object_size(self):
        client=Mock()
        client.head_object.return_value={'ContentLength':20,'ContentType':'video/mp4'}
        body=io.BytesIO(b'\x00\x00\x00\x18ftypisom'+b'0'*8)
        client.get_object.return_value={'Body':body}
        store=PrivateVideoStore(client,'private-bucket')
        self.assertTrue(store.verify_object(KEY,20,'video/mp4'))
        self.assertTrue(body.closed)
        with self.assertRaises(ValueError):store.verify_object(KEY,19,'video/mp4')
        client.get_object.return_value={'Body':io.BytesIO(b'not video')}
        with self.assertRaises(ValueError):store.verify_object(KEY,20,'video/mp4')

    def test_presigned_part_exact_length(self):
        # Real SDK signing against dummy credentials, no network or R2 account.
        cfg=R2Config('a'*32,'private-bucket','dummy-access','dummy-secret')
        store=PrivateVideoStore(cfg.client(),cfg.bucket)
        result=store.presign_part(KEY,'fake-upload',PART_BYTES+7,2)
        self.assertEqual(result['bytes'],7)
        query=parse_qs(urlparse(result['url']).query)
        self.assertIn('content-length',query['X-Amz-SignedHeaders'][0].split(';'))
        self.assertEqual(query['X-Amz-Expires'],['300'])
        with self.assertRaises(ValueError):store.presign_part(KEY,'fake-upload',7,2)
        with self.assertRaises(ValueError):store.presign_part('../private','fake-upload',7,1)

if __name__=='__main__':
    unittest.main()

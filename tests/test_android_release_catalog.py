import unittest
from android_release_catalog import select_release, BASE, verified_release_floor, latest_android_release
from unittest.mock import patch

def release(version, code, **kwargs):
    tag=f'android-v{version}-code{code}'
    name=f'mtunz-android-v{version}-code{code}.apk'
    row={'tag_name':tag,'draft':False,'prerelease':False,'published_at':'2026-11-24T00:00:00Z',
         'assets':[{'name':name,'state':'uploaded','size':123456,
                    'browser_download_url':BASE+tag+'/'+name,'digest':'sha256:'+'a'*64}]}
    row.update(kwargs)
    return row

class CatalogTests(unittest.TestCase):
    def test_latest_numeric_code_not_release_order(self):
        r=select_release([release('1.2.0',12),release('1.1.0',11),release('1.1.1',15)])
        self.assertEqual(r['version_code'],15)
        self.assertEqual(r['version'],'1.1.1')
        self.assertEqual(r['sha256'],'a'*64)
    def test_preview_draft_and_unrelated_releases_excluded(self):
        result=select_release([release('9.9.9',999,draft=True),release('8.0.0',888,prerelease=True),
          release('3.0.0',333,tag_name='web-release'),release('1.0.0',10)])
        self.assertEqual(result['version_code'],10)
    def test_reject_wrong_url_missing_file(self):
        r=release('1.2.3',20)
        r['assets'][0]['browser_download_url']='https://example.com/a.apk'
        self.assertFalse(select_release([r])['available'])
        self.assertFalse(select_release([release('1.1.0',11,assets=[])])['available'])
        self.assertFalse(select_release([])['available'])
    def test_offline_fallback_is_verified_stable_release(self):
        floor=verified_release_floor()
        self.assertTrue(floor['available'])
        self.assertEqual(floor['version_code'],21)
        with patch('android_release_catalog._cached',None), patch('android_release_catalog._expires',0), patch('android_release_catalog.urlopen',side_effect=OSError('rate limit')):
            result=latest_android_release()
            self.assertEqual(result['download_url'],floor['download_url'])
            self.assertTrue(result['stale'])
    def test_only_completed_asset(self):
        r=release('1.2.3',20)
        r['assets'][0]['state']='open'
        self.assertFalse(select_release([r])['available'])

if __name__=='__main__':
    unittest.main()

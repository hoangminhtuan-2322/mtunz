from pathlib import Path
import pytest
sync_playwright=pytest.importorskip('playwright.sync_api').sync_playwright

ROOT=Path(__file__).resolve().parents[1]

def test_fishing_layout():
    with sync_playwright() as p:
        browser=p.chromium.launch()
        for width,height in [(320,568),(375,667),(768,1024),(1024,768),(1440,900)]:
            page=browser.new_page()
            page.set_viewport_size({'width':width,'height':height})
            page.set_content('<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}.fishing-shell{height:100vh;box-sizing:border-box}</style><main class="fishing-shell"><div id="fishing-game"></div></main>')
            page.add_style_tag(path=str(ROOT/'static/fishing-life.css'))
            page.evaluate("""() => {
              window.state={user:{id:1},tab:'fishing'};
              window.esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
              window.api=async()=>({gold:150,level:1,rod:0,owned_rod:0,bag:[],bag_limit:200,book:[],server_ms:Date.now(),message:'',cast:null,catalog:{maps:[{name:'Ao Bình Yên',rod:0,fish:['Cá rô đồng']}],baits:[{name:'Giun đất',price:0}],rods:[{name:'Cần tre',price:0,luck:1}],tiers:[{name:'Phổ thông'}],mutations:[{name:'Bình thường'}]}});
            }""")
            page.add_script_tag(path=str(ROOT/'static/fishing-life.js'))
            page.evaluate('fishingMount()')
            page.locator('[data-fish=cast]').wait_for()
            page.wait_for_function("!document.querySelector('[data-fish=cast]').disabled")
            result=page.evaluate("""() => {
              const host=document.querySelector('.fishing-shell'),g=document.querySelector('#fishing-game'),a=document.querySelector('.fish-hero'),b=document.querySelector('.fish-side'),btn=document.querySelector('[data-fish=cast]');
              return {overflow:host.scrollWidth-host.clientWidth,cols:getComputedStyle(g).gridTemplateColumns.trim().split(/ +/).length,side:b.getBoundingClientRect().left>a.getBoundingClientRect().left,height:btn.getBoundingClientRect().height};
            }""")
            assert result['overflow']<=1,(width,result)
            assert result['cols']==(2 if width>=1024 else 1),(width,result)
            assert result['side']==(width>=1024),(width,result)
            assert result['height']>=44,(width,result)
            page.close()
        browser.close()

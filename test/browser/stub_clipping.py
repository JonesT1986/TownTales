import asyncio
from playwright.async_api import async_playwright
from common import BASE, make_route
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for w in [320, 360, 390, 414, 600, 641, 700, 768, 1024, 1280]:
            ctx = await b.new_context(viewport={'width': w, 'height': 800}); await ctx.route('**/*', make_route())
            pg = await ctx.new_page(); await pg.goto(BASE + '/whitewood-sk'); await pg.wait_for_timeout(1800)
            r = await pg.evaluate('''()=>[...document.querySelectorAll('.tick .stub span')].map(s=>{const b=s.getBoundingClientRect(),c=s.closest('.tick').getBoundingClientRect();const hit=document.elementFromPoint(b.x+2,b.y+b.height/2);return {t:s.textContent,clipped:s.scrollWidth>s.clientWidth||b.x<c.x,covered:!(hit&&s.contains(hit)), hit: hit&&hit.className}})''')
            print(w, r)
            await ctx.close()
        await b.close()
asyncio.run(main())

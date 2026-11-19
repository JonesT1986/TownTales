import sys, asyncio
from playwright.async_api import async_playwright
from common import BASE, make_route
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}); await ctx.route('**/*', make_route())
        pg = await ctx.new_page()
        for u in ['/whitewood-sk#i-568f3cdc-c042-4c15-a5b5-275cc5f7a05a', '/#i-568f3cdc-c042-4c15-a5b5-275cc5f7a05a']:
            await pg.goto(BASE + u); await pg.wait_for_timeout(2000)
            print(u, '->', pg.url, '| h1:', await pg.locator('#view h1').first.inner_text())
        await b.close()
asyncio.run(main())

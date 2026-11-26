# Nov 26 2026 checks: clipping cards + full view, timeline 5-per-year, New/community tags, clipping link
# from the timeline, place markers, admin clipping review (Transcribe image, Approve / + timeline / Reject),
# Remembrance "move to Archive", contacts view, report town field.  Usage: python3 nov26.py /tmp/out 390
import sys, asyncio, json
from playwright.async_api import async_playwright
from common import BASE, make_route
OUT = sys.argv[1]; W = int(sys.argv[2]) if len(sys.argv) > 2 else 390
CLIP = {'id': 'q1', 'town': 'radville-sk', 'image_url': 'https://zpqwrzsgpwwjrlbnfynn.supabase.co/storage/v1/object/public/clippings/q.jpg', 'paper_name': 'Regina Leader Post', 'date_label': '', 'headline': '', 'submitter_name': 'Tourism Radville', 'submitter_email': 'tourism@example.org', 'description': '', 'transcription': '', 'transcription_status': 'uploaded', 'moderation': 'pending', 'item_id': None}
def fn(u, body):
    a = u.split('/')[-1]
    if a == 'clip-queue': return {'clippings': [CLIP]}
    if a == 'clip-transcribe': return {'ok': True, 'transcription': 'Bennett Construction Company Gets Contract\n\n(Special Despatch)\n\nRADVILLE, Sask., Oct. 4.—Work on the [illegible] rink will be started at once. The contract was let today.', 'headline': 'Bennett Construction Company Gets Contract', 'paper': '', 'date': ''}
    if a == 'clip-decide': return {'ok': True, 'status': 'approved', 'item_id': 'x'}
    if a == 'rem-queue': return {'memorials': [{'id': 'm1', 'town': 'radville-sk', 'name': 'Rink clipping', 'note': 'newspaper', 'submission': {'submitter_name': 'A', 'submitter_email': 'a@b.c'}}]}
    if a == 'rem-move': return {'ok': True, 'item_id': 'y'}
    if a == 'contacts': return {'contacts': [{'town': 'radville-sk', 'name': 'Tourism Radville', 'email': 'tourism.radville@gmail.com', 'what': 'Clipping: Regina Leader Post, October 1929', 'at': '2026-11-24T18:06:55Z'}]}
    if a == 'settings': return {'settings': {'auto_approve_link_reader': True, 'new_tag_days': 30, 'new_tag_since': '2026-11-26'}}
    return {'items': []}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': W, 'height': 900}); log = []
        await ctx.route('**/*', make_route(fn, log))
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        # Timeline
        await pg.goto(BASE + '/radville-sk'); await pg.wait_for_timeout(2500)
        y29 = pg.locator('#tl-list article.tick[data-year="1929"]')
        print('1929 entries:', await y29.count(), 'visible:', await pg.locator('#tl-list article.tick[data-year="1929"]:not([hidden])').count())
        more = pg.locator('.tt-yr-more'); print('More buttons:', await more.count(), repr(await more.first.inner_text()))
        print('1930 has button:', await pg.locator('.tt-yr-more[data-yr$="|1930"]').count())
        await more.first.click(); await pg.wait_for_timeout(200)
        print('after More visible:', await pg.locator('#tl-list article.tick[data-year="1929"]:not([hidden])').count(), repr(await more.first.inner_text()))
        await pg.screenshot(path=f'{OUT}/tl-expanded-{W}.png', full_page=True)
        await more.first.click(); await pg.wait_for_timeout(200)
        print('after Show less visible:', await pg.locator('#tl-list article.tick[data-year="1929"]:not([hidden])').count())
        first = y29.first
        print('tags on rink entry:', await first.locator('.pill').all_inner_texts())
        print('tags on fresh entry:', await y29.nth(1).locator('.pill').all_inner_texts())
        await first.locator('summary').click(); await pg.wait_for_timeout(200)
        rf = first.locator('.readfull a'); print('readfull:', repr(await rf.inner_text()), await rf.get_attribute('href'))
        await first.screenshot(path=f'{OUT}/tl-card-open-{W}.png')
        await rf.click(); await pg.wait_for_timeout(1500)
        print('item page clipping block:', await pg.locator('.cl-on-item').count(), '| transcription shown:', await pg.locator('.cl-on-item .cl-trans').count())
        await pg.screenshot(path=f'{OUT}/item-clipping-{W}.png', full_page=True)
        # Archive clippings
        await pg.goto(BASE + '/radville-sk/archive'); await pg.wait_for_timeout(2500)
        cards = pg.locator('#tt-cl-list .cl-card'); print('clip cards:', await cards.count())
        print('card heights:', [round((await cards.nth(i).bounding_box())['height']) for i in range(await cards.count())])
        print('new tags on clip cards:', await pg.locator('#tt-cl-list .tt-new').count())
        await pg.locator('#tt-cl').scroll_into_view_if_needed(); await pg.screenshot(path=f'{OUT}/clip-cards-{W}.png')
        await cards.first.click(); await pg.wait_for_timeout(300)
        print('dialog open:', await pg.locator('#tt-cl-dlg').evaluate('d=>d.open'), '| has transcription:', await pg.locator('#tt-cl-dlg .cl-trans').count())
        await pg.screenshot(path=f'{OUT}/clip-dialog-{W}.png')
        await pg.keyboard.press('Escape')
        # Markers
        await pg.goto(BASE + '/'); await pg.wait_for_timeout(2500)
        print('home markers:', await pg.locator('#view .tt-mk-capital').count(), 'capital,', await pg.locator('#view .tt-mk-city').count(), 'city')
        await pg.screenshot(path=f'{OUT}/home-{W}.png', full_page=True)
        await pg.goto(BASE + '/regina-sk'); await pg.wait_for_timeout(2000)
        print('regina page line:', await pg.locator('.tt-mk-line').all_inner_texts())
        await pg.screenshot(path=f'{OUT}/regina-{W}.png')
        await pg.goto(BASE + '/province/saskatchewan'); await pg.wait_for_timeout(1500)
        print('province markers:', await pg.locator('.pv-towns .tt-mk-capital').count(), await pg.locator('.pv-towns .tt-mk-city').count(), '| legend:', await pg.locator('.tt-mk-legend').count())
        await pg.locator('#towns').screenshot(path=f'{OUT}/province-{W}.png')
        # Admin
        await pg.goto(BASE + '/#admin'); await pg.wait_for_timeout(1500)
        await pg.evaluate("sessionStorage.setItem('tt-admin','k')")
        await pg.goto(BASE + '/#admin'); await pg.wait_for_timeout(2000)
        await pg.locator('[data-tt=cl-load]').click(); await pg.wait_for_timeout(600)
        card = pg.locator('#tt-adm-out .qitem').first
        tl = card.locator('[data-tt=cl-tlform]')
        print('timeline btn disabled (no year):', await tl.is_disabled(), '| note visible:', await card.locator('.cl-tlneed').is_visible())
        await card.locator('[data-tt=cl-tx]').click(); await pg.wait_for_timeout(600)
        print('after transcribe: headline=', repr(await card.locator('[data-f=headline]').input_value()), '| note:', repr(await card.locator('.cl-txnote').inner_text())[:80])
        await card.locator('[data-f=date_label]').fill('October 1929'); await pg.wait_for_timeout(100)
        print('timeline btn disabled after year:', await tl.is_disabled())
        await tl.click(); await pg.wait_for_timeout(200)
        print('form:', {k: await card.locator(f'[data-tl={k}]').input_value() for k in ['year', 'date_label', 'title', 'body', 'source']})
        await card.screenshot(path=f'{OUT}/admin-clip-{W}.png')
        await card.locator('[data-tt=cl-tlgo]').click(); await pg.wait_for_timeout(500)
        print('msg:', await card.locator('.tt-msg').inner_text(), '| state:', await card.locator('.cl-state').inner_text())
        sent = [x for x in log if x[0] == 'clip-decide'][-1][1]; print('sent decide:', json.dumps(sent)[:300])
        await pg.locator('[data-tt=rm-load]').click(); await pg.wait_for_timeout(500)
        print('rem section pill:', await pg.locator('#tt-adm-out .pill').all_inner_texts())
        await pg.locator('[data-tt=rm-move]').click(); await pg.wait_for_timeout(400)
        print('after move:', await pg.locator('#tt-adm-out .qitem').first.inner_text())
        await pg.locator('[data-tt=ct-load]').click(); await pg.wait_for_timeout(400)
        print('contacts:', (await pg.locator('#tt-adm-out').inner_text())[:200].replace('\n', ' | '))
        await pg.locator('#tt-adm').screenshot(path=f'{OUT}/admin-groups-{W}.png')
        await pg.goto(BASE + '/#corrections'); await pg.wait_for_timeout(1200)
        print('report town field:', await pg.locator('#cr-town').count())
        await pg.goto(BASE + '/#upload'); await pg.wait_for_timeout(1200)
        print('people-only note on share form:', await pg.locator('.up-person').count())
        print('errors:', errs)
        await b.close()
asyncio.run(main())

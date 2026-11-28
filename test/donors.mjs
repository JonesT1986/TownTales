// Checks the donation parsing and Stripe signature code. Usage: node test/donors.mjs   (Node 22+ strips the types)
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { townFromRef, donationFrom, stripeVerified } from '../supabase/functions/donors/parse.ts';

const box = (label, value) => ({ key: label.toLowerCase().replace(/[^a-z]/g, ''), label: { custom: label }, text: { value } });
const s = (o) => ({ id: 'cs_1', amount_total: 2500, currency: 'cad', customer_details: { email: 'a@b.ca', name: 'A B' }, ...o });
const named = [box('Name to show on TownTales', ' Jane Doe '), box('In memory or honour of', 'John Smith')];

let d = donationFrom(s({ client_reference_id: 'donate_wapella-sk', custom_fields: named }));
assert.equal(d.p_town, 'wapella-sk'); assert.equal(d.p_name, 'Jane Doe'); assert.equal(d.p_dedication, 'John Smith'); assert.equal(d.p_subscription, null);
d = donationFrom(s({ client_reference_id: 'donate_general', subscription: 'sub_1' }));
assert.equal(d.p_town, null); assert.equal(d.p_name, ''); assert.equal(d.p_subscription, 'sub_1');
assert.ok(donationFrom(s({ custom_fields: named })), 'direct link with the boxes counts');
for (const ref of ['hp_' + 'a'.repeat(24), 'book_wapella-sk']) assert.equal(donationFrom(s({ client_reference_id: ref, custom_fields: named })), null);
assert.equal(donationFrom(s({})), null, 'unrelated checkout ignored');

// Same encoding the browser uses for accented slugs.
const enc = 'donateb_' + Buffer.from('île-à-la-crosse-sk').toString('base64url');
assert.match(enc, /^[A-Za-z0-9_-]+$/); assert.equal(townFromRef(enc), 'île-à-la-crosse-sk');

const now = Math.floor(Date.now() / 1000), raw = '{"a":1}';
const sig = (t, secret) => `t=${t},v1=` + createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
assert.equal(await stripeVerified(raw, sig(now, 'k'), 'k'), true);
assert.equal(await stripeVerified(raw + ' ', sig(now, 'k'), 'k'), false);
assert.equal(await stripeVerified(raw, sig(now, 'x'), 'k'), false);
assert.equal(await stripeVerified(raw, sig(now - 3600, 'k'), 'k'), false);
assert.equal(await stripeVerified(raw, null, 'k'), false);
console.log('donors: all checks passed');

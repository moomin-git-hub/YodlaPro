import assert from 'node:assert/strict';
// Run against a local server: BASE=http://localhost:3001 node test/mcp.test.mjs
const base = process.env.BASE ?? 'http://localhost:3001';
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
const j = async (p, o = {}) => { const r = await fetch(base + p, { ...o, headers: { 'content-type': 'application/json', ...(o.headers ?? {}) } }); return { status: r.status, body: await r.json().catch(() => null) }; };
const email = `mcp${Date.now()}@x.uz`;
const su = await j('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password: 'secret123', name: 'Mo' }) });
assert.equal(su.status, 200, JSON.stringify(su.body));
const auth = { authorization: 'Bearer ' + su.body.token };
assert.equal((await j('/api/claude', { headers: auth })).body.active, false);
const { body: { url } } = await j('/api/claude', { method: 'POST', headers: auth });
assert.match(url, /\/mcp\/yod_/); console.log('✓ connector link created');
const path = new URL(url).pathname;
const client = new Client({ name: 'test', version: '1' });
await client.connect(new StreamableHTTPClientTransport(new URL(base + path)));
const tools = (await client.listTools()).tools.map((t) => t.name);
console.log('✓ tools:', tools.join(', '));
const call = async (name, args = {}) => { const r = await client.callTool({ name, arguments: args }); return { err: r.isError, data: r.isError ? r.content[0].text : JSON.parse(r.content[0].text) }; };
let r = await call('add_cards', { deck: 'IELTS words', cards: [
  { question: 'meticulous', answer: 'sinchkov', example: 'She is meticulous about details.', explanation: 'juda ehtiyotkor, mayda narsalarga e’tiborli' },
  { question: 'The {{c1::capital}} of France is {{c2::Paris}}' },
] });
assert.equal(r.data.added, 2); assert.equal(r.data.card_ids.length, 3); console.log('✓ add_cards creates deck + cards (cloze → 2 cards)');
r = await call('add_cards', { cards: [{ question: 'x' }] }); assert.ok(r.err); console.log('✓ answer required for non-cloze');
r = await call('add_cards', { cards: [{ question: 'book', answer: 'kitob' }] }); assert.equal(r.data.deck.title, 'Claude');
r = await call('list_decks'); assert.ok(r.data.some((d) => d.title === 'IELTS words' && d.cards === 3));
r = await call('search_cards', { query: 'sinchkov' }); assert.equal(r.data[0].example, 'She is meticulous about details.');
const id = r.data[0].id;
r = await call('update_card', { card_id: id, answer: 'puxta, sinchkov' }); assert.equal(r.data.updated, 1);
r = await call('get_deck_cards', { deck: 'ielts words' }); assert.equal(r.data.total, 2); assert.equal(r.data.cards[0].answer, 'puxta, sinchkov');
r = await call('get_due_cards', { limit: 5 }); assert.ok(r.data.cards.length >= 2); assert.ok(r.data.cards[0].rating_intervals.good);
const rv = await call('review_card', { card_id: r.data.cards[0].id, rating: 3 }); assert.equal(rv.data.ok, true); console.log('✓ quiz: due cards + rating → next', rv.data.next_review_in);
r = await call('get_stats'); assert.equal(r.data.today.reviews, 1);
r = await call('set_new_words_per_day', { value: 30 }); assert.equal(r.data.new_words_per_day, 30);
r = await call('create_deck', { title: 'Verbs', parent_deck: 'IELTS words' }); assert.ok(r.data.created);
r = await call('delete_cards', { card_ids: [id] }); assert.equal(r.data.deleted, 1);
console.log('✓ list/search/update/deck cards/stats/settings/subdeck/delete');
// data visible to the app through normal sync
const sync = await j('/api/sync', { headers: auth });
assert.ok(sync.body.flashcards.some((c) => c.front.startsWith('The {{c1::') && c.card_type === 'cloze'));
assert.equal(sync.body.user_settings[0].data.newPerDay, 30); console.log('✓ app sync sees the changes');
// revoke
await client.close();
await j('/api/claude', { method: 'DELETE', headers: auth });
const bad = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) });
assert.equal(bad.status, 401); console.log('✓ revoked link → 401');
const bad2 = await fetch(base + '/mcp/yod_' + 'a'.repeat(32), { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
assert.equal(bad2.status, 401);
await j('/api/auth/me', { method: 'DELETE', headers: auth });
console.log('\nMCP OK');

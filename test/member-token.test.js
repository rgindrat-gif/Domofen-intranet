'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', 'src', 'domofen-forms.js'), 'utf8')
const STUB_TOKEN = 'test-member-token'

function jsonResponse(body, status) {
  status = status == null ? 200 : status
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status: status,
    json: function () { return Promise.resolve(body) },
    text: function () { return Promise.resolve(JSON.stringify(body)) }
  })
}

function headerOf(init, name) {
  const headers = (init && init.headers) || {}
  const target = String(name).toLowerCase()
  const key = Object.keys(headers).find(function (k) { return k.toLowerCase() === target })
  return key ? headers[key] : undefined
}

function parseBody(init) {
  if (!init || init.body == null || init.body === '') return null
  try { return JSON.parse(init.body) } catch (e) { return init.body }
}

function memberstackPresent(token) {
  return {
    getCurrentMember: function () {
      return Promise.resolve({ data: { id: 'mem_test_id' } })
    },
    getMemberCookie: function () {
      return token
    }
  }
}

function memberstackAbsent() {
  return {
    getCurrentMember: function () {
      return Promise.resolve({ data: null })
    },
    getMemberCookie: function () {
      return undefined
    }
  }
}

function memberstackThrowing() {
  return {
    getCurrentMember: function () {
      return Promise.reject(new Error('sdk-throw'))
    },
    getMemberCookie: function () {
      throw new Error('sdk-throw')
    }
  }
}

function memberstackHanging() {
  return {
    getCurrentMember: function () {
      return new Promise(function () { /* never settles */ })
    },
    getMemberCookie: function () {
      return new Promise(function () { /* never settles */ })
    }
  }
}

function createHarness(options) {
  options = options || {}
  const fetches = []
  const fetchImpl = options.fetchImpl || function (url, init) {
    fetches.push({ url: String(url), init: init || {} })
    return jsonResponse({ fields: {}, rec: 'recTEST', url: 'https://signed.example/doc' }, 200)
  }

  const dom = new JSDOM(
    '<!DOCTYPE html><html><body>' +
      '<div class="w-form">' +
        '<form id="Demande_offre" name="wf-form-Demande_offre">' +
          '<input id="Reference" name="Reference" value="REF-TEST" />' +
          '<input type="hidden" name="member_stack_id" value="mem_legacy_display" />' +
          '<input type="hidden" name="airtable_record_id" value="recTEST" />' +
          '<input type="submit" value="Envoyer" />' +
          '<div class="w-form-fail"></div>' +
          '<div class="w-form-done"></div>' +
        '</form>' +
        '<button type="button" id="btn-save-draft">Enregistrer le brouillon</button>' +
      '</div>' +
    '</body></html>',
    {
      url: options.url || 'https://domofen.ch/espace-partenaire/nouvelle-demande',
      runScripts: 'outside-only',
      pretendToBeVisual: true
    }
  )

  const window = dom.window
  window.alert = function () {}
  window.fetch = fetchImpl
  if (Object.prototype.hasOwnProperty.call(options, 'memberstack')) {
    if (options.memberstack) window.$memberstackDom = options.memberstack
  } else {
    window.$memberstackDom = memberstackPresent(STUB_TOKEN)
  }

  window.eval(BUNDLE)
  window.DomofenForms.init({ flow: 'demande' })
  if (typeof options.legacy === 'boolean') {
    window.DomofenForms.CONFIG.LEGACY_IDENTITY = options.legacy
  }

  return { window: window, fetches: fetches, dom: dom }
}

function fireThreeCalls(window) {
  return Promise.all([
    window.DomofenForms.prefill.runPrefill('recTEST', 'mem_test_id'),
    window.DomofenForms.draftSave.save({ disabled: false }),
    window.DomofenForms.submitHandler.handleDirectSubmit()
  ])
}

function byUrlPart(fetches, part) {
  return fetches.filter(function (entry) { return entry.url.indexOf(part) !== -1 })
}

describe('Memberstack token on portal V1 calls', function () {
  it('1. jeton present: prefill, draft and submit carry Authorization Bearer', async function () {
    const h = createHarness({ memberstack: memberstackPresent(STUB_TOKEN) })
    await fireThreeCalls(h.window)

    const prefill = byUrlPart(h.fetches, '/webhook/intranet/prefill')
    const draft = byUrlPart(h.fetches, '/webhook/intranet/draft')
    const submit = byUrlPart(h.fetches, '/webhook/intranet/submit')
    assert.equal(prefill.length, 1)
    assert.equal(draft.length, 1)
    assert.equal(submit.length, 1)

    ;[prefill[0], draft[0], submit[0]].forEach(function (entry) {
      assert.equal(headerOf(entry.init, 'Authorization'), 'Bearer ' + STUB_TOKEN)
    })
    assert.equal(h.window.DomofenForms.memberstackData.lastAuth.etat, 'jeton')
  })

  it('2. SDK unavailable: three calls still leave, without Authorization, etat indisponible', async function () {
    const h = createHarness({ memberstack: memberstackThrowing() })
    await fireThreeCalls(h.window)

    const prefill = byUrlPart(h.fetches, '/webhook/intranet/prefill')
    const draft = byUrlPart(h.fetches, '/webhook/intranet/draft')
    const submit = byUrlPart(h.fetches, '/webhook/intranet/submit')
    assert.equal(prefill.length, 1)
    assert.equal(draft.length, 1)
    assert.equal(submit.length, 1)

    ;[prefill[0], draft[0], submit[0]].forEach(function (entry) {
      assert.equal(headerOf(entry.init, 'Authorization'), undefined)
    })

    const last = h.window.DomofenForms.memberstackData.lastAuth
    assert.equal(last.etat, 'indisponible')
    assert.equal(last.message, h.window.DomofenForms.AUTH_MESSAGE.indisponible)
    assert.notEqual(last.message, h.window.DomofenForms.AUTH_MESSAGE.absent)
    assert.notEqual(last.etat, 'absent')
  })

  it('2b. SDK missing is indisponible, not absent', async function () {
    const h = createHarness({ memberstack: null })
    const auth = await h.window.DomofenForms.acquireMemberToken()
    assert.equal(auth.etat, 'indisponible')
    assert.notEqual(auth.etat, 'absent')
    assert.equal(auth.message || h.window.DomofenForms.memberstackData.lastAuth.message, h.window.DomofenForms.AUTH_MESSAGE.indisponible)
  })

  it('3. member not connected: reconnection message is produced', async function () {
    const h = createHarness({ memberstack: memberstackAbsent() })
    const auth = await h.window.DomofenForms.acquireMemberToken()
    assert.equal(auth.etat, 'absent')
    const last = h.window.DomofenForms.memberstackData.lastAuth
    assert.equal(last.etat, 'absent')
    assert.equal(last.message, h.window.DomofenForms.AUTH_MESSAGE.absent)
    assert.ok(last.message.indexOf('reconnect') !== -1)
    assert.notEqual(last.message, h.window.DomofenForms.AUTH_MESSAGE.indisponible)
  })

  it('4. LEGACY_IDENTITY false: no client-declared identity in headers or body', async function () {
    const h = createHarness({
      memberstack: memberstackPresent(STUB_TOKEN),
      legacy: false
    })
    await fireThreeCalls(h.window)

    const prefill = byUrlPart(h.fetches, '/webhook/intranet/prefill')[0]
    const draft = byUrlPart(h.fetches, '/webhook/intranet/draft')[0]
    const submit = byUrlPart(h.fetches, '/webhook/intranet/submit')[0]

    assert.equal(headerOf(prefill.init, 'x-member-id'), undefined)
    assert.equal(headerOf(draft.init, 'x-member-id'), undefined)
    assert.equal(headerOf(submit.init, 'x-member-id'), undefined)

    const draftBody = parseBody(draft.init)
    const submitBody = parseBody(submit.init)
    assert.ok(draftBody)
    assert.ok(submitBody)
    assert.equal(Object.prototype.hasOwnProperty.call(draftBody, 'member_stack_id'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(submitBody, 'member_stack_id'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(draftBody, 'msid'), false)
    assert.equal(Object.prototype.hasOwnProperty.call(submitBody, 'msid'), false)
    assert.equal(headerOf(prefill.init, 'Authorization'), 'Bearer ' + STUB_TOKEN)
  })

  it('5. LEGACY_IDENTITY true: inherited fields still leave, plus the token', async function () {
    const h = createHarness({
      memberstack: memberstackPresent(STUB_TOKEN),
      legacy: true
    })
    await fireThreeCalls(h.window)

    const prefill = byUrlPart(h.fetches, '/webhook/intranet/prefill')[0]
    const draft = byUrlPart(h.fetches, '/webhook/intranet/draft')[0]
    const submit = byUrlPart(h.fetches, '/webhook/intranet/submit')[0]

    assert.equal(headerOf(prefill.init, 'Authorization'), 'Bearer ' + STUB_TOKEN)
    assert.equal(headerOf(draft.init, 'Authorization'), 'Bearer ' + STUB_TOKEN)
    assert.equal(headerOf(submit.init, 'Authorization'), 'Bearer ' + STUB_TOKEN)
    assert.equal(headerOf(prefill.init, 'x-member-id'), 'mem_test_id')

    const draftBody = parseBody(draft.init)
    const submitBody = parseBody(submit.init)
    assert.ok(draftBody.member_stack_id)
    assert.ok(submitBody.member_stack_id)
    assert.notEqual(draftBody.member_stack_id, '')
    assert.notEqual(submitBody.member_stack_id, '')
  })

  it('6. document call returns signed URL on 200, and two distinct messages on 401 and 403', async function () {
    const fetches = []
    const h = createHarness({
      memberstack: memberstackPresent(STUB_TOKEN),
      fetchImpl: function (url, init) {
        fetches.push({ url: String(url), init: init || {} })
        const href = String(url)
        if (href.indexOf('/webhook/intranet/document') !== -1) {
          if (href.indexOf('rec401') !== -1) return jsonResponse({ error: 'no' }, 401)
          if (href.indexOf('rec403') !== -1) return jsonResponse({ error: 'no' }, 403)
          return jsonResponse({ url: 'https://signed.example/doc' }, 200)
        }
        return jsonResponse({ fields: {} }, 200)
      }
    })

    const ok = await h.window.DomofenForms.getDocumentUrl('recOK')
    assert.equal(ok.ok, true)
    assert.equal(ok.url, 'https://signed.example/doc')
    assert.equal(headerOf(fetches[0].init, 'Authorization'), 'Bearer ' + STUB_TOKEN)

    const denied = await h.window.DomofenForms.getDocumentUrl('rec401')
    const forbidden = await h.window.DomofenForms.getDocumentUrl('rec403')
    assert.equal(denied.ok, false)
    assert.equal(forbidden.ok, false)
    assert.ok(denied.message)
    assert.ok(forbidden.message)
    assert.notEqual(denied.message, forbidden.message)
    assert.equal(denied.message, h.window.DomofenForms.DOCUMENT_MESSAGE.reconnecte)
    assert.equal(forbidden.message, h.window.DomofenForms.DOCUMENT_MESSAGE.interdit)
    assert.equal(/401|403|HTTP/i.test(denied.message), false)
    assert.equal(/401|403|HTTP/i.test(forbidden.message), false)
  })

  it('7. token acquisition past its deadline does not block send', async function () {
    const h = createHarness({ memberstack: memberstackHanging() })
    const started = Date.now()
    await fireThreeCalls(h.window)
    const elapsed = Date.now() - started

    const prefill = byUrlPart(h.fetches, '/webhook/intranet/prefill')
    const draft = byUrlPart(h.fetches, '/webhook/intranet/draft')
    const submit = byUrlPart(h.fetches, '/webhook/intranet/submit')
    assert.equal(prefill.length, 1)
    assert.equal(draft.length, 1)
    assert.equal(submit.length, 1)
    ;[prefill[0], draft[0], submit[0]].forEach(function (entry) {
      assert.equal(headerOf(entry.init, 'Authorization'), undefined)
    })
    assert.equal(h.window.DomofenForms.memberstackData.lastAuth.etat, 'indisponible')
    assert.ok(elapsed < 8000, 'send should resume shortly after the 3s token bound, took ' + elapsed)
  })
})

'use strict'
// 07.11.2026 (NUA-2418) : un 200 sans confirmation ne doit plus effacer la sauvegarde locale.
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { JSDOM } = require('jsdom')

const BUNDLE = fs.readFileSync(path.join(__dirname, '..', 'src', 'domofen-forms.js'), 'utf8')
const KEY = 'domofen_pending_submit'

function rawResponse(text, status) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status: status,
    json: function () { return Promise.resolve(text ? JSON.parse(text) : {}) },
    text: function () { return Promise.resolve(text) } })
}

function harness(submitResponse) {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><div class="w-form">' +
      '<form id="Demande_offre" name="wf-form-Demande_offre">' +
        '<input id="Reference" name="Reference" value="REF-TEST" />' +
        '<input type="submit" value="Envoyer" />' +
        '<div class="w-form-fail" style="display:none"></div>' +
        '<div class="w-form-done" style="display:none"></div>' +
      '</form></div></body></html>',
    { url: 'https://domofen.ch/espace-partenaire/nouvelle-demande', runScripts: 'outside-only', pretendToBeVisual: true })
  const w = dom.window
  const alerts = []
  w.alert = function (m) { alerts.push(m) }
  w.fetch = function (url) {
    if (String(url).indexOf('/webhook/intranet/submit') !== -1) return submitResponse()
    return rawResponse(JSON.stringify({ fields: {}, rec: 'recTEST' }), 200)
  }
  w.$memberstackDom = { getCurrentMember: function () { return Promise.resolve({ data: { id: 'mem_test' } }) },
                        getMemberCookie: function () { return 'tok' } }
  w.eval(BUNDLE)
  w.DomofenForms.init({ flow: 'demande' })
  return { w: w, alerts: alerts }
}

async function submit(h) {
  await h.w.DomofenForms.submitHandler.handleDirectSubmit()
  await new Promise(function (r) { setTimeout(r, 20) })
  const form = h.w.document.querySelector('form')
  return {
    backup: h.w.localStorage.getItem(KEY),
    done: h.w.document.querySelector('.w-form-done').style.display,
    fail: h.w.document.querySelector('.w-form-fail').style.display,
    formHidden: form.style.display === 'none'
  }
}

describe('Submit : succès seulement sur confirmation du serveur', function () {
  it('200 corps vide (panne n8n du 06.11) : sauvegarde CONSERVÉE, erreur affichée', async function () {
    const h = harness(function () { return rawResponse('', 200) })
    const r = await submit(h)
    assert.notEqual(r.backup, null, 'la sauvegarde locale doit rester')
    assert.equal(r.fail, 'block'); assert.notEqual(r.done, 'block'); assert.equal(r.formHidden, false)
    assert.equal(h.alerts.length, 1)
  })
  it('200 { ok: true, rec } : sauvegarde effacée, succès affiché', async function () {
    const h = harness(function () { return rawResponse(JSON.stringify({ ok: true, rec: 'recNEW' }), 200) })
    const r = await submit(h)
    assert.equal(r.backup, null); assert.equal(r.done, 'block'); assert.equal(r.formHidden, true)
  })
  it('200 { ok: false } : sauvegarde conservée', async function () {
    const h = harness(function () { return rawResponse(JSON.stringify({ ok: false, error: 'x' }), 200) })
    const r = await submit(h)
    assert.notEqual(r.backup, null); assert.equal(r.fail, 'block')
  })
  it('503 (nouveau comportement n8n en échec) : sauvegarde conservée', async function () {
    const h = harness(function () { return rawResponse(JSON.stringify({ ok: false, error: 'traitement_echoue', reference: '1' }), 503) })
    const r = await submit(h)
    assert.notEqual(r.backup, null); assert.equal(r.fail, 'block')
  })
})

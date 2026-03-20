/**
 * DomofenForms — Intranet B2B Domofen
 * Frontend JS pour le portail partenaires (domofen.ch/espace-partenaire)
 *
 * 10 modules : colorSelectors, memberstackData, radioSync, schemaPicker,
 *              autreOption, positionManager, positionSerializer, prefill,
 *              draftSave, submitHandler
 *
 * Initialisation : DomofenForms.init({ flow: 'demande' | 'commande' | ... })
 *
 * Remplace : CarlMaillard/domofen-scripts (decommissione)
 * CDN : cdn.jsdelivr.net/gh/rgindrat-gif/Domofen-intranet@main/domofen-forms.min.js
 */
;(function (global) {
  'use strict'

  // ---------------------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------------------
  var CONFIG = {
    // n8n webhooks (remplacent les URLs Make.com)
    PREFILL_URL: 'https://n8n.domofen.ch/webhook/intranet/prefill',
    SAVE_DRAFT_URL: 'https://n8n.domofen.ch/webhook/intranet/draft',
    SUBMIT_URL: 'https://n8n.domofen.ch/webhook/intranet/submit',

    // Selecteurs DOM
    BTN_ADD_SELECTOR: '#btn-add-position',
    BTN_ADD_TEXT_PATTERNS: [
      'position supplementaire',
      'ajouter une position',
      'creer une position',
      'add position'
    ],
    BTN_CLOSE_SELECTOR: '.close_button_image',
    FORM_SELECTORS: [
      'form#Demande_offre',
      'form#Passer_commande',
      'form#modifier_offre',
      'form[name="wf-form-Demande_offre"]',
      'form[name="wf-form-Passer_commande"]',
      'form[name="wf-form-modifier_offre"]',
      'form[aria-label="Demande_offre"]',
      'form[aria-label="Passer_commande"]',
      'form[aria-label="modifier_offre"]',
      'form'
    ],
    COLOR_KEYS: [
      'couleur_interieur',
      'couleur_exterieur',
      'couleur_intercalaire',
      'couleur_ame_profil'
    ],
    RADIO_GROUP_CANDIDATES: [
      'question_adresse_livraison_differente',
      'question_autre_adresse_livraison',
      'question-adresse-livraison',
      'question-adresse-livraison-differente',
      'autre-adresse-livraison',
      'autre_adresse_livraison'
    ]
  }

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  /** querySelector shortcut */
  function qs(sel, ctx) { return (ctx || document).querySelector(sel) }

  /** querySelectorAll as Array */
  function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)) }

  /** Normalize string for comparison (remove diacritics, lowercase, trim) */
  function normalize(val) {
    if (val == null) return ''
    try {
      return String(val).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
    } catch (e) {
      return String(val).toLowerCase().trim()
    }
  }

  /** Set a hidden field value, creating the input if needed */
  function setHidden(form, name, value) {
    var input = form.querySelector('[name="' + name + '"]')
    if (!input) {
      input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      form.appendChild(input)
    }
    input.value = value == null ? '' : String(value)
    return input
  }

  /** Get or create a hidden input */
  function ensureHidden(form, name) {
    var input = form.querySelector('input[type="hidden"][name="' + name + '"]')
    if (!input) {
      input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      form.appendChild(input)
    }
    return input
  }

  /** Remove all child nodes from an element (safe alternative to innerHTML = '') */
  function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild)
  }

  /** Sync Webflow custom checkbox/radio visual state with actual checked state */
  function syncWebflowChecked(el) {
    try {
      var isRadio = el.type === 'radio'
      var isCheckbox = el.type === 'checkbox'
      if (!isRadio && !isCheckbox) return

      var wrapper = el.closest(isRadio ? '.w-radio' : '.w-checkbox')
      var visual = wrapper && wrapper.querySelector(
        '.w-radio-input, .w-form-formradioinput, .w-checkbox-input'
      )
      if (visual) {
        if (el.checked) {
          visual.classList.add('w--redirected-checked')
        } else {
          visual.classList.remove('w--redirected-checked')
        }
      }
      if (wrapper) {
        wrapper.setAttribute('aria-checked', el.checked ? 'true' : 'false')
      }
    } catch (e) { /* ignore */ }
  }

  /** Parse truthy/falsy string to boolean */
  function parseBool(v) {
    if (typeof v === 'boolean') return v
    if (v == null) return false
    if (v === 1 || v === '1') return true
    if (v === 0 || v === '0') return false
    var s = String(v).toLowerCase().trim()
    if (['', 'false', 'non', 'no', 'off', 'null', 'undefined', 'n'].indexOf(s) !== -1) return false
    if (['true', 'oui', 'yes', 'on', 'vrai', 'y', 'checked'].indexOf(s) !== -1) return true
    return s.length > 0
  }

  // ---------------------------------------------------------------------------
  // MODULE 1 : colorSelectors
  // Populates color <select> elements from CMS source elements
  // ---------------------------------------------------------------------------
  var colorSelectors = {
    init: function () {
      var self = this
      var populate = function () {
        CONFIG.COLOR_KEYS.forEach(function (key) { self.populate(key) })
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', populate)
      } else {
        populate()
      }

      // Re-populate when a new position is added
      document.body.addEventListener('position:added', function (e) {
        var container = e.detail && e.detail.container || document
        CONFIG.COLOR_KEYS.forEach(function (key) {
          if (container.querySelector('select[name="' + key + '"]')) {
            self.populate(key)
          }
        })
      })
    },

    populate: function (key) {
      var select = qs('select[name="' + key + '"]')
      if (!select) return

      var currentVal = select.value
      var emptyOpt = select.querySelector('option[value=""]')

      // Read options from CMS source elements
      var options = qsa('.cms-select-source[data-for="' + key + '"]')
        .map(function (el) { return (el.getAttribute('data-label') || '').trim() })
        .filter(Boolean)

      // Rebuild options using safe DOM methods
      clearChildren(select)
      select.appendChild(emptyOpt || this.makeOption('', 'Faites votre choix'))
      options.forEach(function (opt) { select.appendChild(colorSelectors.makeOption(opt, opt)) })

      // Restore previous value or default
      var restoreVal = currentVal
      if (key === 'couleur_intercalaire' && !currentVal) {
        var noir = Array.from(select.options).find(function (o) {
          return o.value.toLowerCase() === 'noir'
        })
        if (noir) restoreVal = noir.value
      }
      if (restoreVal) {
        select.value = restoreVal
        select.dispatchEvent(new Event('change', { bubbles: true }))
      }
    },

    makeOption: function (value, text) {
      var opt = document.createElement('option')
      opt.value = value
      opt.textContent = text
      return opt
    }
  }

  // ---------------------------------------------------------------------------
  // MODULE 2 : memberstackData
  // Reads Memberstack user data from DOM text elements into form fields
  // ---------------------------------------------------------------------------
  var memberstackData = {
    init: function () {
      var map = function (srcId, fieldName) {
        var src = qs('#' + srcId + '_txt')
        var dest = qs('input[name="' + fieldName + '"]')
        if (src && dest && src.textContent.trim()) {
          dest.value = src.textContent.trim()
        }
      }
      var run = function () {
        map('ms_email', 'ms_email')
        map('ms_first', 'ms_first_name')
        map('ms_last', 'ms_last_name')
        map('ms_company', 'ms_company')
        map('ms_adresse', 'ms_adresse')
      }
      document.addEventListener('DOMContentLoaded', function () {
        run()
        setTimeout(run, 300)
      })
    }
  }

  // ---------------------------------------------------------------------------
  // MODULE 3 : radioSync
  // Toggles "autre adresse de livraison" fields based on radio selection
  // ---------------------------------------------------------------------------
  var radioSync = {
    init: function () {
      var groupName = this.detectGroupName()
      if (!groupName) return

      var wraps = [
        qs('.autre-wrap[data-for="autre_adresse_de_livraison"]'),
        qs('.autre-wrap[data-for="autre_adress_npa"]'),
        qs('.autre-wrap[data-for="autre_adress_localite"]')
      ].filter(Boolean)
      if (!wraps.length) return

      var inputs = wraps.map(function (w) {
        return w.querySelector('input, textarea, select')
      }).filter(Boolean)

      var YES_VALUES = ['1', 'oui', 'yes', 'true', 'vrai', 'on']
      var initialized = false
      var prevVisible = null
      var userChanged = false

      var sync = function () {
        var checked = qs('input[type="radio"][name="' + groupName + '"]:checked')
        var isYes = checked && YES_VALUES.indexOf(String(checked.value || '').toLowerCase().trim()) !== -1

        wraps.forEach(function (w) { w.hidden = !isYes })
        inputs.forEach(function (inp) { inp.required = isYes })

        // Clear fields when switching from yes to no (only after init, only user-initiated)
        if (initialized && prevVisible === true && isYes === false && userChanged) {
          inputs.forEach(function (inp) {
            if (inp && inp.value) inp.value = ''
            if (inp && (inp.type === 'checkbox' || inp.type === 'radio')) inp.checked = false
          })
        }
        prevVisible = isYes
      }

      document.addEventListener('change', function (e) {
        if (e.target && e.target.matches('input[type="radio"][name="' + groupName + '"]')) {
          userChanged = true
          sync()
        }
      }, true)

      var bootstrap = function () {
        sync()
        setTimeout(sync, 120)
        setTimeout(sync, 400)
        initialized = true
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap, { once: true })
      } else {
        bootstrap()
      }

      document.addEventListener('prefill:applied', function () { sync() })
      document.addEventListener('domofen:rec-updated', function () { sync() })
    },

    detectGroupName: function () {
      for (var i = 0; i < CONFIG.RADIO_GROUP_CANDIDATES.length; i++) {
        var name = CONFIG.RADIO_GROUP_CANDIDATES[i]
        if (qs('input[type="radio"][name="' + name + '"]')) return name
      }
      return null
    }
  }

  // ---------------------------------------------------------------------------
  // MODULE 4 : schemaPicker
  // Modal for selecting window schema (image + ID)
  // ---------------------------------------------------------------------------
  var schemaPicker = {
    currentPicker: null,

    init: function () {
      var self = this
      var modal = qs('.schema-modal')
      if (!modal) return

      var ensureFields = function (picker) {
        var posNum = picker.getAttribute('data-pos') || ''
        var hidId = picker.querySelector('input[type="hidden"][name$="__schema_id"]')
        if (!hidId) {
          hidId = document.createElement('input')
          hidId.type = 'hidden'
          hidId.name = 'pos_' + posNum + '__schema_id'
          hidId.className = 'hidden_field hidden-field'
          picker.appendChild(hidId)
        }
        var hidUrl = picker.querySelector('input[type="hidden"][name$="__schema_url"]')
        if (!hidUrl) {
          hidUrl = document.createElement('input')
          hidUrl.type = 'hidden'
          hidUrl.name = 'pos_' + posNum + '__schema_url'
          hidUrl.className = 'hidden_field hidden-field'
          picker.appendChild(hidUrl)
        }
        return { hidId: hidId, hidUrl: hidUrl }
      }

      var openModal = function (picker) {
        self.currentPicker = picker
        modal.setAttribute('data-open', '1')
        modal.style.display = 'block'
      }

      var closeModal = function () {
        modal.removeAttribute('data-open')
        modal.style.display = 'none'
        self.currentPicker = null
      }

      document.addEventListener('click', function (e) {
        // Open modal when clicking a schema thumbnail
        if (e.target.closest('.schema-thumb')) {
          var picker = e.target.closest('.schema-picker')
          if (picker) { openModal(picker); return }
        }

        // Select a schema card from the modal
        var card = e.target.closest('.schema-card')
        if (card && modal.contains(card)) {
          if (!self.currentPicker) return
          var schemaId = card.getAttribute('data-schema-id') || card.dataset.schemaId || ''
          var img = card.querySelector('img')
          var imgUrl = img
            ? img.currentSrc || img.src || (img.getAttribute('srcset') || '').split(' ')[0] || img.getAttribute('data-src')
            : ''

          // Update thumbnail in the picker
          var thumbImg = self.currentPicker.querySelector('img.schema-thumb-img')
          var plusIcon = self.currentPicker.querySelector('.schema-plus')
          if (thumbImg && imgUrl) {
            thumbImg.src = imgUrl
            thumbImg.style.opacity = '1'
          }
          if (plusIcon) plusIcon.style.opacity = '0'

          // Store values in hidden fields
          var fields = ensureFields(self.currentPicker)
          if (fields.hidId) fields.hidId.value = schemaId
          if (fields.hidUrl) fields.hidUrl.value = imgUrl || ''

          closeModal()
          return
        }

        // Close modal
        if (e.target.closest('.schema-close') || e.target === modal) closeModal()
      })

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.getAttribute('data-open') === '1') closeModal()
      })

      // On page load, restore schema thumbnails from pre-existing hidden values
      document.addEventListener('DOMContentLoaded', function () {
        qsa('.schema-picker').forEach(function (picker) {
          ensureFields(picker)
          var img = picker.querySelector('img.schema-thumb-img')
          var plus = picker.querySelector('.schema-plus')
          var hidId = picker.querySelector('input[type="hidden"][name$="__schema_id"]')
          if (img && hidId && hidId.value) {
            var thumbUrl = picker.getAttribute('data-thumb-url')
            if (thumbUrl) {
              img.src = thumbUrl
              img.style.opacity = '1'
              if (plus) plus.style.opacity = '0'
              var hidUrl = picker.querySelector('input[type="hidden"][name$="__schema_url"]')
              if (hidUrl && !hidUrl.value) hidUrl.value = thumbUrl
            }
          }
        })
      })

      // On form submit, ensure schema URLs are captured
      document.addEventListener('submit', function (e) {
        var form = e.target
        if (!(form instanceof HTMLFormElement)) return
        form.querySelectorAll('.schema-picker').forEach(function (picker) {
          var fields = ensureFields(picker)
          if (fields.hidUrl && !fields.hidUrl.value) {
            var img = picker.querySelector('img.schema-thumb-img')
            var src = img && (img.currentSrc || img.src || '')
            if (src) fields.hidUrl.value = src
          }
        })
      })
    }
  }

  // ---------------------------------------------------------------------------
  // MODULE 5 : autreOption
  // Adds "Autre (preciser)" option to select fields with a text input reveal
  // ---------------------------------------------------------------------------
  var autreOption = {
    AUTRE_VAL: '__autre__',

    init: function () {
      var self = this

      var wireSelect = function (select) {
        if (!select || select.dataset.autreWired || CONFIG.COLOR_KEYS.indexOf(select.name) !== -1) return
        select.dataset.autreWired = '1'

        var key = select.dataset.key
        var wrap = (select.closest('.js-position') || document)
          .querySelector('.autre-wrap[data-for="' + key + '"]')
        if (!wrap) return

        // Add "Autre" option if not present
        var hasAutre = Array.from(select.options).some(function (o) { return o.value === self.AUTRE_VAL })
        if (!hasAutre) {
          select.add(new Option('Autre (pr\u00e9ciser)\u2026', self.AUTRE_VAL))
        }

        var textInput = wrap.querySelector('input')
        var toggle = function () {
          var isAutre = select.value === self.AUTRE_VAL
          wrap.hidden = !isAutre
          if (textInput) {
            textInput.required = isAutre
            if (!isAutre) textInput.value = ''
          }
        }
        select.addEventListener('change', toggle)
        toggle()
      }

      var wireAll = function (ctx) {
        (ctx || document).querySelectorAll('select[data-key]').forEach(function (s) { wireSelect(s) })
      }

      document.addEventListener('DOMContentLoaded', function () { wireAll() })
      document.body.addEventListener('position:added', function (e) { wireAll(e.detail.container) })
    }
  }

  // ---------------------------------------------------------------------------
  // MODULE 6 : positionManager
  // Add / remove / reindex positions in the form
  // ---------------------------------------------------------------------------
  var positionManager = {
    RE_DOUBLE: /pos_(\d+)__/g,
    RE_SINGLE: /pos_(\d+)_/g,

    init: function () {
      var self = this
      document.addEventListener('DOMContentLoaded', function () {
        document.addEventListener('click', function (e) { self.onAddClick(e) })
        document.addEventListener('click', function (e) { self.onCloseClick(e) })
        self.updateCloseButtons()
      })
    },

    lastPositionEl: function () {
      var positions = document.querySelectorAll('.js-position')
      return positions.length ? positions[positions.length - 1] : null
    },

    nextPosNumber: function () {
      var last = this.lastPositionEl()
      return last ? parseInt(last.dataset.pos, 10) + 1 : 1
    },

    replacePosStr: function (str, num) {
      return str
        .replace(this.RE_DOUBLE, 'pos_' + num + '__')
        .replace(this.RE_SINGLE, 'pos_' + num + '_')
    },

    updateCloseButtons: function () {
      qsa('.js-position').forEach(function (pos, idx) {
        var btn = pos.querySelector(CONFIG.BTN_CLOSE_SELECTOR)
        if (!btn) return
        if (idx === 0) {
          btn.style.display = 'none'
          btn.setAttribute('aria-hidden', 'true')
          btn.tabIndex = -1
        } else {
          btn.style.display = ''
          btn.removeAttribute('aria-hidden')
          btn.tabIndex = 0
        }
      })
    },

    retag: function (el, num) {
      var self = this
      el.dataset.pos = String(num)
      el.querySelectorAll('[data-pos]').forEach(function (child) {
        child.dataset.pos = String(num)
      })

      el.querySelectorAll('input, select, textarea, label, [data-name]').forEach(function (child) {
        if (child.name) child.name = self.replacePosStr(child.name, num)
        if (child.id) child.id = self.replacePosStr(child.id, num)
        if (child.tagName === 'LABEL' && child.htmlFor) {
          child.htmlFor = self.replacePosStr(child.htmlFor, num)
        }
        if (child.hasAttribute('data-name')) {
          child.setAttribute('data-name', self.replacePosStr(child.getAttribute('data-name'), num))
        }
      })

      // Ensure index hidden field
      var indexField = el.querySelector('input[name^="pos_"][name$="__index"]')
      if (indexField) {
        indexField.name = 'pos_' + num + '__index'
        indexField.value = String(num)
        indexField.id = 'pos_' + num + '__index'
      } else {
        indexField = document.createElement('input')
        indexField.type = 'hidden'
        indexField.name = 'pos_' + num + '__index'
        indexField.value = String(num)
        indexField.className = 'input_hidden'
        el.appendChild(indexField)
      }

      // Update title
      var title = el.querySelector('.position-title-name, h3.heading-style-h3')
      if (title) title.textContent = 'Position ' + num
    },

    resetValues: function (el) {
      el.querySelectorAll('input, select, textarea').forEach(function (inp) {
        if (inp.type === 'radio' || inp.type === 'checkbox') {
          inp.checked = false
          var radioVisual = inp.closest('.w-radio')
          var checkVisual = inp.closest('.w-checkbox')
          if (radioVisual) {
            var rv = radioVisual.querySelector('.w-radio-input, .w-form-formradioinput')
            if (rv) rv.classList.remove('w--redirected-checked')
          }
          if (checkVisual) {
            var cv = checkVisual.querySelector('.w-checkbox-input')
            if (cv) cv.classList.remove('w--redirected-checked')
          }
          var wrapper = inp.closest('.w-radio, .w-checkbox')
          if (wrapper) wrapper.setAttribute('aria-checked', 'false')
        } else if (inp.tagName === 'SELECT') {
          inp.selectedIndex = 0
        } else {
          inp.value = ''
        }
      })

      // Reset "autre" wraps
      el.querySelectorAll('.autre-wrap').forEach(function (w) { w.hidden = true })
      el.querySelectorAll('select[data-key]').forEach(function (s) {
        s.removeAttribute('data-autre-wired')
        delete s.dataset.autreWired
      })

      // Reset schema
      el.querySelectorAll('.schema-thumb-img').forEach(function (img) { img.removeAttribute('src') })
      el.querySelectorAll('.schema-plus').forEach(function (p) { p.style.opacity = '1' })
      var schemaId = el.querySelector('input[name$="__schema_id"]')
      if (schemaId) schemaId.value = ''
      var schemaUrl = el.querySelector('input[name$="__schema_url"]')
      if (schemaUrl) schemaUrl.value = ''

      // Re-trigger change on selects to reset "autre" state
      el.querySelectorAll('select[data-key]').forEach(function (s) {
        s.dispatchEvent(new Event('change', { bubbles: true }))
      })
    },

    reindexAll: function () {
      var self = this
      qsa('.js-position').forEach(function (el, idx) { self.retag(el, idx + 1) })
      self.updateCloseButtons()
      if (window.Webflow) {
        window.Webflow.destroy()
        window.Webflow.ready()
        window.Webflow.require('ix2').init()
      }
    },

    onAddClick: function (e) {
      var btn = e.target.closest(CONFIG.BTN_ADD_SELECTOR)
      if (!btn) {
        var el = e.target.closest('button, a, [role="button"], input[type="button"]')
        if (el) {
          var text = (el.textContent || el.value || '').toLowerCase()
          var matches = CONFIG.BTN_ADD_TEXT_PATTERNS.some(function (p) {
            return text.indexOf(p.toLowerCase()) !== -1
          })
          if (matches) btn = el
        }
      }
      if (!btn) return

      e.preventDefault()
      var lastPos = this.lastPositionEl()
      if (!lastPos) return

      var newNum = this.nextPosNumber()
      var clone = lastPos.cloneNode(true)
      this.retag(clone, newNum)
      this.resetValues(clone)
      lastPos.after(clone)

      document.body.dispatchEvent(new CustomEvent('position:added', { detail: { container: clone } }))
      this.reindexAll()
      clone.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },

    onCloseClick: function (e) {
      var btn = e.target.closest(CONFIG.BTN_CLOSE_SELECTOR)
      if (!btn) return
      var pos = btn.closest('.js-position')
      if (!pos) return
      var num = parseInt(pos.dataset.pos || '0', 10) || 0
      if (confirm('Supprimer la position ' + num + ' ?')) {
        pos.remove()
        document.body.dispatchEvent(new CustomEvent('position:removed', { detail: { removedIndex: num } }))
        this.reindexAll()
      }
    }
  }

  // ---------------------------------------------------------------------------
  // MODULE 7 : positionSerializer
  // Serializes all positions into JSON hidden fields before form submission
  // ---------------------------------------------------------------------------
  var positionSerializer = {
    init: function () {
      var self = this
      var bind = function () {
        document.addEventListener('submit', function (e) { self.handleSubmit(e) }, true)
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind)
      } else {
        bind()
      }
    },

    readField: function (el) {
      if (!el || !el.name) return null
      if (el.type === 'checkbox') return { name: el.name, value: !!el.checked }
      if (el.type === 'radio') return el.checked ? { name: el.name, value: el.value } : null
      return { name: el.name, value: el.value }
    },

    serializePosition: function (posEl) {
      var self = this
      var posNum = Number(posEl.dataset.pos || '0') || 0
      var prefix = /^pos_\d+__/
      var data = { index: posNum }

      posEl.querySelectorAll('input, select, textarea').forEach(function (el) {
        var field = self.readField(el)
        if (!field) return
        var key = field.name.replace(prefix, '')
        data[key] = field.value
      })

      // Schema
      var schemaIdEl = posEl.querySelector('input[name$="__schema_id"]')
      var schemaUrlEl = posEl.querySelector('input[name$="__schema_url"]')
      var schemaNameEl = posEl.querySelector('input[name$="__schema_name"]')
      var schemaId = schemaIdEl ? schemaIdEl.value : ''
      var schemaUrl = schemaUrlEl ? schemaUrlEl.value : ''
      var schemaName = schemaNameEl ? schemaNameEl.value : ''
      var displayName = schemaName.trim() || 'Aucun schema'

      data.schema = schemaUrl
        ? { id: schemaId, url: schemaUrl, name: displayName }
        : { id: '', url: '', name: 'Aucun schema' }

      return data
    },

    handleSubmit: function (e) {
      var self = this
      var form = e.target
      try {
        if (!form || form.tagName !== 'FORM') return
        var positions = form.querySelectorAll('.js-position')
        if (!positions.length) return

        var serialized = Array.from(positions)
          .map(function (p) { return self.serializePosition(p) })
          .sort(function (a, b) { return (a.index || 0) - (b.index || 0) })

        ensureHidden(form, 'positions_json').value = JSON.stringify(serialized)
        ensureHidden(form, 'positions_count').value = String(serialized.length)
      } catch (err) {
        console.error('[positions_json] serialization error:', err)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // MODULE 8 : prefill
  // Fetches record data from n8n and pre-fills the form
  // ---------------------------------------------------------------------------
  var prefill = {
    form: null,
    flow: 'demande',

    init: function (form, flow) {
      this.form = form
      this.flow = flow

      var params = new URLSearchParams(location.search || '')
      var hasRec = params.has('rec')
      var hasItem = params.has('item')

      if (hasRec) sessionStorage.setItem('domofen_rec_fallback_ok', '1')

      var useFallback = sessionStorage.getItem('domofen_rec_fallback_ok') === '1'
      if (flow === 'commande' && !hasRec) {
        this.purgeSessionKeys()
        useFallback = false
      }

      var rec = hasRec
        ? params.get('rec')
        : (useFallback && sessionStorage.getItem('domofen_rec')) || ''
      var item = hasItem
        ? params.get('item')
        : (useFallback && sessionStorage.getItem('domofen_item')) || ''

      if (hasRec) sessionStorage.setItem('domofen_rec', rec)
      if (hasItem) sessionStorage.setItem('domofen_item', item)
      sessionStorage.setItem('domofen_flow', flow)

      setHidden(form, 'airtable_record_id', rec)
      setHidden(form, 'webflow_item_id', item)
      setHidden(form, 'workflow_action', flow)

      form.dataset.mode = rec ? 'update' : 'new'
      form.dataset.flow = flow

      // Set submit button text
      try {
        var submitBtn = form.querySelector('[type="submit"], .w-button[type="submit"]')
        if (submitBtn) {
          submitBtn.textContent = flow === 'commande' ? 'Commander' : 'Envoyer ma demande'
        }
      } catch (e) { /* ignore */ }

      this.initHydration()
      var self = this
      this.withMemberId(function (memberId) {
        if (rec) self.runPrefill(rec, memberId)
      })
    },

    purgeSessionKeys: function () {
      sessionStorage.removeItem('domofen_rec')
      sessionStorage.removeItem('domofen_item')
      sessionStorage.removeItem('domofen_rec_fallback_ok')
    },

    /** Get Memberstack member ID (v2 then v1 fallback) */
    withMemberId: function (callback) {
      var self = this
      if (window.$memberstackDom && window.$memberstackDom.getCurrentMember) {
        window.$memberstackDom.getCurrentMember()
          .then(function (result) {
            var id = (result && result.data && result.data.id) || ''
            if (id) sessionStorage.setItem('domofen_msid', id)
            callback(id)
          })
          .catch(function () { self.fallbackV1(callback) })
      } else {
        this.fallbackV1(callback)
      }
    },

    fallbackV1: function (callback) {
      if (window.MemberStack && window.MemberStack.onReady) {
        window.MemberStack.onReady
          .then(function (ms) {
            var id = (ms && ms.member && ms.member.id) || ''
            if (id) sessionStorage.setItem('domofen_msid', id)
            callback(id)
          })
          .catch(function () { callback('') })
      } else {
        callback('')
      }
    },

    /** Fetch prefill data from n8n and apply to form */
    runPrefill: function (rec, memberId) {
      var self = this
      setHidden(this.form, 'member_stack_id', memberId || '')

      fetch(CONFIG.PREFILL_URL + '?rec=' + encodeURIComponent(rec), {
        method: 'GET',
        headers: { 'x-member-id': memberId || '' }
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status)
          return res.json()
        })
        .then(function (data) { self.applyPrefillToForm(data) })
        .catch(function (err) { console.error('[Prefill] fetch error', err) })
    },

    /** Apply fetched fields to the form */
    applyPrefillToForm: function (data) {
      var self = this
      var fields = (data && typeof data.fields === 'object') ? data.fields : {}

      Object.keys(fields).forEach(function (name) {
        var input = self.form.querySelector('[name="' + name + '"]')
        if (!input) return
        var val = fields[name]

        if (input.type === 'checkbox') {
          self.setCheckbox(input, val)
        } else if (input.type === 'radio') {
          self.setRadio(name, val)
        } else if (input.tagName === 'SELECT') {
          var matched = false
          if (input.querySelector('option[value="' + val + '"]')) {
            input.value = String(val)
            matched = true
          }
          if (!matched) {
            var opt = Array.from(input.options).find(function (o) {
              return normalize(o.textContent) === normalize(val)
            })
            if (opt) { input.value = opt.value; matched = true }
          }
          if (!matched) input.value = String(val)
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
        } else {
          if (val != null && typeof val === 'object') {
            try { input.value = JSON.stringify(val) } catch (e) { input.value = String(val) }
          } else {
            input.value = val != null ? val : ''
          }
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
        }
      })

      // Hydrate positions
      try {
        var posJson = fields.positions_json
        if (posJson) {
          var positions = typeof posJson === 'string' ? JSON.parse(posJson) : posJson
          if (Array.isArray(positions) && window.__domofenHydratePositions) {
            window.__domofenHydratePositions(self.form, positions)
          }
        }
        if (fields.positions_count !== undefined) {
          var countField = self.form.querySelector('[name="positions_count"]')
          if (countField) countField.value = String(fields.positions_count)
        }
      } catch (err) {
        console.warn('[Prefill] positions_json parse error', err)
      }

      // Sync radio visual states
      self.form.querySelectorAll('input[type="radio"]:checked').forEach(function (r) {
        r.dispatchEvent(new Event('change', { bubbles: true }))
      })

      // Sync checkbox visual states (with retries for Webflow timing)
      var syncCheckboxes = function () {
        self.form.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
          var visual = cb.closest('.w-checkbox')
          if (visual) {
            var vi = visual.querySelector('.w-checkbox-input')
            if (vi) {
              if (cb.checked) vi.classList.add('w--redirected-checked')
              else vi.classList.remove('w--redirected-checked')
            }
            visual.setAttribute('aria-checked', cb.checked ? 'true' : 'false')
          }
        })
      }
      syncCheckboxes()
      setTimeout(syncCheckboxes, 50)
      setTimeout(syncCheckboxes, 150)
      setTimeout(syncCheckboxes, 300)

      document.dispatchEvent(new CustomEvent('prefill:applied', { detail: { fields: fields } }))
      window.__domofen_last_fields = fields
    },

    /** Set a checkbox value from various truthy/falsy representations */
    setCheckbox: function (el, val) {
      el.checked = parseBool(val)
      syncWebflowChecked(el)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    },

    /** Set a radio value, trying exact match, label match, and boolean match */
    setRadio: function (name, val) {
      var self = this
      var radios = Array.from(self.form.querySelectorAll('input[type="radio"][name="' + name + '"]'))
      if (!radios.length) return false

      var norm = normalize(val == null ? '' : String(val))
      var YES = ['1', 'true', 'oui', 'yes', 'vrai', 'on']
      var NO = ['0', 'false', 'non', 'no', 'off', 'faux']

      // Try exact value match
      var match = radios.find(function (r) { return normalize(r.value) === norm })

      // Try label text match
      if (!match) {
        match = radios.find(function (r) {
          var wrapper = r.closest('.w-radio')
          var label = wrapper && wrapper.querySelector('label')
          return label && normalize(label.textContent) === norm
        })
      }

      // Try boolean match
      if (!match && (YES.indexOf(norm) !== -1 || NO.indexOf(norm) !== -1)) {
        var isYes = YES.indexOf(norm) !== -1
        match = radios.find(function (r) {
          return isYes ? YES.indexOf(normalize(r.value)) !== -1 : NO.indexOf(normalize(r.value)) !== -1
        })
        if (!match) {
          match = radios.find(function (r) {
            var wrapper = r.closest('.w-radio')
            var label = wrapper && wrapper.querySelector('label')
            var labelNorm = label ? normalize(label.textContent) : ''
            return isYes
              ? labelNorm.indexOf('oui') !== -1 || YES.indexOf(labelNorm) !== -1
              : labelNorm.indexOf('non') !== -1 || NO.indexOf(labelNorm) !== -1
          })
        }
      }

      if (!match) return false

      radios.forEach(function (r) { r.checked = false; syncWebflowChecked(r) })
      match.checked = true
      syncWebflowChecked(match)
      match.dispatchEvent(new Event('input', { bubbles: true }))
      match.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    },

    /** Set up hydration function for positions */
    initHydration: function () {
      var self = this

      var setField = function (form, name, val) {
        var input = form.querySelector('[name="' + name + '"]')
        if (!input) return false

        if (input.type === 'checkbox') {
          self.setCheckbox(input, val)
        } else if (input.type === 'radio') {
          self.setRadio(name, val)
        } else if (input.tagName === 'SELECT') {
          var matched = false
          if (input.querySelector('option[value="' + val + '"]')) {
            input.value = String(val)
            matched = true
          }
          if (!matched) {
            var opt = Array.from(input.options).find(function (o) {
              return normalize(o.textContent) === normalize(val)
            })
            if (opt) { input.value = opt.value; matched = true }
          }
          if (!matched) input.value = String(val)
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
        } else {
          input.value = (val != null && typeof val === 'object') ? JSON.stringify(val) : (val != null ? val : '')
          input.dispatchEvent(new Event('input', { bubbles: true }))
          input.dispatchEvent(new Event('change', { bubbles: true }))
        }
        return true
      }

      var countPositions = function () { return document.querySelectorAll('.js-position').length }

      window.__domofenHydratePositions = function (form, positions) {
        if (!Array.isArray(positions) || positions.length === 0) return

        var addBtn = qs('#btn-add-position')

        // Add positions until we have enough
        while (countPositions() < positions.length && addBtn) addBtn.click()

        // Remove extras
        while (countPositions() > positions.length) {
          var all = document.querySelectorAll('.js-position')
          var last = all[all.length - 1]
          if (last) last.remove()
        }

        // Fill each position
        positions
          .sort(function (a, b) { return (a.index || 0) - (b.index || 0) })
          .forEach(function (pos, idx) {
            var num = idx + 1
            var posEl = document.querySelector('.js-position[data-pos="' + num + '"]')
            if (!posEl) {
              var all = document.querySelectorAll('.js-position')
              posEl = all.length ? all[all.length - 1] : null
            }
            if (!posEl) return

            Object.keys(pos).forEach(function (key) {
              if (key !== 'index' && key !== 'schema') {
                setField(form, 'pos_' + num + '__' + key, pos[key])
              }
            })

            // Schema
            var schemaId = (pos.schema && pos.schema.id) || ''
            var schemaUrl = (pos.schema && pos.schema.url) || ''
            var schemaName = (pos.schema && pos.schema.name) || 'Aucun schema s\u00e9lectionn\u00e9'

            setField(form, 'pos_' + num + '__schema_id', schemaId)
            setField(form, 'pos_' + num + '__schema_url', schemaUrl)
            setField(form, 'pos_' + num + '__schema_name', schemaName)

            if (schemaUrl) {
              var picker = posEl.querySelector('.schema-picker')
              var thumbImg = posEl.querySelector('img.schema-thumb-img')
              var plusIcon = posEl.querySelector('.schema-plus')
              var nameEl = picker && picker.querySelector('.schema-name')

              if (thumbImg) { thumbImg.src = schemaUrl; thumbImg.style.opacity = '1' }
              if (plusIcon) plusIcon.style.opacity = '0'
              if (schemaName && nameEl) {
                nameEl.textContent = schemaName
                if (picker) picker.classList.add('has-schema')
              }
            }
          })

        // Delayed re-sync for schema names
        setTimeout(function () {
          positions.forEach(function (pos, idx) {
            var name = (pos.schema && pos.schema.name) || ''
            var url = (pos.schema && pos.schema.url) || ''
            if (!url || !name) return
            var posEl = document.querySelector('.js-position[data-pos="' + (idx + 1) + '"]')
            if (!posEl) return
            var picker = posEl.querySelector('.schema-picker')
            var nameEl = picker && picker.querySelector('.schema-name')
            if (nameEl && !nameEl.textContent) {
              nameEl.textContent = name
              if (picker) picker.classList.add('has-schema')
            }
          })
        }, 500)

        // Update hidden fields
        var posJsonField = form.querySelector('[name="positions_json"]')
        var posCountField = form.querySelector('[name="positions_count"]')
        if (posJsonField) posJsonField.value = JSON.stringify(positions)
        if (posCountField) posCountField.value = String(positions.length)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // MODULE 9 : draftSave
  // Saves the form as a draft to n8n
  // ---------------------------------------------------------------------------
  var draftSave = {
    form: null,

    init: function (form) {
      this.form = form
      var self = this
      var bind = function () {
        var btn = self.findDraftButton()
        if (btn) {
          if (btn.tagName === 'A') {
            btn.setAttribute('href', '#')
            btn.setAttribute('role', 'button')
          }
          btn.addEventListener('click', function (e) {
            e.preventDefault()
            e.stopPropagation()
            self.save(btn)
          })
          console.log('[Draft] ready')
        } else {
          console.warn('[Draft] bouton introuvable')
        }
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind)
      } else {
        bind()
      }
    },

    findDraftButton: function () {
      return qs('#btn-save-draft')
        || qs('[data-action="save-draft"]')
        || Array.from(document.querySelectorAll('a,button'))
            .find(function (el) { return /enregistrer le brouillon/i.test(el.textContent || '') })
    },

    /** Read a form field value, trying multiple possible names */
    valAny: function (names) {
      var self = this
      for (var i = 0; i < names.length; i++) {
        var name = names[i]
        var el = self.form.querySelector('[name="' + name + '"]')
        if (!el) continue
        if (el.type === 'radio') {
          var checked = self.form.querySelector('input[type="radio"][name="' + name + '"]:checked')
          if (checked) return checked.value
          continue
        }
        if (el.type === 'checkbox') return el.checked ? 'true' : 'false'
        if (el.value !== undefined && el.value !== '') return el.value
      }
      return ''
    },

    get: function (name) {
      var el = this.form.querySelector('[name="' + name + '"]')
      return el ? el.value : ''
    },

    getTextContent: function (sel) {
      var el = document.querySelector(sel)
      return el ? (el.textContent || '').trim() : ''
    },

    /** Serialize positions directly (no synthetic submit event needed) */
    ensurePositionsSerialized: function () {
      try {
        positionSerializer.handleSubmit({ target: this.form })
      } catch (e) { /* ignore */ }
      return {
        positions_json: this.get('positions_json') || '',
        positions_count: this.get('positions_count') || ''
      }
    },

    /** Update the browser URL with the Airtable record ID (for persistence) */
    rewriteUrlWithRec: function (rec) {
      try {
        if (!rec) return
        var url = new URL(location.href)
        if (url.searchParams.get('rec') !== String(rec)) {
          url.searchParams.set('rec', String(rec))
          history.replaceState(null, '', url.toString())
        }
        var input = this.form.querySelector('[name="airtable_record_id"]')
        if (!input) {
          input = document.createElement('input')
          input.type = 'hidden'
          input.name = 'airtable_record_id'
          this.form.appendChild(input)
        }
        input.value = String(rec)
        sessionStorage.setItem('domofen_rec', String(rec))
        this.form.dataset.mode = 'update'
      } catch (err) {
        console.warn('[Draft] rewriteUrlWithRec error', err)
      }
    },

    /** Build the complete payload for draft save or submit */
    buildPayload: function () {
      var params = new URLSearchParams(location.search || '')
      var formId = this.form.id || this.form.getAttribute('name') || ''
      var action = params.get('flow') || this.get('workflow_action') || 'demande'
      var rec = this.valAny(['airtable_record_id', 'record_id']) || params.get('rec') || ''
      var item = this.valAny(['webflow_item_id', 'webflow-id', 'webflow_item', 'webflowId']) || params.get('item') || ''
      var msid = this.valAny(['member_stack_id', 'memberstack_id']) || sessionStorage.getItem('domofen_msid') || ''

      var serialized = this.ensurePositionsSerialized()
      var posJson = serialized.positions_json || ''
      var posCount = serialized.positions_count || ''
      var positions = []
      try { positions = posJson ? JSON.parse(posJson) : [] } catch (e) { /* ignore */ }

      return {
        action: 'draft',
        etat: 'Brouillon',
        form_id: formId,
        workflow_action: action,
        airtable_record_id: rec,
        webflow_item_id: item,
        member_stack_id: msid,
        rec: rec,
        item: item,
        positions_json: posJson,
        positions_count: posCount,
        positions: positions,
        meta: {
          form_id: formId,
          submitted_at: '',
          offer_or_demand: '',
          submission_id: '',
          page_id: '',
          page_url: location.href || '',
          published_path: ''
        },
        memberstack: {
          email: this.valAny(['ms_email']) || this.getTextContent('#ms_email_txt'),
          first_name: this.valAny(['ms_first_name']) || this.getTextContent('#ms_first_txt'),
          last_name: this.valAny(['ms_last_name']) || this.getTextContent('#ms_last_txt'),
          company: this.valAny(['ms_company']) || this.getTextContent('#ms_company_txt'),
          adresse: this.valAny(['ms_adresse']) || this.getTextContent('#ms_adresse_txt')
        },
        entreprise: {
          responsable_du_dossier: this.valAny(['responsable-du-dossier', 'responsable_du_dossier']),
          adresse_email_de_retour: this.valAny(['email-adresse-de-retour', 'Email-retour-different']),
          question_adresse_livraison_differente: this.valAny([
            'question_adresse_livraison_differente',
            'autre-adresse-livraison',
            'autre-adresse-livraison?',
            'autre_adresse_livraison'
          ]),
          autre_adresse_livraison: this.valAny(['autre_adresse_de_livraison', 'autre_adresse_livraison']),
          autre_adress_npa: this.valAny(['autre_adress_npa']),
          autre_adress_localite: this.valAny(['autre_adress_localite'])
        },
        chantier: {
          reference: this.valAny(['Reference', 'ref_demande']),
          type_chantier: this.valAny(['Type de chantier', 'Type-de-chantier']),
          type_bien: this.valAny(['Type de bien', 'Type-de-bien']),
          adresse_chantier: this.valAny([
            'Adress_chantier', 'Adresse chantier', 'Adresse chantier*', 'Adresse de livraison'
          ]),
          npa: this.valAny(['NPA']),
          localite: this.valAny(['Localit\u00e9', 'Localit', 'chantier_localite'])
        },
        choix: {
          couleur_interieur: this.valAny(['couleur_interieur']),
          couleur_exterieur: this.valAny(['couleur_exterieur']),
          couleur_intercalaire: this.valAny(['couleur_intercalaire']),
          couleur_ame_profil: this.valAny(['couleur_ame_profil']),
          type_de_soudure: this.valAny(['type de soudure', 'type-de-soudure']),
          verres: this.valAny(['choix-des-verres']),
          verres_autre: this.valAny(['vitrage_autre', 'Vitrage \u2013 autre']),
          altitude: this.valAny(['Altitude', 'altitude']),
          delignement: this.valAny(['D\u00e9lignement', 'D-lignement']),
          securite: this.valAny(['securite', 'S\u00e9curit\u00e9']),
          renvoie_eau: this.valAny(['Renvoie deau', 'Renvoie-d-eau']),
          cale_15x21: this.valAny(['Cale 15x21 mm', 'Cale-15x21-mm']),
          cale_21x15: this.valAny(['Cale 21x15 mm', 'Cale-21x15-mm']),
          donnee_de_dimension: this.valAny(['donnee de dimension', 'donnee_de_dimension']),
          fermente_invisible: this.valAny(['Fermente invisible', 'Fermente-invisible']),
          clip_reno_111033: this.valAny(['Clip Reno 111033', 'Clip-Reno-111033'])
        },
        options: {
          renvoie_eau: this.valAny(['Renvoie deau', 'Renvoie-d-eau']),
          trous_de_fixations: this.valAny(['Trous-de-fixations', 'Trous de fixations', 'trous_de_fixations']),
          pattes_de_fixations: this.valAny(['Pattes-de-fixations', 'Pattes de fixations', 'pattes_de_fixations']),
          cale_15x21: this.valAny(['Cale 15x21 mm', 'Cale-15x21-mm']),
          cale_21x15: this.valAny(['Cale 21x15 mm', 'Cale-21x15-mm']),
          donnee_de_dimension: this.valAny(['donnee de dimension', 'donnee_de_dimension']),
          fermente_invisible: this.valAny(['Fermente invisible', 'Fermente-invisible']),
          clip_reno_111033: this.valAny(['Clip Reno 111033', 'Clip-Reno-111033'])
        },
        remarque_general: {
          remarques: this.valAny(['remarques-generales', 'Remarques g\u00e9n\u00e9rales'])
        },
        pieces_jointes: {
          domofen_upload: this.valAny(['DomofenOfficiel', 'Document_upload'])
        }
      }
    },

    /** Execute the draft save */
    save: function (btn) {
      var self = this

      // Validate reference field
      var refField = self.form.querySelector('#Reference') || self.form.querySelector('[name="Reference"]')
      if (refField) {
        if (!(refField.value || '').trim()) {
          refField.setCustomValidity('Le champ R\u00e9f\u00e9rence est obligatoire avant de sauvegarder votre brouillon')
          refField.reportValidity()
          refField.addEventListener('input', function handler() {
            refField.setCustomValidity('')
            refField.removeEventListener('input', handler)
          })
          return
        }
        refField.setCustomValidity('')
      }

      // Temporarily remove required attributes for draft save
      var requiredFields = Array.from(self.form.querySelectorAll('[required]'))
      requiredFields.forEach(function (el) { el.removeAttribute('required') })

      var payload = self.buildPayload()
      btn.disabled = true

      // Restore required attributes shortly after
      setTimeout(function () {
        requiredFields.forEach(function (el) { el.setAttribute('required', '') })
      }, 100)

      fetch(CONFIG.SAVE_DRAFT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          return res.text().then(function (text) {
            var json = {}
            try { json = text ? JSON.parse(text) : {} } catch (e) {
              console.warn('[Draft] JSON parse error', text)
            }
            return { ok: res.ok, status: res.status, json: json }
          })
        })
        .then(function (result) {
          console.log('[Draft] response', result.json)
          var rec = result.json && (result.json.rec || result.json.record_id || result.json.airtable_record_id)
          if (rec) self.rewriteUrlWithRec(String(rec))
          alert(result.ok ? 'Brouillon enregistr\u00e9.' : "Impossible d'enregistrer le brouillon.")
        })
        .catch(function (err) {
          console.error('[Draft] error', err)
          alert("Impossible d'enregistrer le brouillon pour le moment.")
        })
        .then(function () {
          btn.disabled = false
        })
    }
  }

  // ---------------------------------------------------------------------------
  // MODULE 10 : submitHandler
  // Intercepts form submit and sends via fetch() directly to n8n
  // (Fixes the Webflow native form size limit ~30KB — bug P2)
  // ---------------------------------------------------------------------------
  var submitHandler = {
    form: null,
    flow: 'demande',

    init: function (form, flow) {
      this.form = form
      this.flow = flow
      var self = this

      // Intercept submit in capture phase (before Webflow)
      form.addEventListener('submit', function (e) {
        e.preventDefault()
        e.stopImmediatePropagation()
        self.handleDirectSubmit()
      }, true)
    },

    handleDirectSubmit: function () {
      var self = this
      var form = self.form

      // HTML5 validation
      if (!form.checkValidity()) {
        form.reportValidity()
        return
      }

      // Build payload (reuses draftSave.buildPayload with submit overrides)
      // Temporarily bind draftSave to this form
      var prevForm = draftSave.form
      draftSave.form = form
      var payload = draftSave.buildPayload()
      draftSave.form = prevForm

      payload.action = 'submit'
      payload.etat = 'Soumis'
      payload.meta.submitted_at = new Date().toISOString()

      // UX feedback
      var submitBtn = form.querySelector('[type="submit"], .w-button[type="submit"]')
      var originalText = submitBtn ? submitBtn.textContent : ''
      if (submitBtn) {
        submitBtn.disabled = true
        submitBtn.textContent = 'Envoi en cours...'
      }

      fetch(CONFIG.SUBMIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          return res.text().then(function (text) {
            var json = {}
            try { json = text ? JSON.parse(text) : {} } catch (e) { /* ignore */ }

            if (res.ok) {
              console.log('[Submit] success', json)

              // Update rec in URL if returned
              var rec = json && (json.rec || json.record_id || json.airtable_record_id)
              if (rec) {
                var prevForm2 = draftSave.form
                draftSave.form = form
                draftSave.rewriteUrlWithRec(String(rec))
                draftSave.form = prevForm2
              }

              // Show Webflow success message
              var formWrapper = form.closest('.w-form')
              var successMsg = formWrapper && formWrapper.querySelector('.w-form-done')
              if (successMsg) {
                form.style.display = 'none'
                successMsg.style.display = 'block'
              }
            } else {
              throw new Error('HTTP ' + res.status + ': ' + (json.message || text.substring(0, 200)))
            }
          })
        })
        .catch(function (err) {
          console.error('[Submit] error:', err)
          var formWrapper = form.closest('.w-form')
          var errorMsg = formWrapper && formWrapper.querySelector('.w-form-fail')
          if (errorMsg) errorMsg.style.display = 'block'
          alert("Erreur lors de l'envoi. Veuillez r\u00e9essayer.")
        })
        .then(function () {
          if (submitBtn) {
            submitBtn.disabled = false
            submitBtn.textContent = originalText
          }
        })
    }
  }

  // ---------------------------------------------------------------------------
  // MODULE : mirrorFields
  // Mirrors "autre adresse" fields into hidden fields for form submission
  // ---------------------------------------------------------------------------
  var mirrorFields = {
    init: function (form) {
      if (!form) return

      var ensureMirror = function (name) {
        var el = form.querySelector('input[type="hidden"][name="' + name + '"]')
        if (!el) {
          el = document.createElement('input')
          el.type = 'hidden'
          el.name = name
          form.appendChild(el)
        }
        return el
      }

      var adresse = form.querySelector('input[name="autre_adresse_de_livraison"]')
      var npa = form.querySelector('input[name="autre_adress_npa"]')
      var localite = form.querySelector('input[name="autre_adress_localite"]')

      var mirrorAdresse = ensureMirror('autre_adresse_de_livraison_mirror')
      var mirrorNpa = ensureMirror('autre_adress_npa_mirror')
      var mirrorLocalite = ensureMirror('autre_adress_localite_mirror')

      var copy = function (src, dest) { if (src) dest.value = src.value || '' }
      var syncAll = function () {
        copy(adresse, mirrorAdresse)
        copy(npa, mirrorNpa)
        copy(localite, mirrorLocalite)
      }

      ;[adresse, npa, localite].forEach(function (el) {
        if (el) {
          el.addEventListener('input', syncAll)
          el.addEventListener('change', syncAll)
        }
      })

      document.addEventListener('prefill:applied', syncAll)
      document.addEventListener('DOMContentLoaded', syncAll)
      form.addEventListener('submit', syncAll, true)
    }
  }

  // ---------------------------------------------------------------------------
  // ENTRY POINT
  // ---------------------------------------------------------------------------
  global.DomofenForms = {
    init: function (options) {
      var flow = (options && options.flow) || 'demande'

      // Init standalone modules
      colorSelectors.init()
      memberstackData.init()
      radioSync.init()
      schemaPicker.init()
      autreOption.init()
      positionManager.init()
      positionSerializer.init()

      // Find the form
      var form = null
      for (var i = 0; i < CONFIG.FORM_SELECTORS.length; i++) {
        form = qs(CONFIG.FORM_SELECTORS[i])
        if (form) break
      }

      if (form) {
        prefill.init(form, flow)
        draftSave.init(form)
        submitHandler.init(form, flow)
        mirrorFields.init(form)
        console.log('[DomofenForms] initialized with flow:', flow)
      } else {
        console.error('[DomofenForms] Form not found')
      }
    }
  }

})(typeof window !== 'undefined' ? window : this)

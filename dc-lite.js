/* dc-lite: a tiny renderer for Epstein's Web page templates.
   Supports {{path}} holes, <sc-for list as>, <sc-if value>, onClick/onInput/onChange
   handlers, and a React-like Component class with state, setState and componentDidMount. */
(function () {
  'use strict';
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;

  function lookup(scope, path) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^'.*'$|^".*"$/.test(path)) return path.slice(1, -1);
    var parts = path.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) {
      var v = lookup(scope, p);
      return v == null ? '' : String(v);
    });
  }
  function truthy(v) {
    if (Array.isArray(v)) return v.length > 0;
    return !!v && v !== 'false';
  }
  var EVENTS = { onclick: 'click', oninput: 'input', onchange: 'change', onkeydown: 'keydown', onsubmit: 'submit', onfocus: 'focus', onblur: 'blur' };

  function renderNodes(nodes, scope, parent, key) {
    for (var i = 0; i < nodes.length; i++) renderNode(nodes[i], scope, parent, key + '.' + i);
  }
  function renderNode(node, scope, parent, key) {
    if (node.nodeType === 3) {
      var t = node.nodeValue;
      parent.appendChild(document.createTextNode(t.indexOf('{{') >= 0 ? interp(t, scope) : t));
      return;
    }
    if (node.nodeType !== 1) return;
    var tag = node.tagName.toLowerCase();
    if (tag === 'sc-for') {
      var m = WHOLE.exec(node.getAttribute('list') || '');
      var list = m ? lookup(scope, m[1]) : null;
      var as = node.getAttribute('as') || 'item';
      if (list && list.length) {
        for (var j = 0; j < list.length; j++) {
          var s = Object.create(scope);
          s[as] = list[j];
          s.$index = j;
          renderNodes(node.childNodes, s, parent, key + '[' + j + ']');
        }
      }
      return;
    }
    if (tag === 'sc-if') {
      var mv = WHOLE.exec(node.getAttribute('value') || '');
      if (mv && truthy(lookup(scope, mv[1]))) renderNodes(node.childNodes, scope, parent, key);
      return;
    }
    var el = document.createElementNS(node.namespaceURI, node.localName);
    for (var a = 0; a < node.attributes.length; a++) {
      var at = node.attributes[a];
      var name = at.name, val = at.value;
      if (name.indexOf('hint-') === 0) continue;
      var lname = name.toLowerCase();
      var whole = WHOLE.exec(val);
      if (EVENTS[lname]) {
        var fn = whole ? lookup(scope, whole[1]) : null;
        if (typeof fn === 'function') el.addEventListener(EVENTS[lname], fn);
        continue;
      }
      if (whole) {
        var raw = lookup(scope, whole[1]);
        if (lname === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) { el.__value = raw == null ? '' : String(raw); continue; }
        if (raw === false || raw == null) continue;
        el.setAttribute(name, raw === true ? '' : String(raw));
      } else {
        el.setAttribute(name, val.indexOf('{{') >= 0 ? interp(val, scope) : val);
      }
    }
    el.setAttribute('data-k', key);
    var kids = tag === 'template' ? node.content.childNodes : node.childNodes;
    renderNodes(kids, scope, el, key);
    if (el.__value != null) el.value = el.__value;
    parent.appendChild(el);
  }

  function Component(props) { this.props = props || {}; this.state = {}; }
  Component.prototype.setState = function (patch) {
    var st = typeof patch === 'function' ? patch(this.state) : patch;
    for (var k in st) this.state[k] = st[k];
    this._schedule();
  };
  Component.prototype.forceUpdate = function () { this._schedule(); };
  Component.prototype._schedule = function () {
    var self = this;
    if (self._pending) return;
    self._pending = true;
    Promise.resolve().then(function () { self._pending = false; self._render(); });
  };
  Component.prototype._render = function () {
    var root = this._root, tpl = this._tpl;
    var active = document.activeElement, akey = null, sel = null;
    if (active && root.contains(active)) {
      akey = active.getAttribute('data-k');
      try { sel = [active.selectionStart, active.selectionEnd]; } catch (e) {}
    }
    var x = window.scrollX, y = window.scrollY;
    var vals = this.renderVals() || {};
    var frag = document.createDocumentFragment();
    renderNodes(tpl.content.childNodes, vals, frag, 'r');
    root.style.minHeight = root.offsetHeight + 'px';
    root.replaceChildren(frag);
    root.style.minHeight = '';
    if (this._mounted) window.scrollTo(x, y);
    if (akey) {
      var n = root.querySelector('[data-k="' + akey + '"]');
      if (n) { n.focus({ preventScroll: true }); if (sel && sel[0] != null) { try { n.setSelectionRange(sel[0], sel[1]); } catch (e) {} } }
    }
  };

  function mount(Cls, props) {
    var tpl = document.getElementById('dc-tpl');
    var root = document.getElementById('dc-root');
    var inst = new Cls(props || {});
    inst._root = root; inst._tpl = tpl;
    inst._render();
    inst._mounted = true;
    if (location.hash) {
      var h = document.getElementById(location.hash.slice(1));
      if (h) setTimeout(function () { h.scrollIntoView(); }, 50);
    }
    if (typeof inst.componentDidMount === 'function') setTimeout(function () { inst.componentDidMount(); }, 0);
    root.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented) return;
      var t = document.getElementById(a.getAttribute('href').slice(1));
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
    return inst;
  }
  window.DCLogic = Component;
  window.DCLite = { mount: mount };
})();

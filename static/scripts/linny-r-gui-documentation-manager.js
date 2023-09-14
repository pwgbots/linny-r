/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-docu.js) provides the GUI functionality
for the Linny-R model documentation manager: the draggable dialog that allows
viewing and editing documentation text for model entities.

*/

/*
Copyright (c) 2017-2023 Delft University of Technology

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// CLASS DocumentationManager
class DocumentationManager {
  constructor() {
    this.dialog = UI.draggableDialog('documentation');
    UI.resizableDialog('documentation', 'DOCUMENTATION_MANAGER');
    this.close_btn = document.getElementById('documentation-close-btn');
    this.title = document.getElementById('docu-item-title');
    this.editor = document.getElementById('docu-editor');
    this.viewer = document.getElementById('docu-viewer');
    this.edit_btn = document.getElementById('docu-edit-btn');
    this.copy_btn = document.getElementById('docu-copy-btn');
    this.model_info_btn = document.getElementById('docu-model-info-btn');
    this.compare_btn = document.getElementById('compare-btn');
    this.save_btn = document.getElementById('docu-save-btn');
    this.cancel_btn = document.getElementById('docu-cancel-btn');
    this.info_btn = document.getElementById('docu-info-btn');
    this.resume_btn = document.getElementById('docu-resume-btn');
    this.symbols = document.getElementById('docu-symbols');
    this.message_hint = document.getElementById('docu-message-hint');
    // Make toolbar buttons responsive
    this.close_btn.addEventListener('click',
        (event) => UI.toggleDialog(event));
    this.edit_btn.addEventListener('click', 
        () => DOCUMENTATION_MANAGER.editMarkup());
    this.model_info_btn.addEventListener('click',
        () => DOCUMENTATION_MANAGER.showAllDocumentation());
    this.copy_btn.addEventListener('click',
        () => DOCUMENTATION_MANAGER.copyDocToClipboard());
    this.save_btn.addEventListener('click',
        () => DOCUMENTATION_MANAGER.saveMarkup());
    this.cancel_btn.addEventListener('click',
        () => DOCUMENTATION_MANAGER.stopEditing());
    this.info_btn.addEventListener('click',
        () => DOCUMENTATION_MANAGER.showGuidelines());
    this.resume_btn.addEventListener('click',
        () => DOCUMENTATION_MANAGER.hideGuidelines());
    const
        sym_btns = document.getElementsByClassName('docu-sym'),
        insert_sym = (event) =>
            DOCUMENTATION_MANAGER.insertSymbol(event.target.innerHTML);
    for(let i = 0; i < sym_btns.length; i++) {
      sym_btns[i].addEventListener('click', insert_sym);
    }
    // NOTE: Compare button opens a modal dialog to prompt for file
    this.compare_btn.addEventListener('click',
        () => DOCUMENTATION_MANAGER.comparison_modal.show());
    this.comparison_modal = new ModalDialog('comparison');
    this.comparison_modal.ok.addEventListener('click',
        () => FILE_MANAGER.loadModelToCompare());
    this.comparison_modal.ok.addEventListener('click',
        () => DOCUMENTATION_MANAGER.comparison_modal.hide());

    // Intitialize markup rewriting rules
    this.rules = [
      { // No HTML entities
        pattern: /&/g,  
        rewrite: '&amp;'
      },
      { // No HTML tags
        pattern: /</g,  
        rewrite: '&lt;'
      },
      { // URLs become anchors
        pattern: /((http|https):\/\/[^ "]+)/gmi,  
        rewrite: '<a href="$1" target="_blank">$1</a>'
      },
      { // 3 or more trailing spaces before a newline become a line break
        pattern: / {3,}$/gm,  
        rewrite: '<br>'
      },
      { // Text following ^ (until next ^ or whitespace) becomes superscript
        pattern: /\^([^\s\^]*)[\^]?/g,
        rewrite: '<sup>$1</sup>'
      },
      { // Text following _ (until next _ or whitespace) becomes subscript
        pattern: /_([^\s_]*)_?/g,
        rewrite: '<sub>$1</sub>'
      },
      
      // NOTE: all other patterns are "enclosure" patterns     

      { // Unlike MediaWiki, more = signs make BIGGER headers
        pattern: /===([^\s].*[^\s]?)===/g,
        rewrite: '<h1>$1</h1>'
      },
      {
        pattern: /==([^\s].*[^\s]?)==/g,
        rewrite: '<h2>$1</h2>'
      },
      {
        pattern: /=([^\s].*[^\s]?)=/g,
        rewrite: '<h3>$1</h3>'
      },
      { // Double asterisks make **bold face** print
        pattern: /\*\*([^\s][^\*]*[^\s]?)\*\*/g,
        rewrite: '<strong>$1</strong>'
      },
      { // Single asterisk makes *italic* print
        pattern: /\*([^\s][^\*]*[^\s]?)\*/g,
        rewrite: '<em>$1</em>'
      },
      { // Double minus makes deleted text (red + strike-through)
        pattern: /--([^\s].*[^\s]?)--/g,
        rewrite: '<del>$1</del>'
      },
      { // Double plus makes inserted text (blue + underline)
        pattern: /\+\+([^\s].*[^\s]?)\+\+/g,
        rewrite: '<ins>$1</ins>'
      },
      { // Double grave makes highlighted text (yellow text background)
        pattern: /``([^`]+)``/g,
        rewrite: '<cite>$1</cite>'
      },
      { // Single grave makes monospaced text
        pattern: /`([^`]+)`/g,
        rewrite: '<tt>$1</tt>'
      },
    ];

    // Default content to display when no entity is being viewed
    this.about_linny_r = `
<div style="font-family: sans-serif; font-size: 10px; ">
  <img src="images/logo.png" style="height:25px; margin-right: 8px">
  <div style="display: inline-block; min-height: 20px;
              vertical-align: top; padding-top: 8px">
    [LINNY_R_VERSION]
  </div>
</div>
<div style="font-family: serif; font-size: 12px">
  <p><a href="https://linny-r.info" target="blank">Documentation
    on Linny-R</a> is still scant, but you can learn a lot by
    moving the cursor over buttons, and read the tool-tips that then typically
    will appear.
  </p>
  <p>The primary function of this dialog is to allow you to document a model.
    As you <em><strong>hold down the</em><span style="font: 11px sans-serif">
    Shift</span><em> key</strong></em>, and then move the cursor over a model
    entity (nodes or links in the diagram, but also actors, datasets, charts,
    experiments or modules listed in a dialog), annotations (if any) will
    appear here.
  </p>
  <p>To add or edit an annotation, release the
    <span style="font: 11px sans-serif">Shift</span> key, and then
    click on the <span style="font: 11px sans-serif">Edit</span> button in the
    left corner below.
  </p>
</div>`;

    // Markup guidelines to display when modeler clicks on the info-button
    this.markup_guide = `
<h3>Linny-R Markup Conventions</h3>
<p>You can format your documentation text using these markup conventions:</p>
<table style="width: 100%; table-layout: fixed">
  <tr>
    <td class="markup">*italic*, **bold**, or ***both***</td>
    <td class="markdown">
      <em>italic</em>, <strong>bold</strong>, or <em><strong>both</strong></em>
    </td>
  </tr>
  <tr>
    <td class="markup">` +
      '``highlighted text``' + `, ++new text++, or --deleted text--
    </td>
    <td class="markdown">
      <cite>highlighted text</cite>, <ins>new text</ins>,
      or <del>deleted text</del>
    </td>
  </tr>
  <tr>
    <td class="markup">
      ^super^script and _sub_script, but also m^3 and CO_2 shorthand
    </td>
    <td class="markdown">
      <sup>super</sup>script and <sub>sub</sub>script,
      but also m<sup>3</sup> and CO<sub>2</sub> shorthand
    </td>
  </tr>
  <tr>
    <td class="markup">URLs become links: https://linny-r.org</td>
    <td class="markdown">URLs become links:
      <a href="https://linny-r.org" target="_blank">https://linny-r.org</a>
    </td>
  </tr>
  <tr>
    <td class="markup">
      Blank lines<br><br>separate paragraphs;<br>single line breaks do not.
    </td>
    <td class="markdown">
      <p>Blank lines</p>
      <p>separate paragraphs; single line breaks do not.</p>
    </td>
  </tr>
  <tr>
    <td class="markup">List items start with a dash<br>- like this,<br>
      - until the next item,<br>&nbsp;&nbsp;or a blank line.<br><br>
      Numbered list items start with digit-period-space<br>
      3. like this,<br>
      3. but the numbering<br>&nbsp;&nbsp;&nbsp;always starts at 1.
    </td>
    <td class="markdown">
      <p>List items start with a dash</p>
      <ul>
        <li>like this,</li>
        <li>until the next item, or a blank line.</li>
      </ul>
      <p>Numbered list items start with digit-period-space</p>
      <ol>
        <li>like this,</li>
        <li>but the numbering always starts at 1.</li>
      </ol>
    </td>
  </tr>
  <tr>
    <td class="markup">
      =Small header=<br><br>==Medium header==<br><br>===Large header===
    </td>
    <td class="markdown">
      <h3>Small header</h3><h2>Medium header</h2><h1>Large header</h1>
    </td>
  </tr>
  <tr>
    <td class="markup">
      A single line with only dashes and spaces, e.g.,<br><br>- - -<br><br>
      becomes a horizontal rule.
    </td>
    <td class="markdown">
      <p>A single line with only dashes and spaces, e.g.,</p><hr>
      <p>becomes a horizontal rule.</p>
    </td>
  </tr>
</table>`;

    // Initialize properties
    this.reset();
  }

  reset() {
    this.entity = null;
    this.visible = false;
    this.editing = false;
    this.markup = '';
    this.info_messages = [];
    this.symbols.style.display = 'none';
  }

  clearEntity(list) {
    // To be called when entities are deleted 
    if(list.indexOf(this.entity) >= 0) {
      this.stopEditing();
      this.entity = null;
      this.title.innerHTML = 'Documentation';
      this.viewer.innerHTML = this.about_linny_r;
    }
  }
  
  checkEntity() {
    // Check if entity still exists in model
    const e = this.entity;
    if(!e || e === MODEL) return;
    if(e.hasOwnProperty('name') && !MODEL.objectByName(e.name)) {
      // Clear entity if not null, but not in model
      this.clearEntity([e]);
    }
  }

  updateDialog() {
    // Resizing dialog needs no special action, but entity may have been
    // deleted or renamed
    this.checkEntity();
    if(this.entity) {
      this.title.innerHTML =
          `<em>${this.entity.type}:</em>&nbsp;${this.entity.displayName}`;
    }
  }

  update(e, shift) {
    // Display name of entity under cursor on the infoline, and details
    // in the documentation dialog.
    if(!e) return;
    let et = e.type,
        edn = e.displayName;
    if(et === 'Equation' && e.selector.startsWith(':')) et = 'Method';
    // TO DO: when debugging, display additional data for nodes on the
    // infoline. 
    UI.setMessage(
        e instanceof NodeBox ? e.infoLineName : `<em>${et}:</em> ${edn}`);
    // NOTE: Update the dialog ONLY when shift is pressed. This permits
    // modelers to rapidly browse comments without having to click on
    // entities, and then release the shift key to move to the documentation
    // dialog to edit. Moreover, the documentation dialog must be visible,
    // and the entity must have the `comments` property.
    // NOTE: Equations constitute an exception, as DatasetModifiers do
    // not have the `comments` property. Now that methods can be defined
    // (since version 1.6.0), the documentation window displays the eligible
    // prefixes when the cursor is Shift-moved over the name of a method
    // (in the Equation Manager).
    if(!this.editing && shift && this.visible) {
      if(e.hasOwnProperty('comments')) {
        this.title.innerHTML = `<em>${et}:</em>&nbsp;${edn}`;
        this.entity = e;
        this.markup = (e.comments ? e.comments : '');
        this.editor.value = this.markup;
        this.viewer.innerHTML = this.markdown;
        this.edit_btn.classList.remove('disab');
        this.edit_btn.classList.add('enab');
        // NOTE: Permit documentation of the model by raising the dialog.
        if(this.entity === MODEL) this.dialog.style.zIndex = 101;
      } else if(e instanceof DatasetModifier) {
        this.title.innerHTML = e.selector;
        this.viewer.innerHTML = 'Method <tt>' + e.selector +
            '</tt> does not apply to any entity';
        if(e.expression.eligible_prefixes) {
          const el = Object.keys(e.expression.eligible_prefixes)
              .sort(compareSelectors);
          if(el.length > 0) this.viewer.innerHTML = [
              'Method <tt>', e.selector, '</tt> applies to ',
              pluralS(el.length, 'prefixed entity group'),
              ':<ul><li>', el.join('</li><li>'), '</li></ul>'].join('');
        }
      }
    }
  }
  
  rewrite(str) {
    // Apply all the rewriting rules to `str`.
    str = '\n' + str + '\n';
    this.rules.forEach(
        (rule) => { str = str.replace(rule.pattern, rule.rewrite); });
    return str.trim();
  }
  
  makeList(par, isp, type) {
    // Split on the *global multi-line* item separator pattern.
    const splitter = new RegExp(isp, 'gm'),
          list = par.split(splitter);
    if(list.length < 2) return false;
    // Now we know that the paragraph contains at least one list item line.
    let start = 0;
    // Paragraph may start with plain text, so check using the original
    // pattern.
    if(!par.match(isp)) {
      // If so, retain this first part as a separate paragraph...
      start = 1;
      // NOTE: Add it only if it contains text.
      par = (list[0].trim() ? `<p>${this.rewrite(list[0])}</p>` : '');
      // ... and clear it as list item.
      list[0] = '';
    } else {
      par = '';
    }
    // Rewrite each list item fragment that contains text.
    for(let j = start; j < list.length; j++) {
      list[j] = (list[j].trim() ? `<li>${this.rewrite(list[j])}</li>` : '');
    }
    // Return assembled parts.
    return [par, '<', type, 'l>', list.join(''), '</', type, 'l>'].join('');
  }
  
  get markdown() {
    if(!this.markup) this.markup = '';
    const html = this.markup.split(/\n{2,}/);
    let list;
    for(let i = 0; i < html.length; i++) {
      // Paragraph with only dashes and spaces becomes a horizontal rule.
      if(html[i].match(/^( *-)+$/)) {
        html[i] = '<hr>';
      // Paragraph may contain a bulleted list.
      } else if ((list = this.makeList(html[i], /^ *- +/, 'u')) !== false) {
        html[i] = list;
      // Paragraph may contain a numbered list.
      } else if ((list = this.makeList(html[i], /^ *\d+. +/, 'o')) !== false) {
        html[i] = list;
      // Otherwise: default HTML paragraph.
      } else {
        html[i] = `<p>${this.rewrite(html[i])}</p>`;
      }
    }
    return html.join('');
  }
  
  editMarkup() {
    if(this.edit_btn.classList.contains('disab')) return;
    this.dialog.style.opacity = 1;
    this.viewer.style.display = 'none';
    this.editor.style.display = 'block';
    this.edit_btn.style.display = 'none';
    this.model_info_btn.style.display = 'none';
    this.copy_btn.style.display = 'none';
    this.compare_btn.style.display = 'none';
    this.message_hint.style.display = 'none';
    this.save_btn.style.display = 'block';
    this.cancel_btn.style.display = 'block';
    this.info_btn.style.display = 'block';
    this.symbols.style.display = 'block';
    this.editor.focus();
    this.editing = true;
  }
  
  insertSymbol(sym) {
    // Insert symbol (clicked item in list below text area) into text area.
    this.editor.focus();
    let p = this.editor.selectionStart;
    const
        v = this.editor.value,
        tb = v.substring(0, p),
        ta = v.substring(p, v.length);
    this.editor.value = `${tb}${sym}${ta}`;
    p += sym.length;
    this.editor.setSelectionRange(p, p);
  }
  
  saveMarkup() {
    this.markup = this.editor.value.trim();
    this.checkEntity();
    if(this.entity) {
      this.entity.comments = this.markup;
      this.viewer.innerHTML = this.markdown;
      if(this.entity instanceof Link) {
        UI.drawLinkArrows(MODEL.focal_cluster, this.entity);
      } else if(this.entity instanceof Constraint) {
        UI.paper.drawConstraint(this.entity);
      } else if (typeof this.entity.draw === 'function') {
        // Only draw if the entity responds to that method.
        this.entity.draw();
      }
    }
    this.stopEditing();
  }

  stopEditing() {
    this.editing = false;
    this.editor.style.display = 'none';
    this.viewer.style.display = 'block';
    this.save_btn.style.display = 'none';
    this.cancel_btn.style.display = 'none';
    this.info_btn.style.display = 'none';
    this.symbols.style.display = 'none';
    this.edit_btn.style.display = 'block';
    this.model_info_btn.style.display = 'block';
    this.copy_btn.style.display = 'block';
    this.compare_btn.style.display = 'block';
    this.message_hint.style.display = 'block';
    this.dialog.style.opacity = 0.85;
  }

  showGuidelines() {
    this.editor.style.display = 'none';
    this.save_btn.style.display = 'none';
    this.cancel_btn.style.display = 'none';
    this.info_btn.style.display = 'none';
    this.symbols.style.display = 'none';
    this.viewer.innerHTML = this.markup_guide;
    this.viewer.style.display = 'block';
    this.resume_btn.style.display = 'block';
  }

  hideGuidelines() {
    this.viewer.style.display = 'none';
    this.resume_btn.style.display = 'none';
    this.editor.style.display = 'block';
    this.save_btn.style.display = 'block';
    this.cancel_btn.style.display = 'block';
    this.info_btn.style.display = 'block';
    this.symbols.style.display = 'block';
    this.viewer.innerHTML = this.editor.value.trim();
    this.editor.focus();
  }

  addMessage(msg) {
    // Append message to the info messages list.
    if(msg) this.info_messages.push(msg);
    // Update dialog only when it is showing.
    if(!UI.hidden(this.dialog.id)) this.showInfoMessages(true);
  }
  
  showInfoMessages(shift) {
    // Show all messages that have appeared on the status line.
    const 
        n = this.info_messages.length,
        title = pluralS(n, 'message') + ' since the current model was loaded';
    document.getElementById('info-line').setAttribute(
        'title', 'Status: ' + title);
    if(shift && !this.editing) {
      const divs = [];
      for(let i = n - 1; i >= 0; i--) {
        const
            m = this.info_messages[i],
            first = (i === n - 1 ? '-msg first' : '');
        divs.push('<div><div class="', m.status, '-time">', m.time, '</div>',
            '<div class="', m.status, first, '-msg">', m.text, '</div></div>');
      }
      this.viewer.innerHTML = divs.join('');
      // Set the dialog title.
      this.title.innerHTML = title;
    }
  }

  showArrowLinks(arrow) {
    // Show list of links represented by a composite arrow.
    const
        n = arrow.links.length,
        msg = 'Arrow represents ' + pluralS(n, 'link');
    UI.setMessage(msg);
    if(this.visible && !this.editing) {
      // Set the dialog title.
      this.title.innerHTML = msg;
      // Show list.
      const lis = [];
      let l, dn, c, af;
      for(let i = 0; i < n; i++) {
        l = arrow.links[i];
        dn = l.displayName;
        if(l.from_node instanceof Process) {
          c = UI.color.produced;
          dn = dn.replace(l.from_node.displayName,
              `<em>${l.from_node.displayName}</em>`); 
        } else if(l.to_node instanceof Process) {
          c = UI.color.consumed;
          dn = dn.replace(l.to_node.displayName,
            `<em>${l.to_node.displayName}</em>`); 
        } else {
          c = 'gray';
        }
        if(MODEL.solved && l instanceof Link) {
          af = l.actualFlow(MODEL.t);
          if(Math.abs(af) > VM.SIG_DIF_FROM_ZERO) {
            dn = dn.replace(UI.LINK_ARROW,
                `<span style="color: ${c}">\u291A[${VM.sig4Dig(af)}]\u21FE</span>`);
          }
        }
        lis.push(`<li>${dn}</li>`);
      }
      lis.sort(ciCompare);
      this.viewer.innerHTML = `<ul>${lis.join('')}</ul>`;
    }
  }

  showHiddenIO(node, arrow) {
    // Show list of products or processes linked to node by an invisible
    // arrow (i.e., links represented by a block arrow).
    let msg, iol;
    if(arrow === UI.BLOCK_IN) {
      iol = node.hidden_inputs;
      msg = pluralS(iol.length, 'more input');
    } else if(arrow === UI.BLOCK_OUT) {
      iol = node.hidden_outputs;
      msg = pluralS(iol.length, 'more output');
    } else {
      iol = node.hidden_io; 
      msg = pluralS(iol.length, 'more double linkage');
    }
    msg = node.displayName + ' has ' + msg;
    UI.on_block_arrow = true;
    UI.setMessage(msg);
    if(this.visible && !this.editing) {
      // Set the dialog title.
      this.title.innerHTML = msg;
      // Show list.
      const lis = [];
      for(let i = 0; i < iol.length; i++) {
        lis.push(`<li>${iol[i].displayName}</li>`);
      }
      lis.sort(ciCompare);
      this.viewer.innerHTML = `<ul>${lis.join('')}</ul>`;
    }
  }

  showAllDocumentation() {
    // Show (as HTML) all model entities (categorized by type) with their
    // associated comments (if added by the modeler).
    const
        html = [],
        sl = MODEL.listOfAllComments;
    for(let i = 0; i < sl.length; i++) {
      if(sl[i].startsWith('_____')) {
        // 5-underscore leader indicates: start of new category.
        html.push('<h2>', sl[i].substring(5), '</h2>');
      } else {
        // Expect model element name...
        html.push('<p><tt>', sl[i], '</tt><br><small>');
        // ... immediately followed by its associated marked-up comments.
        i++;
        this.markup = sl[i];
        html.push(this.markdown, '</small></p>');
      }
    }
    this.title.innerHTML = 'Complete model documentation';
    this.viewer.innerHTML = html.join('');
    // Deselect entity and disable editing.
    this.entity = null;
    this.edit_btn.classList.remove('enab');
    this.edit_btn.classList.add('disab');
  }
    
  copyDocToClipboard() {
    UI.copyHtmlToClipboard(this.viewer.innerHTML);
    UI.notify('Documentation copied to clipboard (as HTML)');
  }

  compareModels(data) {
    this.comparison_modal.hide();
    this.model = new LinnyRModel('', '');
    // NOTE: while loading, make the second model "main" so it will initialize
    const loaded = MODEL;
    MODEL = this.model;
    try {
      // NOTE: Convert %23 back to # (escaped by function saveModel)
      const xml = parseXML(data.replace(/%23/g, '#'));
      // NOTE: loading, not including => make sure that IO context is NULL
      IO_CONTEXT = null;
      this.model.initFromXML(xml);
    } catch(err) {
      UI.normalCursor();
      UI.alert('Error while parsing model: ' + err);
      // Restore original "main" model
      MODEL = loaded;
      this.model = null;
      return false;
    }
    // Restore original "main" model
    MODEL = loaded;
    try {
      // Store differences as HTML in local storage
      console.log('Storing differences between model A (' + MODEL.displayName +
          ') and model B (' + this.model.displayName + ') as HTML');
      const html = this.differencesAsHTML(MODEL.differences(this.model));
      window.localStorage.setItem('linny-r-differences-A-B', html);
      UI.notify('Comparison report can be viewed ' +
        '<a href="./show-diff.html" target="_blank"><strong>here</strong></a>');
    } catch(err) {
      UI.alert(`Failed to store model differences: ${err}`);
    }
    // Dispose the model-for-comparison
    this.model = null;
    // Cursor is set to WAITING when loading starts
    UI.normalCursor();
  }
  
  propertyName(p) {
    // Returns the name of a Linny-R entity property as HTML-italicized string
    // if `p` is recognized as such, or otherwise `p` itself
    if(p in UI.MC.SETTINGS_PROPS) return `<em>${UI.MC.SETTINGS_PROPS[p]}:</em>`;
    if(UI.MC.ALL_PROPS.indexOf(p) >= 0) return '<em>' + p.charAt(0).toUpperCase() +
        p.slice(1).replace('_', '&nbsp;') + ':</em>';
    return p;
  }

  propertyAsString(p) {
    // Returns the value of `p` as an HTML string for Model Comparison report 
    if(p === true) return '<code>true</code>';
    if(p === false) return '<code>false</code>';
    const top = typeof p;
    if(top === 'number') return VM.sig4Dig(p);
    if(top === 'string') return (p.length === 0 ? '<em>(empty)</em>' : p);
    return p.toString();
  }
  
  differencesAsHTML(d) {
    const html = [];
    let n = (Object.keys(d).length > 0 ? 'D' : 'No d');
    html.push('<h1>' + n + 'ifferences between model A and model B</h1>');
    html.push('<p><em>Model</em> <strong>A</strong> <em>is <u>current</u>, ',
        'model</em> <strong>B</strong> <em>was loaded for comparison only.</em>');
    html.push('<table><tr><th>Model</th><th>Name</th><th>Author</th></tr>');
    html.push('<tr><td>A</td><td>' + this.propertyAsString(MODEL.name) +
        '</td><td>'+ this.propertyAsString(MODEL.author) + '</td></tr>');
    html.push('<tr><td>B</td><td>' + this.propertyAsString(this.model.name) +
        '</td><td>' + this.propertyAsString(this.model.author) +
        '</td></tr></table>');
    if('settings' in d) html.push('<h2>Model settings</h2>',
        this.differenceAsTable(d.settings));
    if('units' in d) html.push('<h2>Units</h2>',
        this.differenceAsTable(d.units));
    for(let i = 0; i < UI.MC.ENTITY_PROPS.length; i++) {
      const e = UI.MC.ENTITY_PROPS[i];
      if(e in d) html.push('<h2>' + this.propertyName(e) + '</h2>',
          this.differenceAsTable(d[e]));
    }
    if('charts' in d) html.push('<h2><em>Charts</em></h2>',
        this.differenceAsTable(d.charts));
    return html.join('\n');
  }

  differenceAsTableRow(dd, k) {
    const d = dd[k];
    // NOTE: recursive method, as cells can contain tables
    let tr = '';
    if(Array.isArray(d) && d.length >= 2) {
      tr = '<tr><td class="mc-name">' + this.propertyName(d[1]) + '</td>';
      if(d[0] === UI.MC.MODIFIED) {
        if(d[2].hasOwnProperty('A') && d[2].hasOwnProperty('B')) {
          // Leaf node showing the differring property values in A and B
          const mfd = markFirstDifference(d[2].A, d[2].B);
          tr += `<td class="mc-modified">${mfd}</td><td>${d[2].B}</td>`;
        } else {
          // Compound "dictionary" of differences
          tr += '<td colspan="2">' + this.differenceAsTable(d[2]) + '</td>';
        }
      } else {
        // Addition and deletions are shown for model A 
        tr += `<td class="mc-${UI.MC.STATE[d[0]]}">${UI.MC.STATE[d[0]]}</td><td></td>`;
      }
      tr += '</tr>';
    } else if(d.hasOwnProperty('A') && d.hasOwnProperty('B')) {
      tr = '<tr><td>' + this.propertyName(k) + '</td><td class="mc-modified">'+
          markFirstDifference(d.A, d.B) + '</td><td class="mc-former">' +
          d.B + '</td></tr>';
    } else {
      tr = '<tr><td>' + this.differenceAsTable(d) + '</td></tr>';
    }
    return tr;
  }

  differenceAsTable(d) {
    if(typeof d === 'object') {
      const
          html = ['<table>'],
          keys = Object.keys(d).sort();
      for(let i = 0; i < keys.length; i++) {
        html.push(this.differenceAsTableRow(d, keys[i]));
      }
      html.push('</table>');
      return html.join('\n');
    }
    return '';
  }

} // END of class DocumentationManager 

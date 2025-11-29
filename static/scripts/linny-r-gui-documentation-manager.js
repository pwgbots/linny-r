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
Copyright (c) 2017-2025 Delft University of Technology

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
        (event) => DOCUMENTATION_MANAGER.copyDocToClipboard(event.shiftKey));
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
    entity (nodes or links in the diagram, but also actors, datasets, charts
    or experiments listed in a dialog), annotations (if any) will appear here.
  </p>
  <p>To add or edit an annotation, release the
    <span style="font: 11px sans-serif">Shift</span> key, and then click on the
    <span style="font: 11px sans-serif">Edit</span> button in the left corner
    below.
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
    if(list === true || list.indexOf(this.entity) >= 0) {
      this.stopEditing();
      this.entity = null;
      this.title.innerHTML = 'About Linny-R';
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

  update(e, shift, ctrl=false) {
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
    if(!this.editing && this.visible) {
      if(shift && e.hasOwnProperty('comments')) {
        this.title.innerHTML = `<em>${et}:</em>&nbsp;${edn}`;
        this.entity = e;
        this.markup = (e.comments ? e.comments : '');
        this.editor.value = this.markup;
        this.viewer.innerHTML = this.markdown;
        if(e.grid && MODEL.solved && MODEL.with_power_flow) {
          // Show cycle flows instead of comments.
          const cf = POWER_GRID_MANAGER.allCycleFlows(e);
          if(cf) this.viewer.innerHTML = cf;
        } else {
          this.edit_btn.classList.remove('disab');
          this.edit_btn.classList.add('enab');
        }
        // NOTE: Permit documentation of the model by raising the dialog.
        if(this.entity === MODEL) this.dialog.style.zIndex = 101;
      }
      // NOTE: Now that methods can be defined (since version 1.6.0), the
      // documentation window displays the eligible prefixes when the cursor
      // is Ctrl-moved over the name of a method (in the Equation Manager).
      if(ctrl && e instanceof DatasetModifier) {
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
      if(html[i].match(/^(\s*-)+$/)) {
        html[i] = '<hr>';
      // Paragraph may contain a bulleted list.
      } else if ((list = this.makeList(html[i], /^\s*-\s+/, 'u')) !== false) {
        html[i] = list;
      // Paragraph may contain a numbered list.
      } else if ((list = this.makeList(html[i], /^\s*\d+\.\s+/, 'o')) !== false) {
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
      } else if(this.entity instanceof Product) {
        UI.paper.drawProduct(this.entity);
      } else if(this.entity instanceof Process) {
        UI.paper.drawProcess(this.entity);
      } else if(this.entity instanceof Cluster) {
        UI.paper.drawCluster(this.entity);
      } else if(this.entity instanceof Constraint) {
        UI.paper.drawConstraint(this.entity);
      } else if(this.entity instanceof Dataset) {
        // NOTE: Only the Dataset manager can selectively update the
        // nimbus for one dataset or dataset modifier.
        DATASET_MANAGER.updateNimbus(this.entity);
      } else if(this.entity instanceof DatasetModifier) {
        if(this.entity.dataset === MODEL.equations_dataset) {
          EQUATION_MANAGER.updateNimbus();
        } else {
          DATASET_MANAGER.updateNimbus(this.entity);
        }
      } else if(this.entity instanceof Experiment) {
        EXPERIMENT_MANAGER.updateNimbus();
      }
      FINDER.updateNimbus();
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

  updateNimbuses() {
    // When opening/closing the Documentation manager, entities having
    // comments must show/hide their blue nimbuses.
    UI.drawDiagram(MODEL);
    DATASET_MANAGER.updateNimbus();
    EQUATION_MANAGER.updateNimbus();
    EXPERIMENT_MANAGER.updateNimbus();
    FINDER.updateNimbus();
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
    const msg = 'Arrow represents ' + pluralS(arrow.links.length, 'link');
    UI.setMessage(msg);
    if(this.visible && !this.editing) {
      // Set the dialog title.
      this.title.innerHTML = msg;
      // Show list.
      const lis = [];
      let dn,
          c,
          af;
      for(const l of arrow.links) {
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
      for(const io of iol) lis.push(`<li>${io.displayName}</li>`);
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
    let category = '';
    for(let i = 0; i < sl.length; i++) {
      if(sl[i].startsWith('_____')) {
        // 5-underscore leader indicates: start of new category.
        category = sl[i].substring(5);
        html.push('<h2>', category, '</h2>');
      } else {
        // Expect model element name.
        // NOTE: A trailing arrow indicates: element is a dataset modifier.
        if(sl[i].endsWith('&rarr;')) {
          // If so, indent the line, preserving the arrow...
          html.push('<p><tt>&nbsp;&nbsp;', sl[i], '&nbsp;<small>');
          // ... and see the next item as an expression (no comments).
          i++;
          html.push(sl[i], '</small></tt></p>');
        } else if(category === 'Equations' || category === 'Methods') {
          // First add the equation name in monospaced font.
          html.push('<p><tt>', sl[i], '<br><small>');
          // See the next item as an expression (small monospaced font)...
          i++;
          html.push(sl[i], '</small></tt><br><small>');
          // ... followed by its associated marked-up comments.
          i++;
          this.markup = sl[i];
          // Methods have an additional marked-up item: their eligible entities.
          if(category === 'Methods') {
            i++;
            this.markup += sl[i];
          }
          // Only now terminate the paragraph for this model element.
          html.push(this.markdown, '</small></p>');
        } else {
          html.push('<p><tt>', sl[i], '</tt><br><small>');
          // For other categories, the next item will be associated marked-up comments.
          i++;
          this.markup = sl[i];
          html.push(this.markdown, '</small></p>');
        }
      }
    }
    this.title.innerHTML = 'Complete model documentation';
    this.viewer.innerHTML = html.join('');
    // Deselect entity and disable editing.
    this.entity = null;
    this.edit_btn.classList.remove('enab');
    this.edit_btn.classList.add('disab');
  }
    
  copyDocToClipboard(plain) {
    UI.copyHtmlToClipboard(this.viewer.innerHTML, plain);
  }

} // END of class DocumentationManager 

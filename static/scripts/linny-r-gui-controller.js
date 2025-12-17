/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-controller.js) provides the GUI controller
functionality for the Linny-R model editor: buttons on the main tool bars,
the associated modal dialogs (class ModalDialog), and the related event
handler functions.

*/

/*
Copyright (c) 2017-2025 Delft University of Technology

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software furnished to do
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

// CLASS ModalDialog provides basic modal dialog functionality.
class ModalDialog {
  constructor(id) {
    this.id = id;
    this.modal = document.getElementById(id + '-modal');
    this.dialog = document.getElementById(id + '-dlg');
    // NOTE: Dialog title and button properties will be `undefined` if
    // not in the header DIV child of the dialog DIV element.
    this.title = this.dialog.getElementsByClassName('dlg-title')[0];
    this.ok = this.dialog.getElementsByClassName('ok-btn')[0];
    this.cancel = this.dialog.getElementsByClassName('cancel-btn')[0];
    this.info = this.dialog.getElementsByClassName('info-btn')[0];
    this.close = this.dialog.getElementsByClassName('close-btn')[0];
    // NOTE: Reset function is called on hide() and can be redefined.
    this.reset = () => {}; 
  }
  
  element(name) {
    // Return the DOM element within this dialog that is identified by
    // `name`. In the file `index.html`, modal dialogs are defined as
    // DIV elements with id="xxx-modal", "xxx-dlg", etc., and all input
    // fields then must have id="xxx-name".
    return document.getElementById(`${this.id}-${name}`);
  }
  
  selectedOption(name) {
    // Return the selected option element of the named selector.
    const sel = document.getElementById(`${this.id}-${name}`);
    return sel.options[sel.selectedIndex];
  }

  show(name='') {
    // Make dialog visible and set focus on the name element.
    this.modal.style.display = 'block';
    if(name) this.element(name).focus();
  }
  
  hide() {
    // Make this modal dialog invisible.
    this.modal.style.display = 'none';
  }
  
  get showing() {
    // Return TRUE iff this modal dialog is visible.
    return this.modal.style.display === 'block';
  }

} // END of class ModalDialog


// CLASS GroupPropertiesDialog
// This type of dialog supports "group editing". The `fields` that must
// be specified when creating it must be a "dictionary" object with
// such that fields[name] is the entity property name that corresponds
// with the DOM input element for that property. For example, for the
// process group properties dialog, fields['LB'] = 'lower_bound' to
// indicate that the DOM element having id="process-LB" corresponds to
// the property `p.lower_bound` of process `p`.
class GroupPropertiesDialog extends ModalDialog {
  constructor(id, fields) {
    super(id);
    // `fields` is the object that relates HTML elements to properties.
    this.fields = fields;
    // `group` holds the entities (all of the same type) that should be
    // updated when the OK-button of the dialog is clicked.
    this.group = [];
    // `selected_ds` is the dataset that was selected in the Finder when
    // opening this dialog, or the first dataset in the group list.
    this.selected_ds = null;
    // `initial_values` is a "dictionary" with (field name, value) entries
    // that hold the initial values of the group-editable properties.
    this.initial = {};
    // `same` is a "dictionary" with (field name, Boolean) entries such
    // that same[name] = TRUE iff the initial values of all entities in
    // the group were identical.
    this.same = {};
    // NOTE: The `group`, `same` and `initial_values` properties must be
    // set before the dialog is shown.

    // Add event listeners that detect if changes are made to the input
    // fields. For toggle items, this means `onclick` events, for text
    // input fields this means `onkeydown` events.
    const fnc = (event) => {
        const id = event.target.id.split('-').shift();
        // NOTE: Add a short delay to permit checkboxes to update their
        // status first, before checking for change.
        setTimeout(() => UI.modals[id].highlightModifiedFields(), 100);
      };
    for(let name in this.fields) if(this.fields.hasOwnProperty(name)) {
      const e = this.element(name);
      if(e.classList.contains('box') || e.classList.contains('bbtn')) {
        e.addEventListener('click', fnc);
      } else if(e.nodeName === 'SELECT') {
        e.addEventListener('change', fnc);
      } else {
        e.addEventListener('keydown', fnc);
      }
    }
    const spe = this.element('prefix');
    if(spe) {
      spe.addEventListener('keydown', fnc);
      document.getElementById('dsg-add-modif-btn').addEventListener(
          'click', () => UI.modals.datasetgroup.promptForSelector('Add'));
      document.getElementById('dsg-rename-modif-btn').addEventListener(
          'click', () => UI.modals.datasetgroup.promptForSelector('Rename'));
      document.getElementById('dsg-edit-modif-btn').addEventListener(
          'click', () => UI.modals.datasetgroup.editExpression());
      document.getElementById('dsg-delete-modif-btn').addEventListener(
          'click', () => UI.modals.datasetgroup.deleteModifier());
      this.selector_modal = new ModalDialog('group-selector');
      this.selector_modal.ok.addEventListener(
          'click', () => UI.modals.datasetgroup.selectorAction());
      this.selector_modal.cancel.addEventListener(
          'click', () => UI.modals.datasetgroup.selector_modal.hide());
    }
  }

  resetFields() {
    // Remove all class names from fields that relate to their "same"
    // and "changed status, and reset group-related properties.
    function stripClassList(e) {
      if(e) {
        const cl = e.classList;
        while(cl.length > 0 && cl.item(cl.length - 1).indexOf('same-') >= 0) {
          cl.remove(cl.item(cl.length - 1));
        }
      }
    }
    for(let name in this.fields) if(this.initial.hasOwnProperty(name)) {
      stripClassList(this.element(name));
    }
    stripClassList(this.element('prefix'));
    this.element('group').innerText = '';
    for(const id of ['name', 'actor', 'cluster']) {
      const e = this.element(id);
      if(e) e.disabled = false;
    }
    const e = this.element('io');
    if(e) e.style.display = 'block';
    this.group.length = 0;
    this.initial = {};
    this.same = {};
    this.changed = {};
    this.shared_prefix = '';
    this.selectors = {};
    this.selected_selector = '';
    this.default_selectors = [];
    this.new_defsel = false;
    this.same_defsel = true;
    this.last_time_clicked = 0;
  }
  
  setFields(obj) {
    // Use the properties of `obj` as initial values, and infer for each
    // field whether all entities in the group have the same value for
    // this property.
    this.initial = {};
    this.same = {};
    this.changed = {};
    for(let name in this.fields) if(this.fields.hasOwnProperty(name)) {
      const
          el = this.element(name),
          cl = el.classList,
          token = cl.item(0),
          propname = this.fields[name],
          prop = obj[propname];
      if(prop instanceof Expression) {
        this.initial[name] = prop.text;
        el.value = prop.text;
      } else {
        this.initial[name] = prop;
        if(token === 'bbtn') {
          el.className = (prop ? 'bbtn eq' : 'bbtn ne');
          // NOTE: Update required to enable or disable UB field.
          UI.updateEqualBounds(obj.type.toLowerCase());
        } else if(token === 'box') {
          el.className = (prop ? 'box checked' : 'box clear');
        } else if(propname === 'share_of_cost') {
          // NOTE: Share of cost is input as a percentage, but stored as
          // a floating point value between 0 and 1.
          el.value = VM.sig4Dig(100 * prop);
        } else {
          el.value = prop;
        }
      }
      if(this.group.length > 0) {
        let same = true;
        for(let i = 0; same && i < this.group.length; i++) {
          const
              ge = this.group[i],
              gprop = ge[propname];
          // NOTE: Ignore links for which property os not meaningful.
          if(!(ge instanceof Link) ||
              this.validLinkProperty(ge, propname, prop)) {
            same = (gprop instanceof Expression ?
                gprop.text === prop.text : gprop === prop);
          }
        }
        this.same[name] = same;
      }
    }
    // For the dataset group dialog, more fields must be determined.
    if(obj instanceof Dataset) {
      // Determine the longest prefix shared by ALL datasets in the group.
      this.shared_prefix = UI.sharedPrefix(obj.name, obj.name);
      for(const ds of this.group) {
        const sp = UI.sharedPrefix(obj.name, ds.name);
        if(sp && this.shared_prefix.startsWith(sp)) {
          this.shared_prefix = sp;
        } else if(!sp.startsWith(this.shared_prefix)) {
          this.shared_prefix = '';
          break;
        }
      }
      this.element('prefix').value = this.shared_prefix;
      // Determine the set of all dataset modifier selectors while counting
      // the number of occurrences of each selector and checking whether
      // the modifier expressions are identical.
      // NOTE: Here, too, take `obj` as the reference object.
      this.selectors = {};
      this.selected_selector = '';
      this.default_selectors = [];
      this.new_defsel = false;
      this.same_defsel = true;
      if(obj.default_selector) {
        this.default_selectors.push(UI.nameToID(obj.default_selector));
      }
      for(const k of Object.keys(obj.modifiers)) {
        const dsm = obj.modifiers[k];
        this.selectors[k] = {
            count: 1,
            sel: dsm.selector,
            expr: dsm.expression.text,
            same_x: true,
            new_s: false,
            new_x: false,
            deleted: false
          };
      }
      // Then iterate over all datasets, excluding `obj`.
      for(const ds of this.group) if(ds !== obj) {
        const defsel = UI.nameToID(ds.default_selector);
        if(this.default_selectors.indexOf(defsel) < 0) this.same_defsel = false;
        if(defsel) addDistinct(defsel, this.default_selectors);
        for(const k of Object.keys(ds.modifiers)) {
          const
              dsm = ds.modifiers[k],
              s = this.selectors[k];
          if(s) {
            s.count++;
            s.same_x = s.same_x && dsm.expression.text === s.expr;
          } else {
            this.selectors[k] = {
                count: 1,
                sel: dsm.selector,
                expr: dsm.expression.text,
                same_x: true,
                new_s: false,
                new_x: false,
                deleted: false
              };
          }
        }
      }
      // Selectors are not "same" when they do not apply to all datasets
      // in the group.
      const n = this.group.length;
      for(const k of Object.keys(this.selectors)) {
        const s = this.selectors[k];
        s.same_s = s.count === n;
      }
      this.updateModifierList();
    }
  }
  
  updateModifierList() {
    // Display the modifier set for a dataset group.
    const
        trl = [],
        not = (x) => { return (x === false ? 'not-' : ''); },
        mdef = (this.new_defsel !== false ? this.new_defsel :
            (this.default_selectors.length ? this.default_selectors[0] : '')),
        sdef = not(this.same_defsel),
        cdef = not(this.new_defsel);
    for(const k of Object.keys(this.selectors)) {
      const
          s = this.selectors[k],
          ms = (s.new_s === false ? s.sel : s.new_s),
          mx = (s.new_x === false ? s.expr : s.new_x),
          wild = (ms.indexOf('*') >= 0 || ms.indexOf('?') >= 0),
          clk = `" onclick="UI.modals.datasetgroup.selectGroupSelector(event, \'${k}\'`;
      // Do not display deleted modifiers.
      if(s.deleted) continue;
      trl.push(['<tr id="dsgs-', k, '" class="dataset-modif',
          (k === this.selected_selector ? ' sel-set' : ''),
          '"><td class="dataset-selector',
          ` ${not(s.same_s)}same-${not(s.new_s)}changed`,
          (wild ? ' wildcard' : ''),
          '" title="Shift-click to ', (s.defsel ? 'clear' : 'set as'),
          ' default modifier', clk, ', false);">',
          (k === mdef ||
              (this.new_defsel === false && this.default_selectors.indexOf(k) >= 0) ?
                  `<img src="images/solve-${sdef}same-${cdef}changed.png" ` +
                  'style="height: 14px; width: 14px; margin: 0 1px -3px -1px;">' : ''),
          (wild ? wildcardFormat(ms, true) : ms),
          '</td><td class="dataset-expression',
          ` ${not(s.same_x)}same-${not(s.new_x)}changed`, clk,
          ', true);">', mx, '</td></tr>'
        ].join(''));
    }
    this.element('modif-table').innerHTML = trl.join('');
    if(this.selected_selector) UI.scrollIntoView(
        document.getElementById('dsg-' + this.selected_selector));
    const btns = 'dsg-rename-modif dsg-edit-modif dsg-delete-modif';
    if(this.selected_selector) {
      UI.enableButtons(btns);
    } else {
      UI.disableButtons(btns);
    }
  }

  selectGroupSelector(event, id, x=true) {
    // Select modifier selector, or when double-clicked, edit its expression when
    // x = TRUE, or the name of the modifier when x = FALSE.
    const edit = event.altKey || this.doubleClicked(id);
    this.selected_selector = id;
    if(edit) {
      this.last_time_clicked = 0;
      if(x) {
        this.editExpression();
      } else {
        this.promptForSelector('Rename');
      }
      return;
    }
    if(event.shiftKey) {
      // Toggle new default selector.
      this.new_defsel = (this.new_defsel === id ? '' : id);
    }
    this.updateModifierList();
  }
  
  doubleClicked(s) {
    const
        now = Date.now(),
        dt = now - this.last_time_clicked;
    this.last_time_clicked = now;
    if(s === this.selected_selector) {
      // Consider click to be "double" if it occurred less than 300 ms ago.
      if(dt < 300) {
        this.last_time_clicked = 0;
        return true;
      }
    }
    this.clicked_selector = s;
    return false;
  }
  
  enterKey() {
    // Open "edit" dialog for the selected modifier.
    const
        tbl = this.element('modif-table'),
        srl = tbl.getElementsByClassName('sel-set');
    if(srl.length > 0) {
      const r = tbl.rows[srl[0].rowIndex];
      if(r) {
        // Emulate a double-click on the second cell to edit the expression.
        this.last_time_clicked = Date.now();
        r.cells[1].dispatchEvent(new Event('click'));
      }
    }
  }
  
  upDownKey(dir) {
    // Select row above or below the selected one (if possible).
    const
        tbl = this.element('modif-table'),
        srl = tbl.getElementsByClassName('sel-set');
    if(srl.length > 0) {
      let r = tbl.rows[srl[0].rowIndex + dir];
      while(r && r.style.display === 'none') {
        r = (dir > 0 ? r.nextSibling : r.previousSibling);
      }
      if(r) {
        UI.scrollIntoView(r);
        // NOTE: Cell, not row, listens for onclick event.
        r.cells[1].dispatchEvent(new Event('click'));
      }
    }
  }
  
  show(attr, obj) {
    // Make dialog visible with same/changed status and disabled name,
    // actor and cluster fields.
    // NOTE: Cluster dialog is also used to *add* a new cluster, and in
    // that case no fields should be set.
    if(obj) this.setFields(obj);
    if(obj && this.group.length > 0) {
      this.element('group').innerText = `(N=${this.group.length})`;
      // Disable name, actor, and cluster fields if they exist.
      for(const id of ['name', 'actor', 'cluster']) {
        const e = this.element(id);
        if(e) e.disabled = true;
      }
      // Hide io field if it exists.
      const e = this.element('io');
      if(e) e.style.display = 'none';
      // Set the right colors to reflect same and changed status.
      this.highlightModifiedFields();
    }
    this.modal.style.display = 'block';
    if(attr) this.element(attr).focus();
  }
  
  hide() {
    // Reset group-related attributes and then make this modal dialog
    // invisible.
    this.resetFields();
    this.modal.style.display = 'none';
  }

  highlightModifiedFields() {
    // Set the CSS classes of fields so that they reflect their "same"
    // and "changed" status.
    if(this.group.length === 0) return;
    const not = {false: 'not-', true: ''};
    for(let name in this.initial) if(this.initial.hasOwnProperty(name)) {
      const
          iv = this.initial[name],
          // A "group editing" dialog will also have the property `same`
          // for which `same[name]` is TRUE iff all entities had identical
          // values for the property identified by `name` when the dialog
          // was opened.
          same = `${not[this.same[name]]}same`,
          el = this.element(name);
      let changed = false,
          type = '',
          state = '';
      if(el.nodeName === 'INPUT' || el.nodeName === 'SELECT') {
        if(name === 'share-of-cost') {
          // NOTE: Share of cost is input as percentage, but stored as a
          // floating point number. Use != for comparison (not !==).
          changed = (el.value != VM.sig4Dig(100 * iv));
        } else {
          // Text input field; `iv` is a string or a number (for select),
          // so use != and not !== for comparison.
          changed = (el.value != iv);
        }
      } else {
        // Toggle element; `iv` is either TRUE or FALSE.
        type = el.classList.item(0);
        state = el.classList.item(1);
        // Compute current value as Boolean.
        const v = (type === 'box' ? state ==='checked' : state === 'eq');
        changed = (v !== iv);
        // When array box for dataset group is (un)checked, the time aspects
        // cover div must be hidden (shown).
        if(name === 'array') {
          this.element('no-time-msg').style.display = (v ? 'block' : 'none');
        }
      }
      this.changed[name] = changed;
      el.className = `${type} ${state} ${same}-${not[changed]}changed`.trim();
    }
    const spe = this.element('prefix');
    if(spe) {
      const changed = spe.value !== this.shared_prefix;
      spe.className = `same-${not[changed]}changed`;
    }
  }
  
  validLinkProperty(link, property, value=0) {
    // Returns TRUE if for `link` it is meaningful to have `property`,
    // and if so, whether this is TRUE for the (optionally specified)
    // `value` for that property.
    if(property === 'multiplier') {
      // No special multipliers on non-data links.
      if(value > 0 && !link.to_node.is_data) return false;
      // Throughput data only from products.
      if(value === VM.LM_THROUGHPUT &&
          !(link.from_node instanceof Product)) return false;
      // Spinning reserve data only from processes.
      if(value === VM.LM_SPINNING_RESERVE &&
          !(link.from_node instanceof Process)) return false;
    } else if(property === 'flow_delay' || property === 'share_of_cost') {
      // Delay and SoC only on process output links.
      return link.from_node instanceof Process;
    }
    return true;
  }
  
  updateModifiedProperties(obj) {
    // For all entities in the group, set the properties associated with
    // fields that have been changed to those of `obj`, as these will
    // have been validated by the "update entity properties" dialog.
    if(!obj || this.group.length === 0) return;
    // Update `changed` so it reflects the final changes.
    this.highlightModifiedFields();
    for(let name in this.fields) if(this.changed[name]) {
      const
          propname = this.fields[name],
          prop = obj[propname];
      for(const ge of this.group) {
        // NOTE: For links, special care must be taken.
        if(!(ge instanceof Link) ||
            this.validLinkProperty(ge, propname, prop)) {
          if(prop instanceof Expression) {
            const x = ge[propname];
            x.text = prop.text;
            x.compile();
          } else {
            ge[propname] = prop;
          }
        }
      }
    }
  }

  promptForSelector(action) {
    // Open the group selector modal for the specified action.
    let ms = '',
        md = this.selector_modal;
    if(action === 'Rename') {
      ms = this.selectors[this.selected_selector].sel;
    }
    md.element('action').innerText = action;
    md.element('name').value = ms;
    md.show('name');
  }
  
  selectorAction() {
    // Perform the specified selector action.
    const
        md = this.selector_modal,
        action = md.element('action').innerText,
        ne = md.element('name'),
        ms = MODEL.validSelector(ne.value);
    if(!ms) {
      ne.focus();
      return;
    }
    const ok = (action === 'Add' ? this.addSelector(ms) : this.renameSelector(ms));
    if(ok) {
      md.hide();
      this.updateModifierList();
    }
  }

  addSelector(ms) {
    // Create a new selector and adds it to the list.
    const k = UI.nameToID(ms);
    if(!this.selectors.hasOwnProperty(k)) {
      this.selectors[k] = {
          count: 1,
          sel: ms,
          expr: '',
          same_x: true,
          new_s: ms,
          new_x: '',
          deleted: false
        };
    }
    this.selected_selector = k;
    return true;
  }
  
  renameSelector(ms) {
    // Record the new name for this selector as property `new_s`.
    if(this.selected_selector) {
      const sel = this.selectors[this.selected_selector];
      // NOTES:
      // (1) When renaming, the old name is be preserved.
      // (2) Name changes do not affect the key of the selector.
      // (3) When the new name is identical to the original, record this
      //     by setting `new_s` to FALSE.
      sel.new_s = (ms === sel.sel ? false : ms);
    }
    return true;
  }
  
  editExpression() {
    // Open the Expression editor for the selected expression.
    const sel = this.selectors[this.selected_selector];
    if(sel) {
      const md = UI.modals.expression;
      md.element('property').innerHTML = '(dataset group)|' + sel.sel;
      md.element('text').value = sel.new_x || sel.expr;
      document.getElementById('variable-obj').value = 0;
      X_EDIT.updateVariableBar();
      X_EDIT.clearStatusBar();
      X_EDIT.showPrefix(this.shared_prefix);
      md.show('text');
    }
  }

  modifyExpression(x) {
    // Record the new expression for the selected selector.
    // NOTE: Expressions are compiled when changes are saved.
    const sel = this.selectors[this.selected_selector];
    // NOTE: When the new expression is identical to the original,
    // record this by setting `new_x` to FALSE.
    if(sel) sel.new_x = (x === sel.expr ? false : x);
    this.updateModifierList();
  }

  deleteModifier() {
    // Record that the selected modifier should be deleted.
    const sel = this.selectors[this.selected_selector];
    if(sel) {
      sel.deleted = true;
      this.selected_selector = '';
      this.updateModifierList();
    }
  }

} // END of class GroupPropertiesDialog


// CLASS GUIController implements the Linny-R GUI
class GUIController extends Controller {
  constructor() {
    super();
    this.console = false;
    // Identify the type of browser in which Linny-R is running.
    const
        ua = window.navigator.userAgent.toLowerCase(),
        browsers = [
            ['edg', 'Edge'],
            ['opr', 'Opera'],
            ['chrome', 'Chrome'],
            ['firefox', 'Firefox'],
            ['safari', 'Safari']];
    for(const b of browsers) if(ua.indexOf(b[0]) >= 0) {
      this.browser_name = b[1];
      break;
    }
    // Display version number as clickable link just below the Linny-R logo.
    this.version_number = LINNY_R_VERSION;
    this.version_div = document.getElementById('linny-r-version-number');
    this.version_div.innerHTML = 'Version ' + this.version_number;
    // Initialize the "paper" for drawing the model diagram.
    this.paper = new Paper();
    // Block arrows on nodes come in three types:
    this.BLOCK_IN = 1;
    this.BLOCK_OUT = 2;
    this.BLOCK_IO = 3;
    // The properties below are used to avoid too frequent redrawing of
    // the SVG model diagram.
    this.busy_drawing = false;
    this.draw_requests = 0;
    this.busy_drawing_selection = false;
    this.selection_draw_requests = 0;
    // The "edited object" is set when the properties modal of the selected
    // entity is opened with double-click or Alt-click.
    this.edited_object = null;
    // Initialize mouse/cursor control properties.
    this.mouse_x = 0;
    this.mouse_y = 0;
    this.mouse_down_x = 0;
    this.mouse_down_y = 0;
    // When clicking on a node, difference between cursor coordinates
    // and node coordinates is recorded.
    this.move_dx = 0;
    this.move_dy = 0;
    // When moving the cursor, the cumulative movement since the last
    // mouse DOWN or UP event is recorded.
    this.net_move_x = 0;
    this.net_move_y = 0;
    // When mouse button is pressed while some add button is active,
    // the coordinates of the cursor are recorded.
    this.add_x = 0;
    this.add_y = 0;
    // When mouse button is pressed while no node is under the cursor,
    // cursor coordinates are recorded as origin of the drag rectangle. 
    this.start_sel_x = -1;
    this.start_sel_y = -1;
    this.on_node = null;
    this.on_arrow = null;
    this.on_link = null;
    this.on_constraint = null;
    this.on_cluster = null;
    this.on_cluster_edge = false;
    this.on_note = null;
    this.on_block_arrow = null;
    this.linking_node = null;
    this.dragged_node = null;
    this.node_to_move = null;
    this.constraining_node = null;
    this.dbl_clicked_node = null;
    this.target_cluster = null;
    this.constraint_under_cursor = null;
    this.last_up_down_without_move = {up: 0, down: 0};
    // Keyboard shortcuts: Ctrl-x associates with menu button ID.
    this.shortcuts = {
      'A': 'actors',
      'B': 'compare', // B for "model B"
      'C': 'clone', // button and Ctrl-C now copies; Alt-C clones
      'D': 'dataset',
      'E': 'equation',
      'F': 'finder',
      'H': 'receiver',  // activate receiver (H for "Host")
      'I': 'documentation',
      'J': 'sensitivity', // J for "Jitter"
      'K': 'reset', // reset model and clear results from graph
      'L': 'load',
      'M': 'monitor', // Alt-M will open the model settings dialog
      // Ctrl-N will still open a new browser window.
      'O': 'chart',  // O for "Output", as it can be charts as wel as data 
      'P': 'diagram', // P for PNG (Portable Network Graphics image)
      'Q': 'stop',
      'R': 'solve', // runs the simulation
      'S': 'save',
      // Ctrl-T will still open a new browser tab.
      'U': 'parent',  // U for "move UP in cluster hierarchy"
      'V': 'paste',
      // Ctrl-W will still close the browser window.
      'X': 'experiment',
      'Y': 'redo',
      'Z': 'undo',
    };

    // Initialize controller buttons.
    this.node_btns = ['process', 'product', 'link', 'constraint',
        'cluster', 'module', 'note'];
    this.edit_btns = ['replace', 'clone', 'paste', 'delete', 'undo', 'redo'];
    this.model_btns = ['settings', 'save', 'actors',
        'dataset', 'equation', 'chart', 'sensitivity', 'experiment',
        'savediagram', 'finder', 'monitor', 'tex', 'solve',
        'compare', 'update'];
    this.other_btns = ['new', 'load', 'receiver', 'documentation',
        'parent', 'lift', 'solve', 'stop', 'reset', 'zoomin', 'zoomout',
        'stepback', 'stepforward'];
    this.all_btns = this.node_btns.concat(
        this.edit_btns, this.model_btns, this.other_btns);

    // Add all button DOM elements as controller properties.
    for(const b of this.all_btns) {
      this.buttons[b] = document.getElementById(b + '-btn');
    }
    this.active_button = null;

    // Also identify the elements related to the focal cluster.
    this.focal_cluster = document.getElementById('focal-cluster');
    this.focal_black_box = document.getElementById('focal-black-box');
    this.focal_name = document.getElementById('focal-name');
    
    // Keep track of time since last message displayed on the infoline.
    this.time_last_message = new Date('01 Jan 2001 00:00:00 GMT');
    this.message_display_time = 3000;
    this.last_message_type = '';

    // Initialize "main" modals, i.e., those that relate to the controller,
    // not to other dialog objects.
    const main_modals = ['logon', 'model', 'browser', 'save', 'settings',
        'actors', 'expression', 'server', 'solver', 'defaults',
        'add-process', 'add-product', 'move', 'note', 'clone', 'replace'];
    for(const m of main_modals) this.modals[m] = new ModalDialog(m);
    
    // Several dialogs may ask to confirm some action.
    this.confirm_perform_modal = new ModalDialog('confirm-perform');
    this.confirm_perform_modal.ok.addEventListener(
        'click', () => {
            const md = UI.confirm_perform_modal;
            md.hide();
            // NOTE: Delete action function must be set by the calling method.
            if(md.action) {
              // Use setTimeout to ensure that modal is hidden first. 
              setTimeout(md.action, 5);
              // Clear action property to prevent unintended repetition.
              md.action = null;
            }
          });
    this.confirm_perform_modal.cancel.addEventListener(
        'click', () => UI.confirm_perform_modal.hide());
    
    // Property dialogs for entities may permit group editing.
    this.modals.cluster = new GroupPropertiesDialog('cluster', {
        'collapsed': 'collapsed',
        'ignore': 'ignore',
        'black-box': 'black_box'
      });
    this.modals.constraint = new GroupPropertiesDialog('constraint', {
        'soc-direct': 'soc_direction',
        'share-of-cost': 'share_of_cost',
        'no-slack': 'no_slack'
      });
    this.modals.link = new GroupPropertiesDialog('link', {
        'multiplier': 'multiplier',
        'R': 'relative_rate',
        'D': 'flow_delay',
        'share-of-cost': 'share_of_cost'
      });
    this.modals.process = new GroupPropertiesDialog('process', {
        'LB': 'lower_bound',
        'UB': 'upper_bound',
        'UB-equal': 'equal_bounds',
        'IL': 'initial_level',
        'integer': 'integer_level',
        'shut-down': 'level_to_zero',
        'LCF': 'pace_expression',
        'collapsed': 'collapsed'
      });
    this.modals.product = new GroupPropertiesDialog('product', {
        'unit': 'scale_unit',
        'source': 'is_source',
        'sink': 'is_sink',
        'stock': 'is_buffer',
        'data': 'is_data',
        'LB': 'lower_bound',
        'UB': 'upper_bound',
        'UB-equal': 'equal_bounds',
        'IL': 'initial_level',
        'P': 'price',
        'integer': 'integer_level',
        'no-slack': 'no_slack',
        'no-links': 'no_links'
      });
    
    // The Dataset group modal.
    this.modals.datasetgroup = new GroupPropertiesDialog('datasetgroup', {
        'default': 'default_value',
        'unit': 'scale_unit',
        'periodic': 'periodic',
        'array': 'array',
        'time-scale': 'time_scale',
        'time-unit': 'time_unit',
        'method': 'method'
      });
    
    // Initially, no dialog being dragged or resized.
    this.dr_dialog = null;
    
    // Visible draggable dialogs are sorted by their z-index.
    this.dr_dialog_order = [];
    
    // Record of message that was overridden by more important message.
    this.old_info_line = null;
  }
  
  get color() {
    // Permit shorthand "UI.color.xxx" without the ".paper" part.
    return this.paper.palette;
  }
  
  removeListeners(id) {
    // Remove all event listeners from DOM element with specified identifier.
    const el = document.getElementById(id);
    if(!el) return null;
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    return clone;
  }
  
  addListeners() {
    // NOTE: "cc" stands for "canvas container"; this DOM element holds
    // the model diagram SVG.
    this.cc = document.getElementById('cc');
    this.cc.addEventListener('mousemove', (event) => UI.mouseMove(event));
    this.cc.addEventListener('mouseup', (event) => UI.mouseUp(event));
    this.cc.addEventListener('mousedown', (event) => UI.mouseDown(event));
    // NOTE: Responding to `mouseenter` is needed to update the cursor
    // position after closing a modal dialog.
    this.cc.addEventListener('mouseenter', (event) => UI.mouseMove(event));
    // Products can be dragged from the Finder to add a placeholder for
    // it to the focal cluster.
    this.cc.addEventListener('dragover', (event) => UI.dragOver(event));
    this.cc.addEventListener('drop', (event) => UI.drop(event));

    // Disable dragging on all images.
    for(const img of document.getElementsByTagName('img')) {          
      img.addEventListener('dragstart', noDrag);
    }
    
    // Moving cursor over Linny-R logo etc. should display information
    // in Information & Documentation manager.
    const lrf = () => DOCUMENTATION_MANAGER.clearEntity(true);
    document.getElementById('static-icon').addEventListener('mousemove', lrf);
    document.getElementById('linny-r-name').addEventListener('mousemove', lrf);
    document.getElementById('linny-r-version-number')
        .addEventListener('mousemove', lrf);

    // Make all buttons respond to a mouse click.
    this.buttons['new'].addEventListener('click',
        () => UI.promptForNewModel());
    this.buttons.load.addEventListener('click',
        (event) => FILE_MANAGER.loadModel(event.altKey));
    this.buttons.settings.addEventListener('click',
        () => UI.showSettingsDialog(MODEL));
    // NOTE: Save model prompts for new name when Shift-key is pressed.
    this.buttons.save.addEventListener('click',
        (event) => FILE_MANAGER.saveModel(event));
    this.buttons.actors.addEventListener('click',
        () => ACTOR_MANAGER.showDialog());
    // NOTE: Diagram is now saved as PNG *unless* Shift-key is pressed.
    this.buttons.savediagram.addEventListener('click',
        () => FILE_MANAGER.saveDiagramAsSVG(event));
    this.buttons.receiver.addEventListener('click',
        () => RECEIVER.toggle());
    // Right-most buttons open the File manager for special actions.
    this.buttons.compare.addEventListener('click',
        () => FILE_MANAGER.showDialog('compare'));
    this.buttons.update.addEventListener('click',
        () => FILE_MANAGER.showDialog('update'));
    // NOTE: All draggable & resizable dialogs "toggle" show/hide.
    const tdf = (event) => UI.toggleDialog(event);
    this.buttons.dataset.addEventListener('click', tdf);
    this.buttons.equation.addEventListener('click', tdf);
    this.buttons.chart.addEventListener('click', tdf);
    this.buttons.sensitivity.addEventListener('click', tdf);
    this.buttons.experiment.addEventListener('click', tdf);
    this.buttons.finder.addEventListener('click', tdf);
    this.buttons.monitor.addEventListener('click', tdf);
    this.buttons.documentation.addEventListener('click', tdf);
    // Cluster navigation elements:
    this.focal_name.addEventListener('click',
        () => UI.showClusterPropertiesDialog(MODEL.focal_cluster));
    this.focal_name.addEventListener('mousemove',
        () => DOCUMENTATION_MANAGER.update(MODEL.focal_cluster, true));
    this.buttons.parent.addEventListener('click',
        () => UI.showParentCluster());
    this.buttons.lift.addEventListener('click',
        () => UI.moveSelectionToParentCluster());

    // Local host button (on far right of top horizontal tool bar).
    if(!SOLVER.user_id) {
      // NOTE: When user name is specified, solver is not on local host.
      const hl = document.getElementById('host-logo');
      hl.classList.add('local-server');
      hl.addEventListener('click', () => UI.showServerModal());
    }

    // Vertical tool bar buttons:
    this.buttons.clone.addEventListener('click',
        (event) => {
          if(event.altKey) {
            UI.promptForCloning();
          } else {
            UI.copySelection();
          }
        });
    this.buttons.replace.addEventListener('click',
        () => UI.replaceSelectedProduct());
    this.buttons.paste.addEventListener('click',
        () => UI.pasteSelection());
    this.buttons['delete'].addEventListener('click',
        () => {
          UNDO_STACK.push('delete');
          MODEL.deleteSelection();
          UI.updateButtons();
        });
    this.buttons.undo.addEventListener('click',
        () => {
          if(UI.buttons.undo.classList.contains('enab')) {
            UNDO_STACK.undo();
            UI.updateButtons();
          }
        });
    this.buttons.redo.addEventListener('click',
        () => {
          if(UI.buttons.redo.classList.contains('enab')) {
            UNDO_STACK.redo();
            UI.updateButtons();
          }
        });
    this.buttons.solve.addEventListener('click',
        (event) => VM.solveModel(event.altKey));
    this.buttons.stop.addEventListener('click', () => VM.halt());
    this.buttons.reset.addEventListener('click', () => UI.resetModel());

    // Bottom-line GUI elements:
    this.buttons.zoomin.addEventListener('click', () => UI.paper.zoomIn());
    this.buttons.zoomout.addEventListener('click', () => UI.paper.zoomOut());
    this.buttons.stepback.addEventListener('click',
        (event) => UI.stepBack(event));
    this.buttons.stepforward.addEventListener('click',
        (event) => UI.stepForward(event));
    document.getElementById('prev-issue').addEventListener('click',
        () => UI.updateIssuePanel(-1));
    document.getElementById('issue-nr').addEventListener('click',
        () => UI.jumpToIssue());
    document.getElementById('next-issue').addEventListener('click',
        () => UI.updateIssuePanel(1));
    document.getElementById('recall-btn').addEventListener('click',
        () => {
            // Open the documentation manager if still closed.
            if(!DOCUMENTATION_MANAGER.visible) {
              UI.buttons.documentation.dispatchEvent(new Event('click'));
            }
            // Then show all infoline messages since last model load.
            DOCUMENTATION_MANAGER.showInfoMessages(true);
          });

    // Make "stay active" buttons respond to Shift-click.
    const tf = (event) => UI.toggleButton(event);
    for(const tb of document.getElementsByClassName('toggle')) {          
      tb.addEventListener('click', tf);
    }

    // Add listeners to OK and CANCEL buttons on main modal dialogs.
    this.modals.logon.ok.addEventListener('click',
        () => {
            const
                usr = UI.modals.logon.element('name').value,
                pwd = UI.modals.logon.element('password').value;
            // Always hide the modal dialog.
            UI.modals.logon.hide();
            MONITOR.logOnToServer(usr, pwd);
          });
    this.modals.logon.cancel.addEventListener('click',
        () => {
            UI.modals.logon.hide();
            UI.warn('Not connected to solver');
          });

    this.modals.model.ok.addEventListener('click',
        () => UI.createNewModel());
    this.modals.model.cancel.addEventListener('click',
        () => UI.modals.model.hide());

    this.modals.settings.ok.addEventListener('click',
        () => UI.updateSettings(MODEL));
    // NOTE: Model Settings dialog has an information button in its header.
    this.modals.settings.info.addEventListener('click',
        () => {
            // Open the documentation manager if still closed.
            if(!DOCUMENTATION_MANAGER.visible) {
              UI.buttons.documentation.dispatchEvent(new Event('click'));
            }
            DOCUMENTATION_MANAGER.update(MODEL, true);
          });
    this.modals.settings.cancel.addEventListener('click',
        () => {
            UI.modals.settings.hide();
            // Ensure that model documentation can no longer be edited.
            DOCUMENTATION_MANAGER.clearEntity([MODEL]);
          });

    // Make the scale units, solver preferences and power grid buttons
    // of the settings dialog responsive. Clicking will open these dialogs
    // on top of the settings modal dialog.
    this.modals.settings.element('scale-units-btn').addEventListener('click',
        () => SCALE_UNIT_MANAGER.show());
    this.modals.settings.element('solver-prefs-btn').addEventListener('click',
        () => UI.showSolverPreferencesDialog());
    // The power grid options button should be visible only when the options
    // checkbox is checked.
    this.modals.settings.element('power').addEventListener('click',
        () => UI.togglePowerGridButton());
    this.modals.settings.element('power-btn').addEventListener('click',
        () => POWER_GRID_MANAGER.show());

    // Make solver modal elements responsive.
    this.modals.solver.ok.addEventListener('click',
        () => UI.updateSolverPreferences());
    this.modals.solver.cancel.addEventListener('click',
        () => UI.modals.solver.hide());

    // Make server modal elements responsive.
    this.modals.server.ok.addEventListener('click',
        () => UI.changeSolver(UI.modals.server.element('solver').value));
    this.modals.server.cancel.addEventListener('click',
        () => UI.modals.server.hide());
    this.modals.server.element('defaults-btn').addEventListener('click',
        () => UI.showDefaultsDialog());
    this.modals.server.element('update').addEventListener('click',
        () => UI.shutDownToUpdate());
    this.modals.server.element('shut-down').addEventListener('click',
        () => UI.shutDownServer());

    // Make default model properties modal elements responsive.
    this.modals.defaults.ok.addEventListener('click',
        () => UI.changeDefaults());
    this.modals.defaults.cancel.addEventListener('click',
        () => UI.modals.defaults.hide());

    // Modals related to vertical toolbar buttons.
    this.modals['add-process'].ok.addEventListener('click',
        () => UI.addNode('process'));
    this.modals['add-process'].cancel.addEventListener('click',
        () => UI.modals['add-process'].hide());

    this.modals['add-product'].ok.addEventListener('click',
        () => UI.addNode('product'));
    this.modals['add-product'].cancel.addEventListener('click',
        () => UI.modals['add-product'].hide());

    this.modals.cluster.ok.addEventListener('click',
        () => UI.addNode('cluster'));
    this.modals.cluster.cancel.addEventListener('click',
        () => UI.modals.cluster.hide());
    this.modals.cluster.element('include-btn').addEventListener('click',
        () => {
            // Pass entered cluster name on to the inclusion modal.
            FILE_MANAGER.include_modal.cluster_prefix = UI.modals
                .cluster.element('name').value.trim();
            FILE_MANAGER.include_modal.cluster_actor = UI.modals
                .cluster.element('actor').value.trim();
            UI.modals.cluster.hide();
            FILE_MANAGER.showDialog('include');
          });

    // NOTES:
    // (1) Use shared functions for process & product dialog events.
    // (2) The "edit expression" buttons provide sufficient info via `event`.
    const
        eoxedit = (event) => X_EDIT.editExpression(event),
        eodocu = () => DOCUMENTATION_MANAGER.update(UI.edited_object, true),
        eoteqb = (event) => UI.toggleEqualBounds(event);

    this.modals.note.ok.addEventListener('click',
        () => UI.addNode('note'));
    this.modals.note.cancel.addEventListener('click',
        () => UI.modals.note.hide());
    // Notes have 1 expression property (color).
    this.modals.note.element('C-x').addEventListener('click', eoxedit);
    // NOTE: The properties dialog for process, product, cluster and link
    // also respond to `mousemove` to show documentation.
    this.modals.process.ok.addEventListener('click',
        () => UI.updateProcessProperties());
    this.modals.process.cancel.addEventListener('click',
        () => UI.modals.process.hide());
    this.modals.process.dialog.addEventListener('mousemove', eodocu);
    this.modals.process.element('UB-equal').addEventListener('click', eoteqb);
    // Processes have 4 expression properties
    this.modals.process.element('LB-x').addEventListener('click', eoxedit);
    this.modals.process.element('UB-x').addEventListener('click', eoxedit);
    this.modals.process.element('IL-x').addEventListener('click', eoxedit);
    this.modals.process.element('LCF-x').addEventListener('click', eoxedit);
    // Processes can represent power grid elements.
    this.modals.process.element('grid-plate').addEventListener(
        'mouseenter', () => UI.showGridPlateMenu('process'));
    // Make the grid plate menu responsive.
    this.modals.process.element('grid-plate-menu').addEventListener(
        'mouseleave', () => UI.hideGridPlateMenu('process'));
    this.modals.product.ok.addEventListener('click',
        () => UI.updateProductProperties());
    this.modals.product.cancel.addEventListener('click',
        () => UI.modals.product.hide());
    this.modals.product.dialog.addEventListener('mousemove', eodocu);
    this.modals.product.element('UB-equal').addEventListener('click', eoteqb);
    // Product stock box performs action => wait for box to update its state.
    document.getElementById('stock').addEventListener('click',
        () => setTimeout(() => UI.toggleProductStock(), 10));
    // Products have 4 expression properties.
    this.modals.product.element('LB-x').addEventListener('click', eoxedit);
    this.modals.product.element('UB-x').addEventListener('click', eoxedit);
    this.modals.product.element('IL-x').addEventListener('click', eoxedit);
    this.modals.product.element('P-x').addEventListener('click', eoxedit);
    
    // Products have an import/export togglebox.
    this.modals.product.element('io').addEventListener('click',
        () => UI.toggleImportExportBox('product'));

    this.modals.datasetgroup.ok.addEventListener('click',
        () => FINDER.updateDatasetGroupProperties());
    this.modals.datasetgroup.cancel.addEventListener('click',
        () => UI.modals.datasetgroup.hide());

    this.modals.link.ok.addEventListener('click',
        () => UI.updateLinkProperties());
    this.modals.link.cancel.addEventListener('click',
        () => UI.modals.link.hide());
    this.modals.link.dialog.addEventListener('mousemove',
        () => DOCUMENTATION_MANAGER.update(UI.on_link, true));
    this.modals.link.element('multiplier').addEventListener('change',
        () => UI.updateLinkDataArrows());
    
    // Links have 2 expression properties: rate and delay.
    this.modals.link.element('R-x').addEventListener('click', eoxedit);
    this.modals.link.element('D-x').addEventListener('click', eoxedit);

    this.modals.clone.ok.addEventListener('click',
        () => UI.cloneSelection());
    this.modals.clone.cancel.addEventListener('click',
        () => UI.cancelCloneSelection());

    // The MOVE dialog can appear when a process or cluster is added.
    this.modals.move.ok.addEventListener('click',
        () => UI.moveNodeToFocalCluster());
    this.modals.move.cancel.addEventListener('click',
        () => UI.doNotMoveNode());
    
    // The REPLACE dialog appears when a product is Shift-Alt-clicked.
    this.modals.replace.ok.addEventListener('click',
        () => UI.replaceProduct()); 
    this.modals.replace.cancel.addEventListener('click',
        () => UI.modals.replace.hide());
    
    // The PASTE dialog appears when name conflicts must be resolved.
    this.paste_modal = new ModalDialog('paste');
    this.paste_modal.ok.addEventListener('click',
        () => UI.setPasteMapping());
    this.paste_modal.cancel.addEventListener('click',
        () => UI.paste_modal.hide());
    
    // The CHECK UPDATE dialog appears when a new version is detected.
    this.check_update_modal = new ModalDialog('check-update');
    this.check_update_modal.ok.addEventListener('click',
        () => UI.shutDownToUpdate());
    this.check_update_modal.cancel.addEventListener('click',
        () => UI.preventUpdate());

    // The UPDATING modal appears when updating has started.
    // NOTE: This modal has no OK or CANCEL buttons.
    this.updating_modal = new ModalDialog('updating');

    // Add all draggable stay-on-top dialogs as controller properties.
    
    // Make checkboxes respond to click.
    // NOTE: Checkbox-specific events must be bound AFTER this general setting.
    const cbf = (event) => UI.toggleBox(event);
    for(const cb of document.getElementsByClassName('box')) {          
      cb.addEventListener('click', cbf);
    }
    // Make infoline respond to `mouseenter`.
    this.info_line = document.getElementById('info-line');
    this.info_line.addEventListener('mouseenter',
        (event) => DOCUMENTATION_MANAGER.showInfoMessages(event.shiftKey));
    // Ensure that all modal windows respond to ESCape
    // (and more in general to other special keys).
    document.addEventListener('keydown', (event) => UI.checkModals(event));
    // Ensure that all modal dialogs "swallow" mousedown events, as otherwise
    // these may alo be processed by the main window drawing canvas.
    for(const modal of document.getElementsByClassName('modal')) {
      modal.addEventListener('mousedown', (event) => event.stopPropagation());
    }
  
  }
  
  setConstraintUnderCursor(c) {
    // Sets constraint under cursor (CUC) (if any) and records time of event
    this.constraint_under_cursor = c;
    this.cuc_x = this.mouse_x;
    this.cuc_y = this.mouse_y;
    this.last_cuc_change = new Date().getTime();
  }
  
  constraintStillUnderCursor() {
    // Returns CUC, but possibly after setting it to NULL because mouse has
    // moved significantly and CUC was detected more than 300 msec ago
    // NOTE: this elaborate check was added to deal with constraint shapes
    // not always generating mouseout events (due to rapid mouse movements?) 
    const
        dx = Math.abs(this.cuc_x - this.mouse_x),
        dy = Math.abs(this.cuc_y - this.mouse_y);
    if(dx + dy > 5 && new Date().getTime() - this.last_cuc_change > 300) {
      this.constraint_under_cursor = null;
    }
    return this.constraint_under_cursor;
  }

  updateControllerDialogs(letters) {
    if(letters.indexOf('C') >= 0) CHART_MANAGER.updateDialog();
    if(letters.indexOf('D') >= 0) DATASET_MANAGER.updateDialog();
    if(letters.indexOf('E') >= 0) EQUATION_MANAGER.updateDialog();
    if(letters.indexOf('F') >= 0) FINDER.updateDialog();
    if(letters.indexOf('I') >= 0) DOCUMENTATION_MANAGER.updateDialog();
    if(letters.indexOf('J') >= 0) SENSITIVITY_ANALYSIS.updateDialog();
    if(letters.indexOf('X') >= 0) EXPERIMENT_MANAGER.updateDialog();
  }

  loadModelFromXML(xml) {
    // Parse `xml` and update the GUI.
    const loaded = MODEL.parseXML(xml);
    // If not a valid Linny-R model, ensure that the current model is clean.
    if(!loaded) MODEL = new LinnyRModel();
    // If model specifies a preferred solver, immediately try to switch.
    if(MODEL.preferred_solver !== VM.solver_id) {
      UI.changeSolver(MODEL.preferred_solver);
    }
    this.updateScaleUnitList();
    this.drawDiagram(MODEL);
    // Cursor may have been set to `waiting` when decrypting.
    this.normalCursor();
    // Reset the Virtual Machine.
    VM.reset();
    this.updateIssuePanel();
    this.clearStatusLine();
    this.updateButtons();
    // Undoable operations no longer apply!
    UNDO_STACK.clear();
    // Autosaving should start anew.
    FILE_MANAGER.setAutoSaveInterval();
    // Finder and Experiment manager dialogs are closed, but  may still
    // display results for previous model.
    FINDER.updateDialog();
    EXPERIMENT_MANAGER.updateDialog();
    // Signal success or failure.
    return loaded;
  }
  
  makeFocalCluster(c) {
    if(c.is_black_boxed) {
      this.notify('Black-boxed clusters cannot be viewed');
      return;
    }
    let fc = MODEL.focal_cluster;
    MODEL.focal_cluster = c;
    MODEL.clearSelection();
    this.paper.drawModel(MODEL);
    this.updateButtons();
    // NOTE: When "moving up" in the cluster hierarchy, bring the former
    // focal cluster into view.
    if(fc.cluster == MODEL.focal_cluster) {
      this.scrollIntoView(fc.shape.element.childNodes[0]);
    }
  }
  
  drawDiagram(mdl) {
    // "Queue" a draw request (to avoid redrawing too often).
    if(this.busy_drawing) {
      this.draw_requests += 1;
    } else {
      this.draw_requests = 0;
      this.busy_drawing = true;
      this.paper.drawModel(mdl);
      this.busy_drawing = false;
    }
  }

  drawSelection(mdl) {
    // "Queue" a draw request (to avoid redrawing too often)
    if(this.busy_drawing_selection) {
      this.selection_draw_requests += 1;
    } else {
      this.selection_draw_requests = 0;
      this.busy_drawing_selection = true;
      this.paper.drawSelection(mdl);
      this.busy_drawing_selection = false;
    }
  }
  
  drawObject(obj) {
    if(obj instanceof Process) {
      this.paper.drawProcess(obj);
    } else if(obj instanceof Product) {
      this.paper.drawProduct(obj);
    } else if(obj instanceof Cluster) {
      this.paper.drawCluster(obj);
    } else if(obj instanceof Arrow) {
      this.paper.drawArrow(obj);
    } else if(obj instanceof Constraint) {
      this.paper.drawConstraint(obj);
    } else if(obj instanceof Note) {
      this.paper.drawNote(obj);
    }
  }

  drawLinkArrows(cluster, link) {
    // Draw all arrows in `cluster` that represent `link`.
    for(const a of cluster.arrows) {
      if(a.links.indexOf(link) >= 0) this.paper.drawArrow(a);
    }    
  }
  
  showServerModal() {
    // Prepare and show the server modal dialog.
    const
        md = this.modals.server,
        host = md.element('host'),
        sd = md.element('solver-div'),
        nsd = md.element('no-solver-div'),
        html = [];
    host.innerText = 'Server on ' + VM.server;
    if(VM.server === 'local host') {
      host.title = 'Linny-R directory is ' + VM.working_directory;
    }
    for(const s of VM.solver_list) {
      html.push(['<option value="', s,
          (s === VM.solver_id ? '"selected="selected' : ''),
          '">', VM.solver_names[s], '</option>'].join(''));
    }
    md.element('solver').innerHTML = html.join('');
    if(html.length) {
      sd.style.display = 'block';
      nsd.style.display = 'none';
    } else {
      sd.style.display = 'none';
      nsd.style.display = 'block';
    }
    md.show();
  }
  
  showDefaultsDialog() {
    // Show editable default properties and permit modification.
    const md = this.modals.defaults;
    md.element('author').value = CONFIGURATION.user_name;
    md.element('currency').value = CONFIGURATION.default_currency_unit;
    md.element('time-scale').value = CONFIGURATION.default_time_scale;
    md.element('time-unit').value = CONFIGURATION.default_time_unit;
    md.element('scale-unit').value = CONFIGURATION.default_scale_unit;
    this.setBox('defaults-comma', CONFIGURATION.decimal_comma);
    this.setBox('defaults-show-notices', CONFIGURATION.slight_slack_notices);
    md.show('author');
  }
  
  changeDefaults() {
    // Validate defaults input and request server to make changes.
    const
        md = UI.modals.defaults,
        ts = this.validNumericInput('defaults-time-scale', 'time step');
    if(ts === false) return;
    if(ts <= 0) {
      this.warn('Time step must be a positive number');
      md.element('time-scale').focus();
      return;
    }
    // No invalid inputs => proceed.
    md.hide();
    const d = {
        user_name: md.element('author').value.trim(),
        default_currency_unit: md.element('currency').value.trim() || 'EUR',
        default_time_scale: ts,
        default_time_unit: md.element('time-unit').value,
        default_scale_unit: md.element('scale-unit').value.trim() || '1',
        decimal_comma: this.boxChecked('defaults-comma'),
        slight_slack_notices: this.boxChecked('defaults-show-notices')
      };
    this.updateDefaults(JSON.stringify(d));
  }
  
  updateDefaults(json='') {
    // Get default values (after updating them when JSON string is is specified).
    fetch('defaults/', postData({change: json}))
      .then(UI.fetchText)
      .then((data) => {
          // NOTE: No action needed when data is empty string.
          if(data && UI.postResponseOK(data)) {
            try {
              const json = JSON.parse(data);
              for(const k of Object.keys(json)) {
                CONFIGURATION[k] = json[k];
              }
            } catch(err) {
              UI.warn('Failed to update configuration');
            }
          }
        })
      .catch(UI.fetchCatch);
  }
  
  changeSolver(sid) {
    // Change preferred solver to `sid` if specified.
    if(!sid) return;
    const
        md = this.modals.server,
        mps = MODEL.preferred_solver;
    md.hide();
    if(mps && mps !== sid) {
      UI.warn('Model setttings designate ' + VM.solver_names[mps] +
          ' as preferred solver');
      return;
    }
    const pd = postData({
        action: 'change',
        solver: sid,
        user: VM.solver_user,
        token: VM.solver_token
      });
    fetch('solver/', pd)
      .then(UI.fetchText)
      .then((data) => {
          if(UI.postResponseOK(data, true)) {
            VM.selectSolver(sid);
            UI.modals.server.hide();
          }
        })
      .catch(UI.fetchCatch);
  }

  shutDownServer() {
    // This terminates the local host server script and display a plain
    // HTML message in the browser with a restart button.
    this.modals.server.hide();
    if(!SOLVER.user_id) window.open('./shutdown', '_self');
  }

  shutDownToUpdate() {
    // Signal server that an update is required. This will close the
    // local host Linny-R server. If this server was started by the
    // standard OS batch script, this script will proceed to update
    // Linny-R via npm and then restart the server again. If not, the
    // fetch request will time out, anf the user will be warned.
    this.modals.server.hide();
    if(SOLVER.user_id) return;
    fetch('update/')
      .then(UI.fetchText)
      .then((data) => {
          if(UI.postResponseOK(data, true)) {
            UI.check_update_modal.hide();
            if(data.startsWith('Installing')) UI.waitToRestart();
          }
        })
      .catch(UI.fetchCatch);
  }
  
  waitToRestart() {
    // Shows the "update in progress" dialog and then fetches the current
    // version page from the server. Always wait for 5 seconds to permit
    // reading the text, and ensure that the server has been stopped.
    // Only then try to restart.
    if(SOLVER.user_id) return;
    UI.updating_modal.show();
    setTimeout(() => UI.tryToRestart(), 5000);
  }

  tryToRestart() {
    // Fetch the current version number from the server. This may take
    // a wile, as the server was shut down and restarts only after npm
    // has updated the Linny-R software. Typically, this takes only a few
    // seconds, but the connection with the npm server may be slow.
    // Default timeout on Firefox (90 seconds) and Chrome (300 seconds)
    // should amply suffice, though, hence no provision for a second attempt.
    fetch('version/')
      .then(UI.fetchText)
      .then((data) => {
          if(UI.postResponseOK(data)) {
            // Change the dialog text in case the user does not confirm
            // when prompted by the browser to leave the page.
            const
                m = data.match(/(\d+\.\d+\.\d+)/),
                md = UI.updating_modal;
            md.title.innerText = 'Update terminated';
            let msg = [];
            if(m) {
              msg.push(
                `Linny-R version ${m[1]} has been installed.`,
                'To continue, you must reload this page, and',
                'confirm when prompted by your browser.');
              // Hide "update" button in server dialog.
              UI.modals.server.element('update').style.display = 'none';
            } else {
              // Inform user that install appears to have failed.
              msg.push(
                'Installation of new version may <strong>not</strong> have',
                'been successful. Please check the CLI for',
                'error messages or warnings.');
            }
            md.element('msg').innerHTML = msg.join('<br>');
            // Reload `index.html`. This will start Linny-R anew.
            // NOTE: Wait for 2 seconds so the message can be read.
            setTimeout(() => { window.open('./', '_self'); }, 2000);
          }
        })
      .catch(UI.fetchCatch);    
  }

  preventUpdate() {
    // Signal server that no update is required. 
    if(SOLVER.user_id) return;
    // Show "update" button in server dialog to permit updating later.
    const btn = this.modals.server.element('update');
    btn.innerText = 'Update Linny-R to version ' + this.newer_version;
    btn.style.display = 'block';
    fetch('no-update/')
      .then(UI.fetchText)
      .then((data) => {
          if(UI.postResponseOK(data, true)) UI.check_update_modal.hide();
        })
      .catch((err) => {
          UI.warn(UI.WARNING.NO_CONNECTION, err);
          UI.check_update_modal.hide();
        });
  }

  loginPrompt() {
    // Show the server logon modal.
    this.modals.logon.element('name').value = SOLVER.user_id;
    this.modals.logon.element('password').value = '';
    this.modals.logon.show('password');
  }
  
  rotatingIcon(rotate=false) {
    // Controls the appearance of the Linny-R icon in the top-left
    // corner of the browser window.
    const
        si = document.getElementById('static-icon'),
        ri = document.getElementById('rotating-icon');
    if(rotate) {
      si.style.display = 'none';
      ri.style.display = 'block';
    } else {
      ri.style.display = 'none';
      si.style.display = 'block';
    }
  }

  updateTimeStep(t=MODEL.simulationTimeStep) {
    // Display `t` as the current time step.
    // NOTE: The Virtual Machine passes its relative time `VM.t`.
    document.getElementById('step').innerHTML = t;
  }
  
  stopSolving() {
    // Reset solver-related GUI elements and notify modeler.
    super.stopSolving();
    this.buttons.solve.classList.remove('off');
    this.buttons.stop.classList.remove('blink');
    this.buttons.stop.classList.add('off');
    this.rotatingIcon(false);
    // Update the time step on the status bar.
    this.updateTimeStep();
  }
  
  readyToSolve() {
    // Set Stop and Reset buttons to their initial state.
    UI.buttons.stop.classList.remove('blink');
    // Hide the reset button
    UI.buttons.reset.classList.add('off');   
  }
  
  startSolving() {
    // Hide Start button and show Stop button.
    UI.buttons.solve.classList.add('off');
    UI.buttons.stop.classList.remove('off');
  }
  
  waitToStop() {
    // Make Stop button blink to indicate "halting -- please wait".
    UI.buttons.stop.classList.add('blink');
  }
  
  readyToReset() {
    // Show the Reset button.
    UI.buttons.reset.classList.remove('off');
    // When Finder is showing entity properties, add the solution-dependent ones.
    if(FINDER.tabular_view) FINDER.updateTabularView();
  }

  reset() {
    // Reset properties related to cursor position on diagram.
    this.on_node = null;
    this.on_arrow = null;
    this.on_cluster = null;
    this.on_cluster_edge = false;
    this.on_link = null;
    this.on_constraint = null;
    this.on_note = null;
    this.on_block_arrow = false;
    this.dragged_node = null;
    this.linking_node = null;
    this.constraining_node = null;
    this.start_sel_x = -1;
    this.start_sel_y = -1;
  }
  
  resetModel() {
    // Model reset clears results, so then the Finder should display
    // only those entity properties that are model input parameters.
    super.resetModel();
    if(FINDER.tabular_view) FINDER.updateTabularView();
  }

  updateIssuePanel(change=0) {
    const
        count = VM.issue_list.length,
        panel = document.getElementById('issue-panel');
    if(count > 0) {
      const
         prev = document.getElementById('prev-issue'),
         next = document.getElementById('next-issue'),
         nr = document.getElementById('issue-nr');
      panel.title = pluralS(count, 'issue') +
          ' occurred - click on number, \u25C1 or \u25B7 to view what and when';
      if(VM.issue_index === -1) {
        VM.issue_index = 0;
      } else if(change) {
        VM.issue_index = Math.min(VM.issue_index + change, count - 1);
      }
      nr.innerText = VM.issue_index + 1;
      if(VM.issue_index <= 0) {
        prev.classList.add('disab');
      } else {
        prev.classList.remove('disab');
      }
      if(VM.issue_index >= count - 1) {
        next.classList.add('disab');
      } else {
        next.classList.remove('disab');
      }
      panel.style.display = 'table-cell';
      if(change) UI.jumpToIssue();
    } else {
      panel.style.display = 'none';
      VM.issue_index = -1;
    }
  }
  
  jumpToIssue() {
    // Set time step to the one of the warning message for the issue
    // index, redraw the diagram if needed, and display the message
    // on the infoline.
    if(VM.issue_index >= 0) {
      const
          issue = VM.issue_list[VM.issue_index],
          po = issue.indexOf('(t='),
          pc = issue.indexOf(')', po),
          t = parseInt(issue.substring(po + 3, pc - 1));
      if(MODEL.t !== t) {
        MODEL.t = t;
        this.updateTimeStep();
        this.drawDiagram(MODEL);
      }
      this.info_line.classList.remove('error', 'notification');
      this.info_line.classList.add('warning');
      this.info_line.innerHTML = issue.substring(pc + 2);
    }
  }

  doubleClicked(ud) {
    // Return TRUE when a "double-click" occurred.
    const
        now = Date.now(),
        dt = now - this.last_up_down_without_move[ud];
    this.last_up_down_without_move[ud] = now;
    // Consider click to be "double" if it occurred less than 300 ms ago
    if(dt < 300) {
      this.last_up_down_without_move[ud] = 0;
      return true;
    }
    return false;
  }
  
  hidden(id) {
    // Returns TRUE if element is not shown
    const el = document.getElementById(id);
    return window.getComputedStyle(el).display === 'none';
  }
  
  toggle(id, display='block') {
    // Hides element if shown; otherwise sets display mode
    const
        el = document.getElementById(id),
        h = window.getComputedStyle(el).display === 'none';
    el.style.display = (h ? display : 'none');
  }
  
  scrollIntoView(e) {
    // Scrolls container of DOM element `e` such that it becomes visible
    if(e) e.scrollIntoView({block: 'nearest', inline: 'nearest'});
  }

  //
  // Methods related to draggable & resizable dialogs
  //
  
  draggableDialog(d) {
    // Make dialog draggable.
    const
        dlg = document.getElementById(d + '-dlg'),
        hdr = document.getElementById(d + '-hdr');
    let cx = 0,
        cy = 0;
    if(dlg && hdr) {
      // NOTE: Dialogs are draggable only by their header.
      hdr.onmousedown = dialogHeaderMouseDown;
      dlg.onmousedown = dialogMouseDown;
      return dlg;
    } else {
      console.log('ERROR: No draggable header element');
      return null;
    }
    
    function dialogMouseDown(e) {
      e = e || window.event;
      // NOTE: No `preventDefault`, as this disables selector elements.
      // Find the dialog element.
      let de = e.target;
      while(de && !de.id.endsWith('-dlg')) { de = de.parentElement; }
      // Move the dialog (`this`) to the top of the order.
      const doi = UI.dr_dialog_order.indexOf(de);
      // NOTE: Do not reorder when already at end of list (= at top).
      if(doi >= 0 && doi !== UI.dr_dialog_order.length - 1) {
        UI.dr_dialog_order.splice(doi, 1);
        UI.dr_dialog_order.push(de);
        UI.reorderDialogs();
      }
    }
  
    function dialogHeaderMouseDown(e) {
      e = e || window.event;
      e.preventDefault();
      // Find the dialog element.
      let de = e.target;
      while(de && !de.id.endsWith('-dlg')) { de = de.parentElement; }
      // Record the affected dialog.
      UI.dr_dialog = de;
      // Get the mouse cursor position at startup.
      cx = e.clientX;
      cy = e.clientY;
      document.onmouseup = stopDragDialog;
      document.onmousemove = dialogDrag;
    }
  
    function dialogDrag(e) {
      e = e || window.event;
      e.preventDefault();
      // Calculate the relative movement of the mouse cursor...
      const
          dx = cx - e.clientX,
          dy = cy - e.clientY;
      // ... and record the new mouse cursor position.
      cx = e.clientX;
      cy = e.clientY;
      // Move the entire dialog, but prevent it from being moved outside the window.
      UI.dr_dialog.style.top = Math.min(
          window.innerHeight - 40, Math.max(0, UI.dr_dialog.offsetTop - dy)) + 'px';
      UI.dr_dialog.style.left = Math.min(
          window.innerWidth - 40,
              Math.max(-210, UI.dr_dialog.offsetLeft - dx)) + 'px';
    }
  
    function stopDragDialog() {
      // Stop moving when mouse button is released.
      document.onmouseup = null;
      document.onmousemove = null;
      // Preserve position as data attributes.
      UI.dr_dialog.setAttribute('data-top', UI.dr_dialog.style.top);
      UI.dr_dialog.setAttribute('data-left', UI.dr_dialog.style.left);
    }
  }
  
  resizableDialog(d, mgr=null) {
    // Make dialog resizable (similar to dragElement above).
    const
        dlg = document.getElementById(d + '-dlg'),
        rsz = document.getElementById(d + '-resize');
    let w = 0,
        h = 0,
        minw = 0,
        minh = 0,
        cx = 0,
        cy = 0;
    if(dlg && rsz) {
      if(mgr) dlg.setAttribute('data-manager', mgr);
      rsz.onmousedown = resizeMouseDown;
    } else {
      console.log('ERROR: No resizing corner element');
      return false;
    }
  
    function resizeMouseDown(e) {
      e = e || window.event;
      e.preventDefault();
      // Find the dialog element.
      let de = e.target;
      while(de && !de.id.endsWith('-dlg')) { de = de.parentElement; }
      UI.dr_dialog = de;
      // Get the (min.) weight, (min.) height and mouse cursor position at startup.
      const cs = window.getComputedStyle(UI.dr_dialog);
      w = parseFloat(cs.width);
      h = parseFloat(cs.height);
      minw = parseFloat(cs.minWidth);
      minh = parseFloat(cs.minHeight);
      cx = e.clientX;
      cy = e.clientY;
      document.onmouseup = stopResizeDialog;
      document.onmousemove = dialogResize;
    }
  
    function dialogResize(e) {
      e = e || window.event;
      e.preventDefault();
      // Calculate the relative mouse cursor movement.
      let dw = e.clientX - cx,
          dh = e.clientY - cy;
      // NOTE: For modal dialogs, double the movement because they auto-adjust
      // their margins to remain centered.
      if(UI.dr_dialog.parentElement.id.endsWith('-modal')) {
        dw *= 2;
        dh *= 2;
      }
      // Set the dialog's new size.
      UI.dr_dialog.style.width = Math.max(minw, w + dw) + 'px';
      UI.dr_dialog.style.height = Math.max(minh, h + dh) + 'px';
      // Update the dialog if its manager has been specified.
      const mgr = UI.dr_dialog.dataset.manager;
      if(mgr) window[mgr].updateDialog();
    }
  
    function stopResizeDialog() {
      // Stop moving when mouse button is released.
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }
  
  toggleDialog(e) {
    // Hide dialog if visible, or show it if not, and update the
    // order of appearance so that this dialog appears on top.
    e = e || window.event;
    e.preventDefault();
    e.stopImmediatePropagation();
    // Infer dialog identifier from target element.
    const
        dlg = e.target.id.split('-')[0],
        tde = document.getElementById(dlg + '-dlg');
    // NOTE: `manager` attribute is a string, e.g. 'MONITOR' or 'CHART_MANAGER'.
    let mgr = tde.dataset.manager,
        was_hidden = this.hidden(tde.id);
    if(mgr) {
      // Dialog has a manager object => let `mgr` point to it.
      mgr = window[mgr];
      // Manager object attributes are more reliable than DOM element
      // style attributes, so update the visibility status.
      was_hidden = !mgr.visible;
    }
    // NOTE: Modeler should not view charts while an experiment is
    // running, so do NOT toggle when the Chart Manager is NOT visible. 
    if(dlg === 'chart' && was_hidden && MODEL.running_experiment) {
      UI.notify(UI.NOTICE.NO_CHARTS);
      return;
    }
    // Otherwise, toggle the dialog visibility.
    UI.toggle(tde.id);
    UI.buttons[dlg].classList.toggle('stay-activ');
    if(mgr) mgr.visible = was_hidden;
    let t, l;
    if('top' in tde.dataset && 'left' in tde.dataset) {
      // Open at position after last drag (recorded in DOM data attributes).
      t = tde.dataset.top;
      l = tde.dataset.left;
    } else {
      // Make dialog appear in screen center the first time it is shown.
      const cs = window.getComputedStyle(tde);
      t = ((window.innerHeight - parseFloat(cs.height)) / 2) + 'px';
      l = ((window.innerWidth - parseFloat(cs.width)) / 2) + 'px';
    }
    tde.style.top = t;
    tde.style.left = l;
    if(was_hidden) {
      // Add activated dialog to "showing" list, and adjust z-indices.
      this.dr_dialog_order.push(tde);
      this.reorderDialogs();
      // Update the diagram if its manager has been specified.
      if(mgr) {
        mgr.updateDialog();
        if(mgr === DOCUMENTATION_MANAGER) {
          if(this.info_line.innerHTML.length === 0) {
            mgr.title.innerHTML = 'About Linny-R';
            mgr.viewer.innerHTML = mgr.about_linny_r;
            mgr.edit_btn.classList.remove('enab');
            mgr.edit_btn.classList.add('disab');
          }
          mgr.updateNimbuses();
        }
      }
    } else {
      const doi = this.dr_dialog_order.indexOf(tde);
      // NOTE: `doi` should ALWAYS be >= 0 because dialog WAS showing.
      if(doi >= 0) {
        this.dr_dialog_order.splice(doi, 1);
        this.reorderDialogs();
      }
      if(mgr === DOCUMENTATION_MANAGER) {
        mgr.title.innerHTML = 'Documentation';
        mgr.updateNimbuses();
      }
    }
  }
  
  reorderDialogs() {
    // Set z-index of draggable dialogs according to their order
    // (most recently shown or clicked on top).
    let z = 10;
    for(const dd of this.dr_dialog_order) {
      dd.style.zIndex = z;
      z += 5;
    }
  }

  //
  // Button functionality
  //
  
  enableButtons(btns) {
    for(const btn of btns.trim().split(/\s+/)) {
      const b = document.getElementById(btn + '-btn');
      b.classList.remove('disab', 'activ');
      b.classList.add('enab');
    }
  }
  
  disableButtons(btns) {
    for(const btn of btns.trim().split(/\s+/)) {
      const b = document.getElementById(btn + '-btn'); 
      b.classList.remove('enab', 'activ', 'stay-activ');
      b.classList.add('disab');
    }
  }
  
  updateButtons() {
    // Updates the buttons on the main GUI toolbars
    const
        node_btns = 'process product link constraint cluster note ',
        edit_btns = 'replace clone paste delete undo redo ',
        model_btns = 'settings save actors dataset equation chart ' +
            'savediagram finder monitor solve compare update';
    if(MODEL === null) {
      this.disableButtons(node_btns + edit_btns + model_btns);
      return;
    }
    if(isEmpty(MODEL.includedModules)) {
      this.buttons.update.classList.add('off');
    } else {
      this.buttons.update.classList.remove('off');      
    }
    if(MODEL.focal_cluster === MODEL.top_cluster) {
      this.focal_cluster.style.display = 'none';
    } else {
      this.focal_name.innerHTML = MODEL.focal_cluster.displayName;
      if(MODEL.focal_cluster.black_box) {
        this.focal_black_box.style.display = 'inline-block';
      } else {
        this.focal_black_box.style.display = 'none';
      }
      if(MODEL.selection.length > 0) {
        this.enableButtons('lift');
      } else {
        this.disableButtons('lift');
      }
      this.focal_cluster.style.display = 'inline-block';
    }
    this.enableButtons(node_btns + model_btns);
    this.active_button = this.stayActiveButton;
    this.disableButtons(edit_btns);
    if(MODEL.selection.length > 0) {
      this.enableButtons('clone delete');
      // Replace applies only to a single product.
      if(MODEL.selection.length === 1) {
        const p = MODEL.selection[0];
        if(p instanceof Product) {
          const
              b = this.buttons.replace,
              t = 'Replace selected product by some other product (Alt-P)';
          // Differentiate between product types, as products can be
          // replaced only by products of the same type.
          if(p.is_data) {
            b.title = t.replaceAll('product', 'data product');
            b.src = 'images/replace-data-product.png';
          } else {
            b.title = t;
            b.src = 'images/replace-product.png';            
          }
          this.enableButtons('replace');
        }
      }
    }
    if(this.canPaste) this.enableButtons('paste');
    // Only allow soling when some target or process constraint is defined.
    if(MODEL.hasTargets) this.enableButtons('solve');
    var u = UNDO_STACK.canUndo;
    if(u) {
      this.enableButtons('undo');
      this.buttons.undo.title = u;
    } else {
      this.buttons.undo.title = 'Undo not possible';
    }
    u = UNDO_STACK.canRedo;
    if(u) {
      this.enableButtons('redo');
      this.buttons.redo.title = u;
    } else {
      this.buttons.redo.title = 'Redo not possible';
    }
  }
  
  // NOTE: Active buttons allow repeated "clicks" on the canvas
  
  get stayActive() {
    if(this.active_button) {
      return this.active_button.classList.contains('stay-activ');
    }
    return false;
  }
  
  resetActiveButton() {
    if(this.active_button) {
      this.active_button.classList.remove('activ', 'stay-activ');
    }
    this.active_button = null;
  }
  
  get stayActiveButton() {
    // Return the button that is "stay active", or NULL if none .
    for(const btn of ['process', 'product', 'link', 'constraint', 'cluster', 'note']) {
      const b = document.getElementById(btn + '-btn');
      if(b.classList.contains('stay-activ')) return b;
    }
    return null;
  }
  
  toggleButton(e) {
    if(e.target.classList.contains('disab')) return;
    let other = true;
    if(this.active_button) {
      other = (e.target !== this.active_button);
      this.resetActiveButton();
    }
    if(other && (e.target.classList.contains('enab'))) {
      e.target.classList.add((e.shiftKey ? 'stay-activ' : 'activ'));
      this.active_button = e.target;
    }
  }

  //
  // Handlers for mouse/cursor events
  //
  
  updateCursorPosition(e) {
    // Update the cursor coordinates, and display them on the status bar.
    const cp = this.paper.cursorPosition(e.pageX, e.pageY);
    // Keep track of the cumulative relative movement since the last
    // mousedown event.
    this.net_move_x += cp[0] - this.mouse_x;
    this.net_move_y += cp[1] - this.mouse_y;
    // Only now update the mouse coordinates.
    this.mouse_x = cp[0];
    this.mouse_y = cp[1];
    // Show the coordinates on the status bar.
    document.getElementById('pos-x').innerHTML = 'X = ' + this.mouse_x;
    document.getElementById('pos-y').innerHTML = 'Y = ' + this.mouse_y;
    // Reset all "object under cursor detection variables" so that they
    // will be re-established correctly by mouseMove.
    this.on_note = null;
    this.on_node = null;
    this.on_cluster = null;
    this.on_cluster_edge = false;
    this.on_arrow = null;
    this.on_link = null;
    this.on_constraint = false;
  }

  mouseMove(e) {
    // Respond to mouse cursor moving over Linny-R diagram area.
    // First translate browser cursor coordinates to diagram coordinates.
    this.updateCursorPosition(e);
    
    // NOTE: Prevent errors in case MODEL is still undefined.
    if(!MODEL) return;
    
    //console.log(e);
    const fc = MODEL.focal_cluster;
    // NOTE: Proceed from last added to first added node.
    for(let i = fc.processes.length-1; i >= 0; i--) {
      const p = fc.processes[i];
      if(p.containsPoint(this.mouse_x, this.mouse_y)) {
        this.on_node = p;
        break;
      }
    }
    if(!this.on_node) {
      for(let i = fc.product_positions.length-1; i >= 0; i--) {
        // NOTE: Set product coordinates to its position in focal cluster.
        const p = fc.product_positions[i].product.setPositionInFocalCluster();
        if(p.product.containsPoint(this.mouse_x, this.mouse_y)) {
          this.on_node = p.product;
          break;
        }
      }
    }
    // NOTE: Clear for all links the "on arrow head" flag.
    for(const k in MODEL.links) if(MODEL.links.hasOwnProperty(k)) {
      MODEL.links[k].on_arrow_head = false;
    }
    for(const arr of fc.arrows) {
      if(arr) {
        this.on_arrow = arr;
        // NOTE: Arrow may represent multiple links. `containsPoint` returns
        // the link if this can be established unambiguously, otherwise NULL.
        const l = arr.containsPoint(this.mouse_x, this.mouse_y);
        if(l) {
          this.on_link = l;
          break;
        }
      }
    }
    this.on_constraint = this.constraintStillUnderCursor();
    if(fc.related_constraints != null) {
      for(const c of fc.related_constraints) {
        if(c.containsPoint(this.mouse_x, this.mouse_y)) {
          this.on_constraint = c;
          break;
        }
      }
    }
    for(let i = fc.sub_clusters.length-1; i >= 0; i--) {
      const c = fc.sub_clusters[i];
      if(c.containsPoint(this.mouse_x, this.mouse_y)) {
        // NOTE: Cluster that is being dragged is superseded by other clusters
        // so that a cluster it is being dragged over will be detected instead.
        if(!this.on_cluster || c !== this.dragged_node) {
          this.on_cluster = c;
          // NOTE: Cluster edge responds differently to doubble-click.
          this.on_cluster_edge = c.onEdge(this.mouse_x, this.mouse_y);
        }
      }
    }
    // Unset and redraw target cluster if cursor no longer over it.
    if(this.on_cluster !== this.target_cluster) {
      const c = this.target_cluster;
      this.target_cluster = null;
      if(c) {
        UI.paper.drawCluster(c);
        // NOTE: Element is persistent, so semi-transparency must also be
        // undone.
        c.shape.element.setAttribute('opacity', 1);
      }
    }
    for(let i = fc.notes.length-1; i >= 0; i--) {
      const n = fc.notes[i];
      if(n.containsPoint(this.mouse_x, this.mouse_y)) {
        this.on_note = n;
        break;
      }
    }
    if(this.active_button === this.buttons.link && this.linking_node) {
      // Draw red dotted line from linking node to cursor.
      this.paper.dragLineToCursor(this.linking_node, this.mouse_x, this.mouse_y);
    } else if(this.start_sel_x >= 0 && this.start_sel_y >= 0) {
      // Draw selecting rectangle in red dotted lines.
      this.paper.dragRectToCursor(this.start_sel_x, this.start_sel_y,
          this.mouse_x, this.mouse_y);
    } else if(this.active_button === this.buttons.constraint &&
        this.constraining_node) {
      // Draw red dotted line from constraining node to cursor.
      this.paper.dragLineToCursor(this.constraining_node,
          this.mouse_x, this.mouse_y);
    } else if(this.dragged_node) {
      MODEL.moveSelection(this.mouse_x - this.move_dx - this.dragged_node.x,
        this.mouse_y - this.move_dy - this.dragged_node.y);
    }
    let cr = 'pointer';
    // NOTE: First check ON_CONSTRAINT because constraint thumbnails overlap
    // with nodes.
    if(this.on_constraint) {
      DOCUMENTATION_MANAGER.update(this.on_constraint, e.shiftKey);
    // NOTE: Skip the "on node" check if the node is being dragged.
    } else if(this.on_node && this.on_node !== this.dragged_node) {
      if((this.active_button === this.buttons.link) && this.linking_node) {
        // Cannot link process to process.
        cr = (MODEL.canLink(this.linking_node, this.on_node) ?
            'crosshair' : 'not-allowed');
      } else if(this.active_button === this.buttons.constraint) {
        if(this.constraining_node) {
          cr = (this.constraining_node.canConstrain(this.on_node) ?
              'crosshair' : 'not-allowed');
        } else if(!this.on_node.hasBounds) {
          // Products can only constrain when they have bounds.
          cr = 'not-allowed';
        }
      }
      // NOTE: Do not overwite status line when cursor is on a block arrow.
      if(!this.on_block_arrow) {
        DOCUMENTATION_MANAGER.update(this.on_node, e.shiftKey);
      }
    } else if(this.on_note) {
      // When shift-moving over a note, show the model's documentation.
      DOCUMENTATION_MANAGER.update(MODEL, e.shiftKey);
    } else {
      if((this.active_button === this.buttons.link && this.linking_node) ||
          (this.active_button === this.buttons.constraint && this.constraining_node)) {
        // Cannot link to clusters or notes.
        cr = (this.on_cluster || this.on_note ? 'not-allowed' : 'crosshair');
      } else if(e.altKey && this.on_link &&
          this.on_link.on_arrow_head && this.on_link.canFlip) {
        cr = 'ew-resize';
      } else if(!this.on_note && !this.on_constraint && !this.on_link &&
          !this.on_cluster_edge) {
        cr = 'default';
      }
      if(!this.on_block_arrow) {
        if(this.on_link) {
          DOCUMENTATION_MANAGER.update(this.on_link, e.shiftKey);
        } else if(this.on_cluster) {
          DOCUMENTATION_MANAGER.update(this.on_cluster, e.shiftKey);
        } else if(!this.on_arrow) {
          this.setMessage('');
        }
      }
      // When dragging a selection over a cluster, change cursor to "cell" to
      // indicate that selected process(es) will be moved into the cluster.
      // NOTE: Do not do this when the dragged selection is just a single note!
      if(this.dragged_node &&
          !(this.dragged_node instanceof Note && MODEL.selection.length < 2)) {
        // NOTE: Cursor will always be over the dragged node, so do not indicate
        // "drop here?" unless dragged over a different cluster.
        if(this.on_cluster &&  this.on_cluster !== this.dragged_node) {
          cr = 'cell';
          this.target_cluster = this.on_cluster;
          // Redraw the target cluster so it will appear on top (and highlighted).
          UI.paper.drawCluster(this.target_cluster);
        } else {
          cr = 'grab';
        }
      }
    }
    this.paper.container.style.cursor = cr;
  }

  mouseDown(e) {
    // Respond to mousedown event in model diagram area.
    // NOTE: While dragging the selection rectangle, the mouseup event will
    // not be observed when it occurred outside the drawing area. In such
    // cases, the mousedown event must be ignored so that only the mouseup
    // will be processed.
    if(this.start_sel_x >= 0 && this.start_sel_y >= 0) return;
    // Reset the cumulative movement since mousedown.
    this.net_move_x = 0;
    this.net_move_y = 0;
    // Get the paper coordinates indicated by the cursor.
    const cp = this.paper.cursorPosition(e.pageX, e.pageY);
    this.mouse_x = cp[0];
    this.mouse_y = cp[1];
    this.mouse_down_x = cp[0];
    this.mouse_down_y = cp[1];
    // De-activate "stay active" buttons if dysfunctional, or if SHIFT,
    // ALT or CTRL is pressed.
    if((e.shiftKey || e.altKey || e.ctrlKey ||
        this.on_note || this.on_cluster || this.on_link || this.on_constraint ||
        (this.on_node && this.active_button !== this.buttons.link &&
            this.active_button !== this.buttons.constraint)) && this.stayActive) {
      resetActiveButton();
    }
    // NOTE: Only left button is detected (browser catches right menu button).
    if(e.ctrlKey) {
      // Remove clicked item from selection.
      if(MODEL.selection) {
        // NOTE: First check constraints -- see mouseMove() for motivation.
        if(this.on_constraint) {
          if(MODEL.selection.indexOf(this.on_constraint) >= 0) {
            MODEL.deselect(this.on_constraint);
          } else {
            MODEL.select(this.on_constraint);
          }
        } else if(this.on_node){
          if(MODEL.selection.indexOf(this.on_node) >= 0) {
            MODEL.deselect(this.on_node);
          } else {
            MODEL.select(this.on_node);
          }
        } else if(this.on_cluster) {
          if(MODEL.selection.indexOf(this.on_cluster) >= 0) {
            MODEL.deselect(this.on_cluster);
          } else {
            MODEL.select(this.on_cluster);
          }
        } else if(this.on_note) {
          if(MODEL.selection.indexOf(this.on_note) >= 0) {
            MODEL.deselect(this.on_note);
          } else {
            MODEL.select(this.on_note);
          }
        } else if(this.on_link) {
          if(MODEL.selection.indexOf(this.on_link) >= 0) {
            MODEL.deselect(this.on_link);
          } else {
            MODEL.select(this.on_link);
          }
        }
        UI.drawDiagram(MODEL);
      }
      this.updateButtons();
      return;
    } // END IF Ctrl
  
    // Clear selection unless SHIFT pressed or double-clicking, or clicking
    // on a selected entity.
    const clicked_object = this.on_node || this.on_note || this.on_cluster ||
        this.on_link || this.on_constraint;
    if(!(this.doubleClicked('down') || e.shiftKey ||
        MODEL.selection.indexOf(clicked_object) >= 0)) {
      MODEL.clearSelection();
      UI.drawDiagram(MODEL);
    }
  
    // If one of the top six sidebar buttons is active, prompt for new node.
    // Note that this does not apply for links or constraints.
    if(this.active_button && this.active_button !== this.buttons.link &&
        this.active_button !== this.buttons.constraint) {
      this.add_x = this.mouse_x;
      this.add_y = this.mouse_y;
      const ot = this.active_button.id.split('-')[0];
      if(!this.stayActive) this.resetActiveButton();
      if(ot === 'note') {
        setTimeout(() => {
              const md = UI.modals.note;
              md.element('action').innerHTML = 'Add';
              md.element('C').value = '';
              md.element('text').value = '';
              md.show('text');
            });
      } else {
        // Align position to the grid.
        this.add_x = MODEL.aligned(this.add_x);
        this.add_y = MODEL.aligned(this.add_y);
        if(ot === 'process') {
          setTimeout(() => {
                const md = UI.modals['add-process'];
                md.element('name').value = '';
                md.element('actor').value = '';
                md.show('name');
              });
        } else if(ot === 'product') {
          setTimeout(() => {
                const md = UI.modals['add-product'];
                md.element('name').value = '';
                md.element('unit').value = MODEL.default_unit;
                UI.setBox('add-product-data', false);
                md.show('name');
              });            
        } else if(ot === 'cluster') {
          setTimeout(() => {
                const md = UI.modals.cluster;
                md.element('name').value = '';
                md.element('actor').value = '';
                md.show('name');
              });            
        }
      }
      return;
    }
  
    // ALT key pressed => open properties dialog if cursor hovers over
    // some element.
    if(e.altKey) {
      // NOTE: First check constraints -- see mouseMove() for motivation.
      if(this.on_constraint) {
        this.showConstraintPropertiesDialog(this.on_constraint);
      } else if(this.on_node) {
        if(this.on_node instanceof Process) {
          this.showProcessPropertiesDialog(this.on_node);
        } else if(e.shiftKey) {
          // Shift-Alt on product is like Shift-Double-click.
          this.showReplaceProductDialog(this.on_node);
        } else { 
          this.showProductPropertiesDialog(this.on_node);
        }
      } else if(this.on_note) {
        this.showNotePropertiesDialog(this.on_note);
      } else if(this.on_cluster) {
        this.showClusterPropertiesDialog(this.on_cluster);
      } else if(this.on_link) {
        if(this.on_link.on_arrow_head && this.on_link.canFlip) {
          MODEL.flipLink(this.on_link);
        } else {
          this.showLinkPropertiesDialog(this.on_link);
        }
      }
    // NOTE: First check constraints -- see mouseMove() for motivation.
    } else if(this.on_constraint) {
      MODEL.select(this.on_constraint);
    } else if(this.on_note) {
      this.dragged_node = this.on_note;
      this.move_dx = this.mouse_x - this.on_note.x;
      this.move_dy = this.mouse_y - this.on_note.y;
      MODEL.select(this.on_note);
      UNDO_STACK.push('move', this.dragged_node, true);
    // Cursor on node => add link or constraint, or start moving.
    } else if(this.on_node) {
      if(this.active_button === this.buttons.link) {
        this.linking_node = this.on_node;
        // NOTE: Return without updating buttons.
        return;
      } else if(this.active_button === this.buttons.constraint) {
        // Allow constraints only on nodes having upper bounds defined.
        if(this.on_node.upper_bound.defined) {
          this.constraining_node = this.on_node;
          // NOTE: Here, too, return without updating buttons.
          return;
        }
      } else {
        this.dragged_node = this.on_node;
        // NOTE: Keep track of relative movement of the dragged node.
        this.move_dx = this.mouse_x - this.on_node.x;
        this.move_dy = this.mouse_y - this.on_node.y;
        MODEL.select(this.on_node);
        // Pass dragged node for UNDO.
        UNDO_STACK.push('move', this.dragged_node, true);
      }
    } else if(this.on_cluster) {
      this.dragged_node = this.on_cluster;
      this.move_dx = this.mouse_x - this.on_cluster.x;
      this.move_dy = this.mouse_y - this.on_cluster.y;
      MODEL.select(this.on_cluster);
      UNDO_STACK.push('move', this.dragged_node, true);
    } else if(this.on_link) {
      MODEL.select(this.on_link);
    } else {
      this.start_sel_x = this.mouse_x;
      this.start_sel_y = this.mouse_y;
    }
    this.updateButtons();
  }

  mouseUp(e) {
    // Responds to mouseup event.
    const cp = this.paper.cursorPosition(e.pageX, e.pageY);
    // Keep track of the cumulative relative movement since the last
    // mousedown event.
    this.net_move_x += cp[0] - this.mouse_x;
    this.net_move_y += cp[1] - this.mouse_y;
    this.mouse_up_x = cp[0];
    this.mouse_up_y = cp[1];
    let double_clicked = null;
    if(this.doubleClicked('up')) {
      double_clicked = this.dragged_node || this.on_link || this.on_constraint;
    }
    // First check whether user is selecting a rectangle.
    if(this.start_sel_x >= 0 && this.start_sel_y >= 0) {
      // Clear previous selection unless user is adding to it (by still
      // holding SHIFT button down).
      if(!e.shiftKey) MODEL.clearSelection();
      // Compute defining points of rectangle (top left and bottom right).
      const rect = {
          left: Math.min(this.start_sel_x, this.mouse_up_x),
          top: Math.min(this.start_sel_y, this.mouse_up_y),
          right: Math.max(this.start_sel_x, this.mouse_up_x),
          bottom: Math.max(this.start_sel_y, this.mouse_up_y)
        };
      // If rectangle has size greater than 2x2 pixels, select all elements
      // having their center inside the selection rectangle.
      if(rect.right - rect.left > 2 && rect.bottom - rect.top > 2) {
        MODEL.selectList(MODEL.focal_cluster.entitiesInRectangle(rect));
        this.paper.drawSelection(MODEL);
      }
      this.start_sel_x = -1;
      this.start_sel_y = -1;
      this.paper.hideDragRect();
    // Then check whether user is drawing a flow link (by dragging its
    // endpoint).
    } else if(this.linking_node) {
      // If so, check whether the cursor is over a node of the appropriate type.
      if(this.on_node && MODEL.canLink(this.linking_node, this.on_node)) {
        const l = MODEL.addLink(this.linking_node, this.on_node);
        UNDO_STACK.push('add', l);
        MODEL.select(l);
        this.paper.drawModel(MODEL);
      }
      this.linking_node = null;
      if(!this.stayActive) this.resetActiveButton();
      this.paper.hideDragLine();
  
    // Then check whether user is drawing a constraint link (again: by
    // dragging its endpoint).
    } else if(this.constraining_node) {
      if(this.on_node && this.constraining_node.canConstrain(this.on_node)) {
        // Display constraint editor.
        CONSTRAINT_EDITOR.from_name.innerText = this.constraining_node.displayName;
        CONSTRAINT_EDITOR.to_name.innerText = this.on_node.displayName;
        CONSTRAINT_EDITOR.showDialog();
      }
      this.linking_node = null;
      this.constraining_node = null;
      if(!this.stayActive) this.resetActiveButton();
      UI.drawDiagram(MODEL);
  
    // Then check whether the user is moving a node (possibly part of a
    // larger selection).
    } else if(this.dragged_node) {
      // NOTE: When double-clicking with a sensitive mouse, the cursor
      // may move a few pixels, and then this should NOT be considered
      // as an intentional move. Hence, check wether the cursor has been
      // moved *significantly* since the mouseDown event.
      const
          mdx = this.mouse_down_x - this.mouse_x,
          mdy = this.mouse_down_y - this.mouse_y,
          absdx = Math.abs(this.net_move_x),
          absdy = Math.abs(this.net_move_y),
          sigmv = (MODEL.align_to_grid ? MODEL.grid_pixels / 4 : 2.5);
      if(double_clicked) {
        // Ignore insignificant move.
        if(absdx < sigmv && absdy < sigmv) {
          // Undo the move and remove the action from the UNDO-stack.
          // NOTE: Do not use the regular `undo` routine as this would
          // make the action redoable.
          MODEL.moveSelection(mdx, mdy);
          UNDO_STACK.pop('move');
          UNDO_STACK.ignoreLastChange();
        }
        // Double-clicking opens properties dialog, except for clusters;
        // then "drill down", i.e., make the double-clicked cluster focal.
        if(this.dragged_node instanceof Cluster) {
          // NOTE: Bottom & right cluster edges remain sensitive!
          if(this.on_cluster_edge) {
            this.showClusterPropertiesDialog(this.dragged_node);
          } else {
            this.makeFocalCluster(this.dragged_node);
          }
        } else if(this.dragged_node instanceof Product) {
          if(e.shiftKey) {
            // Shift-double-clicking on a *product* prompts for "remapping"
            // the product position to another product (and potentially
            // deleting the original one if it has no more occurrences).
            this.showReplaceProductDialog(this.dragged_node);
          } else {
            this.showProductPropertiesDialog(this.dragged_node);
          }
        } else if(this.dragged_node instanceof Process) {
          this.showProcessPropertiesDialog(this.dragged_node);
        } else {
          this.showNotePropertiesDialog(this.dragged_node);
        }
      } else {
        // Move the selection, even if the movement is very small, because the
        // final movement since last mouse event may make the *cumulative*
        // movement since the last mouseDown significant.
        MODEL.moveSelection(
            this.mouse_up_x - this.mouse_x, this.mouse_up_y - this.mouse_y);
        if(this.net_move_x < 0.5 && this.net_move_y < 0.5) {
          // No effective move of the selection => remove the UNDO.
          UNDO_STACK.pop('move');
          UNDO_STACK.ignoreLastChange();
        }
        // Set cursor to pointer, as it should be on some node while dragging.
        this.paper.container.style.cursor = 'pointer';
        // NOTE: Cursor will always be over the selected cluster (while dragging).
        if(this.on_cluster && !this.on_cluster.selected) {
          if(!(this.dragged_node instanceof Note && MODEL.selection.length < 2)) {
            UNDO_STACK.push('drop', this.on_cluster);
            MODEL.dropSelectionIntoCluster(this.on_cluster);
            // Redraw cluster to erase its orange "target corona".
            UI.paper.drawCluster(this.on_cluster);
            this.on_node = null;
            this.on_note = null;
            this.target_cluster = null;
          }
        }
        // Only now align to grid.
        MODEL.alignToGrid();
      }
      this.dragged_node = null;
  
    // Finally, check whether the user is clicking on a link.
    } else if(this.on_link && double_clicked) {
      this.showLinkPropertiesDialog(this.on_link);
    } else if(this.on_constraint && double_clicked) {
      this.showConstraintPropertiesDialog(this.on_constraint);
    }
    
    // In all cases, perform some clean-up actions:
    // (1) After a double-click, the selection may still contain multiple
    //     entities. If so, clear it, select only the double-clicked entity
    //     and redraw the diagram.
    if(double_clicked && MODEL.selection.length > 1) {
      MODEL.clearSelection();
      MODEL.select(double_clicked);
      UI.drawDiagram(MODEL);
    }
    // (2) Reset "selecting with rectangle" (just to be sure).
    this.start_sel_x = -1;
    this.start_sel_y = -1;
    // (3) Update the UI button states.
    this.updateButtons();
  }
  
  dragOver(e) {
    // Accept products that are dragged from the Finder and do not have
    // a placeholder in the focal cluster.
    this.updateCursorPosition(e);
    const p = MODEL.products[e.dataTransfer.getData('text')];
    if(p && MODEL.focal_cluster.indexOfProduct(p) < 0) e.preventDefault();
  }

  drop(e) {
    // Adds a product that is dragged from the Finder to the focal cluster
    // at the cursor position if it does not have a placeholder yet.
    const p = MODEL.products[e.dataTransfer.getData('text')];
    if(p && MODEL.focal_cluster.indexOfProduct(p) < 0) {
      e.preventDefault();
      MODEL.focal_cluster.addProductPosition(p, this.mouse_x, this.mouse_y);
      UNDO_STACK.push('add', p);
      this.selectNode(p);
      this.drawDiagram(MODEL);
    }
    // NOTE: Update afterwards, as the modeler may target a precise (X, Y).
    this.updateCursorPosition(e);
  }

  //
  // Handler for keyboard events
  //
  
  get topModal() {
    // Return the topmost visible modal dialog, or NULL if none are showing.
    const modals = document.getElementsByClassName('modal');
    let maxz = 0,
        topmod = null;
    for(const m of modals) {
      const
          cs = window.getComputedStyle(m),
          z = parseInt(cs.zIndex);
      if(cs.display !== 'none' && z > maxz) {
        topmod = m;
        maxz = z;
      }
    }
    return topmod;
  }
  
  get topManager() {
    // Return the manager of the top draggable dialog, or NULL if none.
    const last = this.dr_dialog_order.length - 1;
    if(last >= 0) return window[this.dr_dialog_order[last].dataset.manager];
    return null;
  }
  
  checkModals(e) {
    // Respond to Escape, Enter and shortcut keys.
    const
        ttype = e.target.type,
        ttag = e.target.tagName,
        code = e.code,
        alt = e.altKey,
        ctrl = e.ctrlKey || e.metaKey,
        topmod = this.topModal;
    // Modal dialogs: hide on ESC and move to next input on ENTER.
    // NOTE: Consider only the top modal (if any is showing).
    if(code === 'Escape') {
      e.stopImmediatePropagation();
      if(topmod) topmod.style.display = 'none';
    } else if(code === 'Enter' && ttype !== 'textarea') {
      e.preventDefault();
      if(topmod) {
        const inp = Array.from(topmod.getElementsByTagName('input'));
        let i = inp.indexOf(e.target) + 1;
        while(i < inp.length && inp[i].disabled) i++;
        if(i < inp.length) {
          inp[i].focus();
        } else if(topmod.id === 'browser-modal') {
          FILE_MANAGER.enterKey();
        } else if(['datasetgroup-modal', 'constraint-modal', 'boundline-data-modal',
            'xp-clusters-modal'].indexOf(topmod.id) >= 0) {
          // NOTE: These modals must NOT close when Enter is pressed, but only
          // de-focus the input field.
          e.target.blur();
        } else {
          const btns = topmod.getElementsByClassName('ok-btn');
          if(btns.length > 0) btns[0].dispatchEvent(new Event('click'));
        }
        if(topmod.id === 'datasetgroup-modal') UI.modals.datasetgroup.enterKey();
      } else {
        const mgr = this.topManager;
        if(mgr && 'enterKey' in mgr) mgr.enterKey();
      }
    } else if(code === 'Backspace' &&
        ttype !== 'text' && ttype !== 'password' && ttype !== 'textarea') {
      // Prevent backspace to be interpreted (by FireFox) as "go back in browser".
      e.preventDefault();
    } else if(ttag === 'BODY') {
      // Dataset group modal and Constraint Editor accept arrow keys.
      if(topmod) {
        if(topmod.id === 'constraint-modal' && code.startsWith('Arrow')) {
          e.preventDefault();
          CONSTRAINT_EDITOR.arrowKey(e);
          return;
        }
        if(topmod.id === 'datasetgroup-modal' &&
            (code === 'ArrowUp' || code === 'ArrowDown')) {
          e.preventDefault();
          // NOTE: Pass key direction as -1 for UP and +1 for DOWN.
          UI.modals.datasetgroup.upDownKey(e.keyCode - 39);
          return;
        }
      }
      // Lists in draggable dialogs respond to up and down arrow keys.
      if(code === 'ArrowUp' || code === 'ArrowDown') {
        e.preventDefault();
        if(topmod) {
          if(topmod.id === 'browser-modal') {
            FILE_MANAGER.upDownKey(e.keyCode - 39);
          }
          // For other modals, capture the event to prevent underlying
          // draggable dialogs to respond.
        } else {
          const mgr = this.topManager;
          // NOTE: Pass key direction as -1 for UP and +1 for DOWN.
          if(mgr && 'upDownKey' in mgr) mgr.upDownKey(e.keyCode - 39);
        }
      }
      // End, Home, and left and right arrow keys.
      if(code === 'End') {
        e.preventDefault();
        MODEL.t = MODEL.end_period - MODEL.start_period + 1;
        UI.updateTimeStep();
        UI.drawDiagram(MODEL);
      } else if(code === 'Home') {
        e.preventDefault();
        MODEL.t = 1;
        UI.updateTimeStep();
        UI.drawDiagram(MODEL);
      } else if(code === 'ArrowLeft') {
        e.preventDefault();
        this.stepBack(e);
      } else if(code === 'ArrowRight') {
        e.preventDefault();
        this.stepForward(e);
      } else if(ctrl && code === 'KeyL') {
        // Ctrl-L means: load model. Treat separately because Alt-key
        // alters the way in which the model file is loaded.
        e.preventDefault();
        FILE_MANAGER.loadModel(alt);
      } else if(ctrl && code === 'KeyS') {
        // Ctrl-S means: save model. Treat separately because Shift-key
        // and Alt-key alter the way in which the model file is saved.
        e.preventDefault();
        FILE_MANAGER.saveModel(e);
      } else if(alt && code === 'KeyR') {
        // Alt-R means: run to diagnose infeasible/unbounded problem.
        VM.solveModel(true);
      } else if(alt && ['KeyA', 'KeyC', 'KeyM', 'KeyP'].indexOf(code) >= 0) {
        // Special shortcut keys for "actors", "clone selection",
        // "model settings" and "replace product".
        const be = new Event('click');
        if(code === 'KeyA') {
          this.buttons.actors.dispatchEvent(be);
        } else if(code === 'KeyC') {
          this.buttons.clone.dispatchEvent(be);
        } else if(code === 'KeyM') {
          this.buttons.settings.dispatchEvent(be);
        } else if(code === 'KeyP') {
          this.buttons.replace.dispatchEvent(be);
        }
      } else if((topmod && topmod.id === 'browser-modal') ||
          this.topManager === DATASET_MANAGER) {
        // File browser responds to alphanumeric key press.
        let alpha = '';
        if('0123456789-_()'.indexOf(e.key) >= 0) {
          alpha = e.key;
        } else if(code >= 'KeyA' && code <= 'KeyZ') {
          alpha = code.substring(3).toLowerCase();
        }
        if(alpha) {
          e.preventDefault();
          if(topmod) {
            FILE_MANAGER.alphanumericKey(alpha);
          } else {
            DATASET_MANAGER.alphanumericKey(alpha);
          }
        }
      } else if(!e.shiftKey && !alt && !topmod) {
        // Interpret special keys as shortcuts unless a modal dialog is open.
        if(code === 'Delete') {
          // DEL button => delete selection.
          e.preventDefault();
          if(!this.hidden('constraint-modal')) {
            CONSTRAINT_EDITOR.deleteBoundLine();
          } else if(!this.hidden('variable-modal')) {
            CHART_MANAGER.deleteVariable();
          } else if(!topmod) {
            // Do not delete entity from model diagram when some modal
            // is showing. 
            this.buttons['delete'].dispatchEvent(new Event('click'));
          }
        } else if (code === 'Period' && ctrl) {
          // Ctrl-. (dot) moves entire diagram to upper-left corner.
          e.preventDefault();
          this.paper.fitToSize();
          MODEL.alignToGrid();
        } else if(code === 'KeyA' && ctrl) {
          // Select *all* visible entities in focal cluster (no rectangle).
          MODEL.selectList(MODEL.focal_cluster.entitiesInRectangle());
          this.paper.drawSelection(MODEL);
          this.updateButtons();
        } else if (code > 'KeyA' && code <= 'KeyZ' && ctrl) {
          // ALWAYS prevent web browser to do respond to Ctrl-letter commands.
          // NOTE: This cannot prevent a new tab from opening on Ctrl-T.
          e.preventDefault();
          let shortcut = code.substring(3);
          if(shortcut === 'Z' && e.shiftKey) {
            // Interpret Shift-Ctrl-Z as Ctrl-Y (redo last undone operation).
            shortcut = 'Y';
          }
          if(this.shortcuts.hasOwnProperty(shortcut)) {
            const btn = this.buttons[this.shortcuts[shortcut]];
            if(!this.hidden(btn.id) && !btn.classList.contains('disab')) {
              btn.dispatchEvent(new Event('click'));
            }
          }
        }
      }
    }
  }

  //
  // Handlers for checkbox events.
  //
  // Checkboxes may have different colors, which should be preserved
  // while (un)checking. The first item in the classlist of a checkbox
  // element will always be "box", the second item may just be "checked"
  // or "clear", but also something like "checked-same-not-changed".
  // Hence the state change operations should only affect the first part.

  toggleBox(event) {
    // Change "checked" to "clear" or vice versa.
    const el = event.target;
    if(!el.classList.contains('disab')) {
      const
          state = el.classList.item(1),
          list = state.split('-'),
          change = {clear: 'checked', checked: 'clear'};
      list[0] = change[list[0]];
      el.classList.replace(state, list.join('-'));
    }
  }
  
  setBox(id, checked) {
    // Set the box identified by `id` to the state indicated by the
    // Boolean parameter `checked`.
    const
        box = document.getElementById(id),
        state = box.classList.item(1),
        list = state.split('-');
    list[0] = (checked ? 'checked' : 'clear');
    box.classList.replace(state, list.join('-'));
  }
  
  boxChecked(id) {
    // Return TRUE if the box identified by `id` is checked.
    return document.getElementById(id).classList.item(1).startsWith('checked');
  }

  //
  // Handlers for "equal bounds" togglebox events
  //
  // Like checkboxes, an "equal bounds" togglebox may have different colors,
  // which should be preserved while toggling. See explanation above.

  setEqualBounds(type, equal) {
     // Set "equal bounds" button.
     // `type` should be 'process' or 'product', `equal` TRUE or FALSE.
    const
        el = document.getElementById(type + '-UB-equal'),
        cl = el.classList,
        token = cl.item(1);
    cl.replace(token, equal ? 'eq' : 'ne');
    this.updateEqualBounds(type);
  }
  
  updateEqualBounds(type) {
    // Enable/disable UB input fields, depending on button status
    // NOTE: `type` should be 'process' or 'product'
    const
        prefix = type + '-UB',
        inp = document.getElementById(prefix),
        eql = document.getElementById(prefix + '-equal'),
        edx = document.getElementById(prefix + '-x'),
        lbl = document.getElementById(prefix + '-lbl');
    if(eql.classList.contains('ne')) {
      inp.disabled = false;
      edx.classList.remove('disab');
      edx.classList.add('enab');
      lbl.style.color = 'black';
      lbl.style.textShadow = 'none';
    } else {
      inp.disabled = true;
      edx.classList.remove('enab');
      edx.classList.add('disab');
      lbl.style.color = 'gray';
      lbl.style.textShadow = '1px 1px white';
    }
  }
  
  toggleEqualBounds(event) {
    // Toggle the "equal bounds" button state.
    // NOTE: `type` should be 'process' or 'product'
    const
        el = event.target,
        type = el.id.split('-')[0];
    this.setEqualBounds(type, el.classList.contains('ne'));
  }
  
  getEqualBounds(id) {
    return document.getElementById(id).classList.contains('eq');
  }
  
  //
  // Handlers for integer level events
  //

  toggleIntegerLevel(event) {
    const el = event.target;
    if(el.classList.contains('intbtn')) {
      el.classList.remove('intbtn');
      el.classList.add('contbtn');
    } else {
      el.classList.remove('contbtn');
      el.classList.add('intbtn');
    }
  }
  
  setIntegerLevel(id, set) {
    const box = document.getElementById(id);
    if(set) {
      box.classList.remove('contbtn');
      box.classList.add('intbtn');
    } else {
      box.classList.remove('intbtn');
      box.classList.add('contbtn');
    }
  }
  
  hasIntegerLevel(id) {
    return document.getElementById(id).classList.contains('intbtn');
  }

  //
  // Handlers for import/export togglebox events
  // 

  toggleImportExportBox(id) {
    const
        io = document.getElementById(id + '-io'),
        bi = document.getElementById(id + '-import'),
        be = document.getElementById(id + '-export');
    if(window.getComputedStyle(bi).display !== 'none') {
      bi.style.display = 'none';
      be.style.display = 'block';
      io.style.color = '#0000b0';
    } else if(window.getComputedStyle(be).display !== 'none') {
      be.style.display = 'none';
      io.style.color = 'silver';
    } else {
      bi.style.display = 'block';
      io.style.color = '#b00000';
    }  
  }
  
  getImportExportBox(id) {
    if(window.getComputedStyle(
        document.getElementById(id + '-import')).display !== 'none') return 1;
    if(window.getComputedStyle(
        document.getElementById(id + '-export')).display !== 'none') return 2;
    return 0;  
  }
  
  setImportExportBox(id, s) {
    const
        io = document.getElementById(id + '-io'),
        bi = document.getElementById(id + '-import'),
        be = document.getElementById(id + '-export');
    bi.style.display = 'none';
    be.style.display = 'none';
    if(s === 1) {
      bi.style.display = 'block';
      io.style.color = '#b00000';
    } else if(s === 2) {
      be.style.display = 'block';
      io.style.color = '#0000b0';
    } else {
      io.style.color = 'silver';
    }  
  }

  //
  // Input field validation
  // 

  validNames(nn, an='') {
    // Check whether names meet conventions. If not, warn user.
    if(!UI.validName(nn) || nn.indexOf(UI.BLACK_BOX) >= 0) {
      this.warningInvalidName(nn);
      return false;
    }
    if(an === '' || an === UI.NO_ACTOR) return true;
    if(!UI.validName(an)) {
      UI.warn(`Invalid actor name "${an}"`);
      return false;
    }
    return true;
  }
  
  validNumericInput(id, name) {
    // Returns number if input field with identifier `id` contains a number;
    // otherwise returns FALSE; if error, focuses on the field and shows
    // the error while specifying the name of the field
    // NOTE: accept both . and , as decimal point
    const
        inp = document.getElementById(id),
        txt = inp.value.trim().replace(',', '.');
    // NOTE: for some fields, empty strings denote default values, typically 0
    if(txt === '') {
      if(['initial level', 'delay', 'share of cost', 'Delta'].indexOf(name) >= 0) {
        return 0;
      }
    }
    const n = parseFloat(txt);
    // NOTE: any valid number ends with a digit (e.g., 100, 100.0, 1E+2),
    // but parseFloat is more tolerant; however, Linny-R should not accept
    // input such as "100x" nor even "100." 
    if(isNaN(n) || '0123456789'.indexOf(txt[txt.length - 1]) < 0) {
      this.warn(`Invalid number "${txt}" for ${name}`);
      inp.focus();
      return false;
    }
    return n;
  }

  updateExpressionInput(id, name, x) {
    // Updates expression object `x` if input field identified by `id`
    // contains a well-formed expression. If error, focuses on the field
    // and shows the error while specifying the name of the field.
    const
        inp = document.getElementById(id),
        xp = new ExpressionParser(inp.value.trim(), x.object, x.attribute);
    if(xp.error) {
      inp.focus();
      this.warn(`Invalid expression for ${name}: ${xp.error}`);
      return false;
    } else if(xp.is_level_based && name !== 'note color') {
      this.warn(`Expression for ${name} contains a solution-dependent variable`);
    }
    x.update(xp);
    // NOTE: overrule `is_static` to make that IL is always evaluated for t=1
    if(name === 'initial level') x.is_static = true;
    return true;
  }
  
  updateScaleUnitList() {
    // Update the HTML datalist element to reflect all scale units.
    const
        ul = [],
        keys = Object.keys(MODEL.scale_units).sort(ciCompare);
    for(const k of keys) {
      ul.push(`<option value="${MODEL.scale_units[k].name}">`);
    }
    document.getElementById('units-data').innerHTML = ul.join('');
  }
  
  //
  // Navigation in the cluster hierarchy
  //
  
  showParentCluster() {
    if(MODEL.focal_cluster.cluster) {
      this.makeFocalCluster(MODEL.focal_cluster.cluster);
      this.updateButtons();
    }
  }
  
  moveSelectionToParentCluster() {
    if(MODEL.focal_cluster.cluster) {
      UNDO_STACK.push('lift', MODEL.focal_cluster.cluster);
      MODEL.focal_cluster.clearAllProcesses();
      MODEL.dropSelectionIntoCluster(MODEL.focal_cluster.cluster);
      this.updateButtons();
    }
  }

  //
  // Moving backwards and forwards in time
  //
  
  stepBack(e) {
    if(e.target.classList.contains('disab')) return;
    if(MODEL.simulationTimeStep > MODEL.start_period) {
      const dt = (e.shiftKey ? 10 : 1) * (e.ctrlKey || e.metaKey ? 100 : 1);
      MODEL.t = Math.max(1, MODEL.t - dt);
      UI.updateTimeStep();
      UI.drawDiagram(MODEL);
      if(FINDER.visible && FINDER.tabular_view) {
        FINDER.updateTitle();
        FINDER.updateTabularView();
      }
    }
  }
  
  stepForward(e) {
    if(e.target.classList.contains('disab')) return;
    if(MODEL.simulationTimeStep < MODEL.end_period) {
      const dt = (e.shiftKey ? 10 : 1) * (e.ctrlKey || e.metaKey ? 100 : 1);
      MODEL.t = Math.min(MODEL.end_period - MODEL.start_period + 1, MODEL.t + dt);
      UI.updateTimeStep();
      UI.drawDiagram(MODEL);
      if(FINDER.visible && FINDER.tabular_view) {
        FINDER.updateTitle();
        FINDER.updateTabularView();
      }
    }
  }
  
  //
  // Special features that may not work in all browsers
  //
  
  copyStringToClipboard(string) {
    // Copy string to clipboard and notifies user of #lines copied.
    if(navigator.clipboard) {
      const msg = pluralS(string.split('\n').length, 'line') +
          ' copied to clipboard';
      navigator.clipboard.writeText(string)
          .then(() => UI.setMessage(msg, 'notification'))
          .catch(() => UI.setMessage('Failed to copy to clipboard', 'warning'));
    } else {
      UI.setMessage('Your browser does not support copying to clipboard',
          'warning');
    }
  }
  
  copyHtmlToClipboard(html, plain=false) {
    // Copy HTML (as such or as plain text) to clipboard and notify user.
    if(navigator.clipboard) {
      const
          item = (plain ? {'text/plain': html} : {'text/html': html}),
          data = [new ClipboardItem(item)],
          msg = 'HTML copied to clipboard' + (plain ? ' as plain text' : '');
      navigator.clipboard.write(data)
          .then(() => UI.setMessage(msg, 'notification'))
          .catch((err) => UI.setMessage('Failed to copy HTML to clipboard',
              'warning', err));
    } else {
      UI.setMessage('Your browser does not support copying HTML to clipboard',
          'warning');
    }
  }
  
  logHeapSize(msg='') {
    // Log MB's of used heap memory to console (to detect memory leaks).
    // NOTE: This feature is supported only by Chrome.
    if(msg) msg += ' -- ';
    if(performance.memory !== undefined) {
      console.log(msg + 'Allocated memory: ' + Math.round(
          performance.memory.usedJSHeapSize/1048576.0).toFixed(1) + ' MB');
    }
  }

  //
  // Informing the modeler via the status line
  //
  
  clearStatusLine() {
    // Clear message on the status line.
    this.info_line.innerHTML = '';
    UI.info_line.classList.remove(...UI.info_line.classList);
  }

  setMessage(msg, type=null, cause=null) {
    // Display `msg` on infoline unless no type (= plain text) and some
    // info, warning or error message is already displayed.
    super.setMessage(msg, type, cause);
    const types = ['notification', 'warning', 'error'];
    let d = new Date(),
        t = d.getTime(),
        dt = t - this.time_last_message, // Time since display
        rt = this.message_display_time - dt, // Time remaining
        mti = types.indexOf(type),
        lmti = types.indexOf(this.last_message_type);
    if(type) {
      // Only log "real" messages.
      const
          now = [d.getHours(), d.getMinutes().toString().padStart(2, '0'),
              d.getSeconds().toString().padStart(2, '0')].join(':'),
          im = {time: now, text: msg, status: type};
      DOCUMENTATION_MANAGER.addMessage(im);
      // When receiver is active, add message to its log.
      if(RECEIVER.active) RECEIVER.log(`[${now}] ${msg}`);
    }
    if(mti === 1 && lmti === 2 && rt > 0) {
      // Queue warnings if an error message is still being displayed.
          setTimeout(() => {
          UI.info_line.innerHTML = msg;
          UI.info_line.classList.remove(...UI.info_line.classList);
          if(type) UI.info_line.classList.add(type);
          UI.updateIssuePanel();
        }, rt);      
    } else if(lmti < 0 || mti > lmti || rt <= 0) {
      // Display text only if previous message has "timed out" or was less
      // urgent than this one.
      const override = mti === 2 && lmti === 1 && rt > 0;
      this.time_last_message = t;
      this.last_message_type = type;
      if(type) SOUNDS[type].play().catch(() => {
          console.log('NOTICE: Sounds will only play after first user action');
        });
      if(override && !this.old_info_line) {
        // Set time-out to restore overridden warning.
        this.old_info_line = {msg: this.info_line.innerHTML, status: types[lmti]};
        setTimeout(() => {
            UI.info_line.innerHTML = UI.old_info_line.msg;
            UI.info_line.classList.add(UI.old_info_line.status);
            UI.old_info_line = null;
            UI.updateIssuePanel();
          }, this.message_display_time);
      }
      UI.info_line.classList.remove(...UI.info_line.classList);
      if(type) UI.info_line.classList.add(type);
      UI.info_line.innerHTML = msg;
    }
  }
  
  // Visual feedback for time-consuming actions
  waitingCursor() {
    document.body.className = 'waiting';
  }

  normalCursor() {
    document.body.className = '';
  }

  setProgressNeedle(fraction, color='#500080') {
    // Shows a thin purple line just above the status line to indicate progress
    const el = document.getElementById('set-up-progress-bar');
    el.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + '%';
    el.style.backgroundColor = color;
  }
  
  hideStayOnTopDialogs() {
    // Hide and reset all stay-on-top dialogs (even when not showing).
    // NOTE: This routine is called when a new model is loaded.
    DATASET_MANAGER.dialog.style.display = 'none';
    this.buttons.dataset.classList.remove('stay-activ');
    DATASET_MANAGER.reset();
    EQUATION_MANAGER.dialog.style.display = 'none';
    this.buttons.equation.classList.remove('stay-activ');
    EQUATION_MANAGER.reset();
    CHART_MANAGER.dialog.style.display = 'none';
    this.buttons.chart.classList.remove('stay-activ');
    CHART_MANAGER.reset();
    SENSITIVITY_ANALYSIS.dialog.style.display = 'none';
    this.buttons.sensitivity.classList.remove('stay-activ');
    SENSITIVITY_ANALYSIS.reset();
    EXPERIMENT_MANAGER.dialog.style.display = 'none';
    this.buttons.experiment.classList.remove('stay-activ');
    EXPERIMENT_MANAGER.reset();
    DOCUMENTATION_MANAGER.dialog.style.display = 'none';
    this.buttons.documentation.classList.remove('stay-activ');
    DOCUMENTATION_MANAGER.reset();
    FINDER.dialog.style.display = 'none';
    this.buttons.finder.classList.remove('stay-activ');
    FINDER.reset();
    MONITOR.dialog.style.display = 'none';
    this.buttons.monitor.classList.remove('stay-activ');
    MONITOR.reset();
    // No more visible dialogs, so clear their z-index ordering array
    this.dr_dialog_order.length = 0;
  }

  //
  // Operations that affect the current Linny-R model
  //
  
  promptForNewModel() {
    // Prompt modeler to confirm discarding unsaved changes unless this
    // is the follow-up call.
    let md = FILE_MANAGER.confirm_load_modal;
    if(!md.follow_up && UNDO_STACK.last_change > MODEL.last_modified) {
      md.follow_up = () => UI.promptForNewModel();
      md.show();
    } else {
      // Reset the confirmation modal (just to make sure).
      md.follow_up = null;
      // Prompt for model name and author name.
      this.hideStayOnTopDialogs();
      // Clear name, but set author field to default author or author of
      // the current model.
      md = this.modals.model;
      md.element('name').value = '';
      md.element('author').value = CONFIGURATION.user_name || MODEL.author;
      md.show('name');
    }
  }

  createNewModel() {
    const md = this.modals.model;
    // Create a brand new model with (optionally) specified name and author
    MODEL = new LinnyRModel(
        md.element('name').value.trim(), md.element('author').value.trim());
    MODEL.addPreconfiguredScaleUnits();
    md.hide();
    this.updateTimeStep(MODEL.simulationTimeStep);
    this.drawDiagram(MODEL);
    UNDO_STACK.clear();
    VM.reset();
    this.updateButtons();
    FILE_MANAGER.setAutoSaveInterval();
  }
  
  addNode(type) {
    let n = null,
        nn,
        an,
        md;
    if(type === 'note') {
      md = this.modals.note;
      n = this.dbl_clicked_node;
      const
          editing = md.element('action').innerHTML === 'Edit',
          cx = new Expression(editing ? n : null, '', 'C');
      if(this.updateExpressionInput('note-C', 'note color', cx)) {
        if(editing) {
          n = this.dbl_clicked_node;
          this.dbl_clicked_node = null;
          UNDO_STACK.push('modify', n);
          n.contents = md.element('text').value;
          n.color.owner = n;
          n.color.text = md.element('C').value;
          n.color.compile();
          n.parsed = false;
          n.resize();
        } else {
          n = MODEL.addNote();
          n.x = this.add_x;
          n.y = this.add_y;
          n.contents = md.element('text').value;
          n.color.text = md.element('C').value;
          n.parsed = false;
          n.resize();
          n.color.compile();
          UNDO_STACK.push('add', n); 
        }
      }
    } else if(type === 'cluster') {
      // NOTE: Originally, the cluster dialog had no fields other than
      // `name` and `actor`, hence no separate dialog for adding and
      // editing. Now that group editing is possible, a separate method
      // updateClusterProperties is called when the `action` element is
      // set to "Edit".
      md = this.modals.cluster;
      nn = md.element('name').value;
      an = md.element('actor').value;
      if(!this.validNames(nn, an)) {
        UNDO_STACK.pop();
        UNDO_STACK.ignoreLastChange();
        return;
      }
      if(md.element('action').innerHTML === 'Edit') {
        this.edited_object = this.dbl_clicked_node;
        this.dbl_clicked_node = null;
        this.updateClusterProperties();
      } else {
        // New cluster should be added.
        n = MODEL.addCluster(nn, an);
        if(n) {
          // If X and Y are set, cluster exists => ask whether to move it.
          if(n.x !== 0 || n.y !== 0) {
            if(n.cluster !== MODEL.focal_cluster) {
              this.confirmToMoveNode(n);
            } else {
              this.warningEntityExists(n);
            }
          } else {
            n.x = this.add_x;
            n.y = this.add_y;
            UNDO_STACK.push('add', n);
          }
        }
      }
    } else if(type === 'process' || type === 'product') {
/* NOT CLEAR WHAT THIS CODE DOES, SO DISABLE IT
      if(this.dbl_clicked_node) {
        n = this.dbl_clicked_node;
        md = this.modals['add-' + type];
        this.dbl_clicked_node = null;
      } else {
*/
      if(true) {                      // added line
        this.dbl_clicked_node = null; // added line
        if(type === 'process') {
          md = this.modals['add-process'];
          nn = md.element('name').value;
          an = md.element('actor').value;
          if(!this.validNames(nn, an)) {
            UNDO_STACK.pop();
            UNDO_STACK.ignoreLastChange();
            return false;
          }
          n = MODEL.addProcess(nn, an);
        } else {
          md = this.modals['add-product'];
          nn = md.element('name').value;
          // NOTE: As of version 1.5, actor cash IN, chash OUT and cash FLOW
          // can be added as special data products. These products are indicated
          // by a leading dollar sign or euro sign, followed by an acceptable
          // flow indicator (I, O, F, CI, CO, CF, IN, OUT, FLOW), or none to
          // indicate the default "cash flow", followed by the name of an
          // actor already defined in the model.
          if(nn.startsWith('$') || nn.startsWith('\u20AC')) {
            const
                valid = {
                  'i': 'IN',
                  'ci': 'IN',
                  'in': 'IN',
                  'o': 'OUT',
                  'co': 'OUT',
                  'out': 'OUT',
                  'f': 'FLOW',
                  'cf': 'FLOW',
                  'flow': 'FLOW'
                },
                parts = nn.substring(1).trim().split(' ');
            let flow = valid[parts[0].toLowerCase()];
            if(flow === undefined) flow = '';
            // If first part indicates flow type, trim it from the name parts.
            if(flow) parts.shift();
            // Now the parts should identify an actor; this may be (no actor).
            const
                aid = this.nameToID(parts.join(' ').trim() || this.NO_ACTOR),
                a = MODEL.actorByID(aid);
            if(a) {
              // If so, and no flow type, assume the default (cash FLOW).
              if(!flow) flow = 'FLOW';
              // Change name to canonical.form, i.e., like "$FLOW actor name"
              nn = `$${flow} ${a.name}`;
            }
          }
          // Test if name is valid. 
          const vn = this.validName(nn);
          if(!vn) {
            UNDO_STACK.pop();
            UNDO_STACK.ignoreLastChange();
            this.warningInvalidName(nn);
            return false;
          }
          // NOTE: Pre-check if product exists.
          const pp = MODEL.objectByName(nn);
          n = MODEL.addProduct(nn);
          if(n) {
            if(pp) {
              // Do not change unit or data type of existing product.
              this.notify(`Added existing product <em>${pp.displayName}</em>`);
            } else if(nn.startsWith('$')) {
              // Actor cash flow products must be data products, and
              // must have the model's currency unit as scale unit.
              n.scale_unit = MODEL.currency_unit;
              n.is_data = true;
            } else {
              n.scale_unit = MODEL.addScaleUnit(md.element('unit').value);
              n.is_data = this.boxChecked('add-product-data');
            }
            MODEL.focal_cluster.addProductPosition(n, this.add_x, this.add_y);
          }
        }
        if(n) {
          // If process, and X and Y are set, it exists; then if not in the
          // focal cluster, ask whether to move it there.
          if(n instanceof Process && (n.x !== 0 || n.y !== 0)) {
            if(n.cluster !== MODEL.focal_cluster) {
              this.confirmToMoveNode(n);
            } else {
              this.warningEntityExists(n);
            }
          } else {
            n.x = this.add_x;
            n.y = this.add_y;
            UNDO_STACK.push('add', n);
          }
        }
      }
    }
    MODEL.inferIgnoredEntities();
    if(n) {
      md.hide();
      // Select the newly added entity.
      // NOTE: If the focal cluster was selected (via the top tool bar),
      // it cannot be selected.
      if(n !== MODEL.focal_cluster) this.selectNode(n);
    }
  }
  
  selectNode(n) {
    // Make `n` the current selection, and redraw so that it appears in red
    if(n) {
      MODEL.select(n);
      UI.drawDiagram(MODEL);
      // Generate a mousemove event for the drawing canvas to update the cursor etc.
      this.cc.dispatchEvent(new Event('mousemove'));
      this.updateButtons();
    }
  }
  
  confirmToMoveNode(n) {
    // Store node `n` in global variable, and open confirm dialog
    const md = this.modals.move;
    this.node_to_move = n;
    md.element('node-type').innerHTML = n.type.toLowerCase();
    md.element('node-name').innerHTML = n.displayName;
    md.element('from-cluster').innerHTML = n.cluster.displayName;
    md.show();  
  }
  
  doNotMoveNode() {
    // Cancel the "move node to focal cluster" operation
    this.node_to_move = null;
    this.modals.move.hide(); 
  }
  
  moveNodeToFocalCluster() {
    // Perform the "move node to focal cluster" operation
    const n = this.node_to_move;
    this.node_to_move = null;
    this.modals.move.hide();
    if(n instanceof Process || n instanceof Cluster) {
      // Keep track of the old parent cluster
      const pc = n.cluster;
      // TO DO: prepare for undo
      n.setCluster(MODEL.focal_cluster);
      n.x = this.add_x;
      n.y = this.add_y;
      // Prepare both affected parent clusters for redraw
      pc.clearAllProcesses();
      MODEL.focal_cluster.clearAllProcesses();
      this.selectNode(n);
    }
  }
  
  promptForCloning() {
    // Open CLONE modal.
    const n = MODEL.selection.length;
    if(n > 0) {
      const md = UI.modals.clone;
      md.element('prefix').value = '';
      md.element('actor').value = '';
      md.element('count').innerHTML = `(${pluralS(n, 'element')})`;
      md.show('prefix');
    }
  }
  
  cloneSelection() {
    const md = UI.modals.clone;
    if(MODEL.selection.length) {
      const
          p_prompt = md.element('prefix'),
          a_prompt = md.element('actor'),
          renumber = this.boxChecked('clone-renumbering'),
          actor_name = a_prompt.value.trim();
      let prefix = p_prompt.value.trim();
      // Perform basic validation of combination prefix + actor.
      let msg = '';
      p_prompt.focus();
      if(!prefix && !actor_name && !(renumber && MODEL.canRenumberSelection)) {
        msg = 'Prefix and actor name cannot both be empty';
      } else if(prefix && !UI.validName(prefix)) {
        msg = `Invalid prefix "${prefix}"`;
      } else if(actor_name && !UI.validName(actor_name)) {
        msg = `Invalid actor name "${actor_name}"`;
        a_prompt.focus();
      }
      if(msg) {
        this.warn(msg);
        return;
      }
      const err = MODEL.cloneSelection(prefix, actor_name, renumber);
      if(err) {
        // Something went wrong, so do not hide the modal, but focus on
        // the DOM element returned by the model's cloning method.
        const el = md.element(err);
        if(el) {
          el.focus();
        } else {
          UI.warn(`Unexpected clone result "${err}"`);
        }
        return;
      }
    }
    md.hide();
    this.updateButtons();
  }
  
  cancelCloneSelection() {
    this.modals.clone.hide();
    this.updateButtons();
  }
  
  copySelection() {
    // Save selection as XML in local storage of the browser.
    const xml = MODEL.selectionAsXML;
    if(xml) {
      window.localStorage.setItem('Linny-R-selection-XML', xml);
      this.updateButtons();
      const bn = (this.browser_name ? ` of ${this.browser_name}` : '');
      this.notify('Selection copied to local storage' + bn);
    }
  }
  
  get canPaste() {
    // Return TRUE if the browser has a recent selection-as-XML object
    // in its local storage.
    const xml = window.localStorage.getItem('Linny-R-selection-XML');
    if(xml) {
      const timestamp = xml.match(/<copy timestamp="(\d+)"/);
      if(timestamp) { 
        if(Date.now() - parseInt(timestamp[1]) < 8*3600000) return true;
      }
      // Remove XML from local storage if older than 8 hours.
      window.localStorage.removeItem('Linny-R-selection-XML');
    }
    return false;
  }
  
  promptForMapping(mapping) {
    // Prompt user to specify name conflict resolution strategy.
    const md = this.paste_modal;
    md.mapping = mapping;
    md.element('from-prefix').innerText = mapping.from_prefix || '';
    md.element('to-prefix').innerText = mapping.to_prefix || '';
    md.element('ftp').style.display = (mapping.from_prefix ? 'block' : 'none');
    md.element('from-actor').innerText = mapping.from_actor || '';
    md.element('to-actor').innerText = mapping.to_actor || '';
    md.element('fta').style.display = (mapping.from_actor ? 'block' : 'none');
    md.element('actor').value = mapping.actor || '';
    md.element('prefix').value = mapping.prefix || '';
    const
        tc = (mapping.top_clusters ?
            Object.keys(mapping.top_clusters).sort(ciCompare) : []),
        ft = (mapping.from_to ?
            Object.keys(mapping.from_to).sort(ciCompare) : []),
        sl = [];
    if(tc.length) {
      sl.push('<div style="font-weight: bold; margin:4px 2px 2px 2px">',
        'Names for top-level clusters:</div>');
      const sll = sl.length;
      // Add text inputs for selected cluster nodes.
      for(let i = 0; i < tc.length; i++) {
        const
            ti = mapping.top_clusters[tc[i]],
            state = (ti === tc[i] ? 'color: #e09000; ' :
                this.validName(ti) ? 'color: #0000c0; ' :
                'font-style: italic; color: red; ');
        sl.push('<div class="paste-option"><span>', tc[i], '</span> ',
            '<div class="paste-select"><input id="paste-selc-', i,
            '" type="text" style="', state, 'font-size: 12px" value="',
            ti, '"></div></div>');
      }
      // Remove header when no items were added.
      if(sl.length === sll) sl.pop();
    }
    if(ft.length) {
      sl.push('<div style="font-weight: bold; margin:4px 2px 2px 2px">',
        'Mapping of nodes to link from/to:</div>');
      const sll = sl.length;
      // Add selectors for unresolved FROM/TO nodes.
      for(let i = 0; i < ft.length; i++) {
        const ti = mapping.from_to[ft[i]];
        if(ft[i] === ti) {
          const elig = MODEL.eligibleFromToNodes(mapping.from_to_type[ti]);
          sl.push('<div class="paste-option"><span>', ft[i], '</span> ');
          if(elig.length) {
            sl.push('<div class="paste-select"><select id="paste-ft-', i,
              '" style="font-size: 12px">');
            for(const e of elig) {
              const dn = e.displayName;
              sl.push('<option value="', dn, '">', dn, '</option>');
            }
            sl.push('</select></div>');
          } else {
            sl.push('<span><em>(no eligible node)</em></span');
          }
          sl.push('</div>');
        }
      }
      // Remove header when no items were added.
      if(sl.length === sll) sl.pop();
    }
    md.element('scroll-area').innerHTML = sl.join('');
    // Open dialog, which will call pasteSelection(...) on OK.
    this.paste_modal.show();
  }
  
  setPasteMapping() {
    // Update the paste mapping as specified by the modeler and then
    // proceed to paste.
    const
        md = this.paste_modal,
        mapping = Object.assign({}, md.mapping),
        tc = (mapping.top_clusters ?
            Object.keys(mapping.top_clusters).sort(ciCompare) : []),
        ft = (mapping.from_to ?
            Object.keys(mapping.from_to).sort(ciCompare) : []);
    mapping.actor = md.element('actor').value;
    mapping.prefix = md.element('prefix').value.trim();
    mapping.increment = true;
    for(let i = 0; i < tc.length; i++) {
      const cn = md.element('selc-' + i).value.trim();
      if(this.validName(cn)) mapping.top_clusters[tc[i]] = cn;
    }
    for(let i = 0; i < ft.length; i++) if(mapping.from_to[ft[i]] === ft[i]) {
      const
          ftn = md.element('ft-' + i).value,
          fto = MODEL.objectByName(ftn);
      if(fto) mapping.from_to[ft[i]] = ftn;
    }
    this.pasteSelection(mapping);
  }
  
  pasteSelection(mapping={}) {
    // If selection has been saved as XML in local storage, test to
    // see whether PASTE would result in name conflicts, and if so,
    // open the name conflict resolution window.
    let xml = window.localStorage.getItem('Linny-R-selection-XML');
    try {
      xml = parseXML(xml);
    } catch(e) {
      console.log(e);
      this.alert('Paste failed due to invalid XML');
      return;
    }

    const
        entities_node = childNodeByTag(xml, 'entities'),
        from_tos_node = childNodeByTag(xml, 'from-tos'),
        extras_node = childNodeByTag(xml, 'extras'),
        selc_node = childNodeByTag(xml, 'selected-clusters'),
        selection_node = childNodeByTag(xml, 'selection'),
        actor_names = [],
        new_entities = [],
        name_map = {},
        name_conflicts = [];
            
    // Auxiliary functions.
    
    function namedObjects() {
      // Return TRUE iff XML contains named objects.
      for(const cn of entities_node.childNodes) {
        if(cn.nodeName !== 'note') return true;
      }
      return false;
    }
    
    function fullName(node) {
      // Return full entity name inferred from XML node data.
      if(node.nodeName === 'from-to' || node.nodeName === 'selc') {
        const
            n = xmlDecoded(nodeParameterValue(node, 'name')),
            an = xmlDecoded(nodeParameterValue(node, 'owner'));
        if(an && an !== UI.NO_ACTOR) {
          addDistinct(an, actor_names);
          return `${n} (${an})`;
        }
        return n;
      }
      if(node.nodeName !== 'link' && node.nodeName !== 'constraint') {
        const
            n = xmlDecoded(nodeContentByTag(node, 'name')),
            an = xmlDecoded(nodeContentByTag(node, 'owner'));
        if(an && an !== UI.NO_ACTOR) {
          addDistinct(an, actor_names);
          return `${n} (${an})`;
        }
        return n;
      } else {
        let fn = xmlDecoded(nodeContentByTag(node, 'from-name')),
            fa = xmlDecoded(nodeContentByTag(node, 'from-owner')),
            tn = xmlDecoded(nodeContentByTag(node, 'to-name')),
            ta = xmlDecoded(nodeContentByTag(node, 'to-owner')),
            arrow = (node.nodeName === 'link' ? UI.LINK_ARROW : UI.CONSTRAINT_ARROW);
        if(fa && fa !== UI.NO_ACTOR) {
          addDistinct(fa, actor_names);
          fn = `${fn} (${fa})`;
        }
        if(ta && ta !== UI.NO_ACTOR) {
          addDistinct(ta, actor_names);
          tn = `${tn} (${ta})`;
        }
        return `${fn}${arrow}${tn}`;
      }
    }
    
    function nameAndActor(name) {
      // Return tuple [entity name, actor name] if `name` ends with a
      // parenthesized string that identifies an actor in the selection.
      const ai = name.lastIndexOf(' (');
      if(ai < 0) return [name, ''];
      let actor = name.slice(ai + 2, -1);
      // Test whether parenthesized string denotes an actor.
      if(actor_names.indexOf(actor) >= 0 || actor === mapping.actor ||
          actor === mapping.from_actor || actor === mapping.to_actor) {
        name = name.substring(0, ai);
      } else {
        actor = '';
      }
      return [name, actor];
    }

    function mappedName(n) {
      // Return full name `n` modified according to the mapping.
      // NOTE: Links and constraints require two mappings (recursion!).
      if(n.indexOf(UI.LINK_ARROW) > 0) {
        const ft = n.split(UI.LINK_ARROW);
        return mappedName(ft[0]) + UI.LINK_ARROW + mappedName(ft[1]);
      }
      if(n.indexOf(UI.CONSTRAINT_ARROW) > 0) {
        const ft = n.split(UI.CONSTRAINT_ARROW);
        return mappedName(ft[0]) + UI.CONSTRAINT_ARROW + mappedName(ft[1]);
      }
      // Mapping precedence order:
      // (1) prefix inherited from cluster
      // (2) actor name inherited from cluster
      // (3) actor name specified by modeler
      // (4) prefix specified by modeler
      // (5) auto-increment tail number
      // (6) nearest eligible node
      if(mapping.from_prefix && n.startsWith(mapping.from_prefix)) {
        return n.replace(mapping.from_prefix, mapping.to_prefix);
      }
      if(mapping.from_actor) {
        const ai = n.lastIndexOf(mapping.from_actor);
        if(ai > 0) return n.substring(0, ai) + mapping.to_actor;
      }
      // NOTE: Specified actor cannot override existing actor.
      if(mapping.actor && !nameAndActor(n)[1]) {
        return `${n} (${mapping.actor})`;
      }
      if(mapping.prefix) {
        return mapping.prefix + UI.PREFIXER + n;
      }
      let nr = endsWithDigits(n);
      if(mapping.increment && nr) {
        return n.replace(new RegExp(nr + '$'), parseInt(nr) + 1);
      }
      if(mapping.top_clusters && mapping.top_clusters[n]) {
        return mapping.top_clusters[n];
      }
      if(mapping.from_to && mapping.from_to[n]) {
        return mapping.from_to[n];
      }
      // No mapping => return original name.
      return n;
    }

    function nameConflicts(node) {
      // Map names of entities defined by the child nodes of `node`
      // while detecting name conflicts.
      for(const c of node.childNodes) {
        if(c.nodeName !== 'link' && c.nodeName !== 'constraint') {
          const
              fn = fullName(c),
              mn = mappedName(fn),
              obj = MODEL.objectByName(mn),
              // Assume that existing products can be added as product
              // positions if they are not prefixed.
              add_pp = (obj instanceof Product && mn.indexOf(UI.PREFIXER) < 0);
          // Name conflict occurs when the mapped name is already in use
          // in the target model, or when the original name is mapped onto
          // different names (this might occur due to modeler input).
          if((obj && !add_pp) || (name_map[fn] && name_map[fn] !== mn)) {
            addDistinct(fn, name_conflicts);
          } else {
            name_map[fn] = mn;
          }
        }
      }
    }
    
    function addEntityFromNode(node) {
      // Add entity to model based on XML node data and mapping.
      // NOTE: Do not add if an entity having this type and mapped name
      // already exists; name conflicts accross entity types may occur
      // and result in error messages.
      const
          et = node.nodeName,
          fn = fullName(node),
          mn = mappedName(fn);
      let obj;
      if(et === 'note') {
        // Ensure that copy had new time stamp.
        let cn = childNodeByTag(node, 'timestamp').firstChild;
        cn.nodeValue = new Date().getTime().toString();
        cn = childNodeByTag(node, 'x-coord').firstChild;
        // Move note a bit right and down.
        cn.nodeValue = (safeStrToInt(cn.nodeValue, 0) + 12).toString();
        cn = childNodeByTag(node, 'y-coord').firstChild;
        cn.nodeValue = (safeStrToInt(cn.nodeValue, 0) + 12).toString();
        obj = MODEL.addNote(node);
        if(obj) new_entities.push(obj);
      } else if(et === 'process' && !MODEL.processByID(UI.nameToID(mn))) {
        const
           na = nameAndActor(mn),
           new_actor = !MODEL.actorByID(UI.nameToID(na[1]));
        obj = MODEL.addProcess(na[0], na[1], node);
        if(obj) {
          obj.code = '';
          obj.setCode();
          if(new_actor) new_entities.push(obj.actor);
          new_entities.push(obj);
        }
      } else if(et === 'product' && !MODEL.productByID(UI.nameToID(mn))) {
        obj = MODEL.addProduct(mn, node);
        if(obj) {
          obj.code = '';
          obj.setCode();
          new_entities.push(obj);
        }
      } else if(et === 'cluster' && !MODEL.clusterByID(UI.nameToID(mn))) {
        const
           na = nameAndActor(mn),
           new_actor = !MODEL.actorByID(UI.nameToID(na[1]));
        obj = MODEL.addCluster(na[0], na[1], node);
        if(obj) {
          if(new_actor) new_entities.push(obj.actor);
          new_entities.push(obj);
        }
      } else if(et === 'dataset' && !MODEL.datasetByID(UI.nameToID(mn))) {
        obj = MODEL.addDataset(mn, node);
        if(obj) new_entities.push(obj);
      } else if(et === 'link' || et === 'constraint') {
        const
            ft = mn.split(et === 'link' ? UI.LINK_ARROW : UI.CONSTRAINT_ARROW),
            fl = MODEL.objectByName(ft[0]),
            tl = MODEL.objectByName(ft[1]);
        if(fl && tl) {
          obj = (et === 'link' ?
              MODEL.addLink(fl, tl, node) :
              MODEL.addConstraint(fl, tl, node));
          if(obj) new_entities.push(obj);
        } else {
          UI.alert(`Failed to paste ${et} ${fn} as ${mn}`);
        }
      }
    }
    
    const
        mts = nodeParameterValue(xml, 'model-timestamp'),
        cn = nodeParameterValue(xml, 'cluster-name'),
        ca = nodeParameterValue(xml, 'cluster-actor'),
        fc = MODEL.focal_cluster,
        fcn = fc.name,
        fca = fc.actor.name,
        sp = this.sharedPrefix(cn, fcn),
        fpn = (cn === UI.TOP_CLUSTER_NAME ? '' : cn.replace(sp, '')),
        tpn = (fcn === UI.TOP_CLUSTER_NAME ? '' : fcn.replace(sp, ''));
    // Infer mapping from XML data and focal cluster name & actor name.
    mapping.shared_prefix = sp;
    mapping.from_prefix = (fpn ? sp + fpn + UI.PREFIXER : sp);
    mapping.to_prefix = (tpn ? sp + tpn + UI.PREFIXER : sp);
    mapping.from_actor = UI.realActorName(ca);
    mapping.to_actor = UI.realActorName(fca);
    // Prompt for mapping when pasting to the same model and cluster.
    if(parseInt(mts) === MODEL.time_created.getTime() &&
        ca === fca && mapping.from_prefix === mapping.to_prefix &&
        !(mapping.prefix || mapping.actor || mapping.increment) &&
        namedObjects()) {
      // Prompt for names of selected cluster nodes.
      if(selc_node.childNodes.length && !mapping.prefix) {
        mapping.top_clusters = {};
        for(const c of selc_node.childNodes) {
          const
              fn = fullName(c),
              mn = mappedName(fn);
          mapping.top_clusters[fn] = mn;
        }
      }
      this.promptForMapping(mapping);
      return;
    }
    // Also prompt if FROM and/or TO nodes are not selected, and map to
    // existing entities.
    if(from_tos_node.childNodes.length && !mapping.from_to) {
      const
          ft_map = {},
          ft_type = {};
      for(const c of from_tos_node.childNodes) {
        const
            fn = fullName(c),
            mn = mappedName(fn);
        if(MODEL.objectByName(mn)) {
          ft_map[fn] = mn;
          ft_type[fn] = (nodeParameterValue(c, 'is-data') === '1' ?
              'Data' : nodeParameterValue(c, 'type'));
        }
      }
      // Prompt only for FROM/TO nodes that map to existing nodes.
      if(Object.keys(ft_map).length) {
        mapping.from_to = ft_map;
        mapping.from_to_type = ft_type;
        this.promptForMapping(mapping);
        return;
      }
    }

    // Only check for selected entities. From-to's and extra's should be
    // used if they exist, or should be created when copying to a different
    // model.
    name_map.length = 0;
    nameConflicts(entities_node);
    if(name_conflicts.length) {
      UI.warn(pluralS(name_conflicts.length, 'name conflict'));
console.log('HERE name conflicts', name_conflicts, mapping);
      return;
    }
    
    // No conflicts => add all.
    for(const c of extras_node.childNodes) addEntityFromNode(c);
    for(const c of from_tos_node.childNodes) addEntityFromNode(c);
    for(const c of entities_node.childNodes) addEntityFromNode(c);
    // Update diagram, showing newly added nodes as selection.
    MODEL.clearSelection();
    for(const c of selection_node.childNodes) {
      const
          n = xmlDecoded(nodeContent(c)),
          obj = MODEL.objectByName(mappedName(n));
      if(obj) {
        // NOTE: Selected products must be positioned.
        if(obj instanceof Product) MODEL.focal_cluster.addProductPosition(obj);
        MODEL.select(obj);
      }
    }
    // Force redrawing the selection to ensure that links to positioned
    // products are displayed as arrows instead of block arrows.
    fc.clearAllProcesses();
    UI.drawDiagram(MODEL);
    this.paste_modal.hide();
  }
  
  //
  // Interaction with modal dialogs to modify model or entity properties
  //
  
  // Settings modal

  showSettingsDialog(model) {
    const md = this.modals.settings;
    md.element('name').value = model.name;
    md.element('author').value = model.author;
    md.element('product-unit').value = model.default_unit;
    md.element('currency-unit').value = model.currency_unit;
    md.element('grid-pixels').value = model.grid_pixels;
    md.element('time-scale').value = model.time_scale;
    md.element('time-unit').value = model.time_unit;
    md.element('period-start').value = model.start_period;
    md.element('period-end').value = model.end_period;
    md.element('block-length').value = model.block_length;
    md.element('look-ahead').value = model.look_ahead;
    md.element('time-limit').value = model.timeout_period;
    this.setBox('settings-decimal-comma', model.decimal_comma);
    this.setBox('settings-align-to-grid', model.align_to_grid);
    this.setBox('settings-block-arrows', model.show_block_arrows);
    this.setBox('settings-diagnose', model.always_diagnose);
    this.setBox('settings-power', model.with_power_flow);
    this.setBox('settings-cost-prices', model.infer_cost_prices);
    this.setBox('settings-negative-flows', model.ignore_negative_flows);
    this.setBox('settings-report-results', model.report_results);
    this.setBox('settings-encrypt', model.prompt_to_encrypt);
    const pg_btn = md.element('power-btn');
    pg_btn.style.display = (model.with_power_flow ? 'inline-block' : 'none');
    if(model.ignore_grid_capacity || model.ignore_KVL || model.ignore_power_losses) {
      pg_btn.classList.add('ignore');
    } else {
      pg_btn.classList.remove('ignore');
    }
    md.show('name');
  }
  
  updateSettings(model) {
    // Valdidate inputs.
    const px = this.validNumericInput('settings-grid-pixels', 'grid resolution');
    if(px === false) return false;
    const ts = this.validNumericInput('settings-time-scale', 'time step');
    if(ts === false) return false;
    const md = UI.modals.settings;
    if(ts <= 0) {
      this.warn('Time step must be non-negative');
      md.element('time-scale').focus();
      return false;
    }
    let ps = this.validNumericInput('settings-period-start', 'first time step');
    if(ps === false) return false;
    if(ps < 1) {
      this.warn('Simulation cannot start earlier than at t=1');
      md.element('period-start').focus();
      return false;
    }
    let pe = this.validNumericInput('settings-period-end', 'last time step');
    if(pe === false) return false;
    if(pe < ps) {
      this.warn('End time cannot precede start time');
      md.element('period-end').focus();
      return false;      
    }
    const bl = this.validNumericInput('settings-block-length', 'block length');
    if(bl === false) return false;
    const la = this.validNumericInput('settings-look-ahead', 'look-ahead');
    if(la === false) return false;
    if(la < 0) {
      this.warn('Look-ahead must be non-negative');
      md.element('look-ahead').focus();
      return false;
    }
    const tl = UI.validNumericInput('settings-time-limit', 'solver time limit');
    if(tl === false) return false;
    if(tl < 0) {
      // NOTE: time limit 0 is interpreted as "no limit"
      this.warn('Impractical solver time limit');
      md.element('time-limit').focus();
      return false;
    }
    const
        e = md.element('product-unit'),
        dsu = UI.cleanName(e.value) || '1';
    model.name = md.element('name').value.trim();
    // Display model name in browser unless blank.
    document.title = model.nameWithoutPath || 'Linny-R';
    // NOTE: Author names should not contain potential path delimiters.
    model.author = md.element('author').value.trim().replaceAll(/\\|\//g, '');
    if(!model.scale_units.hasOwnProperty(dsu)) model.addScaleUnit(dsu);
    model.default_unit = dsu;
    model.currency_unit = md.element('currency-unit').value.trim();
    model.report_results = UI.boxChecked('settings-report-results');
    model.prompt_to_encrypt = UI.boxChecked('settings-encrypt');
    model.decimal_comma = UI.boxChecked('settings-decimal-comma');
    model.always_diagnose = this.boxChecked('settings-diagnose');
    // Notify modeler that diagnosis changes the value of +INF.
    if(model.always_diagnose) {
      UI.notify('To diagnose unbounded problems, values beyond 1e+10 ' +
          'are considered as infinite (\u221E)');
      this.buttons.solve.title = 'Run simulation (Ctrl-R)';
    } else {
      this.buttons.solve.title = 'Run simulation (Ctrl-R) &ndash; ' +
          'Alt-click to diagnose infeasible/unbounded problem (Alt-R)';
    }
    // Some changes may necessitate redrawing the diagram.
    let cb = UI.boxChecked('settings-align-to-grid'),
        redraw = !model.align_to_grid && cb;
    model.align_to_grid = cb;
    model.grid_pixels = Math.floor(px);
    cb = UI.boxChecked('settings-power');
    redraw = redraw || cb !== model.with_power_flow;
    model.with_power_flow = cb;
    // NOTE: Clear the "ignore" options if no power flow constraints.
    if(!model.with_power_flow) {
      model.ignore_grid_capacity = false;
      model.ignore_KVL = false;
      model.ignore_power_losses = false;
    }
    cb = UI.boxChecked('settings-cost-prices');
    redraw = redraw || cb !== model.infer_cost_prices;
    model.infer_cost_prices = cb;
    model.ignore_negative_flows = UI.boxChecked('settings-negative-flows');
    cb = UI.boxChecked('settings-block-arrows');
    redraw = redraw || cb !== model.show_block_arrows;
    model.show_block_arrows = cb;
    // Changes affecting run length (hence vector lengths) require a model reset.
    let reset = false;
    reset = reset || (ts != model.time_scale);
    model.time_scale = ts;
    const tu = md.element('time-unit').value;
    reset = reset || (tu != model.time_unit);
    model.time_unit = (tu || CONFIGURATION.default_time_unit);
    ps = Math.floor(ps);
    reset = reset || (ps != model.start_period);
    model.start_period = ps;
    pe = Math.floor(pe);
    reset = reset || (pe != model.end_period);
    model.end_period = pe;
    reset = reset || (bl != model.block_length);
    model.block_length = Math.floor(bl);
    reset = reset || (la != model.look_ahead);
    model.look_ahead = Math.floor(la);
    // Solver settings do not affect vector length
    model.timeout_period = tl;
    // Update currencies in other dialogs
    this.modals.product.element('currency').innerHTML = model.currency_unit;
    // Close the dialog
    md.hide();
    // Ensure that model documentation can no longer be edited
    DOCUMENTATION_MANAGER.clearEntity([model]);
    // Reset model if needed
    if(reset) {
      model.resetExpressions();
      this.notify('To update datasets and results, run the simulation (again)');
      CHART_MANAGER.updateDialog();
      redraw = true;
    }
    // Adjust current time step if it falls outside (new) interval
    if(model.t < ps || model.t > pe) {
      model.t = (model.t < ps ? ps : pe);
      UI.updateTimeStep();
      redraw = true;
    }
    if(redraw) this.drawDiagram(model);
  }
  
  togglePowerGridButton() {
    // Responds to clicking the "power grid options" checkbox by toggling
    // the "View/edit power grids" button.
    const
        cb = this.modals.settings.element('power'),
        pb = this.modals.settings.element('power-btn');
    // NOTE: When clicked, state has not been updated yet. 
    if(cb.classList.contains('clear')) {
      pb.style.display = 'inline-block';
    } else {
      pb.style.display = 'none';
    }
  }
  
  // Solver preferences modal
  
  showSolverPreferencesDialog() {
    const
        md = this.modals.solver,
        html = ['<option value="">(default)</option>'];
    for(const s of VM.solver_list) {
      html.push(['<option value="', s,
          (s === MODEL.preferred_solver ? '"selected="selected' : ''),
          '">', VM.solver_names[s], '</option>'].join(''));
    }
    md.element('preference').innerHTML = html.join('');
    md.element('int-feasibility').value = MODEL.integer_tolerance;
    md.element('mip-gap').value = MODEL.MIP_gap;
    this.setBox('solver-show-notices', MODEL.show_notices);
    md.show();
  }
  
  updateSolverPreferences() {
    // Set values for solver preferences.
    const
        md = this.modals.solver,
        it = md.element('int-feasibility'),
        mg = md.element('mip-gap');
    let itol = 5e-7,
        mgap = 1e-4;
    // Validate input, assuming default values for empty fields.
    if(it.value.trim()) itol = UI.validNumericInput('solver-int-feasibility',
        'integer feasibility tolerance');
    if(itol === false) return false;
    if(mg.value.trim()) mgap = UI.validNumericInput('solver-mip-gap',
        'relative MIP gap');
    if(mgap === false) return false;
    // Modify solver preferences for the current model.
    const ps = md.element('preference').value;
    if(ps !== MODEL.preferred_solver) {
      MODEL.preferred_solver = ps;
      // Immediately try to change to the preferred solver, as this is
      // an asynchronous call that may take time to complete.
      UI.changeSolver(ps);
    }
    MODEL.integer_tolerance = Math.max(1e-9, Math.min(0.1, itol));
    MODEL.MIP_gap = Math.max(0, Math.min(0.5, mgap));
    MODEL.show_notices = this.boxChecked('solver-show-notices');
    // Close the dialog.
    md.hide();
  }
  
  // Note modal

  showNotePropertiesDialog(n=null) {
    this.dbl_clicked_node = n;
    const md = this.modals.note;
    if(n) {
      md.element('action').innerHTML = 'Edit';
      const nr = n.number;
      md.element('number').innerHTML = (nr ? '#' + nr : '');
      md.element('text').value = n.contents;
      md.element('C').value = n.color.text;
    } else {
      md.element('action').innerHTML = 'Add';
    }
    md.show('text');
  }
  
  // Process modal

  showProcessPropertiesDialog(p, attr='name', alt=false, group=[]) {
    // Opens the process modal and sets its fields to properties of `p`.
    const md = this.modals.process;
    // In the Finder, multiple processes may be edited as a group.
    md.group = group;
    md.element('name').value = p.name;
    md.element('actor').value = (p.hasActor ? p.actor.name : '');
    md.element('length').value = p.length_in_km;
    md.grid_id = (p.grid ? p.grid.id : '');
    this.hideGridPlateMenu('process');
    this.updateGridFields();
    // Focus on lower bound when showing the dialog for a group.
    if(group.length > 0) {
      attr = 'LB';
    } else if (!attr) {
      // Focus on the name input if `attr` was not specified.
      attr = 'name';      
    }
    md.show(attr, p);
    this.edited_object = p;
    // NOTE: Special shortcut Alt-click on an expression property in the
    // Finder dialog means that this expression should be opened in the
    // Expression Editor; this is effectuated via a "click" event on the
    // edit button next to the attribute input field.
    if(alt && !md.group) {
      md.element(attr + '-x').dispatchEvent(new Event('click'));
    }
  }
  
  showGridPlateMenu(modal) {
    const md = this.modals[modal];
    POWER_GRID_MANAGER.updateGridMenu(modal);
    md.element('grid-plate-menu').style.display = 'block';
  }
  
  hideGridPlateMenu(modal) {
    const md = this.modals[modal];
    md.element('grid-plate-menu').style.display = 'none';
  }
  
  setGridPlate(div) {
    const
        parts = div.id.split('-'),
        modal = parts[0],
        md = this.modals[modal],
        id = parts.pop(),
        grid = MODEL.powerGridByID(id);
    // NOTE: Store power grid identifier as property of the modal.
    md.grid_id = (grid ? id : '');
    this.updateGridFields();
  }
  
  updateGridFields() {
    // Adjust the powergrid-related elements of the dialog according to
    // the value of the `grid_id` property of the modal.
    const
        md = this.modals.process,
        plate = md.element('grid-plate'),
        overlay = md.element('grid-overlay'),
        notab = ['LB', 'IL', 'LCF'],
        pg = MODEL.powerGridByID(md.grid_id);
    if(pg) {
      plate.className = 'grid-kV-plate';
      plate.style.backgroundColor = pg.color;
      plate.innerHTML = pg.voltage;
      overlay.style.display = 'block';
      // Disable tab stop for the properties that are now not shown.
      for(const nt of notab) md.element(nt).tabIndex = -1;
    } else {
      plate.innerHTML = '(&#x21AF;)';
      plate.className = 'no-grid-plate';
      overlay.style.display = 'none';
      // Enable tab stop for the properties that are now not shown.
      for(const nt of notab) md.element(nt).tabIndex = 0;
    }
    this.hideGridPlateMenu('process');
    // Show plate "button" only when power grids option is set for model.
    plate.style.display = (MODEL.with_power_flow ? 'block' : 'none');
  }

  updateProcessProperties() {
    // Validates process properties, and only updates the edited process
    // if all input is OK.
    // @@TO DO: prepare for undo
    const
        md = this.modals.process,
        p = this.edited_object;
    // Rename object if name and/or actor have changed
    const
        pn = md.element('name').value.trim(),
        an = md.element('actor').value.trim();
    let n = p.rename(pn, an);
    // NOTE: When rename returns FALSE, a warning is already shown.
    if(n !== true && n !== false) {
      this.warningEntityExists(n);
      return false;
    }
    // Update expression properties.
    if(!this.updateExpressionInput(
        'process-LB', 'lower bound', p.lower_bound)) return false;
    if(!this.updateExpressionInput(
        'process-UB', 'upper bound', p.upper_bound)) return false;
    // If process is constrained, its upper bound must be defined
    if(!p.upper_bound.defined) {
      const c = MODEL.isConstrained(p);
      if(c) {
        n = (c.from_node === p ? c.to_node : c.from_node);
        this.warningSetUpperBound(n);
        return false;
      }
    }
    if(!this.updateExpressionInput(
        'process-IL', 'initial level', p.initial_level)) return false;
    // Store original expression string.
    const
        px = p.pace_expression,
        pxt = p.pace_expression.text;
    // Validate expression.
    if(!this.updateExpressionInput('process-LCF', 'level change frequency',
        px)) return false;
    // NOTE: Level change frequency expression must be *static* and >= 1.
    n = px.result(1);
    if(!px.isStatic || n < 1) {
      md.element('LCF').focus();
      this.warn('Level change frequency must be static and &ge; 1');
      // Restore original expression string.
      px.text = pxt;
      px.code = null;
      return false;
    }
    // Ignore level change frequency fraction if a real number was entered.
    p.pace = Math.floor(n);
    if(n - p.pace > VM.SIG_DIF_LIMIT) this.notify(
        'Level change frequency set to ' + p.pace);
    // At this point, all input has been validated, so entity properties
    // can be modified.
    p.equal_bounds = this.getEqualBounds('process-UB-equal');
    p.integer_level = this.boxChecked('process-integer');
    p.level_to_zero = this.boxChecked('process-shut-down');
    p.collapsed = this.boxChecked('process-collapsed');
    p.power_grid = MODEL.powerGridByID(md.grid_id);
    p.length_in_km = safeStrToFloat(md.element('length').value, 0);
    if(md.group.length > 1) {
      // Redraw the entire diagram, as multiple processes may have changed.
      md.updateModifiedProperties(p);
      MODEL.focal_cluster.clearAllProcesses();
      UI.drawDiagram(MODEL);
    } else {
      // Redraw the shape, as its appearance and/or associated link types
      // may have changed.
      p.drawWithLinks();
    }
    md.hide();  
    return true;
  }

  // Product modal

  showProductPropertiesDialog(p, attr='name', alt=false, group=[]) {
    const md = this.modals.product;
    // In the Finder, multiple products may be edited as a group.
    md.group = group;
    md.element('name').value = p.name;
    // NOTE: price label includes the currency unit and the product unit,
    // e.g., EUR/ton
    md.element('P-unit').innerHTML =
        (p.scale_unit === '1' ? '' : '/' + p.scale_unit);
    md.element('currency').innerHTML = MODEL.currency_unit;
    // NOTE: IO parameter status is not "group-edited"!
    this.setImportExportBox('product', MODEL.ioType(p));
    // Focus on lower bound when showing the dialog for a group.
    if(group.length > 0) {
      attr = 'LB';
    } else if (!attr) {
      // Focus on the name input if `attr` was not specified.
      attr = 'name';      
    }
    md.show(attr, p);
    this.edited_object = p;
    this.toggleProductStock();
    // NOTE: special shortcut Alt-click on an expression property in the Finder
    // dialog means that this expression should be opened in the Expression
    // Editor; this is effectuated via a "click" event on the edit button next
    // to the attribute input field
    if(alt) md.element(attr + '-x').dispatchEvent(new Event('click'));
  }

  toggleProductStock() {
    // Enable/disable initial level input in the Product modal, depending on
    // the Stock check box status.
    const
        lb = document.getElementById('product-LB'),
        ub = document.getElementById('product-UB'),
        il = document.getElementById('product-IL'),
        lbl = document.getElementById('product-IL-lbl'),
        edx = document.getElementById('product-IL-x');
    if(this.boxChecked('product-stock')) {
      // Set lower bound to 0 unless already specified.
      if(!lb.value.trim()) lb.value = 0;
      if(!il.value.trim()) il.value = 0;
      il.disabled = false;
      lbl.style.color = 'black';
      lbl.style.textShadow = 'none';
      edx.classList.remove('disab');
      edx.classList.add('enab');
    } else {
      // NOTE: To restore normal product default, clear LB if it is zero
      // *and* no UB is specified.
      if(lb.value === '0' && !ub.value.trim() ) lb.value = '';
      // NOTE: Always clear initial level, as this applies only to stocks.
      il.value = '';
      il.disabled = true;
      lbl.style.color = 'gray';
      lbl.style.textShadow = '1px 1px white';
      edx.classList.remove('enab');
      edx.classList.add('disab');
    }
  }
  
  updateProductProperties() {
    // Validate product properties, and update only if all input is OK.
    const
        md = this.modals.product,
        p = this.edited_object;
    // @@TO DO: prepare for undo
    // Rename object if name has changed.
    const nn = md.element('name').value.trim();
    let n = p.rename(nn, '');
    if(n !== true && n !== p) {
      this.warningEntityExists(n);
      return false;
    }
    // Update expression properties.
    // NOTE: For stocks, set lower bound to zero if undefined.
    const
        stock = this.boxChecked('product-stock'),
        lb = md.element('LB'),
        il = md.element('IL');
    if(stock && lb.value.trim().length === 0) lb.value = '0';
    if(!this.updateExpressionInput('product-LB', 'lower bound',
        p.lower_bound)) return false;
    if(!this.updateExpressionInput('product-UB', 'upper bound',
        p.upper_bound)) return false;
    if(p.name.startsWith('$')) {
      // NOTE: For actor cash flow data products, price and initial
      // level must remain blank...
      md.element('P').value = '';
      il.value = '';
      // ... and the unit must be the model's currency unit.
      md.element('unit').value = MODEL.currency_unit;
    }
    if(!this.updateExpressionInput('product-IL', 'initial level',
        p.initial_level)) return false;
    if(!this.updateExpressionInput('product-P', 'market price',
        p.price)) return false;
    // If product is constrained, its upper bound must be defined.
    if(!p.upper_bound.defined) {
      const c = MODEL.isConstrained(p);
      if(c) {
        n = (c.from_node === this.edited_object ? c.to_node : c.from_node);
        this.warningSetUpperBound(n);
        return false;
      }
    }
    // At this point, all input has been validated, so entity properties
    // can be modified.
    p.changeScaleUnit(md.element('unit').value);
    // NOTE: For actor cash flow data products, more properties must not
    // be modified.
    if(!p.name.startsWith('$')) {
      p.is_source = this.boxChecked('product-source');
      p.is_sink = this.boxChecked('product-sink');
      // NOTE: Do not unset `is_data` if product has ingoing data arrows.
      p.is_data = p.hasDataInputs || this.boxChecked('product-data');
      p.is_buffer = stock;
      // NOTE: Integer constraint will typically not work because cash
      // flows are scaled when setting up the Simplex tableau, and hence
      // the values of their decision variable will differ from their
      // level in the model.
      p.integer_level = this.boxChecked('product-integer');
    }
    p.no_slack = this.boxChecked('product-no-slack');
    p.equal_bounds = this.getEqualBounds('product-UB-equal');
    const pnl = p.no_links;
    p.no_links = this.boxChecked('product-no-links');
    // NOTE: Always resize because size co-depends on bounds.
    const must_redraw = (p.resize() || pnl !== p.no_links);
    MODEL.ioUpdate(p, this.getImportExportBox('product'));
    // If a group was edited, update all entities in this group. 
    if(md.group.length > 0) md.updateModifiedProperties(p);
    if(must_redraw || md.group.length > 1) {
      // Hide or show links => redraw (with new arrows).
      MODEL.focal_cluster.clearAllProcesses();
      UI.drawDiagram(MODEL);
    } else {
      UI.paper.drawProduct(p);
    }
    md.hide();
    return true;
  }

  // Cluster modal

  showClusterPropertiesDialog(c, group=[]) {
    let bb = false;
    for(const g of group) bb = bb || g.is_black_boxed;
    if(bb || c.is_black_boxed) {
      this.notify('Black-boxed clusters cannot be edited');
      return;
    }
    this.dbl_clicked_node = c;
    const md = this.modals.cluster;
    md.group = group;
    md.element('action').innerText = 'Edit';
    md.element('name').value = c.name;
    md.element('actor').value = UI.realActorName(c.actor.name);
    md.element('options').style.display = 'block';
    this.setBox('cluster-collapsed', c.collapsed);
    this.setBox('cluster-ignore', c.ignore);
    this.setBox('cluster-black-box', c.black_box);
    md.show('name', c);
  }
  
  updateClusterProperties() {
    // Validates cluster properties, and only updates the edited cluster
    // if all input is OK.
    // @@TO DO: prepare for undo
    const
        md = this.modals.cluster,
        c = this.edited_object;
    // Rename object if name and/or actor have changed
    let cn = md.element('name').value.trim(),
        an = md.element('actor').value.trim(),
        n = c.rename(cn, an);
    // NOTE: When rename returns FALSE, a warning is already shown.
    if(n !== true && n !== false) {
      this.warningEntityExists(n);
      return false;
    }
    // Input is validated => modify cluster properties.
    c.collapsed = this.boxChecked('cluster-collapsed');
    c.ignore = this.boxChecked('cluster-ignore');
    c.black_box = this.boxChecked('cluster-black-box');
    if(md.group.length > 1) md.updateModifiedProperties(c);
    // Always redraw the entire diagram, as multiple clusters may have
    // changed, and 'drawWithLinks' does not work (yet) for clusters.
    MODEL.focal_cluster.clearAllProcesses();
    UI.drawDiagram(MODEL);
    // Restore default dialog title, and hide the options to
    // collapse, ignore or "black-box" the cluster.
    md.element('action').innerHTML = 'Add';
    md.element('options').style.display = 'none';
    md.hide();  
    return true;
  }

  // Link modal

  showLinkPropertiesDialog(l, attr='R', alt=false, group=[]) {
    const
        from_process = l.from_node instanceof Process,
        to_process = l.to_node instanceof Process,
        md = this.modals.link; 
    md.group = group;
    md.element('from-name').innerHTML = l.from_node.displayName;
    md.element('to-name').innerHTML = l.to_node.displayName;
    md.show(attr, l);
    // NOTE: counter-intuitive, but "level" must always be the "from-unit", as
    // it is the "per" unit
    const
        fu = md.element('from-unit'),
        tu = md.element('to-unit');
    if(from_process) {
      fu.innerHTML = 'level';
      tu.innerHTML = l.to_node.scale_unit;
    } else if(to_process) {
      fu.innerHTML = 'level';      
      tu.innerHTML = l.from_node.scale_unit;
    } else {
      // Product-to-product link, so both products have a scale unit
      fu.innerHTML = l.from_node.scale_unit;
      tu.innerHTML = l.to_node.scale_unit;      
    }
    if(l.to_node.is_data) {
      // Spinning reserve can be "read" only from processes.
      md.element('spinning').disabled = !from_process;
      // Throughput can be "read" only from products.
      md.element('throughput').disabled = from_process;
      // Allow link type.
      md.element('multiplier-row').classList.remove('off');
    } else {
      // Disallow if TO-node is not a data product
      md.element('multiplier-row').classList.add('off');
    }
    md.element('multiplier').value = l.multiplier;
    this.updateLinkDataArrows();
    md.element('D').value = l.flow_delay.text;
    md.element('R').value = l.relative_rate.text;
    // NOTE: share of cost is input as a percentage
    md.element('share-of-cost').value = VM.sig4Dig(100 * l.share_of_cost);
    // No delay or share of cost for inputs of a process
    if(to_process) {
      md.element('output-row').style.display = 'none';
    } else {
      md.element('output-row').style.display = 'block';
      // Share of cost only for outputs of a process
      if(from_process) {
        md.element('output-soc').style.display = 'inline-block';
      } else {
        md.element('output-soc').style.display = 'none';
      }
    }
    this.edited_object = l;
    if(alt) md.element(attr + '-x').dispatchEvent(new Event('click'));
  }

  updateLinkDataArrows() {
    // Sets the two link arrow symbols in the Link modal header
    const
        a1 = document.getElementById('link-arrow-1'),
        a2 = document.getElementById('link-arrow-2'),
        lm = document.getElementById('link-multiplier').value,
        d = document.getElementById('link-D'),
        deb = document.getElementById('link-D-x');
    // NOTE: selector value is a string, not a number
    if(lm === '0') {
      // Default link symbol is a solid arrow
      a1.innerHTML = '&#x279D;';
      a2.innerHTML = '&#x279D;';
    } else {
      // Data link symbol is a three-dash arrow
      a1.innerHTML = '&#x290F;';
      a2.innerHTML = '&#x290F;';
    }
    // NOTE: use == as `lm` is a string.
    if(lm == VM.LM_PEAK_INC) {
      // Peak increase data link has no delay.
      d.disabled = true;
      d.value = '0';
      // Also disable its "edit expression" button 
      deb.classList.remove('enab');
      deb.classList.add('disab');
    } else {
      d.disabled = false;
      deb.classList.remove('disab');
      deb.classList.add('enab');
    }
  }
  
  updateLinkProperties() {
    // @@TO DO: prepare for undo
    const
        md = this.modals.link,
        l = this.edited_object;
    // Check whether all input fields are valid.
    if(!this.updateExpressionInput('link-R', 'rate', l.relative_rate)) {
      return false;
    }
    let soc = this.validNumericInput('link-share-of-cost', 'share of cost');
    if(soc === false) return false;
    if(soc < 0 || soc > 100) {
      md.element('share-of-cost').focus();
      UI.warn('Share of cost can range from 0 to 100%');
      return false;
    }
    if(!this.updateExpressionInput('link-D', 'delay', l.flow_delay)) {
      return false;
    }
    // Explicitly set delay to 0 if input is empty string.
    if(!l.flow_delay.text.trim()) l.flow_delay.text = '0';
    const
        m = parseInt(md.element('multiplier').value),
        redraw = m !== l.multiplier &&
            (m === VM.LM_FIRST_COMMIT || l.multiplier === VM.LM_FIRST_COMMIT);
    l.multiplier = m;
    l.relative_rate.text = md.element('R').value.trim();
    if(l.multiplier !== VM.LM_LEVEL && soc > 0) {
      soc = 0; 
      this.warn('Cost can only be attributed to level-based links');
    }
    // For multipliers requiring a binary variable, and also for those
    // based on the node's upper bound, warn the modeler when the UB for
    // this node is infinite or unspecified.
    if(VM.LM_NEEDING_ON_OFF.indexOf(m) >= 0) {
      if(!l.from_node.upper_bound.text) {
        UI.warn('Infinite upper bound of <strong>' + l.from_node.displayName +
            `</strong> will cause issues for ${VM.LM_SYMBOLS[m]} link`);
      }
    }
    // NOTE: Share of cost is input as a percentage, but stored as a floating
    // point value between 0 and 1.
    // If SoC is changed, *all* output links must be redrawn.
    const soc_change = (l.share_of_cost !== soc / 100);
    l.share_of_cost = soc / 100;
    if(md.group.length > 1) {
      // NOTE: Special care must be taken to not set special multipliers
      // on non-data links, or delay or SoC on process output links.
      // The groupPropertiesDialog should do this.
      md.updateModifiedProperties(l);
      // Redraw the entire diagram, as many arrows may have changed.
      MODEL.focal_cluster.clearAllProcesses();
      UI.drawDiagram(MODEL);
    } else {
      if(soc_change) {
        // Redraw process with its links so that all SoC labels are updated.
        this.on_arrow.from_node.drawWithLinks();
      } else {
        // Only redraw the arrow shape that represents the edited link.
        this.paper.drawArrow(this.on_arrow);
        // Redraw the FROM node if link has become (or no longer is) "first commit".
        if(redraw) this.drawObject(this.on_arrow.from_node);
      }
    }
    md.hide();
  }

  // NOTE: The constraint modal is controlled by the global instance of
  // class ConstraintEditor. 

  showConstraintPropertiesDialog(c) {
    // Display the constraint editor
    document.getElementById(
        'constraint-from-name').innerHTML = c.from_node.displayName;
    document.getElementById(
        'constraint-to-name').innerHTML = c.to_node.displayName;
    CONSTRAINT_EDITOR.showDialog();
  }
  
  replaceSelectedProduct() {
    // Check whether selection contains one product, and if so, prompt
    // for replacement.
    if(MODEL.selection.length !== 1) return;
    const p = MODEL.selection[0];
    if(p instanceof Product) this.showReplaceProductDialog(p);
  }

  showReplaceProductDialog(p) {
    // Prompt for a product (different from `p`) by which `p` should be
    // replaced for the selected product position
    const pp = MODEL.focal_cluster.indexOfProduct(p);
    if(pp >= 0) {
      MODEL.clearSelection();
      MODEL.selectList([p]);
      this.drawObject(p);
      // Make list of nodes related to P by links
      const rel_nodes = [];
      for(const l of p.inputs) rel_nodes.push(l.from_node);
      for(const l of p.outputs) rel_nodes.push(l.to_node);
      const options = [];
      for(let k in MODEL.products) if(MODEL.products.hasOwnProperty(k) &&
          // NOTE: do not show "black-boxed" products
          !k.startsWith(UI.BLACK_BOX)) {
        const po = MODEL.products[k];
        // Skip the product that is to be replaced, an also products having a
        // different type (regular product or data product) 
        if(po !== p && po.is_data === p.is_data) {
          // NOTE: also skip products PO that are linked to a node Q that is
          // already linked to P (as replacing would then create a two-way link)
          let no_rel = true; 
          for(const l of po.inputs) {
            if(rel_nodes.indexOf(l.from_node) >= 0) {
              no_rel = false;
              break;
            }
          }
          for(const l of po.outputs) {
            if(rel_nodes.indexOf(l.to_node) >= 0) {
              no_rel = false;
              break;
            }
          }
          if(no_rel) options.push(po.displayName);
        }
      }
      const md = this.modals.replace;
      if(options.length > 0) {
        options.sort();
        const ol = [];
        for(const o of options) ol.push(`<option text="${o}">${o}</option>`);
        md.element('by-name').innerHTML = ol.join('');
        const pne = md.element('product-name');
        pne.innerHTML = p.displayName;
        // Show that product is data by a dashed underline
        if(p.is_data) {
          pne.classList.add('is-data');
        } else {
          pne.classList.remove('is-data');
        }
        // By default, replace only locally
        this.setBox('replace-local', true);
        md.show();
      } else {
        this.warn('No eligable products to replace ' + p.displayName);
      }
    }
  }
  
  replaceProduct() {
    // Replace occurrence(s) of specified product P by product R
    // NOTE: P is still selected, so clear it
    MODEL.clearSelection();
    const
        md = this.modals.replace,
        erp = md.element('product-name'),
        erb = md.element('by-name'),
        global = !this.boxChecked('replace-local');
    if(erp && erb) {
      const
          p = MODEL.objectByName(erp.innerHTML),
          rname = erb.options[erb.selectedIndex].text,
          r = MODEL.objectByName(rname);
      if(p instanceof Product) {
        if(r instanceof Product) {
          MODEL.replaceProduct(p, r, global);
          md.hide();
        } else {
          UI.warn(`No product "${rname}"`);
        }
      } else {
        UI.warn(`No product "${erp.text}"`);
      }
    }
  }
  
} // END of class GUIController


/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-datamgr.js) provides the GUI functionality
for the Linny-R Dataset Manager dialog.

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

// CLASS GUIDatasetManager provides the dataset dialog functionality.
class GUIDatasetManager extends DatasetManager {
  constructor() {
    super();
    this.dialog = UI.draggableDialog('dataset');
    UI.resizableDialog('dataset', 'DATASET_MANAGER');
    // Make toolbar buttons responsive
    this.close_btn = document.getElementById('dataset-close-btn');
    this.close_btn.addEventListener(
        'click', (event) => UI.toggleDialog(event));
    document.getElementById('ds-new-btn').addEventListener(
         // Shift-click on New button => add prefix of selected dataset
         // (if any) to the name field of the dialog.
        'click', () => DATASET_MANAGER.promptForDataset(event.shiftKey));
    document.getElementById('ds-data-btn').addEventListener(
        'click', () => DATASET_MANAGER.editData());
    document.getElementById('ds-rename-btn').addEventListener(
        'click', () => DATASET_MANAGER.promptForName());
    document.getElementById('ds-clone-btn').addEventListener(
        'click', () => DATASET_MANAGER.cloneDataset());
    document.getElementById('ds-load-btn').addEventListener(
        'click', () => DATASET_MANAGER.load_csv_modal.show());
    document.getElementById('ds-delete-btn').addEventListener(
        'click', () => DATASET_MANAGER.deleteDataset());
    this.dataset_table = document.getElementById('dataset-table');
    // Data properties pane below the dataset scroll area.
    this.properties = document.getElementById('dataset-properties');
    // Number of prefixed datasets is displayed at bottom of left pane.
    this.prefixed_count = document.getElementById('dataset-prefixed-count');
    // Toggle buttons at bottom of dialog.
    this.blackbox = document.getElementById('dataset-blackbox');
    this.blackbox.addEventListener(
        'click', () => DATASET_MANAGER.toggleBlackBox());
    this.outcome = document.getElementById('dataset-outcome');
    this.outcome.addEventListener(
        'click', () => DATASET_MANAGER.toggleOutcome());
    this.io_box = document.getElementById('dataset-io');
    this.io_box.addEventListener(
        'click', () => DATASET_MANAGER.toggleImportExport());
    // Modifier pane buttons.
    document.getElementById('ds-add-modif-btn').addEventListener(
        'click', () => DATASET_MANAGER.promptForSelector('new'));
    document.getElementById('ds-rename-modif-btn').addEventListener(
        'click', () => DATASET_MANAGER.promptForSelector('rename'));
    document.getElementById('ds-edit-modif-btn').addEventListener(
        'click', () => DATASET_MANAGER.editExpression());
    document.getElementById('ds-delete-modif-btn').addEventListener(
        'click', () => DATASET_MANAGER.deleteModifier());
    document.getElementById('ds-convert-modif-btn').addEventListener(
        'click', () => DATASET_MANAGER.promptToConvertModifiers());
    // Modifier table.
    this.modifier_table = document.getElementById('dataset-modif-table');
    // Modal dialogs.
    this.new_modal = new ModalDialog('new-dataset');
    this.new_modal.ok.addEventListener(
        'click', () => DATASET_MANAGER.newDataset());
    this.new_modal.cancel.addEventListener(
        'click', () => DATASET_MANAGER.new_modal.hide());
    this.rename_modal = new ModalDialog('rename-dataset');
    this.rename_modal.ok.addEventListener(
        'click', () => DATASET_MANAGER.renameDataset());
    this.rename_modal.cancel.addEventListener(
        'click', () => DATASET_MANAGER.rename_modal.hide());
    this.load_csv_modal = new ModalDialog('load-csv');
    this.load_csv_modal.ok.addEventListener(
        'click', () => FILE_MANAGER.loadCSVFile());
    this.load_csv_modal.cancel.addEventListener(
        'click', () => DATASET_MANAGER.load_csv_modal.hide());
    this.conversion_modal = new ModalDialog('convert-modifiers');
    this.conversion_modal.ok.addEventListener(
        'click', () => DATASET_MANAGER.convertModifiers());
    this.conversion_modal.cancel.addEventListener(
        'click', () => DATASET_MANAGER.conversion_modal.hide());
    this.new_selector_modal = new ModalDialog('new-selector');
    this.new_selector_modal.ok.addEventListener(
        'click', () => DATASET_MANAGER.newModifier());
    this.new_selector_modal.cancel.addEventListener(
        'click', () => DATASET_MANAGER.new_selector_modal.hide());
    this.rename_selector_modal = new ModalDialog('rename-selector');
    this.rename_selector_modal.ok.addEventListener(
        'click', () => DATASET_MANAGER.renameModifier());
    this.rename_selector_modal.cancel.addEventListener(
        'click', () => DATASET_MANAGER.rename_selector_modal.hide());
    // The dataset time series dialog has more controls
    this.series_modal = new ModalDialog('series');
    this.series_modal.ok.addEventListener(
        'click', () => DATASET_MANAGER.saveSeriesData());
    this.series_modal.cancel.addEventListener(
        'click', () => DATASET_MANAGER.series_modal.hide());
    // Time-related controls must not be shown when array box is checked
    // NOTE: use timeout to permit checkbox to update its status first
    this.series_modal.element('array').addEventListener(
        'click', () => setTimeout(() => UI.toggle('series-no-time-msg'), 0));
    // When URL is entered, data is fetched from this URL
    this.series_modal.element('url').addEventListener(
        'blur', (event) => DATASET_MANAGER.getRemoteDataset(event.target.value));
    // The series data text area must update its status line
    this.series_data = this.series_modal.element('data');
    this.series_data.addEventListener(
        'keyup', () => DATASET_MANAGER.updateLine());
    this.series_data.addEventListener(
        'click', () => DATASET_MANAGER.updateLine());
    this.reset();
  }

  reset() {
    super.reset();
    this.selected_prefix_row = null;
    this.selected_dataset = null;
    this.selected_modifier = null;
    this.edited_expression = null;
    this.clicked_object = null;
    this.last_time_clicked = 0;
    this.focal_table = null;
    this.prefixed_datasets = [];
    this.expanded_rows = [];
  }
  
  doubleClicked(obj) {
    const
        now = Date.now(),
        dt = now - this.last_time_clicked;
    this.last_time_clicked = now;
    if(obj === this.clicked_object) {
      // Consider click to be "double" if it occurred less than 300 ms ago
      if(dt < 300) {
        this.last_time_clicked = 0;
        return true;
      }
    }
    this.clicked_object = obj;
    return false;
  }
  
  enterKey() {
    // Open "edit" dialog for the selected dataset or modifier expression.
    if(!this.focal_table) this.focal_table = this.dataset_table;
    const srl = this.focal_table.getElementsByClassName('sel-set');
    if(srl.length > 0) {
      const r = this.focal_table.rows[srl[0].rowIndex];
      if(r) {
        const e = new Event('click');
        if(this.focal_table === this.dataset_table) {
          // Emulate Alt-click in the table to open the time series dialog.
          e.altKey = true;
          r.dispatchEvent(e);
        } else if(this.focal_table === this.modifier_table) {
          // Emulate a double-click on the second cell to edit the expression.
          this.last_time_clicked = Date.now();
          r.cells[1].dispatchEvent(e);
        }
      }
    }
  }
  
  upDownKey(dir) {
    // Select row above or below the selected one (if possible).
    if(!this.focal_table) this.focal_table = this.dataset_table;
    const srl = this.focal_table.getElementsByClassName('sel-set');
    if(srl.length > 0) {
      let r = this.focal_table.rows[srl[0].rowIndex + dir];
      while(r && r.style.display === 'none') {
        r = (dir > 0 ? r.nextSibling : r.previousSibling);
      }
      if(r) {
        UI.scrollIntoView(r);
        // NOTE: cell, not row, listens for onclick event
        if(this.focal_table === this.modifier_table) r = r.cells[1];
        r.dispatchEvent(new Event('click'));
      }
    }
  }
  
  expandToShow(name) {
    // Expand all prefix rows for dataset having `name` so as to make it visible.
    const pn = UI.prefixesAndName(name);
    if(pn.length > 1) {
      pn.pop();
      while(pn.length) {
        addDistinct(pn.join(UI.PREFIXER).toLowerCase(), this.expanded_rows);
        pn.pop();
      }
      this.updateDialog();
    }
  }
  
  hideCollapsedRows() {
    // Hide all rows except top level and immediate children of expanded.
    for(const row of this.dataset_table.rows) {
      const
          // Get the first DIV in the first TD of this row.
          first_div = row.firstChild.firstElementChild,
          btn = first_div.dataset.prefix === 'x';
      let p = row.dataset.prefix,
          x = this.expanded_rows.indexOf(p) >= 0, 
          show = !p || x;
      if(btn) {
        const btn_div = row.getElementsByClassName('tree-btn')[0];
        // Special expand/collapse row.
        if(show) {
          // Set triangle to point down.
          btn_div.innerText = '\u25BC';
        } else {
          // Set triangle to point right. 
          btn_div.innerText = '\u25BA';
          // See whether "parent prefix" is expanded.
          p = p.split(UI.PREFIXER);
          p.pop();
          p = p.join(UI.PREFIXER);
          // If so, then also show the row.
          show = (!p || this.expanded_rows.indexOf(p) >= 0);
        }
      }
      row.style.display = (show ? 'block' : 'none');
    }
  }
  
  togglePrefixRow(e) {
    // Show list items of the next prefix level.
    let r = e.target;
    while(r.tagName !== 'TR') r = r.parentNode;
    const
        p = r.dataset.prefix,
        i = this.expanded_rows.indexOf(p);
    if(i >= 0) {
      this.expanded_rows.splice(i, 1);
      // Also remove all prefixes that have `p` as prefix.
      for(let j = this.expanded_rows.length - 1; j >= 0; j--) {
        if(this.expanded_rows[j].startsWith(p + UI.PREFIXER)) {
          this.expanded_rows.splice(j, 1);
        }
      }
    } else {
      addDistinct(p, this.expanded_rows);
    }
    this.hideCollapsedRows();
  }
  
  rowByPrefix(prefix) {
    // Return the first table row with the specified prefix.
    if(!prefix) return null;
    let lcp = prefix.toLowerCase(),
        pl = lcp.split(': ');
    // Remove trailing ': '
    if(lcp.endsWith(': ')) {
      pl.pop();
      lcp = pl.join(': ');
    }
    while(pl.length > 0) {
      addDistinct(pl.join(': '), this.expanded_rows);
      pl.pop();
    }
    this.hideCollapsedRows();
    for(const r of this.dataset_table.rows) if(r.dataset.prefix === lcp) return r;
    return null;
  }

  selectPrefixRow(e) {
    // Select expand/collapse prefix row.
    this.focal_table = this.dataset_table;
    // NOTE: `e` can also be a string specifying the prefix to select.
    let r = e.target || this.rowByPrefix(e);
    if(!r) return;
    // Modeler may have clicked on the expand/collapse triangle.
    const toggle = r.classList.contains('tree-btn');
    while(r.tagName !== 'TR') r = r.parentNode;
    this.selected_prefix_row = r;
    this.prefixed_datasets = MODEL.datasetKeysByPrefix(r.dataset.prefix);
    const sel = this.dataset_table.getElementsByClassName('sel-set');
    this.selected_dataset = null;
    if(sel.length > 0) {
      sel[0].classList.remove('sel-set');
      this.updatePanes();
    }
    r.classList.add('sel-set');
    if(!e.target) r.scrollIntoView({block: 'center'});
    if(toggle || e.altKey || this.doubleClicked(r)) this.togglePrefixRow(e);
    this.updatePanes();      
  }
  
  updateDialog() {
    const
        indent_px = 14,
        dl = [],
        dnl = [],
        sd = this.selected_dataset,
        ioclass = ['', 'import', 'export'];
    for(let d in MODEL.datasets) if(MODEL.datasets.hasOwnProperty(d)) {
      // NOTE: Do not list "black-boxed" entities or the equations dataset.
      if(!d.startsWith(UI.BLACK_BOX) &&
          MODEL.datasets[d] !== MODEL.equations_dataset) dnl.push(d);
    }
    dnl.sort((a, b) => UI.compareFullNames(a, b, true));
    // First determine indentation levels, prefixes and names.
    const
        indent = [],
        pref_ids = [],
        names = [],
        pref_names = {},
        xids = [];
    for(const dn of dnl) {
      const pref = UI.prefixesAndName(MODEL.datasets[dn].name);
      // NOTE: Only the name part (so no prefixes at all) will be shown.
      names.push(pref.pop());
      indent.push(pref.length);
      // NOTE: Ignore case but join again with ": " because prefixes
      // can contain any character; only the prefixer is "reserved".
      const pref_id = pref.join(UI.PREFIXER).toLowerCase();
      pref_ids.push(pref_id);
      pref_names[pref_id] = pref;
    }
    let sdid = 'dstr',
        prev_id = '',
        ind_div = '';
    for(let i = 0; i < dnl.length; i++) {
      const
          d = MODEL.datasets[dnl[i]],
          pid = pref_ids[i];
      if(indent[i]) {
        ind_div = '<div class="ds-indent" style="width: ' +
            indent[i] * indent_px + 'px">\u25B9</div>';
      } else {
        ind_div = '';
      }
      // NOTE: Empty string should not add a collapse/expand row.
      if(pid && pid != prev_id && xids.indexOf(pid) < 0) {
        // NOTE: XX: aa may be followed by XX: YY: ZZ: bb, which requires
        // *two* collapsable lines: XX: YY and XX: YY: ZZ: before adding
        // XX: YY: ZZ: bb.
        const
            ps = pid.split(UI.PREFIXER),
            pps = prev_id.split(UI.PREFIXER),
            pn = pref_names[pid],
            pns = pn.join(UI.PREFIXER),
            lpl = [];
        let lindent = 0;
        // Ignore identical leading prefixes.
        while(ps.length > 0 && pps.length > 0 && ps[0] === pps[0]) {
          lpl.push(ps.shift());
          pps.shift();
          pn.shift();
          lindent++;
        }
        // Add a "collapse" row for each new prefix.
        while(ps.length > 0) {
          lpl.push(ps.shift());
          lindent++;
          const lpid = lpl.join(UI.PREFIXER);
          dl.push(['<tr data-prefix="', lpid,
              '" data-prefix-name="', pns.slice(0, lpid.length), '" class="dataset"',
              'onclick="DATASET_MANAGER.selectPrefixRow(event);"><td>',
              // NOTE: data-prefix="x" signals that this is an extra row
              (lindent > 0 ?
                  '<div data-prefix="x" style="width: ' + lindent * indent_px +
                  'px"></div>' :
                  ''),
              '<div data-prefix="x" class="tree-btn">',
              (this.expanded_rows.indexOf(lpid) >= 0 ? '\u25BC' : '\u25BA'),
              '</div>', pn.shift(), '</td></tr>'].join(''));
          // Add to the list to prevent multiple c/x-rows for the same prefix.
          xids.push(lpid);
        }
      }
      prev_id = pid;
      let cls = ioclass[MODEL.ioType(d)];
      if(d.outcome) {
        cls += ' outcome';
      } else if(d.array) {
        cls += ' array';
      } else if(d.data.length > 0) {
        cls += ' series';
      }
      if(Object.keys(d.modifiers).length > 0) cls += ' modif';
      if(d.black_box) cls += ' blackbox';
      cls = cls.trim();
      if(cls) cls = ' class="' + cls + '"';
      if(d === sd) sdid += i;
      dl.push(['<tr id="dstr', i, '" class="dataset',
          (d === sd ? ' sel-set' : ''),
          (d.default_selector ? ' def-sel' : ''),
          '" data-prefix="', pid,
          '" onclick="DATASET_MANAGER.selectDataset(event, \'',
          dnl[i], '\');" onmouseover="DATASET_MANAGER.showInfo(\'', dnl[i],
          '\', event.shiftKey);"><td>', ind_div, '<div', cls, '>',
          names[i], '</td></tr>'].join(''));
    }
    this.dataset_table.innerHTML = dl.join('');
    this.hideCollapsedRows();
    const e = document.getElementById(sdid);
    if(e) UI.scrollIntoView(e);
    this.updatePanes();
  }
  
  updatePanes() {
    const
        sd = this.selected_dataset,
        btns = 'ds-data ds-clone ds-delete ds-rename';
    if(sd) {
      this.prefixed_count.style.display = 'none';
      this.properties.style.display = 'block';
      document.getElementById('dataset-default').innerHTML =
          VM.sig4Dig(sd.default_value) +
              (sd.scale_unit === '1' ? '' : '&nbsp;' + sd.scale_unit);
      document.getElementById('dataset-count').innerHTML = sd.data.length;
      document.getElementById('dataset-special').innerHTML = sd.propertiesString;
      if(sd.data.length > 0) {
        document.getElementById('dataset-min').innerHTML = VM.sig4Dig(sd.min);
        document.getElementById('dataset-max').innerHTML = VM.sig4Dig(sd.max);
        document.getElementById('dataset-mean').innerHTML = VM.sig4Dig(sd.mean);
        document.getElementById('dataset-stdev').innerHTML =
            VM.sig4Dig(sd.standard_deviation);
        document.getElementById('dataset-stats').style.display = 'block';
      } else {
        document.getElementById('dataset-stats').style.display = 'none';
      }
      if(sd.black_box) {
        this.blackbox.classList.remove('off');
        this.blackbox.classList.add('on');
      } else {
        this.blackbox.classList.remove('on');
        this.blackbox.classList.add('off');
      }
      if(sd.outcome) {
        this.outcome.classList.remove('not-selected');
      } else {
        this.outcome.classList.add('not-selected');
      }
      UI.setImportExportBox('dataset', MODEL.ioType(sd));
      UI.enableButtons(btns);
    } else {
      this.properties.style.display = 'none';
      const
          pdsl = this.prefixed_datasets.length,
          npds = pluralS(pdsl, 'dataset');
      this.prefixed_count.innerText = npds;
      this.prefixed_count.style.display = (pdsl ? 'block' : 'none');
      UI.disableButtons(btns);
      if(this.selected_prefix_row) {
        UI.enableButtons('ds-rename ds-delete', true);
        document.getElementById('ds-rename-btn')
            .title = `Rename ${npds} by changing prefix "${this.selectedPrefix}"`;
        document.getElementById('ds-delete-btn')
            .title = `Delete ${npds} having prefix "${this.selectedPrefix}"`;        
      } else {
        document.getElementById('ds-rename-btn').title = 'Rename selected dataset';
        document.getElementById('ds-delete-btn').title = 'Delete selected dataset';
      }
    }
    this.updateModifiers();
  }
  
  updateModifiers() {
    const
        sd = this.selected_dataset,
        hdr = document.getElementById('dataset-modif-header'),
        name = document.getElementById('dataset-modif-ds-name'),
        ttls = document.getElementById('dataset-modif-titles'),
        mbtns = document.getElementById('dataset-modif-buttons'),
        msa = document.getElementById('dataset-modif-scroll-area');
    if(!sd) {
      hdr.innerText = '(no dataset selected)';
      name.style.display = 'none';
      ttls.style.display = 'none';
      msa.style.display = 'none';
      mbtns.style.display = 'none';
      return;
    }
    hdr.innerText = 'Modifiers of';
    name.innerHTML = sd.displayName;
    name.style.display = 'block';
    const
        ml = [],
        msl = sd.selectorList,
        sm = this.selected_modifier;
    let smid = 'dsmtr';
    for(let i = 0; i < msl.length; i++) {
      const
          m = sd.modifiers[UI.nameToID(msl[i])],
          wild = m.hasWildcards,
          defsel = (m.selector === sd.default_selector),
          issue = (m.expression.compile_issue ? ' compile-issue' :
              (m.expression.compute_issue ? ' compute-issue' : '')),
          clk = '" onclick="DATASET_MANAGER.selectModifier(event, \'' +
              m.selector + '\'';
      if(m === sm) smid += i;
      ml.push(['<tr id="dsmtr', i, '" class="dataset-modif',
          (m === sm ? ' sel-set' : ''),
          '"><td class="dataset-selector', issue,
          (wild ? ' wildcard' : ''),
          '" title="Shift-click to ', (defsel ? 'clear' : 'set as'),
          ' default modifier',
          clk, ', false);">',
          (defsel ? '<img src="images/solve.png" style="height: 14px;' +
              ' width: 14px; margin: 0 1px -3px -1px;">' : ''),
          (wild ? wildcardFormat(m.selector, true) : m.selector),
          '</td><td class="dataset-expression', issue,
          (issue ? '"title="' +
              safeDoubleQuotes(m.expression.compile_issue ||
                  m.expression.compute_issue) : ''),
          clk, ');">', m.expression.text, '</td></tr>'].join(''));
    }
    this.modifier_table.innerHTML = ml.join('');
    ttls.style.display = 'block';
    msa.style.display = 'block';
    mbtns.style.display = 'block';
    if(sm) UI.scrollIntoView(document.getElementById(smid));
    const btns = 'ds-rename-modif ds-edit-modif ds-delete-modif';
    if(sm) {
      UI.enableButtons(btns);
    } else {
      UI.disableButtons(btns);
    }
    // Check if dataset appears to "misuse" dataset modifiers
    const
        pml = sd.inferPrefixableModifiers,
        e = document.getElementById('ds-convert-modif-btn');
    if(pml.length > 0) {
      e.style.display = 'inline-block';
      e.title = 'Convert '+ pluralS(pml.length, 'modifier') +
          ' to prefixed dataset(s)';
    } else {
      e.style.display = 'none'; 
    }
  }
  
  showInfo(id, shift) {
    // Display documentation for the dataset having identifier `id`
    const d = MODEL.datasets[id];
    if(d) DOCUMENTATION_MANAGER.update(d, shift);
  }
  
  selectDataset(event, id) {
    // Select dataset, or edit it when Alt- or double-clicked.
    this.focal_table = this.dataset_table;
    const
        d = MODEL.datasets[id] || null,
        edit = event.altKey || this.doubleClicked(d);
    this.selected_dataset = d;
    this.prefixed_datasets.length = 0;
    if(d && edit) {
      this.last_time_clicked = 0;
      this.editData();
      return;
    }
    // NOTE: Updating entire dialog may be very time-consuming
    // when model contains numerous prefixed datasets.
    this.updatePanes();
    // NOTE: The selected row now has to be highlighted, as the table
    // HTML is not changed.
    let r = event.target;
    while(r && r.tagName !== 'TR') r = r.parentNode;
    const sel = this.dataset_table.getElementsByClassName('sel-set');
    if(sel.length > 0) sel[0].classList.remove('sel-set');
    r.classList.add('sel-set');
  }
  
  selectModifier(event, id, x=true) {
    // Select modifier, or when double-clicked, edit its expression when
    // x = TRUE, or the name of the modifier when x = FALSE.
    this.focal_table = this.modifier_table;
    if(this.selected_dataset) {
      const m = this.selected_dataset.modifiers[UI.nameToID(id)],
            edit = event.altKey || this.doubleClicked(m);
      if(event.shiftKey) {
        // NOTE: prepare to update HTML class of selected dataset
        const el = this.dataset_table.getElementsByClassName('sel-set')[0];
        // Toggle dataset default selector
        if(m.selector === this.selected_dataset.default_selector) {
          this.selected_dataset.default_selector = '';
          el.classList.remove('def-sel');
        } else {
          this.selected_dataset.default_selector = m.selector;
          el.classList.add('def-sel');
        }
      }
      this.selected_modifier = m;
      if(edit) {
        this.last_time_clicked = 0;
        if(x) {
          this.editExpression();
        } else {
          this.promptForSelector('rename');
        }
        return;
      }
    } else {
      this.selected_modifier = null;
    } 
    this.updateModifiers();
  }
  
  get selectedPrefix() {
    // Returns the selected prefix (with its trailing colon-space)
    const tr = this.selected_prefix_row;
    if(tr && tr.dataset.prefixName) return tr.dataset.prefixName + UI.PREFIXER;
    return '';
  }
  
  promptForDataset(shift=false) {
    // Shift signifies: add prefix of selected dataset (if any) to
    // the name field of the dialog
    let prefix = '';
    if(shift) {
      if(this.selected_dataset) {
        prefix = UI.completePrefix(this.selected_dataset.name);
      } else if(this.selected_prefix) {
        prefix = this.selectedPrefix;
      }
    }
    this.new_modal.element('name').value = prefix;
    this.new_modal.show('name');
  }
  
  newDataset() {
    const n = this.new_modal.element('name').value.trim(),
          d = MODEL.addDataset(n);
    if(d) {
      this.new_modal.hide();
      this.selected_dataset = d;
      this.focal_table = this.dataset_table;
      this.updateDialog();
    }
  }
  
  promptForName() {
    // Prompts the modeler for a new name for the selected dataset (if any)
    if(this.selected_dataset) {
      this.rename_modal.element('title').innerText = 'Rename dataset';
      this.rename_modal.element('name').value =
          this.selected_dataset.displayName;
      this.rename_modal.show('name');
    } else if(this.selected_prefix_row) {
      this.rename_modal.element('title').innerText = 'Rename datasets by prefix';
      this.rename_modal.element('name').value = this.selectedPrefix.slice(0, -2);
      this.rename_modal.show('name');
    }
  }
  
  renameDataset() {
    // Change the name of the selected dataset.
    if(this.selected_dataset) {
      const
          inp = this.rename_modal.element('name'),
          n = UI.cleanName(inp.value);
      // Show modeler the "cleaned" new name.
      inp.value = n;
      // Then try to rename -- this may generate a warning.
      if(this.selected_dataset.rename(n)) {
        this.rename_modal.hide();
        if(EXPERIMENT_MANAGER.selected_experiment) {
          EXPERIMENT_MANAGER.selected_experiment.inferVariables();
        }
        UI.updateControllerDialogs('CDEFJX');
      }
    } else if(this.selected_prefix_row) {
      // Create a list of datasets to be renamed.
      let e = this.rename_modal.element('name'),
          prefix = e.value.trim();
      e.focus();
      // Trim trailing colon if user added it.
      while(prefix.endsWith(':')) prefix = prefix.slice(0, -1);
      // NOTE: Prefix may be empty string, but otherwise should be a
      // valid name.
      if(prefix && !UI.validName(prefix)) {
        UI.warn('Invalid prefix');
        return;
      }
      // Now add the colon-plus-space prefix separator.
      prefix += UI.PREFIXER;
      // Perform the renaming operation.
      if(MODEL.renamePrefixedDatasets(this.selectedPrefix, prefix)) {
        this.selectPrefixRow(prefix);
      }
    }
    this.rename_modal.hide();
  }

  cloneDataset() {
    // Create a new dataset that is identical to the current one
    if(this.selected_dataset) {
      const d = this.selected_dataset;
      let nn = d.name + '-copy';
      while(MODEL.objectByName(nn)) {
        nn += '-copy';
      }
      const nd = MODEL.addDataset(nn);
      // Copy properties of d to nd
      nd.comments = `${d.comments}`;
      nd.default_value = d.default_value;
      nd.scale_unit = d.scale_unit;
      nd.time_scale = d.time_scale;
      nd.time_unit = d.time_unit;
      nd.method = d.method;
      nd.periodic = d.periodic;
      nd.outcome = d.outcome;
      nd.array = d.array;
      nd.url = d.url;
      nd.data = d.data.slice();
      for(let s in d.modifiers) if(d.modifiers.hasOwnProperty(s)) {
        const
            m = d.modifiers[s],
            nm = nd.addModifier(m.selector);
        nm.expression = new Expression(nd, s, m.expression.text);
      }
      nd.resetExpressions();
      nd.computeStatistics();
      this.selected_dataset = nd;
      this.updateDialog();
    }    
  }
  
  get selectedAsList() {
    // Return list of datasets selected directly or by prefix.
    const dsl = [];
    // Prevent including the equations dataset (just in case).
    if(this.selected_dataset && this.selected_dataset !== MODEL.equations_dataset) {
      dsl.push(this.selected_dataset);
    } else {
      // NOTE: List of prefixed datasets contains keys, not objects.
      for(const k of this.prefixed_datasets) {
        const ds = MODEL.datasets[k];
        if(ds !== MODEL.equations_dataset) dsl.push();
      }
    }
    return dsl;
  }

  deleteDataset() {
    // Delete selected dataset(s).
    for(const ds of this.selectedAsList) {
      MODEL.removeImport(ds);
      MODEL.removeExport(ds);
      delete MODEL.datasets[ds.identifier];
    }
    this.selected_dataset = null;
    this.prefixed_datasets.length = 0;
    this.updateDialog();
    MODEL.updateDimensions();      
  }
  
  toggleBlackBox() {
    const d = this.selected_dataset;
    if(d) {
      d.black_box = !d.black_box;
      this.updateDialog();
    }
  }
  
  toggleOutcome() {
    const d = this.selected_dataset;
    if(d) {
      // NOTE: arrays cannot be outcomes
      if(d.array) {
        d.outcome = false;
      } else {
        d.outcome = !d.outcome;
      }
      this.updateDialog();
      if(!UI.hidden('experiment-dlg')) EXPERIMENT_MANAGER.updateDialog();
    }
  }
  
  toggleImportExport() {
    const d = this.selected_dataset;
    if(d) {
      MODEL.ioUpdate(d, (MODEL.ioType(d) + 1) % 3);
      this.updateDialog();
    }
  }
  
  promptForSelector(dlg) {
    let ms = '',
        md = this.new_selector_modal;
    if(dlg === 'rename') {
      if(this.selected_modifier) ms = this.selected_modifier.selector;
      md = this.rename_selector_modal;
    }
    md.element('type').innerText = 'dataset modifier';
    md.element('name').value = ms;
    md.show('name');
  }

  newModifier() {
    const md = this.new_selector_modal;
    // NOTE: Selector modal is also used by constraint editor.
    if(md.element('type').innerText !== 'dataset modifier') return;
    const
        sel = md.element('name').value,
        m = this.selected_dataset.addModifier(sel);
    if(m) {
      this.selected_modifier = m;
      // NOTE: update dimensions only if dataset now has 2 or more modifiers
      // (ignoring those with wildcards)
      const sl = this.selected_dataset.plainSelectors;
      if(sl.length > 1) MODEL.expandDimension(sl);
      md.hide();
      this.updateModifiers();
    }
  }
  
  renameModifier() {
    if(!this.selected_modifier) return;
    const md = this.rename_selector_modal;
    // NOTE: Selector modal is also used by constraint editor.
    if(md.element('type').innerText !== 'dataset modifier') return;
    const
        wild = this.selected_modifier.hasWildcards,
        sel = md.element('name').value,
        // NOTE: Normal dataset selector, so remove all invalid characters.
        clean_sel = sel.replace(/[^a-zA-z0-9\%\+\-\?\*]/g, ''),
        // Keep track of old name
        oldm = this.selected_modifier,
        // NOTE: addModifier returns existing one if selector not changed.
        m = this.selected_dataset.addModifier(clean_sel);
    // NULL can result when new name is invalid
    if(!m) return;
    // If selected modifier was the dataset default selector, update it.
    if(oldm.selector === this.selected_dataset.default_selector) {
      this.selected_dataset.default_selector = m.selector;
    }
    MODEL.renameSelectorInExperiments(oldm.selector, clean_sel);
    // If only case has changed, just update the selector.
    if(m === oldm) {
      m.selector = clean_sel;
      this.updateDialog();
      md.hide();
      return;
    }
    // Rest is needed only when a new modifier has been added.
    m.expression = oldm.expression;
    if(wild) {
      // Wildcard selector means: recompile the modifier expression.
      m.expression.attribute = m.selector;
      m.expression.compile();
    }
    this.deleteModifier();
    this.selected_modifier = m;
    // Update all chartvariables referencing this dataset + old selector.
    const vl = MODEL.datasetVariables;
    let cv_cnt = 0;
    for(const v of vl) {
      if(v.object === this.selected_dataset && v.attribute === oldm.selector) {
        v.attribute = m.selector;
        cv_cnt++;
      }
    }
    // Also replace old selector in all expressions (count these as well).
    const xr_cnt = MODEL.replaceAttributeInExpressions(
        oldm.dataset.name + '|' + oldm.selector, m.selector);
    // Notify modeler of changes (if any).
    const msg = [];
    if(cv_cnt) msg.push(pluralS(cv_cnt, ' chart variable'));
    if(xr_cnt) msg.push(pluralS(xr_cnt, ' expression variable'));
    if(msg.length) {
      UI.notify('Updated ' +  msg.join(' and '));
      // Also update these stay-on-top dialogs, as they may display a
      // variable name for this dataset + modifier.
      UI.updateControllerDialogs('CDEFJX');
    }
    // NOTE: Update dimensions only if dataset now has 2 or more modifiers
    // (ignoring those with wildcards).
    const sl = this.selected_dataset.plainSelectors;
    if(sl.length > 1) MODEL.expandDimension(sl);
    md.hide();
    this.updateModifiers();
  }
  
  editExpression() {
    const m = this.selected_modifier;
    if(m) {
      this.edited_expression = m.expression;
      const md = UI.modals.expression;
      md.element('property').innerHTML = this.selected_dataset.displayName +
          UI.OA_SEPARATOR + m.selector;
      md.element('text').value = m.expression.text;
      document.getElementById('variable-obj').value = 0;
      X_EDIT.updateVariableBar();
      X_EDIT.clearStatusBar();
      md.show('text');
    }
  }

  modifyExpression(x) {
    // Update and compile expression only if it has been changed
    if (x != this.edited_expression.text) {
      this.edited_expression.text = x;
      this.edited_expression.compile();
    }
    this.edited_expression.reset();
    this.edited_expression = null;
    this.updateModifiers();
  }

  deleteModifier() {
    // Delete modifier from selected dataset
    const m = this.selected_modifier;
    if(m) {
      // If it was the dataset default modifier, clear the default
      if(m.selector === this.selected_dataset.default_selector) {
        this.selected_dataset.default_selector = '';
      }
      // Then simply remove the object
      delete this.selected_dataset.modifiers[UI.nameToID(m.selector)];
      this.selected_modifier = null;
      this.updateModifiers();
      MODEL.updateDimensions();
    }
  }

  promptToConvertModifiers() {
    // Convert modifiers of selected dataset to new prefixed datasets
    const
        ds = this.selected_dataset,
        md = this.conversion_modal;
    if(ds) {
      md.element('prefix').value = ds.displayName;
      md.show('prefix');
    }
  }
  
  convertModifiers() {
    // Convert modifiers of selected dataset to new prefixed datasets
    if(!this.selected_dataset) return;
    const
        ds = this.selected_dataset,
        md = this.conversion_modal,
        e = md.element('prefix');
    let prefix = e.value.trim(),
        vcount = 0;
    e.focus();
    while(prefix.endsWith(':')) prefix = prefix.slice(0, -1);
    // NOTE: prefix may be empty string, but otherwise should be a valid name
    if(!UI.validName(prefix)) {
      UI.warn('Invalid prefix');
      return;
    }
    prefix += UI.PREFIXER;
    const dsn = ds.displayName;
    for(const m of ds.inferPrefixableModifiers) {
      // Create prefixed dataset with correct default value
      const
          sel = m.selector,
          newds = MODEL.addDataset(prefix + sel);
      if(newds) {
        // Retain properties of the "parent" dataset
        newds.scale_unit = ds.scale_unit;
        newds.time_scale = ds.time_scale;
        newds.time_unit = ds.time_unit;
        // Set modifier's expression result as default value
        newds.default_value = m.expression.result(1);
        // Remove the modifier from the dataset
        delete ds.modifiers[UI.nameToID(sel)];
        // If it was the dataset default modifier, clear this default
        if(sel === ds.default_selector) ds.default_selector = '';
        // Rename variable in charts
        const
            from = dsn + UI.OA_SEPARATOR + sel,
            to = newds.displayName;
        for(const v of MODEL.datasetVariables) {
          // NOTE: variable should match original dataset + selector.
          if(v.displayName === from) {
            // Change to new dataset WITHOUT selector.
            v.object = newds;
            v.attribute = '';
            vcount++;
          }
        }
        // Rename variable in the Sensitivity Analysis.
        for(let j = 0; j < MODEL.sensitivity_parameters.length; j++) {
          if(MODEL.sensitivity_parameters[j] === from) {
            MODEL.sensitivity_parameters[j] = to;
            vcount++;
          }
        }
        for(let j = 0; j < MODEL.sensitivity_outcomes.length; j++) {
          if(MODEL.sensitivity_outcomes[j] === from) {
            MODEL.sensitivity_outcomes[j] = to;
            vcount++;
          }
        }
        // Rename variable in expressions and notes
        const re = new RegExp(
            // Handle multiple spaces between words
            '\\[\\s*' + escapeRegex(from).replace(/\s+/g, '\\s+')
            // Handle spaces around the separator |
            .replace('\\|', '\\s*\\|\\s*') +
            // Pattern ends at any character that is invalid for a
            // dataset modifier selector (unlike equation names)
            '\\s*[^a-zA-Z0-9\\+\\-\\%\\_]', 'gi');
        for(const x of MODEL.allExpressions) {
          const matches = x.text.match(re);
          if(matches) {
            for(let k = 0; k < matches.length; k++) {
              // NOTE: each match will start with the opening bracket,
              // but end with the first "non-selector" character, which
              // will typically be ']', but may also be '@' (and now that
              // units can be converted, also the '>' of the arrow '->')
              x.text = x.text.replace(matches[k], '[' + to + matches[k].slice(-1));
              vcount ++;
            }
            // Force recompilation
            x.code = null;
          }
        }
        for(const n of MODEL.notesWithTags) {
          const matches = n.contents.match(re);
          if(matches) {
            for(let k = 0; k < matches.length; k++) {
              // See NOTE above for the use of `slice` here
              n.contents = n.contents.replace(matches[k], '[' + to + matches[k].slice(-1));
              vcount ++;
            }
            // Note fields must be parsed again
            n.parsed = false;
          }
        }
      }
    }
    if(vcount) UI.notify('Renamed ' + pluralS(vcount, 'variable') +
        ' throughout the model');
    // Delete the original dataset unless it has series data
    if(ds.data.length === 0) this.deleteDataset();
    MODEL.updateDimensions();
    this.selected_dataset = null;
    this.selected_prefix_row = null;
    this.updateDialog();
    md.hide();
    this.selectPrefixRow(prefix);
  }

  updateLine() {
    const
        ln =  document.getElementById('series-line-number'),
        lc =  document.getElementById('series-line-count');
    ln.innerHTML = this.series_data.value.substring(0,
        this.series_data.selectionStart).split('\n').length;
    lc.innerHTML = this.series_data.value.split('\n').length;
  }
  
  editData() {
    // Show the Edit time series dialog.
    const
        ds = this.selected_dataset,
        md = this.series_modal,
        cover = md.element('no-time-msg');
    if(ds) {
      md.element('default').value = ds.default_value;
      md.element('unit').value = ds.scale_unit;
      cover.style.display = (ds.array ? 'block' : 'none');
      md.element('time-scale').value = VM.sig4Dig(ds.time_scale);
      // Add options for time unit selector.
      const ol = [];
      for(let u in VM.time_unit_shorthand) {
        if(VM.time_unit_shorthand.hasOwnProperty(u)) {
          ol.push(['<option value="', u,
              (u === ds.time_unit ? '" selected="selected' : ''),
              '">', VM.time_unit_shorthand[u], '</option>'].join(''));
        }
      }
      md.element('time-unit').innerHTML = ol.join('');
      // Add options for(dis)aggregation method selector.
      ol.length = 0;
      for(let i = 0; i < this.methods.length; i++) {
        ol.push(['<option value="', this.methods[i],
            (this.methods[i] === ds.method ? '" selected="selected' : ''),
            '">', this.method_names[i], '</option>'].join(''));
      }
      md.element('method').innerHTML = ol.join('');
      // Update the "periodic" box.
      UI.setBox('series-periodic', ds.periodic);
      // Update the "array" box.
      UI.setBox('series-array', ds.array);
      md.element('url').value = ds.url;
      // Show data as decimal numbers (JS default notation) on separate lines.
      this.series_data.value = ds.data.join('\n');
      md.show('default');
    }
  }
  
  saveSeriesData() {
    const ds = this.selected_dataset;
    if(!ds) return false;
    const dv = UI.validNumericInput('series-default', 'default value');
    if(dv === false) return false;
    const ts = UI.validNumericInput('series-time-scale', 'time scale');
    if(ts === false) return false;
    // NOTE: Trim textarea value as it typically has trailing newlines
    let lines = this.series_data.value.trim();
    if(lines) {
      lines = lines.split('\n');
    } else {
      lines = [];
    }
    let n,
        data = [];
    for(let i = 0; i < lines.length; i++) {
      // consider comma's to denote the decimal period
      const txt = lines[i].trim().replace(',', '.');
      // consider blank lines as "no data" => replace by default value
      if(txt === '') {
        n = dv;
      } else {
        n = parseFloat(txt);
        if(isNaN(n) || '0123456789'.indexOf(txt[txt.length - 1]) < 0) {
          UI.warn(`Invalid number "${txt}" at line ${i + 1}`);
          return false;
        }
      }
      data.push(n);
    }
    // Save the data
    ds.default_value = dv;
    ds.changeScaleUnit(this.series_modal.element('unit').value);
    ds.time_scale = ts;
    ds.time_unit = this.series_modal.element('time-unit').value;
    ds.method = this.series_modal.element('method').value;
    ds.periodic = UI.boxChecked('series-periodic');
    ds.array = UI.boxChecked('series-array');
    if(ds.array) ds.outcome = false;
    ds.url = this.series_modal.element('url').value;
    ds.data = data;
    ds.computeVector();
    ds.computeStatistics();
    if(ds.data.length === 0 && !ds.array &&
        Object.keys(ds.modifiers).length > 0 &&
        ds.timeStepDuration !== MODEL.timeStepDuration) {
      UI.notify('Dataset time scale only affects time series data; ' +
          'modifier expressions evaluate at model time scale');
    }
    this.series_modal.hide();
    this.updateDialog();
  }
  
  readCSVData(text) {
    // Parse text from uploaded file and create or overwrite datasets.
    const
        lines = text.trim().split(/\n/),
        n = lines.length;
    if(n < 2) {
      UI.warn('Data must have at least 2 lines: dataset names and default values');
      return false;
    }
    // Infer most likely delimiter.
    const
        tabs = text.split('\t').length - 1,
        tab0 = lines[0].split('\t').length - 1,
        tab1 = lines[1].split('\t').length - 1,
        semic0 = lines[0].split(';').length - 1,
        semics = text.split(';').length - 1 - semic0;
    let sep = '\t';
    if(!tabs || tab0 !== tab1) {
      // Tab is most likely NOT the separator.
      sep = (semics ? ';' : ',');
    }
    const
        parts = lines[0].split(sep),
        dsn = [];
    let quoted = false;
    for(const p of parts) {
      const
          swq = /^\"(\"\")*($|[^\"])/.test(p),
          ewq = p.endsWith('"');
      if(!quoted && swq && !ewq) {
        dsn.push(p);
        quoted = true;
      } else if(quoted) {
        dsn[dsn.length - 1] += sep + p;
        quoted = !ewq;
      } else {
        dsn.push(p);
      }
    }
    for(let i = 0; i < dsn.length; i++) {
      const n = UI.cleanName(unquoteCSV(dsn[i].trim()));
      if(!UI.validName(n)) {
        UI.warn(`Invalid dataset name "${n}" in column ${i}`);
        return false;
      }
      dsn[i] = n;
    }
    const
        ncol = dsn.length,
        dsa = [],
        dsdv = lines[1].split(sep);
    if(dsdv.length !== ncol) {
      UI.warn(`Number of default values (${dsdv.length}) does not match number of dataset names (${ncol})`);
      return false;
    }
    for(let i = 0; i < dsdv.length; i++) {
      const
          v = dsdv[i].trim(),
          sf = safeStrToFloat(v, NaN);
      if(isNaN(sf)) {
        UI.warn(`Invalid default value "${v}" in column ${i}`);
        return false;
      } else {
        // Push empty list, as this will become the actual dataset without default value.
        dsa.push([]);
      }
    }
    for(let i = 2; i < n; i++) {
      const dsv = lines[i].trim().split(sep);
      if(dsv.length !== ncol) {
        UI.warn(`Number of values (${dsv.length}) on line ${i} does not match number of dataset names (${ncol})`);
        return false;
      }
      for(let j = 0; j < ncol; j++) {
        const
            v = dsv[j].trim(),
            sf = safeStrToFloat(v, NaN);
        // NOTE: Ignore empty strings, but this may "shift up" numerical values on later rows.
        if(isNaN(sf) && v !== '') {
          UI.warn(`Invalid numerical value "${v}" for <strong>${dsn[j]}</strong> on line ${i}`);
          return false;
        } else if(!isNaN(sf)) {
          dsa[j].push(sf);
        }
      }
    }
    // Add or update datasets.
    let added = 0,
        updated = 0;
    for(let i = 0; i < dsn.length; i++) {
      const
          n = dsn[i],
          id = UI.nameToID(n),
          ods = MODEL.namedObjectByID(id),
          ds = ods || MODEL.addDataset(n);
      // NOTE: `ds` will now be either a new dataset or an existing one.
      if(ds instanceof Dataset) {
        // Keep track of added/updated datasets.
        const
            odv = ds.default_value,
            odata = ds.dataString;
        ds.default_value = safeStrToFloat(dsdv[i], 0);
        ds.data = dsa[i];
        if(ods) {
          if(ds.default_value !== odv || odata !== ds.dataString) updated++;
        } else {
          added++;
        }
        ds.computeStatistics();
      } else if(ds && ds.type) {
        UI.warn(`Name conflict: ${ds.type} "${ds.displayName}" already exists`);
      } else {
        UI.alert(`No dataset "${n}" added`);
      }
    }
    // Notify modeler of changes (if any).
    let msg = 'No datasets added or updated';
    if(added) {
      msg = pluralS(added, 'dataset') + ' added';
      if(updated) msg += ', ' + pluralS(updated, 'dataset') + ' updated';
    } else if(updated) {
      msg = pluralS(updated, 'dataset') + ' updated';
    }
    UI.notify(msg);
    this.updateDialog();
    return true;
  }
  
} // END of class GUIDatasetManager

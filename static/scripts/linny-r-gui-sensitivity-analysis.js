/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-sensitivity.js) provides the functionality
for the Linny-R Sensitivity Analysis dialog.

*/

/*
Copyright (c) 2017-2024 Delft University of Technology

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

// CLASS GUISensitivityAnalysis implements the GUI for the parent class
// SensitivityAnalysis defined in file `linny-r-ctrl.js`
class GUISensitivityAnalysis extends SensitivityAnalysis {
  constructor() {
    super();
    this.dialog = UI.draggableDialog('sensitivity');
    UI.resizableDialog('sensitivity', 'SENSITIVITY_ANALYSIS');
    this.close_btn = document.getElementById('sensitivity-close-btn');
    this.close_btn.addEventListener('click', (e) => UI.toggleDialog(e));
    // Control panel accepts drag/drop of entities
    this.control_panel = document.getElementById('sensitivity-control-panel');
    this.control_panel.addEventListener(
        'dragover', (event) => SENSITIVITY_ANALYSIS.dragOver(event));
    this.control_panel.addEventListener(
        'drop', (event) => SENSITIVITY_ANALYSIS.handleDrop(event));
    this.base_selectors = document.getElementById('sa-base-selectors');
    this.base_selectors.addEventListener('mouseover',
        (event) => SENSITIVITY_ANALYSIS.showSelectorInfo(event.shiftKey));
    this.base_selectors.addEventListener(
        'focus', () => SENSITIVITY_ANALYSIS.editBaseSelectors());
    this.base_selectors.addEventListener(
        'blur', () => SENSITIVITY_ANALYSIS.setBaseSelectors());

    this.delta = document.getElementById('sensitivity-delta');
    this.delta.addEventListener(
        'focus', () => SENSITIVITY_ANALYSIS.editDelta());
    this.delta.addEventListener(
        'blur', () => SENSITIVITY_ANALYSIS.setDelta());
    
    // NOTE: both the base selectors and the delta input blur on Enter  
    const blurf = (event) => { if(event.key === 'Enter') event.target.blur(); };
    this.base_selectors.addEventListener('keyup', blurf);
    this.delta.addEventListener('keyup', blurf);
    
    // Make parameter buttons responsive
    document.getElementById('sa-p-add-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.promptForParameter());
    document.getElementById('sa-p-up-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.moveParameter(-1));
    document.getElementById('sa-p-down-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.moveParameter(1));
    document.getElementById('sa-p-delete-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.deleteParameter());
    // Make outcome buttons responsive
    document.getElementById('sa-o-add-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.promptForOutcome());
    document.getElementById('sa-o-up-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.moveOutcome(-1));
    document.getElementById('sa-o-down-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.moveOutcome(1));
    document.getElementById('sa-o-delete-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.deleteOutcome());
    // The toggle button to hide/show the control panel
    this.toggle_chevron = document.getElementById('sa-toggle-chevron');
    this.toggle_chevron.addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.toggleControlPanel());

    // The display panel and its buttons
    this.display_panel = document.getElementById('sensitivity-display-panel');
    this.start_btn = document.getElementById('sa-start-btn');
    this.start_btn.addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.start());
    this.pause_btn = document.getElementById('sa-pause-btn');
    this.pause_btn.addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.pause());
    this.stop_btn = document.getElementById('sa-stop-btn');
    this.stop_btn.addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.stop());
    this.reset_btn = document.getElementById('sa-reset-btn');
    this.reset_btn.addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.clearResults());
    this.progress = document.getElementById('sa-progress');
    this.statistic = document.getElementById('sensitivity-statistic');
    this.statistic.addEventListener(
        'change', () => SENSITIVITY_ANALYSIS.setStatistic());
    // Scroll area for the outcomes table
    this.scroll_area = document.getElementById('sa-scroll-area');
    this.scroll_area.addEventListener(
        'mouseover', (event) => SENSITIVITY_ANALYSIS.showOutcome(event, ''));
    this.table = document.getElementById('sa-table');
    // Buttons at panel bottom
    this.abs_rel_btn = document.getElementById('sa-abs-rel');
    this.abs_rel_btn.addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.toggleAbsoluteRelative());
    this.color_scales = {
        rb: document.getElementById('sa-rb-scale'),
        no: document.getElementById('sa-no-scale')
      };
    const csf = (event) => SENSITIVITY_ANALYSIS.setColorScale(event);
    this.color_scales.rb.addEventListener('click', csf);
    this.color_scales.no.addEventListener('click', csf);
    document.getElementById('sa-copy-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.copyTableToClipboard());
    document.getElementById('sa-copy-data-btn').addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.copyDataToClipboard());
    this.outcome_name = document.getElementById('sa-outcome-name');

    // The add variable modal
    this.variable_modal = new ModalDialog('add-sa-variable');
    this.variable_modal.ok.addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.addVariable());
    this.variable_modal.cancel.addEventListener(
        'click', () => SENSITIVITY_ANALYSIS.variable_modal.hide());
    // NOTE: the modal calls methods of the Expression Editor dialog
    this.variable_modal.element('obj').addEventListener(
      'change', () => X_EDIT.updateVariableBar('add-sa-'));
    this.variable_modal.element('name').addEventListener(
      'change', () => X_EDIT.updateAttributeSelector('add-sa-'));

    // Initialize main dialog properties
    this.reset();
  }

  updateDialog() {
    this.updateControlPanel();
    this.drawTable();
    this.color_scales[this.color_scale.range].classList.add('sel-cs');
  }
  
  updateControlPanel() {
    // Shows the control panel, or when the analysis is running the
    // legend to the outcomes (also to prevent changes to parameters) 
    this.base_selectors.value = MODEL.base_case_selectors;
    this.delta.value = VM.sig4Dig(MODEL.sensitivity_delta);
    const tr = [];
    for(let i = 0; i < MODEL.sensitivity_parameters.length; i++) {
      const p = MODEL.sensitivity_parameters[i];
      tr.push('<tr class="dataset',
          (this.selected_parameter === i ? ' sel-set' : ''),
          '" onclick="SENSITIVITY_ANALYSIS.selectParameter(', i, ');">',
          '<td class="v-box"><div id="sap-box-', i, '" class="vbox',
          (this.checked_parameters[p] ? ' crossed' : ' clear'),
          '" onclick="SENSITIVITY_ANALYSIS.toggleParameter(', i,
          ');"></div></td><td>', p, '</td></tr>');
    }
    document.getElementById('sa-p-table').innerHTML = tr.join('');
    tr.length = 0;
    for(let i = 0; i < MODEL.sensitivity_outcomes.length; i++) {
      const o = MODEL.sensitivity_outcomes[i];
      tr.push('<tr class="dataset',
          (this.selected_outcome === i ? ' sel-set' : ''),
          '" onclick="SENSITIVITY_ANALYSIS.selectOutcome(', i, ');">',
          '<td class="v-box"><div id="sao-box-', i, '" class="vbox',
          (this.checked_outcomes[o] ? ' crossed' : ' clear'),
          '" onclick="SENSITIVITY_ANALYSIS.toggleOutcome(', i,
          ');"></div></td><td>', o, '</td></tr>');
    }
    document.getElementById('sa-o-table').innerHTML = tr.join('');
    this.updateControlButtons('p');
    this.updateControlButtons('o');
    // NOTE: allow run without parameters, but not without outcomes
    if(MODEL.sensitivity_outcomes.length > 0) {
      this.start_btn.classList.remove('disab');
      this.start_btn.classList.add('enab');
    } else {
      this.start_btn.classList.remove('enab');
      this.start_btn.classList.add('disab');
    }
    // Show the "clear results" button only when selected experiment has run
    if(MODEL.sensitivity_runs.length > 0) {
      this.reset_btn.classList.remove('off');
    } else {
      this.reset_btn.classList.add('off');
      this.progress.innerHTML = '';
    }
    this.variable_modal.element('obj').value = 0;
    // Update variable dropdown list of the "add SA variable" modal using
    // a method of the Expression Editor dialog
    X_EDIT.updateVariableBar('add-sa-');
  }

  updateControlButtons(b) {
    const
        up = document.getElementById(`sa-${b}-up-btn`),
        down = document.getElementById(`sa-${b}-down-btn`),
        del = document.getElementById(`sa-${b}-delete-btn`);
    let index, last;
    if(b === 'p') {
      index = this.selected_parameter;
      last = MODEL.sensitivity_parameters.length - 1;
    } else {
      index = this.selected_outcome;
      last = MODEL.sensitivity_outcomes.length - 1;
    }
    up.classList.add('v-disab');
    down.classList.add('v-disab');
    del.classList.add('v-disab');
    if(index >= 0) {
      del.classList.remove('v-disab');
      if(index > 0) up.classList.remove('v-disab');
      if(index < last) down.classList.remove('v-disab');
    }
  }

  toggleControlPanel() {
    if(this.options_shown) {
      this.control_panel.style.display = 'none';
      this.display_panel.style.left = '1px';
      this.display_panel.style.width = 'calc(100% - 8px)';
      this.toggle_chevron.innerHTML = '&raquo;';
      this.toggle_chevron.title = 'Show control panel';
      this.options_shown = false;
    } else {
      this.control_panel.style.display = 'block';
      this.display_panel.style.left = 'calc(40% + 2px)';
      this.display_panel.style.width = 'calc(60% - 5px)';
      this.toggle_chevron.innerHTML = '&laquo;';    
      this.toggle_chevron.title = 'Hide control panel';
      this.options_shown = true;
    }
  }

  showSelectorInfo(shift) {
    // Called when cursor is moved over the base selectors input field
    if(shift && MODEL.base_case_selectors.length > 0) {
      // When selector(s) are specified and shift is pressed, show info on
      // what the selectors constitute as base scenario
      this.showBaseCaseInfo();
      return;
    }
    // Otherwise, display list of all dataset selectors in docu-viewer
    if(DOCUMENTATION_MANAGER.visible) {
      const
          ds_dict = MODEL.listOfAllSelectors,
          html = [],
          sl = Object.keys(ds_dict).sort((a, b) => UI.compareFullNames(a, b, true));
      for(let i = 0; i < sl.length; i++) {
        const
            s = sl[i],
            dl = ds_dict[s],
            dnl = [],
            bs = (dl.length > 1 ?
                ' style="border: 0.5px solid #a080c0; border-right: none"' : '');
        for(let j = 0; j < dl.length; j++) {
          dnl.push(dl[j].displayName);
        }
        html.push('<tr><td class="sa-ds-sel" ',
            'onclick="SENSITIVITY_ANALYSIS.toggleSelector(this);">',
            s, '</td><td', bs, '>', dnl.join('<br>'), '</td></tr>');
      }
      if(html.length > 0) {
        // Display information as read-only HTML
        DOCUMENTATION_MANAGER.title.innerText = 'Dataset selectors';
        DOCUMENTATION_MANAGER.viewer.innerHTML =
            '<table><tr><td><strong>Selector</strong></td>' +
            '<td><strong>Dataset(s)</strong><td></tr>' + html.join('') +
            '</table>';
        DOCUMENTATION_MANAGER.edit_btn.classList.remove('enab');
        DOCUMENTATION_MANAGER.edit_btn.classList.add('disab');
      }
    }
  }
  
  showBaseCaseInfo() {
    // Display information on the base case selectors combination if docu-viewer
    // is visible and cursor is moved over base case input field
    const combi = MODEL.base_case_selectors.split(' ');
    if(combi.length > 0 && DOCUMENTATION_MANAGER.visible) {
      const
          info = {},
          html = [],
          list = [];
      info.title = `Base scenario: <tt>${tupelString(combi)}</tt>`;
      for(let i = 0; i < combi.length; i++) {
        const sel = combi[i];
        html.push('<h3>Selector <tt>', sel, '</tt></h3>');
        // List associated datasets (if any)
        list.length = 0;
        for(let id in MODEL.datasets) if(MODEL.datasets.hasOwnProperty(id)) {
          const ds = MODEL.datasets[id];
          for(let k in ds.modifiers) if(ds.modifiers.hasOwnProperty(k)) {
            if(ds.modifiers[k].match(sel)) {
              list.push('<li>', MODEL.datasets[id].displayName,
                  '<span class="dsx">',
                  MODEL.datasets[id].modifiers[UI.nameToID(sel)].expression.text,
                  '</span></li>');
            }
          }
        }
        if(list.length > 0) {
          html.push('<em>Datasets:</em> <ul>', list.join(''), '</ul>');
        }
        info.html = html.join('');
        // Display information as read-only HTML
        DOCUMENTATION_MANAGER.title.innerHTML = info.title;
        DOCUMENTATION_MANAGER.viewer.innerHTML = info.html;
        DOCUMENTATION_MANAGER.edit_btn.classList.remove('enab');
        DOCUMENTATION_MANAGER.edit_btn.classList.add('disab');
      }
    }
  }
  
  toggleSelector(obj) {
    const
      sel = obj.textContent,
      bsl = MODEL.base_case_selectors.split(' '),
      index = bsl.indexOf(sel);
    if(index >= 0) {
      bsl.splice(index, 1);
    } else {
      bsl.push(sel);
    }
    MODEL.base_case_selectors = bsl.join(' ');
   this.base_selectors.value = MODEL.base_case_selectors;
  }
  
  editBaseSelectors() {
    // Give visual feedback by setting background color to white
    this.base_selectors.style.backgroundColor = 'white';
  }
  
  setBaseSelectors() {
    // Sanitize string before accepting it as space-separated selector list
    const
        sl = this.base_selectors.value.replace(/[\;\,]/g, ' ').trim().replace(
            /[^a-zA-Z0-9\+\-\%\_\s]/g, '').split(/\s+/),
        bs = sl.join(' '),
        sd = MODEL.listOfAllSelectors,
        us = [];
    for(let i = 0; i < sl.length; i++) {
      if(sl[i].length > 0 && !(sl[i] in sd)) us.push(sl[i]);
    }
    if(us.length > 0) {
      UI.warn('Base contains ' + pluralS(us.length, 'unknown selector') +
          ': "' + us.join('", "') + '"');
    } else if(MODEL.base_case_selectors !== bs &&
        MODEL.sensitivity_runs.length > 0) {
      UI.notify('Change may have invalidated the analysis results');
    }
    MODEL.base_case_selectors = bs;
    this.base_selectors.value = bs;
    this.base_selectors.style.backgroundColor = 'inherit';
  }
  
  editDelta() {
    // Give visual feedback by setting background color to white
    this.delta.backgroundColor = 'white';
  }
  
  setDelta() {
    const
        did = 'sensitivity-delta',
        d = UI.validNumericInput(did, 'Delta');
    if(d !== false) {
      if(MODEL.sensitivity_delta !== d && MODEL.sensitivity_runs.length > 0) {
        UI.notify('Change may have invalidated the analysis results');
      }
      MODEL.sensitivity_delta = d;
      document.getElementById(did).style.backgroundColor = 'inherit';
    }
    this.updateDialog();
  }
  
  selectParameter(p) {
    this.selected_parameter = p;
    this.updateControlPanel();
  }
  
  selectOutcome(o) {
    this.selected_outcome = o;
    this.updateControlPanel();
  }
  
  toggleParameter(n) {
    const p = MODEL.sensitivity_parameters[n];
    let c = false;
    if(p in this.checked_parameters) c = this.checked_parameters[p];
    this.checked_parameters[p] = !c;
    this.drawTable();
  }
  
  toggleOutcome(n) {
    const o = MODEL.sensitivity_outcomes[n];
    let c = false;
    if(o in this.checked_outcomes) c = this.checked_outcomes[o];
    this.checked_outcomes[o] = !c;
    this.drawTable();
  }

  moveParameter(dir) {
    let n = this.selected_parameter;
    if(n < 0) return;
    if(dir > 0 && n < MODEL.sensitivity_parameters.length - 1 ||
        dir < 0 && n > 0) {
      n += dir;
      const v = MODEL.sensitivity_parameters.splice(this.selected_parameter, 1)[0];
      MODEL.sensitivity_parameters.splice(n, 0, v);
      this.selected_parameter = n;
    }
    this.updateDialog();
  }
  
  moveOutcome(dir) {
    let n = this.selected_outcome;
    if(n < 0) return;
    if(dir > 0 && n < MODEL.sensitivity_outcomes.length - 1 ||
       dir < 0 && n > 0) {
      n += dir;
      const v = MODEL.sensitivity_outcomes.splice(this.selected_outcome, 1)[0];
      MODEL.sensitivity_outcomes.splice(n, 0, v);
      this.selected_outcome = n;
    }
    this.updateDialog();
  }
  
  promptForParameter() {
    // Open dialog for adding new parameter
    const md = this.variable_modal;
    md.element('type').innerText = 'parameter';
    // NOTE: clusters have no suitable attributes, and equations are endogenous
    md.element('cluster').style.display = 'none';
    md.element('equation').style.display = 'none';
    // NOTE: update to ensure that valid attributes are selectable
    X_EDIT.updateVariableBar('add-sa-');
    md.show();
  }

  promptForOutcome() {
    // Open dialog for adding new outcome
    const md = this.variable_modal;
    md.element('type').innerText = 'outcome';
    md.element('cluster').style.display = 'block';
    md.element('equation').style.display = 'block';
    // NOTE: update to ensure that valid attributes are selectable
    X_EDIT.updateVariableBar('add-sa-');
    md.show();
  }

  dragOver(ev) {
    const
        tid = ev.target.id,
        ok = (tid.startsWith('sa-p-') || tid.startsWith('sa-o-')),
        n = ev.dataTransfer.getData('text'),
        obj = MODEL.objectByID(n);
    if(ok && obj) ev.preventDefault();
  }
  
  handleDrop(ev) {
    // Prompt for attribute if dropped object is a suitable entity
    ev.preventDefault();
    const
        tid = ev.target.id,
        param = tid.startsWith('sa-p-'),
        n = ev.dataTransfer.getData('text'),
        obj = MODEL.objectByID(n);
    if(!obj) {
      UI.alert(`Unknown entity ID "${n}"`);
    } else if(param && obj instanceof Cluster) {
      UI.warn('Clusters do not have exogenous attributes');
    } else if(obj instanceof DatasetModifier) {
      if(param) {
        UI.warn('Equations can only be outcomes');
      } else {
        MODEL.sensitivity_outcomes.push(obj.displayName);
        this.updateDialog();    
      }
    } else {
      const vt = this.variable_modal.element('type');
      if(param) {
        vt.innerText = 'parameter';
      } else {
        vt.innerText = 'outcome';
      }
      this.variable_modal.show();
      const
          tn = VM.object_types.indexOf(obj.type),
          dn = obj.displayName;
      this.variable_modal.element('obj').value = tn;
      X_EDIT.updateVariableBar('add-sa-');
      const s = this.variable_modal.element('name');
      let i = 0;
      for(let k in s.options) if(s.options.hasOwnProperty(k)) {
        if(s[k].text === dn) {
          i = s[k].value;
          break;
        }
      }
      s.value = i;
      // NOTE: use method of the Expression Editor, specifying the SA prefix
      X_EDIT.updateAttributeSelector('add-sa-'); 
    }  
  }

  addVariable() {
    // Add parameter or outcome to the respective list
    const
        md = this.variable_modal,
        t = md.element('type').innerText,
        e = md.selectedOption('obj').text,
        o = md.selectedOption('name').text,
        a = md.selectedOption('attr').text;
    let n = '';
    if(e === 'Equation' && a) {
      // For equations, the attribute denotes the name
      n = a;
    } else if(o && a) {
      // Most variables are defined by name + attribute ...
      n = o + UI.OA_SEPARATOR + a;
    } else if(e === 'Dataset' && o) {
      // ... but for datasets the selector is optional
      n = o;
    }
    if(n) {
      if(t === 'parameter' && MODEL.sensitivity_parameters.indexOf(n) < 0) {
        MODEL.sensitivity_parameters.push(n);
      } else if(t === 'outcome' && MODEL.sensitivity_outcomes.indexOf(n) < 0) {
        MODEL.sensitivity_outcomes.push(n);
      }
      this.updateDialog();
    }
    md.hide();
  }
  
  deleteParameter() {
    // Remove selected parameter from the analysis
    MODEL.sensitivity_parameters.splice(this.selected_parameter, 1);
    this.selected_parameter = -1;
    this.updateDialog();
  }

  deleteOutcome() {
    // Remove selected outcome from the analysis
    MODEL.sensitivity_outcomes.splice(this.selected_outcome, 1);
    this.selected_outcome = -1;
    this.updateDialog();
  }

  pause() {
    // Interrupt solver but retain data on server and allow resume
    UI.notify('Run sequence will be suspended after the current run');
    this.pause_btn.classList.add('blink');
    this.stop_btn.classList.remove('off');
    this.must_pause = true;
  }

  resumeButtons() {
    // Changes buttons to "running" state, and return TRUE if state was "paused"
    const paused = this.start_btn.classList.contains('blink');
    this.start_btn.classList.remove('blink');
    this.start_btn.classList.add('off');
    this.pause_btn.classList.remove('off');
    this.stop_btn.classList.add('off');
    this.must_pause = false;
    return paused;
  }

  readyButtons() {
    // Sets experiment run control buttons in "ready" state
    this.pause_btn.classList.add('off');
    this.stop_btn.classList.add('off');
    this.start_btn.classList.remove('off', 'blink');
    this.must_pause = false;
  }
  
  pausedButtons(aci) {
    // Sets experiment run control buttons in "paused" state
    this.pause_btn.classList.remove('blink');
    this.pause_btn.classList.add('off');
    this.start_btn.classList.remove('off');
    // Blinking start button indicates: paused -- click to resume
    this.start_btn.classList.add('blink');
    this.progress.innerHTML = `Run ${aci} PAUSED`;
  }
  
  clearResults() {
    // Clears results, and resets control buttons
    MODEL.sensitivity_runs.length = 0;
    this.readyButtons();
    this.reset_btn.classList.add('off');
    this.selected_run = -1;
    this.must_pause = false;
    this.progress.innerHTML = '';
    this.updateDialog();
  }

  setProgress(msg) {
    // Shows `msg` in the progress field of the dialog
    this.progress.innerHTML = msg;
  }
  
  showCheckmark(t) {
    // Shows green checkmark (with elapsed time `t` as title) in progress field
    this.progress.innerHTML =
        `<span class="x-checked" title="${t}">&#10004;</span>`;
  }

  drawTable() {
    // Draws sensitivity analysis as table
    const
        html = [],
        pl = MODEL.sensitivity_parameters.length,
        ol = MODEL.sensitivity_outcomes.length;
    if(ol === 0) {
      this.table.innerHTML = '';
      return;
    }
    html.push('<tr><td colspan="2"></td>');
    for(let i = 0; i < ol; i++) {
      const o = MODEL.sensitivity_outcomes[i];
      if(!this.checked_outcomes[o]) {
        html.push('<td class="sa-col-hdr" ',
            'onmouseover="SENSITIVITY_ANALYSIS.showOutcome(event, \'', o, '\');">',
            i+1, '</td>');
      }
    }
    html.push('</tr><tr class="sa-p-row" ',
        'onclick="SENSITIVITY_ANALYSIS.selectRun(0);">',
        '<td colspan="2" class="sa-row-hdr"><em>Base scenario</em></td>');
    for(let i = 0; i < ol; i++) {
      const o = MODEL.sensitivity_outcomes[i];
      if(!this.checked_outcomes[o]) {
        html.push('<td id="sa-r0c', i,
            '" onmouseover="SENSITIVITY_ANALYSIS.showOutcome(event, \'',
            o, '\');"></td>');
      }
    }
    html.push('</tr>');
    const
        sdelta = (MODEL.sensitivity_delta >= 0 ? '+' : '') +
            VM.sig4Dig(MODEL.sensitivity_delta) + '%',
        dc = sdelta.startsWith('+') ? 'sa-plus' : 'sa-minus';
    for(let i = 0; i < pl; i++) {
      const p = MODEL.sensitivity_parameters[i];
      if(!this.checked_parameters[p]) {
        html.push('<tr class="sa-p-row" ',
            'onclick="SENSITIVITY_ANALYSIS.selectRun(', i+1, ');">',
            '<td class="sa-row-hdr" title="', p, '">', p,
            '</td><td class="', dc, '">', sdelta, '</td>');
        for(let j = 0; j < MODEL.sensitivity_outcomes.length; j++) {
          const o = MODEL.sensitivity_outcomes[j];
          if(!this.checked_outcomes[o]) {
            html.push('<td id="sa-r', i+1, 'c', j,
                '" onmouseover="SENSITIVITY_ANALYSIS.showOutcome(event, \'',
                o, '\');"></td>');
          }
        }
      }
      html.push('</tr>');
    }
    this.table.innerHTML = html.join('');
    if(this.selected_run >= 0) document.getElementById(
          `sa-r${this.selected_run}c0`).parentNode.classList.add('sa-p-sel');
    this.updateData();
  }
  
  updateData() {
    // Fills table cells with their data value or status
    const
        pl = MODEL.sensitivity_parameters.length,
        ol = MODEL.sensitivity_outcomes.length,
        rl = MODEL.sensitivity_runs.length;
    if(ol === 0) return;
    // NOTE: computeData is a parent class method
    this.computeData(this.selected_statistic);
    // Draw per row (i) where i=0 is the base case
    for(let i = 0; i <= pl; i ++) {
      if(i < 1 || !this.checked_parameters[MODEL.sensitivity_parameters[i-1]]) {
        for(let j = 0; j < ol; j++) {
          if(!this.checked_outcomes[MODEL.sensitivity_outcomes[j]]) {
            const c = document.getElementById(`sa-r${i}c${j}`);
            c.classList.add('sa-data');
            if(i >= rl) {
              c.classList.add('sa-not-run');
            } else {
              if(i < 1) {
                c.classList.add('sa-brd');
              } else if(this.color_scale.range === 'no') {
                c.style.backgroundColor = 'white';
              } else {
                c.style.backgroundColor =
                    this.color_scale.rgb(this.shade[j][i - 1]);
              }
              if(i > 0 && this.relative_scale) {
                let p = this.perc[j][i - 1];
                // Replace warning sign by dash
                if(p === '\u26A0') p = '-';
                c.innerText = p + (p !== '-' ? '%' : '');
              } else {
                c.innerText = this.data[j][i];
              }
            }
          }
        }
      }
    }
  }

  showOutcome(event, o) {
    // Displays outcome `o` (the name of the variable) below the table
    event.stopPropagation();
    this.outcome_name.innerHTML = o;
  }
  
  selectRun(n) {
    // Selects run `n`, or toggles if already selected
    const rows = this.scroll_area.getElementsByClassName('sa-p-sel');
    for(let i = 0; i < rows.length; i++) {
      rows.item(i).classList.remove('sa-p-sel');
    }
    if(n === this.selected_run) {
      this.selected_run = -1;
    } else if(n < MODEL.sensitivity_runs.length) {
      this.selected_run = n;
      if(n >= 0) document.getElementById(
          `sa-r${n}c0`).parentNode.classList.add('sa-p-sel');
    }
    VM.setRunMessages(this.selected_run);
  }

  setStatistic() {
    // Update view for selected variable
    this.selected_statistic = this.statistic.value;
    this.updateData();
  }
  
  toggleAbsoluteRelative() {
    // Toggles between # (absolute) and % (relative) display of outcome values
    this.relative_scale = !this.relative_scale;
    this.abs_rel_btn.innerText = (this.relative_scale ? '%' : '#');
    this.updateData();
  }

  setColorScale(event) {
    // Infers clicked color scale button from event, and selects it
    if(event) {
      const cs = event.target.id.split('-')[1];
      this.color_scale.set(cs);
      this.color_scales.rb.classList.remove('sel-cs');
      this.color_scales.no.classList.remove('sel-cs');
      this.color_scales[cs].classList.add('sel-cs');
    }
    this.updateData();
  }
  
  copyTableToClipboard() {
    UI.copyHtmlToClipboard(this.scroll_area.innerHTML);
    UI.notify('Table copied to clipboard (as HTML)');
  }
  
  copyDataToClipboard() {
    UI.notify(UI.NOTICE.WORK_IN_PROGRESS);
  }
  
} // END of class SensitivityAnalysis

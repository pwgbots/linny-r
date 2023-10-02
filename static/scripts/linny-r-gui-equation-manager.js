/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-eqmgr.js) provides the GUI functionality
for the Linny-R Equation Manager dialog.

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

// CLASS EquationManager provides the equation dialog functionality
class EquationManager {
  constructor() {
    this.dialog = UI.draggableDialog('equation');
    UI.resizableDialog('equation', 'EQUATION_MANAGER');    
    this.close_btn = document.getElementById('equation-close-btn');
    this.close_btn.addEventListener(
        'click', (event) => UI.toggleDialog(event));
    this.table = document.getElementById('equation-table');
    this.scroll_area = document.getElementById('equation-scroll-area');
    
    // Make toolbar buttons responsive
    document.getElementById('eq-new-btn').addEventListener(
        'click', () => EQUATION_MANAGER.promptForEquation());
    document.getElementById('eq-rename-btn').addEventListener(
        'click', () => EQUATION_MANAGER.promptForName());
    document.getElementById('eq-clone-btn').addEventListener(
        'click', () => EQUATION_MANAGER.promptToClone());
    document.getElementById('eq-edit-btn').addEventListener(
        'click', () => EQUATION_MANAGER.editEquation());
    document.getElementById('eq-delete-btn').addEventListener(
        'click', () => EQUATION_MANAGER.deleteEquation());
    this.outcome_btn = document.getElementById('equation-outcome');
    this.outcome_btn.addEventListener(
        'click', () => EQUATION_MANAGER.toggleOutcome());
    
    // Create modal dialogs
    this.new_modal = new ModalDialog('new-equation');
    this.new_modal.ok.addEventListener(
        'click', () => EQUATION_MANAGER.newEquation());
    this.new_modal.cancel.addEventListener(
        'click', () => EQUATION_MANAGER.cancelEquation());

    this.rename_modal = new ModalDialog('rename-equation');
    this.rename_modal.ok.addEventListener(
        'click', () => EQUATION_MANAGER.renameEquation());
    this.rename_modal.cancel.addEventListener(
        'click', () => EQUATION_MANAGER.rename_modal.hide());

    this.clone_modal = new ModalDialog('clone-equation');
    this.clone_modal.ok.addEventListener(
        'click', () => EQUATION_MANAGER.cloneEquation());
    this.clone_modal.cancel.addEventListener(
        'click', () => EQUATION_MANAGER.clone_modal.hide());

    // Initialize the dialog properties
    this.reset();
  }

  reset() {
    this.visible = false;
    this.selected_modifier = null;
    this.edited_expression = null;
    this.last_time_clicked = 0;
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
    // Open the expression editor for the selected equation
    const srl = this.table.getElementsByClassName('sel-set');
    if(srl.length > 0) {
      const r = this.table.rows[srl[0].rowIndex];
      if(r) {
        // Emulate a double-click on the second cell to edit the expression
        this.last_time_clicked = Date.now();
        r.cells[1].dispatchEvent(new Event('click'));
      }
    }
  }
  
  upDownKey(dir) {
    // Select row above or below the selected one (if possible)
    const srl = this.table.getElementsByClassName('sel-set');
    if(srl.length > 0) {
      const r = this.table.rows[srl[0].rowIndex + dir];
      if(r) {
        UI.scrollIntoView(r);
        // NOTE: not row but cell listens for onclick
        r.cells[1].dispatchEvent(new Event('click'));
      }
    }
  }
  
  updateDialog() {
    // Updates equation list, highlighting selected equation (if any)
    const
        ed = MODEL.equations_dataset,
        ml = [],
        msl = ed.selectorList,
        sm = this.selected_modifier;
    if(sm && sm.outcome_equation) {
      this.outcome_btn.classList.remove('not-selected'); 
    } else {
      this.outcome_btn.classList.add('not-selected'); 
    }
    let smid = 'eqmtr';
    for(let i = 0; i < msl.length; i++) {
      const
          m = ed.modifiers[UI.nameToID(msl[i])],
          wild = (m.selector.indexOf('??') >= 0),
          method = m.selector.startsWith(':'),
          issue = (m.expression.compile_issue ? ' compile-issue' :
              (m.expression.compute_issue ? ' compute-issue' : '')),
          clk = '" onclick="EQUATION_MANAGER.selectModifier(event, \'' +
              m.selector + '\'',
          mover = (method ? ' onmouseover="EQUATION_MANAGER.showInfo(\'' +
              m.identifier + '\', event.shiftKey);"' : '');
      if(m === sm) smid += i;
      ml.push(['<tr id="eqmtr', i, '" class="dataset-modif',
          (m === sm ? ' sel-set' : ''),
          '"><td class="equation-selector',
          (method ? ' method' : ''),
          // Display in gray when method cannot be applied.
          (m.expression.noMethodObject ? ' no-object' : ''),
          (m.expression.isStatic ? '' : ' it'), issue,
          (wild ? ' wildcard' : ''), clk, ', false);"', mover, '>',
          (m.outcome_equation ? '<span class="outcome"></span>' : ''),
          (wild ? wildcardFormat(m.selector) : m.selector),
          '</td><td class="equation-expression', issue,
          (issue ? '"title="' +
              safeDoubleQuotes(m.expression.compile_issue ||
                  m.expression.compute_issue) : ''),
          clk, ');">', m.expression.text, '</td></tr>'].join(''));
    }
    this.table.innerHTML = ml.join('');
    this.scroll_area.style.display = 'block';
    if(sm) UI.scrollIntoView(document.getElementById(smid));
    const btns = 'eq-rename eq-clone eq-edit eq-delete';
    if(sm) {
      UI.enableButtons(btns);
    } else {
      UI.disableButtons(btns);
    }
  }
  
  showInfo(id, shift) {
    // @@TO DO: Display documentation for the equation => extra comments field?
    const d = MODEL.equations_dataset.modifiers[id];
    if(d) DOCUMENTATION_MANAGER.update(d, shift);
  }
  
  selectModifier(event, id, x=true) {
    // Select modifier, or when Alt- or double-clicked, edit its expression
    // or the equation name (= name of the modifier)
    if(MODEL.equations_dataset) {
      const
          m = MODEL.equations_dataset.modifiers[UI.nameToID(id)] || null,
          edit = event.altKey || this.doubleClicked(m);
      this.selected_modifier = m;
      if(m && edit) {
        if(x) {
          this.editEquation();
        } else {
          this.promptForName();
        }
        return;
      }
    } else {
      this.selected_modifier = null;
    }
    this.updateDialog();
  }
  
  toggleOutcome() {
    const m = this.selected_modifier;
    // NOTE: Methods cannot be outcomes.
    if(m && !m.selector.startsWith(':')) {
      m.outcome_equation = !m.outcome_equation;
      this.updateDialog();
      if(!UI.hidden('experiment-dlg')) EXPERIMENT_MANAGER.updateDialog();
    }
  }
  
  promptForEquation(add=false) {
    this.add_to_chart = add;
    this.new_modal.element('name').value = '';
    this.new_modal.show('name');
  }
  
  newEquation() {
    const
        n = this.new_modal.element('name').value.trim(),
        m = MODEL.equations_dataset.addModifier(n);
    if(m) {
      this.new_modal.hide();
      this.selected_modifier = m;
      this.updateDialog();
      // Open expression editor if expression is still undefined
      if(!m.expression.text) this.editEquation();
    }
  }

  editEquation() {
    const m = this.selected_modifier;
    if(m) {
      this.edited_expression = m.expression;
      const md = UI.modals.expression;
      md.element('property').innerHTML = this.selected_modifier.selector;
      md.element('text').value = m.expression.text;
      document.getElementById('variable-obj').value = 0;
      X_EDIT.updateVariableBar();
      X_EDIT.clearStatusBar();
      md.show('text');
    }
  }
  
  cancelEquation() {
    this.new_modal.hide();
    this.add_to_chart = false;
  }

  modifyEquation(x) {
    // Update and compile expression only if it has been changed
    if(this.edited_expression && x != this.edited_expression.text) {
      this.edited_expression.text = x;
      this.edited_expression.compile();
    }
    this.edited_expression.reset();
    this.edited_expression = null;
    this.updateDialog();
    CHART_MANAGER.updateDialog();
    if(this.add_to_chart && CHART_MANAGER.chart_index >= 0) {
      // Add selected modifier as new equation to chart
      CHART_MANAGER.addVariable(this.selected_modifier.selector);
      this.add_to_chart = false;
    }
  }

  promptForName() {
    // Prompts the modeler for a new name for the selected equation (if any)
    if(this.selected_modifier) {
      this.rename_modal.element('name').value = this.selected_modifier.selector;
      this.rename_modal.show('name');
    }
  }
  
  renameEquation() {
    if(!this.selected_modifier) return;
    const
        sel = this.rename_modal.element('name').value,
        // Keep track of old name.
        oldm = this.selected_modifier,
        olds = oldm.selector,
        // NOTE: addModifier returns existing one if selector not changed.
        m = MODEL.equations_dataset.addModifier(sel);
    // NULL indicates invalid name.
    if(!m) return;
    // If only case has changed, update the selector.
    // NOTE: Equation names may contain spaces; if so, reduce to single space.
    if(m === oldm) {
      m.selector = sel.trim().replace(/\s+/g, ' ');
    } else {
      // When a new modifier has been added, more actions are needed.
      m.expression = oldm.expression;
      // NOTE: The `attribute` property of the expression must be updated
      // because it identifies the "owner" of the expression.
      m.expression.attribute = m.selector;
      this.deleteEquation();
      this.selected_modifier = m;
    }
    // Update all chartvariables referencing this dataset + old selector
    let cv_cnt = 0;
    for(let i = 0; i < MODEL.charts.length; i++) {
      const c = MODEL.charts[i];
      for(let j = 0; j < c.variables.length; j++) {
        const v = c.variables[j];
        if(v.object === MODEL.equations_dataset && v.attribute === olds) {
          v.attribute = m.selector;
          cv_cnt++;
        }
      }
    }
    // Also replace old selector in all expressions (count these as well)
    // NOTE: equation selectors in variables are similar to entity names
    const xr_cnt = MODEL.replaceEntityInExpressions(olds, m.selector);
    // Notify modeler of changes (if any)
    const msg = [];
    if(cv_cnt) msg.push(pluralS(cv_cnt, ' chart variable'));
    if(xr_cnt) msg.push(pluralS(xr_cnt, ' expression variable'));
    if(msg.length) {
      UI.notify('Updated ' +  msg.join(' and '));
      // Also update these stay-on-top dialogs, as they may display a
      // variable name for this dataset + modifier
      UI.updateControllerDialogs('CDEFJX');
    }
    // Always close the name prompt dialog, and update the equation manager
    this.rename_modal.hide();
    this.updateDialog();
  }
  
  promptToClone() {
    // Prompts the modeler for the name of the clone to make of the
    // selected equation (if any).
    if(this.selected_modifier) {
      this.clone_modal.element('name').value = this.selected_modifier.selector;
      this.clone_modal.show('name');
    }
  }
  
  cloneEquation() {
    if(!this.selected_modifier) return;
    const
        s = this.clone_modal.element('name').value,
        // New equation identifier must not equal some entity ID
        obj = MODEL.objectByName(s);
    if(obj) {
      // NOTE: also pass selector, or warning will display dataset name.
      UI.warningEntityExists(obj);
      return null;
    }
    // Name is new and unique, so try to use it
    const m = MODEL.equations_dataset.addModifier(s);
    // NULL indicates invalid name, and modeler will have been warned.
    if(!m) return;
    // Give the new modifier the same expression as te selected one.
    m.expression.text = this.selected_modifier.expression.text;
    // Compile the expression. This may generate a warning when the new
    // name does not provide adequate context.
    m.expression.compile();
    // 
    this.selected_modifier = m;
    // Even if warning was given, close the name prompt dialog, and update
    // the equation manager.
    this.clone_modal.hide();
    this.updateDialog();
  }
  
  deleteEquation() {
    const m = this.selected_modifier;
    if(m) {
      delete MODEL.equations_dataset.modifiers[UI.nameToID(m.selector)];
      this.selected_modifier = null;
      this.updateDialog();
    }
  }

} // END of class EquationManager


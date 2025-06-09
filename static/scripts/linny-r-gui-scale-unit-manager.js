/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-scale-unit-manager.js) provides the GUI
functionality for the Linny-R Scale Unit Manager dialog.

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

// CLASS ScaleUnitManager (modal dialog!)
class ScaleUnitManager {
  constructor() {
    // Add the scale units modal.
    this.dialog = new ModalDialog('scale-units');
    this.dialog.close.addEventListener('click',
        () => SCALE_UNIT_MANAGER.dialog.hide());
    // Make the add, edit and delete buttons of this modal responsive.
    this.dialog.element('new-btn').addEventListener('click',
        () => SCALE_UNIT_MANAGER.promptForScaleUnit());
    this.dialog.element('edit-btn').addEventListener('click',
        () => SCALE_UNIT_MANAGER.editScaleUnit());
    this.dialog.element('delete-btn').addEventListener('click',
        () => SCALE_UNIT_MANAGER.deleteScaleUnit());
    // Add the scale unit definition modal.
    this.new_scale_unit_modal = new ModalDialog('new-scale-unit');
    this.new_scale_unit_modal.ok.addEventListener(
        'click', () => SCALE_UNIT_MANAGER.addNewScaleUnit());
    this.new_scale_unit_modal.cancel.addEventListener(
        'click', () => SCALE_UNIT_MANAGER.new_scale_unit_modal.hide());
    this.scroll_area = this.dialog.element('scroll-area');
    this.table = this.dialog.element('table');
  }
  
  get selectedUnitIsBaseUnit() {
    // Return TRUE iff selected unit is used as base unit for some unit.
    for(let k in this.scale_units) if(this.scale_units.hasOwnProperty(k)) {
      if(this.scale_units[k].base_unit === this.selected_unit) return true;
    }
    return false;
  }

  show() {
    // Show the user-defined scale units for the current model.
    // NOTE: Add/edit/delete actions operate on this list, so changes
    // take immediate effect.
    MODEL.cleanUpScaleUnits();
    // NOTE: Unit name is key in the scale units object.
    this.selected_unit = '';
    this.last_time_selected = 0;
    this.updateDialog();
    this.dialog.show();
  }
  
  updateDialog() {
    // Create the HTML for the scale units table and update the state
    // of the action buttons.
    if(!MODEL.scale_units.hasOwnProperty(this.selected_unit)) {
      this.selected_unit = '';
    }
    const
        keys = Object.keys(MODEL.scale_units).sort(ciCompare),
        sl = [],
        ss = this.selected_unit;
    let ssid = 'scntr';
    if(keys.length <= 1) {
      // Only one key => must be the default '1'.
      sl.push('<tr><td><em>No units defined</em></td></tr>');
    } else {
      for(let i = 1; i < keys.length; i++) {
        const
            s = keys[i],
            clk = '" onclick="SCALE_UNIT_MANAGER.selectScaleUnit(event, \'' +
                s + '\'';
        if(s === ss) ssid += i;
        sl.push(['<tr id="scntr', i, '" class="dataset-modif',
            (s === ss ? ' sel-set' : ''),
            '"><td class="dataset-selector', clk, ');">',
            s, '</td><td class="dataset-selector', clk, ', \'scalar\');">',
            MODEL.scale_units[s].scalar, '</td><td class="dataset-selector',
            clk, ', \'base\');">', MODEL.scale_units[s].base_unit,
            '</td></tr>'].join(''));
      }
    }
    this.table.innerHTML = sl.join('');
    if(ss) UI.scrollIntoView(document.getElementById(ssid));
    let btns = 'scale-units-edit';
    if(!this.selectedUnitIsBaseUnit) btns += ' scale-units-delete';
    if(ss) {
      UI.enableButtons(btns);
    } else {
      UI.disableButtons(btns);
    }
  }

  selectScaleUnit(event, symbol, focus) {
    // Select scale unit, and when double-clicked, allow to edit it.
    const
        ss = this.selected_unit,
        now = Date.now(),
        dt = now - this.last_time_selected,
        // NOTE: Alt-click and double-click indicate: edit.
        // Consider click to be "double" if the same modifier was clicked
        // less than 300 ms ago.
        edit = event.altKey || (symbol === ss && dt < 300);
    this.selected_unit = symbol;
    this.last_time_selected = now;
    if(edit) {
      this.last_time_selected = 0;
      this.promptForScaleUnit('Edit', focus);
      return;
    }
    this.updateDialog();
  }
  
  promptForScaleUnit(action='Define new', focus='name') {
    // Show the Add/Edit scale unit dialog for the indicated action.
    const md = this.new_scale_unit_modal;
    // NOTE: By default, let name and base unit be empty strings, not '1'.
    let sv = {name: '', scalar: '1', base_unit: '' };
    if(action === 'Edit' && this.selected_unit) {
      sv = MODEL.scale_units[this.selected_unit];
    }
    md.element('action').innerText = action;
    md.element('name').value = sv.name;
    md.element('scalar').value = sv.scalar;
    md.element('base').value = sv.base_unit;
    UI.updateScaleUnitList();
    this.new_scale_unit_modal.show(focus);
  }

  addNewScaleUnit() {
    // Add the new scale unit or update the one being edited.
    const
        md = this.new_scale_unit_modal,
        edited = md.element('action').innerText === 'Edit',
        // NOTE: Unit name cannot contain single quotes.
        s = UI.cleanName(md.element('name').value).replace("'", ''),
        v = md.element('scalar').value.trim(),
        // NOTE: Accept empty base unit to denote '1'.
        b = md.element('base').value.trim() || '1';
    if(!s) {
      // Do not accept empty string as name.
      UI.warn('Scale unit must have a name');
      md.element('name').focus();
      return;
    }
    if(MODEL.scale_units.hasOwnProperty(s) && !edited) {
      // Do not accept existing unit as name for new unit.
      UI.warn(`Scale unit "${s}" is already defined`);
      md.element('name').focus();
      return;      
    }
    if(b !== s && !MODEL.scale_units.hasOwnProperty(b)) {
      UI.warn(`Base unit "${b}" is undefined`);
      md.element('base').focus();
      return;
    }
    if(UI.validNumericInput('new-scale-unit-scalar', 'scalar')) {
      const ucs = Math.abs(safeStrToFloat(v));
      if(ucs < VM.NEAR_ZERO) {
        UI.warn(`Unit conversion scalar cannot be zero`);
        md.element('scalar').focus();
        return;
      }
      if(b === s && ucs !== 1) {
        UI.warn(`When base unit = scale unit, scalar must equal 1`);
        md.element('scalar').focus();
        return;
      }      
      const selu = this.selected_unit;
      if(edited && b !== s) {
        // Prevent inconsistencies across scalars.
        const cr = MODEL.scale_units[b].conversionRates();
        if(cr.hasOwnProperty(s)) {
          UI.warn(`Defining ${s} in terms of ${b} introduces a circular reference`);
          md.element('base').focus();
          return;
        }
      }
      if(edited && s !== selu) {
         // First rename base units.
        for(let k in MODEL.scale_units) if(MODEL.scale_units.hasOwnProperty(k)) {
          if(MODEL.scale_units[k].base_unit === selu) {
            MODEL.scale_units[k].base_unit = s;
          }
        }
        // NOTE: renameScaleUnit replaces references to `s`, not the entry.
        MODEL.renameScaleUnit(selu, s);
        delete MODEL.scale_units[this.selected_unit];
      }
      MODEL.scale_units[s] = new ScaleUnit(s, v, b);
      MODEL.selected_unit = s;
      this.new_scale_unit_modal.hide();
      UI.updateScaleUnitList();
      this.updateDialog();
    }
  }
  
  editScaleUnit() {
    // Allow user to edit name and/or value.
    if(this.selected_unit) this.promptForScaleUnit('Edit', 'scalar');
  }
  
  deleteScaleUnit() {
    // Allow user to delete.
    // @@@TO DO: Check whether scale unit is used in the model.
    if(this.selected_unit && !this.selectedUnitIsBaseUnit) {
      delete MODEL.scale_units[this.selected_unit];
      this.updateDialog();
    }
  }
  
  updateScaleUnits() {
    // Replace scale unit definitions of model by the new definitions.
    UI.updateScaleUnitList();
    this.dialog.hide();
  }
  
} // END of class ScaleUnitManager

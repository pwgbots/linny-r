/*
Linny-R is an executable graphical specification language for (mixed integer)
linear programming (MILP) problems, especially unit commitment problems (UCP).
The Linny-R language and tool have been developed by Pieter Bots at Delft
University of Technology, starting in 2009. The project to develop a browser-
based version started in 2017. See https://linny-r.org for more information.

This JavaScript file (linny-r-gui-power-grid-manager.js) provides the GUI
functionality for the Linny-R Power Grid Manager dialog.

*/

/*
Copyright (c) 2017-2026 Delft University of Technology

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

// CLASS GUIPowerGridManager (modal dialog!)
class GUIPowerGridManager extends PowerGridManager {
  constructor() {
    super();
    // Add the power grids modal.
    this.dialog = new ModalDialog('power-grids');
    this.dialog.close.addEventListener('click',
        () => POWER_GRID_MANAGER.closeDialog());
    // Make the add, edit and delete buttons of this modal responsive.
    this.dialog.element('new-btn').addEventListener('click',
        () => POWER_GRID_MANAGER.promptForPowerGrid());
    this.dialog.element('edit-btn').addEventListener('click',
        () => POWER_GRID_MANAGER.editPowerGrid());
    this.dialog.element('delete-btn').addEventListener('click',
        () => POWER_GRID_MANAGER.deletePowerGrid());
    // Add the power grid definition modal.
    this.new_power_grid_modal = new ModalDialog('new-power-grid');
    this.new_power_grid_modal.ok.addEventListener(
        'click', () => POWER_GRID_MANAGER.addNewPowerGrid());
    this.new_power_grid_modal.cancel.addEventListener(
        'click', () => POWER_GRID_MANAGER.new_power_grid_modal.hide());
    this.scroll_area = this.dialog.element('scroll-area');
    this.table = this.dialog.element('table');
  }
  
  updateGridMenu(modal) {
    // Create inner HTML for a menu with voltages and names as title.
    // The parameter `modal` identifies the modal for which this menu
    // is generated. Th e selected plate will then be shown in the DIV
    // identified by "`modal`-grid-plate".
    const menu = UI.modals[modal].element('grid-plate-menu');
    if(menu) {
      const
          html = [],
          grids = this.sortedGridIDs;
      html.push('<div id="', modal, '-gm-none" class="no-grid-plate" ',
          'title="No grid element" onclick="UI.setGridPlate(event.target)">',
          '(&#x21AF;)</div>');
      for(const g of grids) {
        const pg = MODEL.power_grids[g];
        html.push('<div id="', modal, '-gm-', pg.id,
            '"class="menu-plate" style="background-color: ', pg.color,
            '" title="Element of grid &ldquo;', pg.name,
            '&rdquo;" onclick="UI.setGridPlate(event.target);">',
            pg.voltage, '</div>');
      }
      menu.innerHTML = html.join('');
    }
  }

  show() {
    // Show the power grids for the current model.
    // NOTE: Add/edit/delete actions operate on this list, so changes
    // take immediate effect.
    // NOTE: Power grid objects have a unique abstract identifier.
    this.selected_grid = '';
    this.last_time_selected = 0;
    this.updateDialog();
    this.dialog.show();
  }
  
  updateDialog() {
    // Create the HTML for the power grids table and update the state
    // of the action buttons.
    if(!MODEL.power_grids.hasOwnProperty(this.selected_grid)) {
      this.selected_grid = '';
    }
    const
        keys = this.sortedGridIDs,
        sl = [],
        ss = this.selected_grid;
    let ssid = 'scntr';
    if(!keys.length) {
      sl.push('<tr><td><em>No grids defined</em></td></tr>');
    } else {
      for(let i = 0; i < keys.length; i++) {
        const
            s = keys[i],
            clk = '" onclick="POWER_GRID_MANAGER.selectPowerGrid(event, \'' +
                s + '\'',
            pg = MODEL.power_grids[s];
        if(s === ss) ssid += i;
        sl.push(['<tr id="scntr', i, '" class="dataset-modif',
            (s === ss ? ' sel-set' : ''),
            '"><td class="dataset-selector', clk, ');">',
            '<div class="grid-kV-plate" style="background-color: ',
            pg.color, '">', pg.voltage, '</div>',
            '<div class="grid-watts">', pg.power_unit, '</div>',
            (pg.kirchhoff ?
                '<div class="grid-kvl-symbol">&#x27F3;</div>': ''),
            (pg.loss_approximation ?
                '<div class="grid-loss-symbol">L&sup' +
                pg.loss_approximation + ';</div>' : ''),
            '</div>', pg.name, '</td></tr>'].join(''));
      }
    }
    this.table.innerHTML = sl.join('');
    UI.setBox('power-grids-capacity', MODEL.ignore_grid_capacity);
    UI.setBox('power-grids-KVL', MODEL.ignore_KVL);
    UI.setBox('power-grids-losses', MODEL.ignore_power_losses);
    if(ss) UI.scrollIntoView(document.getElementById(ssid));
    const btns = 'power-grids-edit power-grids-delete';
    if(ss) {
      UI.enableButtons(btns);
    } else {
      UI.disableButtons(btns);
    }
  }
  
  closeDialog() {
    // Save checkbox status and hide the dialog.
    MODEL.ignore_grid_capacity = UI.boxChecked('power-grids-capacity');
    MODEL.ignore_KVL = UI.boxChecked('power-grids-KVL');
    MODEL.ignore_power_losses = UI.boxChecked('power-grids-losses');
    this.dialog.hide();
    const pg_btn = document.getElementById('settings-power-btn');
    if(MODEL.ignore_grid_capacity || MODEL.ignore_KVL || MODEL.ignore_power_losses) {
      pg_btn.classList.add('ignore');
    } else {
      pg_btn.classList.remove('ignore');
    }
  }

  selectPowerGrid(event, id, focus) {
    // Select power grid, and when double-clicked, allow to edit it.
    const
        ss = this.selected_grid,
        now = Date.now(),
        dt = now - this.last_time_selected,
        // NOTE: Alt-click and double-click indicate: edit.
        // Consider click to be "double" if the same modifier was clicked
        // less than 300 ms ago.
        edit = event.altKey || (id === ss && dt < 300);
    this.selected_grid = id;
    this.last_time_selected = now;
    if(edit) {
      this.last_time_selected = 0;
      this.promptForPowerGrid('Edit', focus);
      return;
    }
    this.updateDialog();
  }
  
  promptForPowerGrid(action='Define new', focus='name') {
    // Show the Add/Edit power grid dialog for the indicated action. 
    const md = this.new_power_grid_modal;
    md.element('action').innerText = action;
    let pg;
    if(action === 'Edit' && this.selected_grid) {
      pg = MODEL.power_grids[this.selected_grid];
    } else {
      // Use a dummy object to obtain default properties.
      pg = new PowerGrid('');
    }
    md.element('name').value = pg.name;
    md.element('voltage').value = pg.kilovolts;
    md.element('color').value = pg.color;
    md.element('unit').value = pg.power_unit;
    UI.setBox('grid-kirchhoff', pg.kirchhoff);
    md.element('losses').value = pg.loss_approximation;
    this.new_power_grid_modal.show(focus);
  }

  addNewPowerGrid() {
    // Add the new power grid or update the one being edited. 
    const
        md = this.new_power_grid_modal,
        edited = md.element('action').innerText === 'Edit',
        n = UI.cleanName(md.element('name').value);
    if(!n) {
      // Do not accept empty string as name
      UI.warn('Power grid must have a name');
      md.element('name').focus();
      return;
    }
    let pg = MODEL.powerGridByName(n);
    if(pg && !edited) {
      // Do not accept name of existing grid as name for new grid.
      UI.warn(`Power grid "${pg.name}" is already defined`);
      md.element('name').focus();
      return;      
    }
    const
        e = md.element('voltage'),
        kv = safeStrToFloat(e.value, 0);
    if(kv <= 0 || kv > 5000) {
      UI.warn(`Voltage must be positive (up to 5 MV)`);
      e.focus();
      return;      
    }
    pg = (edited ? MODEL.powerGridByID(this.selected_grid) :
        MODEL.addPowerGrid(randomID()));
    pg.name = n;
    pg.kilovolts = kv;
    pg.color = md.element('color').value;
    pg.power_unit = md.element('unit').value;
    pg.kirchhoff = UI.boxChecked('grid-kirchhoff'); 
    pg.loss_approximation = parseInt(md.element('losses').value);
    md.hide();
    this.updateDialog();
  }
  
  editPowerGrid() {
    // Allow user to edit name and/or value.
    if(this.selected_grid) this.promptForPowerGrid('Edit');
  }
  
  deletePowerGrid() {
    // Allow user to delete, but warn if some processes are labeled as
    // part of this power grid.
    if(this.selected_grid) {
      // @@@TO DO: check whether grid is used in the model.
      // If so, ask user to confirm to remove grid property from all
      // process elements having this grid.
      delete MODEL.power_grids[this.selected_grid];
      this.updateDialog();
    }
  }
  
  cycleFlowTable(c) {
    // Return flows through cycle `c` as an HTML table.
    if(!MODEL.solved) return '';
    const html = ['<table class="power-flow">',
        '<tr><th colspan="2">Grid process</th>' +
        '<th title="Reactance"><em>x</em></th><th title="Power">P</th>' +
        '<th><em>x</em>P</th></tr>'];
    let sum = 0;
    for(const edge of c) {
      const
          p = edge.process,
          x = p.length_in_km * p.grid.reactancePerKm,
          l = p.actualLevel(MODEL.t);
      html.push(`<tr><td title="${p.gridEdge}">${p.displayName}</td>` + 
          `</td><td>[${edge.orientation > 0 ? '&plus;' : '&minus;'}]</td>` +
          `<td>${(Math.round(x * 10000) / 10000).toFixed(4)}</td>` +
          `<td>${VM.sig4Dig(l)}</td>` +
          `<td>${(x * l).toFixed(2)}</td></tr>`);
      sum += edge.orientation * x * l;
    }
    html.push('<tr><td colspan="4"><strong>Sum  &Sigma;<em>x</em>P</strong> ' +
        `<em>(should be zero)</em></td><td>${safeToPrecision(sum, 2)}</td></tr>`);
    html.push('</table><br>');
    return html.join('\n');
  }

  allCycleFlows(p) {
    // Return power flows for each cycle that `p` is part of as an HTML
    // table (so it can be displayed in the documentation dialog).
    if(!MODEL.solved) return '';
    const flows = [];
    for(let i = 0; i < this.cycle_basis.length; i++) {
      const c = this.cycle_basis[i];
      for(const e of c) if(e.process === p) {
        flows.push(`<h3>Flows through cycle (${i}):</h3>`,
            this.cycleFlowTable(c));
        break;
      }
    }
    return flows.join('\n');
  }
  
} // END of class GUIPowerGridManager
